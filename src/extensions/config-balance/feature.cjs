// «Конфиги и баланс»: the balance table (a Google Sheet through «Google Таблицы», or CSV/XLSX in the project) against
// the game's config files (Unity ScriptableObject .asset, JSON, CSV). It proposes which table column is which config
// field (names and agreeing values; the local model only for leftovers), the user confirms the mapping (saved per
// project), and the card shows every difference with its file and line, schema problems (types, ranges, enums,
// references, duplicate keys) and what changed between versions in git. Petya never writes a file: «Применить в
// конфиги» hands an exact change list to the Programmer (own branch, diff for review), «Записать в таблицу…» writes
// config values into the sheet through «Google Таблицы» after a preview of the exact cells.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const files=require('./files.cjs');
const match=require('./match.cjs');
const history=require('./history.cjs');
const store=require('./store.cjs');
const table=require('../google-sheets/table.cjs');
const ID='config-balance',BY='Конфиги и баланс';

// --- Routing ---------------------------------------------------------------------------------------------------------
// Near-misses: CI / server / tool configs, Petya's own settings, money balance, work-life balance, load balancers.
const CONFIG=/конфиг\p{L}*|scriptable\s*object|(?:^|[^\p{L}])\.?asset(?=$|[^\p{L}])/iu;
const BALANCE=/баланс\p{L}*/iu;
const TABLE=/таблиц\p{L}*|(?:гугл|google)[\s-]*(?:sheets?|шит)/iu;
const GAME=/юнит|оруж|предмет|враг|геро|персонаж|уровн|игр[аеыу]|игров|урон|здоров|хп|скорост|волн|скилл|способн|монстр|босс|лучник|рыцар|экономик|сундук/iu;
const AVOID=/(?:^|[^\p{L}])(?:ci|cd|nginx|apache|docker\p{L}*|webpack|eslint|prettier|tsconfig|babel|vite|kubernetes|k8s|helm|jenkins|gradle|ssh|vscode|ide|сервер\p{L}*|бд|базы\s+данных)(?=$|[^\p{L}])|ci\/cd|github\s+actions|пет[иьяе](?=$|[^\p{L}])|настро[ейк]\p{L}*\s+(?:пети|приложени|компьютер)|(?:на|по)\s+(?:карт|сч[её]т|телефон|кошел)\p{L}*|деньг|рубл|доллар|выписк|баланс\p{L}*\s+(?:работ|жизн|бел|цвет|звук|громкост)|балансир|нагрузк/iu;
const HISTORY=/(?:что|какие|сколько)\s+(?:\p{L}+\s+)?(?:поменял|изменил|правил)\p{L}*|(?:истори|верси|дифф?|diff)\p{L}*\s+(?:баланс|конфиг)|с\s+прошл\p{L}*\s+(?:верси|релиз|коммит|раз)/iu;
const WHY=/почему\s+.{2,80}?\s+(?:в\s+игре|в\s+конфиг\p{L}*|в\s+билде)\s+(?:не\s+(?:как|такой|такое|такая|совпада)|другой|другое|друга)|не\s+как\s+в\s+таблиц|не\s+совпада\p{L}*\s+с\s+таблиц/iu;
const COMPARE=/свер\p{L}*|сравни\p{L}*|расхожд\p{L}*|совпада\p{L}*|синхрониз\p{L}*|отлича\p{L}*/iu;
const VALIDATE=/провер\p{L}*|валидир\p{L}*|валидац\p{L}*|ошибк\p{L}*|битые|некорректн\p{L}*/iu;
function intent(text){
 const t=String(text||'').trim();if(!t||t.length>1200||AVOID.test(t))return null;
 const config=CONFIG.test(t),balance=BALANCE.test(t),tab=TABLE.test(t),game=GAME.test(t);
 if(WHY.test(t)&&(tab||config||balance))return 'why';
 if(HISTORY.test(t)&&(balance||config))return 'history';
 if(COMPARE.test(t)&&(balance&&(config||tab||game)||config&&(tab||balance)))return 'compare';
 if(VALIDATE.test(t)&&config&&(game||balance||/(?:все|наши|игров)/iu.test(t)))return 'validate';
 return null;
}

// --- Helpers ---------------------------------------------------------------------------------------------------------
function projectRoots(s){try{return require('../localization/find.cjs').projectRoots(s);}catch{return [];}}
const sheets=s=>s.googleSheets&&s.settings['extension_google-sheets']==='true'&&s.googleSheets.ready?.()?s.googleSheets:null;
const BALANCE_TAB=/баланс|balance|юнит|unit|конфиг|config|stats|стат|экономик|economy|предмет|item|оруж|weapon|враг|enem|геро|hero|волн|wave/iu;
const short=f=>String(f||'').split('/').pop();
const shown=v=>v===null||v===undefined||v===''?'пусто':Array.isArray(v)?v.join(', '):typeof v==='number'?String(v):String(v);
const reports=new Map();// reportId → {root, table, set, scan bits} for remapping without reading everything again
const REPORT_TTL=3*3600000;
function keep(id,value){const now=Date.now();for(const [k,v] of reports)if(now-v.at>REPORT_TTL)reports.delete(k);reports.set(id,{...value,at:now});}

// Google Sheet tabs as tables of the same shape as project files.
async function sheetTables(g,spreadsheetId,{only,limit=8}={}){
 const meta=await g.meta(spreadsheetId);
 const tabs=meta.sheets.filter(t=>!t.hidden&&(!only||only(t.title,meta.title))).slice(0,limit);
 const out=[];
 for(const t of tabs){const r=await g.read(meta.id,t.title);if(r.header<0||r.text.length<=r.header+1)continue;
  out.push({id:'sheet:'+meta.id+'#'+t.title,label:meta.title+' · '+t.title,source:{type:'sheet',spreadsheetId:meta.id,sheet:t.title,title:meta.title,url:r.url},text:r.text,numbers:r.numbers,header:r.header});}
 return out;
}
// Candidate tables: a pasted link, the saved mapping's source, project files and known spreadsheets that look like balance.
async function candidates(s,text,scan,saved){
 const g=sheets(s);const url=g?.parseUrl(text)||require('../google-sheets/client.cjs').parseUrl(text);
 if(url){if(!g)return {needSheets:true};return {tables:await sheetTables(g,url.id),pinned:true};}
 const out=[...scan.tables];
 if(g){
  const ids=new Set(saved.filter(m=>m.source.type==='sheet').map(m=>m.source.spreadsheetId));
  for(const k of g.known().slice(0,10))if(ids.has(k.id)||BALANCE_TAB.test(k.title)||k.sheets.some(t=>BALANCE_TAB.test(t.title)))ids.add(k.id);
  for(const id of [...ids].slice(0,4)){try{out.push(...await sheetTables(g,id,{only:(tab,title)=>BALANCE_TAB.test(tab)||BALANCE_TAB.test(title)||saved.some(m=>m.source.spreadsheetId===id&&m.source.sheet===tab),limit:6}));}catch{/* an unreadable spreadsheet is skipped */}}
 }
 return {tables:out};
}
// The mapping for a table and a set: the confirmed one (columns found again by header) or a proposal.
async function mappingFor(s,t,set,saved){
 const head=t.text[t.header]||[];
 const m=saved.find(x=>x.source.id===t.id&&x.set.id===set.id);
 if(m){
  const col=c=>head.findIndex(h=>h===c);
  const key=col(m.key.column);
  if(key>=0){const columns=m.columns.map(p=>({column:p.column,col:col(p.column),field:p.field,how:'user'})).filter(p=>p.col>=0);
   const fields=[...new Set(set.objects.flatMap(o=>Object.keys(o.fields)))];
   return {key:{column:m.key.column,col:key,field:m.key.field},columns,confirmed:true,fields,unmatched:head.map((h,c)=>({column:h,col:c})).filter(x=>x.column&&x.col!==key&&!columns.some(p=>p.col===x.col))};}
 }
 const key=match.keyMatch(t,set);if(!key)return null;
 const p=match.propose(t,set,key);
 // The model only suggests pairs for columns nothing matched; both names must exist.
 if(p.unmatched.length&&s.settings.model){
  const free=p.fields.filter(f=>f!==key.field&&!p.pairs.some(x=>x.field===f)).slice(0,80);
  const r=await kit.modelJSON(s,{system:'Сопоставь столбцы таблицы баланса игры с полями конфигов. Пару давай только если уверен; иначе пропусти. Имена — точно как в списках.',
   user:{columns:p.unmatched.map(x=>x.column),fields:free},schema:{type:'object',properties:{pairs:{type:'array',items:{type:'object',properties:{column:{type:'string'},field:{type:'string'}},required:['column','field']},maxItems:20}},required:['pairs']}}).catch(()=>null);
  for(const x of r?.pairs||[]){const u=p.unmatched.find(c=>c.column===x.column);if(u&&free.includes(x.field)&&!p.pairs.some(y=>y.field===x.field||y.col===u.col))p.pairs.push({column:u.column,col:u.col,field:x.field,how:'model'});}
  p.unmatched=p.unmatched.filter(u=>!p.pairs.some(x=>x.col===u.col));
 }
 return {key:{column:key.column,col:key.col,field:key.field},columns:p.pairs.sort((a,b)=>a.col-b.col),confirmed:false,fields:p.fields,unmatched:p.unmatched};
}
// Whether spoken words name a label; Russian words also match English labels («экономика» → economy, «юниты» → units).
function named(spoken,label){return table.nameScore(spoken,label)>=0.5||table.words(spoken).some(w=>{const m=match.meanings(w);return match.tokens(label).some(x=>x.length>=4&&(m.has(x)||m.has(x.replace(/s$/,''))));});}
// The best table × config set: a named one first, then the most matched rows and mapped columns.
async function pick(s,text,tables,sets,saved){
 const spoken=table.words(text).filter(w=>w.length>=4&&!/^(?:свер|срав|конф|бала|табл|почем|игре|чем|прове)/iu.test(w)).join(' ');
 let best=null;
 for(const t of tables)for(const set of sets){
  if(t.source.type==='file'&&set.files.length===1&&set.files[0]===t.source.path)continue;
  const key=match.keyMatch(t,set);if(!key)continue;
  const p=match.propose(t,set,key);if(!p.pairs.length)continue;
  const savedHit=saved.some(m=>m.source.id===t.id&&m.set.id===set.id);
  // A table named in the request beats the saved mapping; Russian words also match English labels («экономика» → economy).
  const hit=spoken&&[t.label,set.label].some(l=>named(spoken,l));
  const score=(hit?2000:0)+(savedHit?1000:0)+key.matched*2+p.pairs.length;
  if(!best||score>best.score)best={t,set,score};
 }
 if(!best)return null;
 const mapping=await mappingFor(s,best.t,best.set,saved);
 return mapping?{table:best.t,set:best.set,mapping}:null;
}
// The first text column of a row, for «Лучник» rather than «archer».
function labelColumn(t,key){
 const head=t.text[t.header]||[];
 for(let c=0;c<head.length;c++){
  if(c===key.col)continue;let filled=0,text=0;
  for(let r=t.header+1;r<t.text.length;r++){if(!t.text[r][c])continue;filled++;if(t.numbers[r]?.[c]===null||t.numbers[r]?.[c]===undefined)text++;}
  if(filled&&text===filled)return c;
 }
 return -1;
}

// The exact change list for the Programmer: every differing value, file by file, with its line.
function codeFix(rows){
 const diff=rows.filter(r=>r.status==='diff'&&r.sheet!==''&&r.file);
 if(!diff.length)return '';
 const by=new Map();for(const r of diff){if(!by.has(r.file))by.set(r.file,[]);by.get(r.file).push(r);}
 const lines=[...by].map(([file,list])=>file+': '+list.map(r=>r.field+(r.objectId&&by.get(file).some(x=>x.objectId!==r.objectId)?' у '+r.objectId:'')+' '+shown(r.config)+' → '+shown(r.sheet)+(r.line?' (строка '+r.line+')':'')).join('; '));
 return 'Как программист, в отдельной ветке обнови значения в конфигах игры по балансу, больше ничего не меняя. '+lines.join('. ')+'.';
}
function rulesShown(rules,mapping,issues){
 const fields=new Set([...(mapping?.columns||[]).map(p=>p.field),...issues.map(i=>i.field).filter(Boolean)]);
 return rules.filter(r=>fields.has(r.field)||r.user).slice(0,40);
}
async function guidsIfNeeded(scan,sets){
 const refs=sets.some(set=>set.objects.some(o=>Object.values(o.fields).some(v=>v&&typeof v==='object'&&v.ref&&v.guid)));
 return refs?files.guids(scan.metaFiles):null;
}
const allIds=scan=>new Set(scan.sets.flatMap(x=>x.objects.map(o=>match.norm(o.id))));

// Builds the compare card from a table, a set and a mapping (also used when the user changes a pair).
function report(s,{root,t,set,mapping,overrides,ids,guids,focus}){
 const cmp=match.compare(t,set,mapping);
 const lc=labelColumn(t,mapping.key);
 for(const r of cmp.rows)if(r.row!==undefined)r.label=lc>=0?String(t.text[r.row][lc]||r.key):r.key;
 const v=match.validate(set,{overrides,ids,guids,sheetDuplicates:match.duplicates(t,mapping.key.col)});
 const g=sheets(s);
 return {rows:cmp.rows.slice(0,400),counts:cmp.counts,issues:v.issues.slice(0,200),rules:rulesShown(v.rules,mapping,v.issues),
  codeFix:codeFix(cmp.rows),canWriteSheet:t.source.type==='sheet'&&!!g?.writable?.()&&cmp.counts.diff>0,
  source:{id:t.id,label:t.label,type:t.source.type,url:t.source.url||'',path:t.source.path||''},
  set:{id:set.id,label:set.label,kind:set.kind,files:set.files.length,objects:set.objects.length},
  mapping:{key:{column:mapping.key.column,field:mapping.key.field},columns:mapping.columns.map(({column,col,field,how})=>({column,col,field,how})),confirmed:!!mapping.confirmed,fields:mapping.fields.slice(0,200),unmatched:(mapping.unmatched||[]).map(u=>u.column)},
  focus:focus||null,project:path.basename(root)};
}
function focusOf(text,rows,t){
 const words=table.words(text).filter(w=>w.length>=3&&!/^(?:почему|игре|таблиц\p{L}*|конфиг\p{L}*|как|не|совпада\p{L}*|друг\p{L}*|такой|такое|билде)$/iu.test(w));
 const hitRow=r=>words.some(w=>table.matches(r.label||'',w)||table.matches(r.key||'',w)||table.matches(r.object||'',w)||(t&&r.row!==undefined&&t.text[r.row].some(c=>table.matches(c,w))));
 const hitField=r=>words.some(w=>table.matches(r.column||'',w)||match.meanings(w).has(String(r.field||'').toLocaleLowerCase()));
 const rows2=rows.filter(r=>r.field&&hitRow(r)&&hitField(r));
 return rows2.length?rows2:rows.filter(r=>r.field&&hitRow(r)&&r.status==='diff');
}

// --- Turns -----------------------------------------------------------------------------------------------------------------
async function compareTurn(s,text,kind,root,scan){
 const saved=store.project(s,root).mappings||[];
 const found=await candidates(s,text,scan,saved);
 if(found.needSheets){
  const offer=s.extensionOffers?.prerequisite?.('google-sheets',text);
  return kit.reply(s,text,{by:BY,question:true,text:'Чтобы сверить с Google Таблицей, нужно приложение «Google Таблицы» с доступом к этой таблице. Добавьте и подключите его, затем повторите запрос.',...offer?{data:{extensionOffer:offer}}:{}});
 }
 if(!scan.sets.length)return kit.reply(s,text,{by:BY,question:true,text:'В папке проекта не нашёл конфигов: ScriptableObject .asset, JSON или CSV с числами. Где они лежат? Подключите нужную папку в контексте чата.'});
 const chosen=await pick(s,text,found.tables,scan.sets,saved);
 if(!chosen)return kit.reply(s,text,{by:BY,question:true,text:found.tables.length?'Не нашёл таблицу, строки которой совпадают с объектами конфигов (по id или имени). Пришлите ссылку на нужную Google Таблицу или скажите, какой файл с балансом сверять.':'Где таблица баланса? Пришлите ссылку на Google Таблицу'+(sheets(s)?'':' (нужно приложение «Google Таблицы»)')+' или положите CSV/XLSX с балансом в папку проекта.'});
 const {table:t,set,mapping}=chosen;
 const overrides=store.project(s,root).rules?.[set.id]||{};
 const ids=allIds(scan),guids=await guidsIfNeeded(scan,[set]);
 const data=report(s,{root,t,set,mapping,overrides,ids,guids});
 const reportId=randomUUID();keep(reportId,{root,t,set,mapping,ids,guids});
 const c=data.counts,diffs=data.rows.filter(r=>r.status==='diff');
 const errors=data.issues.filter(i=>i.severity==='error').length;
 let reply;
 if(kind==='why'){
  const focus=focusOf(text,data.rows,t);data.focus=focus.map(r=>data.rows.indexOf(r));
  const d=focus.find(r=>r.status==='diff')||focus[0];
  if(!d)reply='Не нашёл этот объект или поле в сверке «'+t.label+'» с '+set.label+'. Расходится всего '+c.diff+' '+kit.plural(c.diff,['значение','значения','значений'])+' — все в карточке.';
  else if(d.status==='diff')reply='В таблице «'+d.column+'» у «'+d.label+'» — '+shown(d.sheet)+', а в '+short(d.file)+' — '+shown(d.config)+(d.line?' (строка '+d.line+')':'')+'. Игра берёт значение из конфига. Чтобы перенести значение из таблицы, нажмите «Применить в конфиги» — Программист сделает это в отдельной ветке.';
  else if(d.status==='same')reply='«'+d.column+'» у «'+d.label+'» совпадает: '+shown(d.sheet)+' и в таблице, и в '+short(d.file)+'. Если в игре другое, значение меняется в коде или в другом конфиге.';
  else reply='«'+d.label+'»: '+(d.status==='no-object'?'в конфигах нет такого объекта.':d.status==='no-field'?'у объекта в '+short(d.file)+' нет поля «'+d.field+'».':'нет строки в таблице.');
 }else{
  const ex=diffs[0];
  reply='Сверил «'+t.label+'» с '+set.label+' ('+set.objects.length+' '+kit.plural(set.objects.length,['объект','объекта','объектов'])+'): '+
   (c.diff?'расходится '+c.diff+' '+kit.plural(c.diff,['значение','значения','значений']):'значения совпадают')+
   (c.noObject?', '+c.noObject+' '+kit.plural(c.noObject,['строки','строк','строк'])+' нет в конфигах':'')+(c.noRow?', '+c.noRow+' '+kit.plural(c.noRow,['объекта','объектов','объектов'])+' нет в таблице':'')+'.'+
   (ex?' Например: «'+ex.column+'» у «'+ex.label+'» — в таблице '+shown(ex.sheet)+', в '+short(ex.file)+' '+shown(ex.config)+'.':'')+
   (errors?' Ошибок в конфигах: '+errors+'.':'')+(mapping.confirmed?'':' Сопоставление столбцов предложено автоматически — проверьте и подтвердите в карточке.');
 }
 return kit.reply(s,text,{by:BY,text:reply,data:{balanceCard:{mode:'compare',reportId,...data,at:new Date().toISOString()}}});
}
async function validateTurn(s,text,root,scan){
 if(!scan.sets.length)return kit.reply(s,text,{by:BY,question:true,text:'В папке проекта не нашёл конфигов: ScriptableObject .asset, JSON или CSV с числами. Подключите папку с ними в контексте чата.'});
 const spoken=table.words(text).filter(w=>w.length>=4&&!/^(?:пров|конф|ошиб|валид|наши|игро)/iu.test(w)).join(' ');
  const chosen=scan.sets.filter(x=>spoken&&(named(spoken,x.label)||x.objects.some(o=>table.nameScore(spoken,o.name||o.id)>=0.5)));
 const list=(chosen.length?chosen:scan.sets).slice(0,10);
 const ids=allIds(scan),guids=await guidsIfNeeded(scan,list),rules=store.project(s,root).rules||{};
 const sets=list.map(set=>{const v=match.validate(set,{overrides:rules[set.id]||{},ids,guids});return {id:set.id,label:set.label,kind:set.kind,files:set.files.length,objects:set.objects.length,issues:v.issues.slice(0,100),rules:v.rules.filter(r=>v.issues.some(i=>i.field===r.field)||r.user).slice(0,30)};});
 const errors=sets.reduce((n,x)=>n+x.issues.filter(i=>i.severity==='error').length,0),warnings=sets.reduce((n,x)=>n+x.issues.filter(i=>i.severity==='warning').length,0);
 const reportId=randomUUID();keep(reportId,{root,ids,guids,validate:list});
 const reply='Проверил '+sets.length+' '+kit.plural(sets.length,['набор','набора','наборов'])+' конфигов ('+sets.reduce((n,x)=>n+x.objects,0)+' объектов): '+(errors||warnings?(errors?'ошибок '+errors:'')+(errors&&warnings?', ':'')+(warnings?'предупреждений '+warnings:''):'ошибок нет')+'.'+
  (errors?' Первая: '+sets.flatMap(x=>x.issues).find(i=>i.severity==='error').message:'');
 return kit.reply(s,text,{by:BY,text:reply,data:{balanceCard:{mode:'validate',reportId,project:path.basename(root),sets,at:new Date().toISOString()}}});
}
async function historyTurn(s,text,root,scan){
 if(!scan.sets.length)return kit.reply(s,text,{by:BY,question:true,text:'В папке проекта не нашёл конфигов, история которых нужна. Подключите папку с ними в контексте чата.'});
 const byRoot=new Map();for(const set of scan.sets)for(const f of set.files){const r=set.root||root;if(!byRoot.has(r))byRoot.set(r,[]);byRoot.get(r).push(f);}
 s.requestProgress?.report?.('Смотрю историю конфигов в git');
 const versions=[];let repo=false;
 for(const [r,list] of byRoot){const h=await history.versions(r,list);repo=repo||h.repo;versions.push(...h.versions);}
 if(!repo)return kit.reply(s,text,{by:BY,question:true,text:'Папка проекта не в git — сравнивать версии не с чем. Подключите папку репозитория в контексте чата.'});
 const total=versions.reduce((n,v)=>n+v.changes.length,0);
 const last=versions.find(v=>v.changes.length);
 const reply=!versions.length?'В истории git изменений конфигов не нашёл.':'Последние изменения конфигов: '+versions.filter(v=>v.changes.length).slice(0,3).map(v=>(v.working?'не закоммичено':'«'+v.subject+'» ('+v.author+')')+' — '+v.changes.length+' '+kit.plural(v.changes.length,['правка','правки','правок'])).join('; ')+'.'+
  (last?.changes[0]?.field?' Например, '+last.changes[0].object+'.'+last.changes[0].field+': '+shown(last.changes[0].old)+' → '+shown(last.changes[0].new)+'.':'');
 return kit.reply(s,text,{by:BY,text:reply,data:{balanceCard:{mode:'history',reportId:randomUUID(),project:path.basename(root),versions,total,at:new Date().toISOString()}}});
}
async function turn(s,command){
 const text=String(command||'');
 const kind=intent(text);
 if(!kind||!kit.installed(s,ID))return null;
 const roots=projectRoots(s);
 if(!roots.length)return kit.reply(s,text,{by:BY,question:true,text:'Где проект с конфигами? Подключите папку проекта в контексте чата — Петя найдёт ScriptableObject .asset, JSON и CSV и таблицы баланса.'});
 try{
  s.requestProgress?.report?.('Ищу конфиги и таблицы баланса');
  const scan=await files.scan(roots);
  if(kind==='history')return await historyTurn(s,text,roots[0],scan);
  if(kind==='validate')return await validateTurn(s,text,roots[0],scan);
  return await compareTurn(s,text,kind,roots[0],scan);
 }catch(e){if(e?.name==='InputRequired')throw e;return e.status?kit.reply(s,text,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,text,BY,e);}
}

// --- Card actions --------------------------------------------------------------------------------------------------------
function setup(s){
 const writing=new Set();
 function locate(reportId){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.balanceCard;if(card?.reportId&&card.reportId===reportId)return card;}
  return null;
 }
 function cached(reportId){const card=locate(String(reportId||''));if(!card)throw Error('Отчёт устарел или удалён. Повторите сверку в чате.');const r=reports.get(card.reportId);if(!r)throw Error('Данные сверки устарели. Повторите сверку в чате.');return {card,r};}
 function refresh(card,r){
  const overrides=store.project(s,r.root).rules?.[r.set.id]||{};
  const next=report(s,{root:r.root,t:r.t,set:r.set,mapping:r.mapping,overrides,ids:r.ids,guids:r.guids});
  Object.assign(card,next,{sheetWrite:null});s.dialogue.persist?.();return card;
 }
 return {ipc:{
  // The user changes one pair: column → field ('' removes it). The comparison is redone on the cached data.
  remap(reportId,column,field){
   const {card,r}=cached(reportId);
   const head=r.t.text[r.t.header]||[],col=head.indexOf(String(column));
   if(col<0||col===r.mapping.key.col)throw Error('Такого столбца нет.');
   if(field&&!r.mapping.fields.includes(field))throw Error('Такого поля в конфигах нет.');
   const columns=r.mapping.columns.filter(p=>p.col!==col&&p.field!==field);
   if(field)columns.push({column:head[col],col,field,how:'user'});
   r.mapping={...r.mapping,columns:columns.sort((a,b)=>a.col-b.col),confirmed:false,unmatched:head.map((h,c)=>({column:h,col:c})).filter(x=>x.column&&x.col!==r.mapping.key.col&&!columns.some(p=>p.col===x.col))};
   return refresh(card,r);
  },
  confirm(reportId){
   const {card,r}=cached(reportId);
   store.saveMapping(s,r.root,{source:{id:r.t.id,label:r.t.label,type:r.t.source.type,...r.t.source.spreadsheetId?{spreadsheetId:r.t.source.spreadsheetId,sheet:r.t.source.sheet}:{path:r.t.source.path}},set:{id:r.set.id,label:r.set.label},key:{column:r.mapping.key.column,field:r.mapping.key.field},columns:r.mapping.columns.map(p=>({column:p.column,field:p.field}))});
   r.mapping={...r.mapping,confirmed:true};card.mapping={...card.mapping,confirmed:true};s.dialogue.persist?.();return card;
  },
  // A schema override for a field: {required, min, max, enum:[…], ref} or null to go back to the inferred rule.
  setRule(reportId,field,rule){
   const {card,r}=cached(reportId);
   if(!r.set)throw Error('Правило задаётся в карточке сверки.');
   const clean=rule?{...rule.required!==undefined?{required:!!rule.required}:{},...Number.isFinite(Number(rule.min))&&rule.min!==''&&rule.min!==null?{min:Number(rule.min)}:{},...Number.isFinite(Number(rule.max))&&rule.max!==''&&rule.max!==null?{max:Number(rule.max)}:{},
    ...Array.isArray(rule.enum)&&rule.enum.length?{enum:rule.enum.map(String).slice(0,50)}:{},...rule.ref!==undefined?{ref:!!rule.ref}:{}}:null;
   store.setRule(s,r.root,r.set.id,String(field),clean&&Object.keys(clean).length?clean:null);
   return refresh(card,r);
  },
  // Configs → sheet: the cells to write (sheet value → config value), kept with the card until «Записать».
  prepareSheetWrite(reportId){
   const {card,r}=cached(reportId);
   if(r.t.source.type!=='sheet')throw Error('Записывать можно только в Google Таблицу.');
   const g=sheets(s);if(!g?.writable?.())throw Error('Включите запись в настройках «Google Таблицы».');
   const lc=labelColumn(r.t,r.mapping.key);
   const changes=match.compare(r.t,r.set,r.mapping).rows.filter(x=>x.status==='diff'&&(typeof x.config==='number'||typeof x.config==='string'||typeof x.config==='boolean')).slice(0,500)
    .map(x=>({sheet:r.t.source.sheet,row:x.row,col:x.col,cell:require('../google-sheets/client.cjs').cell(x.row,x.col),old:r.t.numbers[x.row]?.[x.col]??r.t.text[x.row]?.[x.col]??'',new:x.config,label:lc>=0?String(r.t.text[x.row][lc]||x.key):x.key,field:x.column}));
   if(!changes.length)throw Error('Записывать нечего: расхождений с числами или текстом нет.');
   card.sheetWrite={changes,spreadsheetId:r.t.source.spreadsheetId,url:r.t.source.url};s.dialogue.persist?.();
   return card.sheetWrite;
  },
  async writeSheet(reportId){
   const card=locate(String(reportId||''));if(!card?.sheetWrite)throw Error('Сначала посмотрите, какие ячейки изменятся.');
   if(card.sheetWrite.done)return {done:card.sheetWrite.done,already:true};
   if(writing.has(reportId))throw Error('Уже записываю.');
   const g=sheets(s);if(!g?.writable?.())throw Error('Включите запись в настройках «Google Таблицы».');
   writing.add(reportId);
   try{const r=await g.applyUpdate({spreadsheetId:card.sheetWrite.spreadsheetId,changes:card.sheetWrite.changes});card.sheetWrite.done={cells:r.cells,url:r.url,at:new Date().toISOString()};s.dialogue.persist?.();return {done:card.sheetWrite.done};}
   finally{writing.delete(reportId);}
  }
 }};
}
module.exports={name:'configBalance',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,intent,codeFix};
