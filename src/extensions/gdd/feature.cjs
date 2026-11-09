// «Геймдизайн-документ»: drafts or updates a section of the project's GDD (Markdown in the repository, a Confluence
// page or a Google Doc — target.cjs) from this chat, meeting summaries, Jira epics and the game's configs (read with
// the reader of «Конфиги и баланс» — evidence.cjs).
// - «опиши систему лиг в GDD», «обнови раздел экономики по текущим конфигам»: a draft of that section. Every number in
//   it must be backed: config values are cited as [file:line], numbers of a chat / meeting / Jira line carry that
//   source's label; code checks each number (`check`) — a number that equals one config value gets its citation, any
//   other number is marked «(уточнить)». The card shows the section's diff against the GDD and writes it only on
//   «Записать в GDD» (IPC `apply`), which first checks the GDD is still what the draft was made from.
// - «чего не хватает в GDD»: systems found in configs and code folders that have no section.
// - «GDD лежит в docs/gdd.md» / a link: remembers where the project's GDD is.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const diff=require('../doc-diff/diff.cjs');
const target=require('./target.cjs');
const ev=require('./evidence.cjs');
const ID='gdd',BY='Геймдизайн-документ';
const clip=(t,n=300)=>{const v=String(t||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v;};
const cap=t=>{const v=String(t||'').trim();return v?v[0].toLocaleUpperCase('ru')+v.slice(1):v;};

// --- Routing ----------------------------------------------------------------------------------------------------------
const clean=t=>String(t||'').replace(/^\s*петя[\s,:.!?—-]*/iu,'').replace(/[?!.]+$/u,'').replace(/ё/g,'е').trim();
const GDD='(?:gdd|гдд|геймдизайн[\\s-]*документ\\p{L}*|геймдизайн\\p{L}*|диздок\\p{L}*|дизайн[\\s-]*документ\\p{L}*)';
const IN_GDD=new RegExp('\\s*(?:(?:в|во|для|по)\\s+)?(?:наш\\p{L}*\\s+)?'+GDD+'(?=$|[^\\p{L}])','giu');
const VERB='(?:опиши|распиши|обнови|актуализируй|дополни|допиши|добавь|напиши|составь|оформи|пропиши|перепиши)';
const DRAFT=new RegExp('^'+VERB+'\\s+(.+)$','iu');
const HAS_GDD=new RegExp('(?:^|[^\\p{L}])'+GDD+'(?=$|[^\\p{L}])','iu');
const BY_CONFIGS=/\s+(?:по|из|с\s+учетом)\s+(?:текущ\p{L}*\s+|наш\p{L}*\s+|свеж\p{L}*\s+|актуальн\p{L}*\s+|игров\p{L}*\s+)?конфиг\p{L}*$/iu;
const SECTION_BY_CONFIGS=new RegExp('^(?:обнови|актуализируй|перепиши|сверь)\\s+раздел\\p{L}*\\s+(.{2,80}?)'+BY_CONFIGS.source.replace(/^\\s\+/,'\\s+'),'iu');
const GAPS=new RegExp('(?:^|\\s)(?:чего|что|каких\\s+(?:систем|разделов))\\s+(?:ещ[её]\\s+)?(?:не\\s+хватает|нет|не\\s+описан\\p{L}*|недоста[её]т)\\s+(?:в\\s+)?(?:наш\\p{L}*\\s+)?'+GDD+'|(?:какие|что\\s+за)\\s+(?:системы|механики|фичи)\\s+(?:ещ[её]\\s+)?не\\s+описаны\\s+в\\s+'+GDD,'iu');
const BIND=new RegExp('^(?:наш\\s+)?'+GDD+'\\s+(?:лежит|находится|хранится|живет|теперь)\\s+(?:в|на|тут|здесь|по\\s+ссылке)?\\s*[:—-]?\\s*(\\S.{2,400})$|^(?:наш\\s+)?'+GDD+'\\s*[—:-]\\s*(\\S.{2,400})$','iu');
// Not a section of our GDD: definitions, whole new documents, templates, other apps' subjects.
const NOT=/^(?:а\s+)?(?:что\s+такое|зачем|как\s+(?:писать|составить|оформить))|шаблон|пример\p{L}*\s+gdd|(?:^|\s)(?:adr|решени\p{L}*\s*:)|устарел|свежест|актуальност|поменял|изменил/iu;
function topicOf(text){
 let t=text.replace(IN_GDD,' ').replace(BY_CONFIGS,' ').replace(/\s+/g,' ').trim();
 t=t.replace(/^(?:в\s+)?(?:раздел\p{L}*|секци\p{L}*|глав\p{L}*)\s+(?:про|о|об|по)?\s*/iu,'').replace(/^(?:про|о|об|насч[её]т)\s+/iu,'').replace(/\s+(?:в|во|для)$/iu,'').trim();
 return t;
}
function kind(text){
 const t=clean(text);
 if(!t||t.length>500||/^\/|(?:^|\s)скилл/iu.test(t)||NOT.test(t))return null;
 if(GAPS.test(t))return {kind:'gaps'};
 const b=BIND.exec(t);
 if(b){const where=(b[1]||b[2]).trim();if(/https?:\/\/|\.(?:md|markdown)(?=$|[\s»"])/i.test(where))return {kind:'bind',where};}
 const sc=SECTION_BY_CONFIGS.exec(t);
 if(sc)return {kind:'draft',topic:topicOf(sc[1]),configs:true};
 const d=DRAFT.exec(t);
 if(d&&HAS_GDD.test(t)){
  const topic=topicOf(d[1]);
  if(!topic||!diff.words(topic).length)return null;
  return {kind:'draft',topic,configs:BY_CONFIGS.test(t)};
 }
 return null;
}
// «систему лиг» → «Система лиг», «экономики» → «Экономика».
function title(topic){
 let t=String(topic).trim().replace(/^(?:систем[уы])\s+/iu,'Система ').replace(/^(?:механик[уи])\s+/iu,'Механика ');
 // Accusative / genitive endings of one word back to the nominative (a '|'-joined literal: data).
 if(!/\s/.test(t))for(const pair of 'ику:ика|ики:ика|ку:ка|ки:ка|цу:ца|ту:та|му:ма|ну:на|лу:ла|ру:ра|ву:ва'.split('|')){const [from,to]=pair.split(':');if(t.toLowerCase().endsWith(from)){t=t.slice(0,-from.length)+to;break;}}
 return cap(t);
}

// --- The number check -----------------------------------------------------------------------------------------------
// Every number must be backed by a citation on its line: a config fact [file:line] with that value, or a source label
// whose line contains the number. A number equal to exactly one config value gets that citation; any other number is
// marked «(уточнить)». → {text, unclear:[{number, line}], cited}
function check(markdown,facts,sources){
 const byCite=new Map();for(const f of facts){const list=byCite.get(f.cite)||[];list.push(f.value);byCite.set(f.cite,list);}
 const values=new Map();for(const f of facts){const k=String(f.value);values.set(k,(values.get(k)||[]).concat(f));}
 const unclear=[];let cited=0;
 const lines=String(markdown).split('\n').map((line,n)=>{
  const all=[...line.matchAll(/\[([^\]\n]{1,300})\]/g)].map(m=>({text:m[1].trim(),index:m.index}));
  // A number's citations are those of its own sentence (brackets masked, so «file.json» does not end one).
  const masked=line.replace(/\[[^\]\n]{1,300}\]/g,m=>'['+'x'.repeat(m.length-2)+']');
  const sentence=at=>{let a=0,b=masked.length;for(const m of masked.matchAll(/[.!?](?=\s|$)/g)){if(m.index<at)a=m.index+1;else{b=m.index+1;break;}}const own=all.filter(x=>x.index>=a&&x.index<b).map(x=>x.text);return own.length?own:tail;};
  // Citations standing after the last sentence cite the whole line (a quoted source line).
  const end=masked.replace(/(?:\s*\[x*\])+\s*$/,'').length;
  const tail=all.filter(x=>x.index>=end).map(x=>x.text);
  const nums=diff.numbers(line);if(!nums.length)return line;
  const ok=num=>sentence(num.index).some(c=>{
   if(byCite.has(c))return byCite.get(c).some(v=>Math.abs(v-num.value)<1e-9);
   const src=sources.find(x=>x.label===c);
   return !!src&&diff.numbers(src.text).some(v=>Math.abs(v.value-num.value)<1e-9);
  });
  let out='',at=0;
  for(const num of nums){
   const after=num.index+num.length;
   out+=line.slice(at,after);at=after;
   if(ok(num)){cited++;continue;}
   const same=values.get(String(num.value))||[];
   const tail=line.slice(after);
   if(/^\s*\(уточнить\)/.test(tail)){unclear.push({number:num.text,line:n+1});continue;}
   // A number equal to one config value of something the line names (the object or the field) gets its citation.
   const a=Math.max(...[...line.slice(0,num.index).matchAll(/[.;,!?:(—]/g)].map(m=>m.index+1),0),b=line.slice(after).search(/[.;,!?)]/);
   const clause=line.slice(a,b<0?line.length:after+b);
   const near=same.filter(f=>diff.overlap((f.names||[f.object]).join(' ')+' '+f.field,clause)>0);
   if(near.length===1&&!sentence(num.index).length){out+=' ['+near[0].cite+']';cited++;continue;}
   out+=' (уточнить)';unclear.push({number:num.text,line:n+1});
  }
  return out+line.slice(at);
 });
 return {text:lines.join('\n'),unclear,cited};
}
// How many numbers of a text are not backed (no changes) — for the card's editor.
function unbacked(markdown,facts,sources){
 const r=check(markdown,facts,sources);
 return r.unclear;
}

// --- Drafting ----------------------------------------------------------------------------------------------------------
const PARAMS='Параметры из конфигов';
function table(sets){
 const out=[];
 for(const set of sets){
  out.push('','Конфиг: `'+set.label+'`','','| Объект | Параметр | Значение | Где |','|---|---|---|---|');
  for(const f of set.facts.slice(0,30))out.push('| '+f.object.replace(/\|/g,'/')+' | '+f.field.replace(/\|/g,'/')+' | '+f.value+' | ['+f.cite+'] |');
 }
 return out.join('\n').trim();
}
// The old section's own prose: without its previous config table (it is regenerated).
function prose(old){
 const parts=diff.sections('## x\n\n'+old).filter(x=>x.level>=2);
 const lines=String(old).split('\n');
 const cut=parts.find(x=>x.level>2&&/параметр|конфиг/i.test(x.title));
 if(!cut)return String(old).trim();
 return [...lines.slice(0,cut.line-2),...lines.slice(cut.end-2)].join('\n').trim();
}
async function draft(s,{topic,configs:only,doc,sec,sets,sources}){
 const facts=sets.flatMap(x=>x.facts);
 const heading=sec?sec.title:title(topic);
 const old=sec?target.bodyOf(doc.text,sec):'';
 const lines=[];
 const own=prose(old);
 if(own)lines.push(own);
 if(!only)for(const x of sources)if(!own.includes(x.text))lines.push('- '+x.text+' ['+x.label+']');
 if(!lines.length)lines.push('Описание — уточнить.');
 let body=lines.join('\n\n');
 let by='rules';
 if(s.settings.model&&(sources.length||facts.length)){
  try{
   const r=await kit.modelJSON(s,{system:'Напиши раздел геймдизайн-документа по-русски в Markdown (без заголовка раздела и без таблицы параметров): 2–6 коротких абзацев или пунктов о том, как работает система. Каждое число бери только из facts или sources и сразу после него ставь ссылку в квадратных скобках: для facts — cite, для sources — label. Чисел, которых нет в данных, не пиши. Ничего не выдумывай.',
    user:{topic,section:heading,old:clip(old,3000),facts:facts.slice(0,60).map(f=>({cite:f.cite,object:f.object,field:f.field,value:f.value})),sources:sources.map(x=>({label:x.label,text:x.text}))},
    schema:{type:'object',properties:{text:{type:'string'}},required:['text']},predict:900,temperature:0.2});
   const text=String(r?.text||'').replace(/^#{1,6}\s+.*\n+/,'').trim();
   if(text.length>=20){body=text;by='model';}
  }catch{by='rules';}
 }
 if(sets.length)body+='\n\n### '+PARAMS+'\n\n'+table(sets);
 const checked=check(body,facts,sources);
 return {heading,old,body:checked.text,unclear:checked.unclear,cited:checked.cited,by,facts};
}

const store=s=>require('../../extension-cache.cjs').store(s.dataRoot,ID);
function remember(s,id,value){const st=store(s),all={...st.peek('drafts')||{}};all[id]={...all[id],...value,at:Date.now()};st.set('drafts',Object.fromEntries(Object.entries(all).sort((a,b)=>b[1].at-a[1].at).slice(0,30)));return all[id];}
const recall=(s,id)=>(store(s).peek('drafts')||{})[id]||null;

// Where the GDD is: remembered, found, asked.
function where(s,resume){
 return target.locate(s).then(found=>{
  if(found.one)return resume(found.one);
  if(found.many){const label=t=>t.label;return ask({text:'Нашёл несколько GDD. Какой это проекта?',label:'GDD',options:found.many.map(label),strictChoices:true},answer=>{const t=found.many.find(x=>label(x)===String(answer).trim());if(!t)return resume(null);target.bind(s,t);return resume(t);});}
  return ask({text:'Где GDD проекта? Пришлите путь к .md в папке проекта или ссылку на страницу Confluence или Google Документ.',label:'GDD',placeholder:'docs/gdd.md или https://…'},answer=>{const t=target.parse(s,answer);if(!t)return resume(null);target.bind(s,t);return resume(t);});
 });
}
const roots=s=>require('../doc-diff/find.cjs').projectRoots(s);
const KIND={file:'Markdown в проекте',confluence:'Confluence',google:'Google Документы'};

async function draftTurn(s,command,intent,{now=new Date(),scan}={}){
 return where(s,async t=>{
  if(!t)return kit.reply(s,command,{by:BY,question:true,text:'Не понял, где GDD: нужен путь к .md-файлу в папке проекта или ссылка на Confluence / Google Документ. Скажите «GDD лежит в docs/gdd.md».'});
  s.requestProgress?.report?.('Читаю GDD и конфиги');
  let doc;try{doc=await target.read(s,t);}catch(e){return kit.failure(s,command,BY,e);}
  const sec=target.section(doc.text,intent.topic);
  const folders=roots(s);
  let sets=[];try{sets=folders.length?await ev.configs(folders,intent.topic,{scan}):[];}catch{sets=[];}
  const sources=intent.configs?[]:[...ev.chat(s,intent.topic),...ev.meetings(s,intent.topic,now),...await ev.epics(s,intent.topic).catch(()=>[])];
  if(intent.configs&&!sets.length)return kit.reply(s,command,{by:BY,text:'В конфигах проекта не нашёл ничего про «'+intent.topic+'»'+(folders.length?'':' — к чату не привязана папка проекта')+'. Раздел не трогаю.'});
  const d=await draft(s,{...intent,doc,sec,sets,sources});
  const draftId=randomUUID();
  remember(s,draftId,{target:t,title:d.heading,level:sec?.level||2,version:doc.version,old:d.old,facts:d.facts.map(f=>({cite:f.cite,value:f.value,field:f.field,names:f.names})),sources:sources.map(x=>({label:x.label,text:x.text})),state:'draft'});
  const card={mode:'draft',draftId,target:{kind:t.kind,where:doc.where,title:doc.title,url:doc.url},section:{title:d.heading,exists:!!sec,level:sec?.level||2},
   old:d.old,text:d.body,ops:diff.wordDiff(d.old,d.body),unclear:d.unclear,cited:d.cited,by:d.by,
   facts:d.facts.slice(0,60).map(f=>({cite:f.cite,object:f.object,field:f.field,value:f.value})),configs:sets.map(x=>({label:x.label,files:x.files.slice(0,6),count:x.facts.length})),
   sources:sources.map(x=>({kind:x.kind,label:x.label,text:x.text,url:x.url||''}))};
  const said=(sec?'Обновил черновик раздела «':'Черновик нового раздела «')+d.heading+'» для GDD ('+KIND[t.kind]+'): '+d.cited+' '+kit.plural(d.cited,['число','числа','чисел'])+' со ссылкой на источник'+(d.unclear.length?', '+d.unclear.length+' помечено «уточнить»':'')+'. В GDD запишу только после «Записать в GDD» на карточке.';
  return kit.reply(s,command,{by:BY,text:said,data:{gddCard:card}});
 });
}

async function gapsTurn(s,command,{scan}={}){
 return where(s,async t=>{
  if(!t)return kit.reply(s,command,{by:BY,question:true,text:'Не понял, где GDD. Скажите «GDD лежит в docs/gdd.md» или пришлите ссылку.'});
  const folders=roots(s);
  if(!folders.length)return kit.reply(s,command,{by:BY,question:true,text:'Привяжите к чату папку проекта — системы ищу в её конфигах и коде.'});
  let doc;try{doc=await target.read(s,t);}catch(e){return kit.failure(s,command,BY,e);}
  s.requestProgress?.report?.('Ищу системы в конфигах и коде');
  const list=await ev.systems(folders,{scan});
  const heads=diff.sections(doc.text).filter(x=>x.level>=1);
  const rows=list.map(x=>{
   const hit=heads.find(h=>diff.overlap(x.name,h.title)>0);
   const mention=!hit&&heads.find(h=>diff.overlap(x.name,h.body)>0);
   return {name:x.name,kind:x.kind,files:x.files.slice(0,3),status:hit?'covered':mention?'mentioned':'missing',section:hit?.title||mention?.title||''};
  });
  const missing=rows.filter(r=>r.status!=='covered');
  const card={mode:'gaps',target:{kind:t.kind,where:doc.where,title:doc.title,url:doc.url},sections:heads.length,rows:[...missing,...rows.filter(r=>r.status==='covered')]};
  const text=!rows.length?'В конфигах и коде проекта не нашёл систем, которые можно сверить с GDD.':!missing.length?'Все '+rows.length+' '+kit.plural(rows.length,['система','системы','систем'])+' из конфигов и кода есть в GDD.':
   'В GDD нет разделов для '+missing.length+' из '+rows.length+' '+kit.plural(rows.length,['системы','систем','систем'])+': '+missing.slice(0,6).map(r=>r.name).join(', ')+'.';
  return kit.reply(s,command,{by:BY,text,data:{gddCard:card}});
 });
}

function bindTurn(s,command,intent){
 const t=target.parse(s,intent.where);
 if(!t)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл «'+clip(intent.where,80)+'»: нужен .md-файл в папке проекта или ссылка на Confluence / Google Документ.'});
 target.bind(s,t);
 return kit.reply(s,command,{by:BY,text:'Запомнил: GDD этого проекта — '+t.label+' ('+KIND[t.kind]+').'});
}

function setup(s){
 const guard=draftId=>{
  if(!kit.installed(s,ID))throw Error('Приложение «Геймдизайн-документ» не добавлено.');
  if(typeof draftId!=='string'||!/^[0-9a-f-]{36}$/.test(draftId))throw Error('Некорректный черновик.');
  const d=recall(s,draftId);if(!d)throw Error('Черновик устарел. Попросите подготовить раздел заново.');
  return d;
 };
 const body=text=>{if(typeof text!=='string'||!text.trim()||text.length>100000)throw Error('Пустой или слишком длинный текст раздела.');return text.replace(/\r\n?/g,'\n').trim();};
 return {ipc:{
  state(draftId){return {state:guard(draftId).state};},
  // The diff and the numbers without a source for the text in the card's editor (nothing is changed).
  preview(draftId,text){const d=guard(draftId),t=body(text);return {ops:diff.wordDiff(d.old||'',t),unclear:unbacked(t,d.facts,d.sources)};},
  // Writes exactly the editor's section into the GDD, once, only if the GDD did not change since the draft.
  async apply(draftId,text){
   const d=guard(draftId),t=body(text);
   if(d.state==='saved')return {ok:true,text:'Уже записано в GDD'};
   const r=await target.write(s,d.target,{title:d.title,body:t,version:d.version,level:d.level});
   remember(s,draftId,{state:'saved'});
   return {ok:true,text:'Раздел «'+d.title+'» записан: '+r.where};
  },
  // Permission to edit Google Docs (Docs write scope) for the chosen Google account.
  async grant(){const workspace=require('../../google-workspace.cjs'),auth=require('../google-drive/auth.cjs');await workspace.consent(s,'docs',{account:auth.chosen(s.settings)?.key||'',write:true});return {started:true};}
 }};
}
async function turn(s,command,deps={}){
 if(!kit.installed(s,ID))return null;
 const intent=kind(command);if(!intent)return null;
 try{
  if(intent.kind==='bind')return bindTurn(s,String(command),intent);
  if(intent.kind==='gaps')return await gapsTurn(s,String(command),deps);
  return await draftTurn(s,String(command),intent,deps);
 }catch(e){if(e?.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'gdd',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,kind,title,check,draft,teardown(){},
 dashboard:{accepts:command=>kind(command)?.kind==='gaps',size:'m',widgets:[]}};
