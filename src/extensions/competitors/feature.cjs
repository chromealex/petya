// «Конкуренты»: competitor games tracked per project. App Store facts come from Apple's public iTunes Lookup/Search
// API (version, release notes, rating, number of ratings, price, size, last update); Google Play has no official API,
// so its facts come from Petya's web search engine or are skipped with a note. Each read is kept as a daily local
// snapshot, so new versions, other release notes, rating, size and price changes are found by comparing snapshots.
// The local model only picks highlights from release notes, and every highlight must be a verbatim quote of the
// notes (checked here) — no invented features. Our own games for «Сравнить с нами» are the App Store apps the
// «Отзывы в сторах» app knows. Removing a competitor keeps its history and can be undone.
const kit=require('../app-kit.cjs');
const itunes=require('./itunes.cjs');
const play=require('./play.cjs');
const h=require('./history.cjs');
const query=require('./query.cjs');
const ID='competitors',BY='Конкуренты',NOTICE='competitors-refresh';
const DAY=86400000;
const WEB_LIMIT=3;

function validate(next){
 const c=String(next.competitorsCountry||'us').trim().toLowerCase();
 if(!itunes.COUNTRY.test(c))throw Error('Страна App Store — двухбуквенный код, например us, ru, de.');
 next.competitorsCountry=c;
}
const country=s=>itunes.country(s.settings.competitorsCountry);
const today=(now=new Date())=>new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())).toISOString().slice(0,10);
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,'');
const date=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});};
const num=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const big=n=>n>=1e6?(n/1e6).toLocaleString('ru-RU',{maximumFractionDigits:1})+' млн':n>=1e3?Math.round(n/1e3).toLocaleString('ru-RU')+' тыс.':String(n);

// --- Notification center: refreshing with web searches can take a while ---------------------------------------
const state={operation:null};
function publish(s,item){
 state.operation={id:NOTICE,title:BY,...item};
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',state.operation);}catch{/* window closing */}
}

// --- Our games: the App Store apps «Отзывы в сторах» is set up for -------------------------------------------------
function ourIds(settings){
 try{return require('../store-reviews/stores.cjs').list(settings.storeReviewsAscApps,itunes.ID).map(a=>a.id);}catch{return [];}
}

// --- Highlights: verbatim quotes of release notes -----------------------------------------------------------------------
const flat=v=>String(v||'').replace(/\s+/g,' ').trim();
const KINDS=['механика','контент','событие','баланс','монетизация','исправления','другое'];
// Without a model: the first bullet lines of the notes, as written.
function bullets(notes,limit=3){
 return String(notes||'').split(/\n+/).map(l=>l.replace(/^\s*(?:[-•*–—▪●◦]|\d+[.)])\s*/,'').trim()).filter(l=>l.length>=8&&!/^(?:what'?s new|что нового|new in|in this update|в этом обновлении)[:!]?$/i.test(l)).slice(0,limit).map(quote=>({quote:quote.slice(0,240),kind:null}));
}
function verified(notes,list){
 const hay=flat(notes).toLowerCase(),seen=new Set();
 return (list||[]).map(x=>({quote:flat(x?.quote).replace(/^[«"“]|[»"”]$/g,'').trim(),kind:KINDS.includes(x?.kind)?x.kind:null}))
  .filter(x=>x.quote.length>=6&&hay.includes(x.quote.toLowerCase())&&!seen.has(x.quote.toLowerCase())&&seen.add(x.quote.toLowerCase())).slice(0,4);
}
async function highlights(s,rows){
 const withNotes=rows.filter(r=>r.notes&&r.fresh).slice(0,6);
 if(!withNotes.length)return;
 let answer=null;
 if(s.settings.model){
  s.requestProgress?.report('Выбираю главное из описаний обновлений');
  try{answer=await kit.modelJSON(s,{system:'Ниже тексты «Что нового» из обновлений игр-конкурентов в App Store. Для каждой игры выбери до 4 главных изменений. quote — дословный фрагмент текста, скопированный без изменений (не переводи и не пересказывай). kind — одно из: '+KINDS.join(', ')+'. Ничего не придумывай: если текст общий («исправления ошибок»), так и отметь.',
   user:{apps:withNotes.map(r=>({id:r.key,name:r.name,notes:r.notes.slice(0,1500)}))},
   schema:{type:'object',properties:{apps:{type:'array',items:{type:'object',properties:{id:{type:'string'},highlights:{type:'array',items:{type:'object',properties:{quote:{type:'string'},kind:{type:'string',enum:KINDS}},required:['quote','kind']},maxItems:4}},required:['id','highlights']}}},required:['apps']},predict:900,temperature:0.1});}
  catch{answer=null;}
 }
 for(const r of withNotes){
  const fromModel=verified(r.notes,answer?.apps?.find(a=>a.id===r.key)?.highlights);
  r.highlights=fromModel.length?fromModel:bullets(r.notes);
  r.highlightsBy=fromModel.length?'model':'text';
 }
}

// --- Reading facts and keeping snapshots ---------------------------------------------------------------------------
async function refresh(s,entries,{now=new Date(),web=true}={}){
 const st=h.store(s),day=today(now),notes=[];
 const apple=entries.filter(e=>e.store==='appstore'),google=entries.filter(e=>e.store==='play');
 const facts=new Map();
 if(apple.length){
  s.requestProgress?.report('Читаю App Store');
  const found=await itunes.lookup(s,apple.map(e=>e.id),country(s));
  for(const e of apple){const f=found.get(e.id);if(f)facts.set(e.key,f);else notes.push('«'+e.name+'» нет в App Store страны '+country(s).toUpperCase()+' (или игру сняли с продажи).');}
 }
 // Google Play through the web search engine: a few apps per request, once a day each.
 const stale=google.filter(e=>!h.history(st,e.key).some(x=>x.day===day&&x.web));
 if(google.length&&web){
  const todo=stale.slice(0,WEB_LIMIT);
  if(todo.length&&play.available(s))publish(s,{text:'Ищу данные Google Play: 0 из '+todo.length,busy:true,kind:'info',version:'running:'+day});
  let done=0,skipped=null;
  for(const e of todo){
   s.requestProgress?.report('Ищу страницу Google Play: '+e.name);
   try{const f=await play.lookup(s,e.id,e.name===e.id?'':e.name);if(f.skipped)skipped=f.note;else facts.set(e.key,f);}
   catch(err){notes.push('Google Play «'+e.name+'»: '+err.message);}
   done++;if(play.available(s))publish(s,{text:'Ищу данные Google Play: '+done+' из '+todo.length,busy:true,percent:Math.round(100*done/todo.length),kind:'info',version:'running:'+day});
  }
  if(skipped)notes.push(skipped);
  if(stale.length>todo.length)notes.push('Google Play: за один запрос проверяю до '+WEB_LIMIT+' игр через поиск, остальные — в следующий раз.');
  if(todo.length&&play.available(s))publish(s,{text:'Данные Google Play обновлены: '+[...facts.keys()].filter(k=>k.startsWith('play:')).length+' из '+todo.length,busy:false,kind:'success',version:'done:'+day});
 }
 const items=entries.map(e=>{
  const f=facts.get(e.key);
  const rows=f?h.record(st,e.key,day,f):h.history(st,e.key);
  const cur=rows.at(-1)||null,prev=cur?h.previous(rows,cur.day):null;
  return {entry:e,facts:f||null,rows,cur,prev};
 });
 return {items,notes};
}

function row(x,{days,now=new Date(),trend=7}){
 const e=x.entry,f=x.facts||{},cur=x.cur||{};
 const updated=f.updated||cur.updated||null;
 const old=h.around(x.rows,cur.day||today(now),trend);
 const fresh=!!updated&&now.getTime()-Date.parse(updated)<=days*DAY;
 return {key:e.key,store:e.store,id:e.id,name:f.name||e.name,developer:f.developer||e.developer||'',url:f.url||e.url||'',
  rating:f.rating??cur.rating??null,ratings:f.ratings??cur.ratings??null,ratingCurrent:f.ratingCurrent??cur.ratingCurrent??null,
  version:f.version||cur.version||'',updated,size:f.size??cur.size??null,price:f.price??cur.price??null,formattedPrice:f.formattedPrice||'',genre:f.genre||'',
  notes:f.notes||cur.notes||'',fresh,changes:h.changes(x.prev,cur),since:x.prev?.day||null,
  history:x.rows.slice(-60).filter(r=>r.rating!=null).map(r=>({day:r.day,rating:r.rating})),
  ratingDelta:old&&old!==cur&&old.rating!=null&&cur.rating!=null?Math.round((cur.rating-old.rating)*100)/100:null,ratingFrom:old&&old!==cur?old.day:null,ratingWas:old&&old!==cur?old.rating:null,
  web:f.web||null,stale:!x.facts,highlights:[],added:e.added||null};
}

// --- Chat -------------------------------------------------------------------------------------------------------------------
function cardBase(s,project,mode,extra={}){return {project:{id:project,name:h.projectName(s,project)},country:country(s),mode,checked:new Date().toISOString(),...extra};}
const emptyText=(s,project)=>'Список конкурентов'+(h.projectName(s,project)?' проекта «'+h.projectName(s,project)+'»':'')+' пуст. Скажите «добавь в конкуренты Clash of Clans» или пришлите ссылку на игру в App Store или Google Play.';

async function addTurn(s,command,project,now){
 const st=h.store(s),list=h.list(st,project);
 const t=query.target(command);
 if(!t)return kit.reply(s,command,{by:BY,question:true,text:'Кого добавить в конкуренты? Назовите игру или пришлите ссылку App Store / Google Play.'});
 let entry=null;
 if(t.store==='appstore'&&t.id){
  const found=await itunes.lookup(s,[t.id],t.country||country(s));const f=found.get(t.id);
  if(!f)return kit.reply(s,command,{by:BY,question:true,text:'В App Store ('+(t.country||country(s)).toUpperCase()+') нет приложения с id '+t.id+'. Проверьте ссылку.'});
  entry={key:f.key,store:'appstore',id:f.id,name:f.name,developer:f.developer,url:f.url};
 }else if(t.store==='play'&&t.id){
  entry={key:'play:'+t.id,store:'play',id:t.id,name:t.id,developer:'',url:'https://play.google.com/store/apps/details?id='+t.id};
 }else if(t.store==='play'){
  return kit.reply(s,command,{by:BY,question:true,text:'В Google Play нет открытого поиска по названию. Пришлите ссылку на страницу игры (play.google.com/store/apps/details?id=…) или пакет вида com.company.game.'});
 }else{
  s.requestProgress?.report('Ищу «'+t.name+'» в App Store');
  const found=(await itunes.search(s,t.name,country(s),6)).filter(r=>r.name);
  // Only an exact name is added at once; anything else is a choice on the card.
  const exact=found.filter(r=>norm(r.name)===norm(t.name));
  if(exact.length!==1){
   if(!found.length)return kit.reply(s,command,{by:BY,question:true,text:'Не нашёл «'+t.name+'» в App Store ('+country(s).toUpperCase()+'). Уточните название или пришлите ссылку.'});
   const candidates=found.slice(0,5).map(f=>({...row({entry:{key:f.key,store:'appstore',id:f.id,name:f.name},facts:f,rows:[],cur:null,prev:null},{days:30,now}),tracked:list.some(e=>e.key===f.key)}));
   return kit.reply(s,command,{by:BY,question:true,text:'Нашёл в App Store несколько игр по запросу «'+t.name+'». Нажмите «Следить» у нужной.',data:{competitors:cardBase(s,project,'candidates',{rows:candidates,query:t.name})}});
  }
  const f=exact[0];entry={key:f.key,store:'appstore',id:f.id,name:f.name,developer:f.developer,url:f.url};
 }
 if(list.some(e=>e.key===entry.key))return listTurn(s,command,project,now,{text:'«'+entry.name+'» уже в списке конкурентов.',mark:entry.key});
 h.setList(st,project,[...list,{...entry,added:new Date(now).toISOString()}]);
 return listTurn(s,command,project,now,{text:'Добавил «'+entry.name+'» в конкуренты'+(h.projectName(s,project)?' проекта «'+h.projectName(s,project)+'»':'')+'. Снимок сохранён — изменения версии, рейтинга и размера буду показывать с этого дня.',mark:entry.key,mode:'added'});
}

function removeTurn(s,command,project){
 const st=h.store(s),list=h.list(st,project);
 const t=query.target(command);
 const match=t?list.filter(e=>(t.id&&(e.id===t.id||e.key===t.store+':'+t.id))||(t.name&&(norm(e.name)===norm(t.name)||norm(e.name).includes(norm(t.name))&&norm(t.name).length>=4))):[];
 if(match.length!==1)return kit.reply(s,command,{by:BY,question:true,text:list.length?(match.length?'Под это подходят несколько: ':'Не нашёл такой игры в списке. Сейчас отслеживаю: ')+(match.length?match:list).map(e=>'«'+e.name+'»').join(', ')+'. Кого убрать?':emptyText(s,project)});
 const gone=match[0];
 h.setList(st,project,list.filter(e=>e.key!==gone.key));
 // History is kept: «Вернуть» on the card restores the entry with everything recorded so far.
 return kit.reply(s,command,{by:BY,text:'Убрал «'+gone.name+'» из конкурентов. История снимков сохранена — можно вернуть кнопкой на карточке.',data:{competitors:cardBase(s,project,'removed',{removed:gone,rows:[]})}});
}

async function listTurn(s,command,project,now,{text:lead,mark,mode:forced}={}){
 const st=h.store(s),list=h.list(st,project);
 if(!list.length)return kit.reply(s,command,{by:BY,question:true,text:emptyText(s,project)});
 const intent=forced||query.intent(command),days=query.days(command);
 const trend=/месяц/iu.test(command)?30:7;
 const read=await refresh(s,list,{now});
 const notes=[...new Set(read.notes)];
 let rows=read.items.map(x=>row(x,{days,now,trend}));
 if(['news','mechanics','added','list'].includes(intent))await highlights(s,rows);
 let ours=[];
 if(intent==='compare'){
  const ids=ourIds(s.settings);
  if(ids.length){try{const found=await itunes.lookup(s,ids,country(s));ours=ids.map(id=>found.get(id)).filter(Boolean).map(f=>({...row({entry:{key:f.key,store:'appstore',id:f.id,name:f.name},facts:f,rows:[],cur:null,prev:null},{days,now}),ours:true}));}catch(e){notes.push('Наши игры: '+e.message);}}
  if(!ours.length)notes.push('Чтобы сравнить с нашими играми, добавьте их App Store id в «Отзывы в сторах» (Настройки → Приложения App Store).');
 }
 // Order: what the question is about first.
 if(intent==='rating')rows.sort((a,b)=>(b.ratingDelta??-9)-(a.ratingDelta??-9)||(b.rating??0)-(a.rating??0));
 else if(intent==='compare')rows.sort((a,b)=>(b.rating??0)-(a.rating??0));
 else rows.sort((a,b)=>(b.changes.length?1:0)-(a.changes.length?1:0)||String(b.updated||'').localeCompare(String(a.updated||'')));
 const text=lead||summary(intent,rows,ours,{days,trend});
 const card=cardBase(s,project,intent,{rows,ours,days,trend,mark:mark||null,notes:notes.slice(0,5)});
 const sources=rows.filter(r=>r.web).flatMap(r=>r.web.sources.slice(0,1));
 return kit.reply(s,command,{by:BY,text,data:{competitors:card},sources});
}

function summary(intent,rows,ours,{days,trend}){
 const n=rows.length;
 const updated=rows.filter(r=>r.fresh);
 const label=days<=2?'за последние сутки':days===7?'за неделю':days===14?'за 2 недели':days===60?'за 2 месяца':'за 30 дней';
 const changed=rows.filter(r=>r.changes.length);
 const what=c=>c.kind==='version'?'версия '+c.from+' → '+c.to:c.kind==='notes'?'новое описание обновления':c.kind==='rating'?'рейтинг '+num(c.from)+' → '+num(c.to):c.kind==='ratings'?'оценок '+big(c.from)+' → '+big(c.to):c.kind==='size'?'размер '+Math.round(c.from/1048576)+' → '+Math.round(c.to/1048576)+' МБ':'цена '+c.from+' → '+c.to;
 const since=changed.length?' С прошлой проверки: '+changed.slice(0,3).map(r=>r.name+' — '+r.changes.map(what).join(', ')).join('; ')+'.':'';
 if(intent==='rating'){
  const moved=rows.filter(r=>r.ratingDelta!=null&&Math.abs(r.ratingDelta)>=0.01);
  if(!rows.some(r=>r.ratingDelta!=null))return 'Истории рейтингов пока нет: Петя сохраняет снимок раз в день, когда вы спрашиваете о конкурентах. Сейчас: '+rows.filter(r=>r.rating!=null).slice(0,5).map(r=>r.name+' '+num(r.rating)+' ★').join(', ')+'.';
  const up=moved.filter(r=>r.ratingDelta>0),down=moved.filter(r=>r.ratingDelta<0);
  const per=trend===30?'за месяц':'за неделю';
  return (up.length?'Рейтинг '+per+' вырос у '+up.map(r=>r.name+' ('+num(r.ratingWas)+' → '+num(r.rating)+')').join(', ')+'.':'Рейтинг '+per+' ни у кого не вырос.')+(down.length?' Снизился у '+down.map(r=>r.name+' ('+(r.ratingDelta>0?'+':'−')+num(Math.abs(r.ratingDelta))+')').join(', ')+'.':'');
 }
 if(intent==='compare'){
  const rated=rows.filter(r=>r.rating!=null);
  const avg=rated.length?rated.reduce((a,r)=>a+r.rating,0)/rated.length:null;
  if(!ours.length)return 'Конкурентов: '+n+(avg!=null?', средний рейтинг '+num(Math.round(avg*100)/100)+' ★':'')+'. Наших игр в «Отзывы в сторах» не нашёл — сравнить не с чем.';
  return ours.map(o=>{
   const above=rated.filter(r=>o.rating!=null&&r.rating>o.rating).length;
   const head=('Наша «'+o.name+'»: '+(o.rating!=null?num(o.rating)+' ★ ('+big(o.ratings||0)+' оценок)':'без рейтинга')+(o.updated?', обновлена '+date(o.updated):'')).replace(/\.?$/,'.');
   return head+(o.rating!=null&&rated.length?' Рейтинг выше нашего у '+above+' из '+rated.length+' конкурентов'+(avg!=null?', в среднем у них '+num(Math.round(avg*100)/100)+' ★':'')+'.':'');
  }).join(' ');
 }
 if(intent==='mechanics'){
  const picks=updated.filter(r=>r.highlights.length).map(r=>r.name+': '+r.highlights.filter(x=>!x.kind||['механика','контент','событие','монетизация'].includes(x.kind)).slice(0,2).map(x=>'«'+x.quote+'»').join(', ')).filter(x=>!/:\s*$/.test(x));
  return picks.length?'Что добавили в обновлениях '+label+' — '+picks.join('; ')+'.':'В описаниях обновлений '+label+' новых механик не нашлось'+(updated.length?' (обновились: '+updated.map(r=>r.name).join(', ')+')':'')+'.';
 }
 if(intent==='list')return 'Отслеживаю '+n+' '+kit.plural(n,['игру','игры','игр'])+': '+rows.map(r=>r.name).join(', ')+'.'+since;
 if(!updated.length)return label[0].toUpperCase()+label.slice(1)+' никто из '+n+' '+kit.plural(n,['конкурента','конкурентов','конкурентов'])+' не обновился.'+since;
 return 'Обновились '+label+': '+updated.length+' из '+n+' — '+updated.slice(0,4).map(r=>r.name+(r.version?' '+r.version:'')+' ('+date(r.updated)+')').join(', ')+'.'+since;
}

async function competitorsTurn(s,command,now=new Date()){
 const project=h.projectOf(s);
 const intent=query.intent(command);
 if(intent==='add')return addTurn(s,command,project,now);
 if(intent==='remove')return removeTurn(s,command,project);
 return listTurn(s,command,project,now);
}

function setup(s){
 const project=id=>typeof id==='string'&&id?id:h.projectOf(s);
 const ready=()=>{if(!kit.installed(s,ID))throw Error('Приложение «Конкуренты» не добавлено.');};
 return {ipc:{
  progress:()=>state.operation,
  items:projectId=>kit.installed(s,ID)?h.list(h.store(s),project(projectId)):[],
  lists:()=>kit.installed(s,ID)?{country:country(s),projects:h.projects(h.store(s),s)}:{country:country(s),projects:[]},
  // «Следить» on a card (a search candidate) or the settings field: adds one App Store app / Play package.
  async add(projectId,item){
   ready();const st=h.store(s),p=project(projectId),list=h.list(st,p);
   const store=item?.store==='play'?'play':'appstore',id=String(item?.id||'');
   if(store==='appstore'&&!itunes.ID.test(id)||store==='play'&&!play.PACKAGE.test(id))throw Error('Некорректная игра.');
   const key=store+':'+id;
   if(list.some(e=>e.key===key))return {key,text:'Уже в списке конкурентов'};
   let entry={key,store,id,name:String(item.name||id).slice(0,200),developer:String(item.developer||'').slice(0,200),url:store==='play'?'https://play.google.com/store/apps/details?id='+id:'https://apps.apple.com/app/id'+id};
   if(store==='appstore'){const f=(await itunes.lookup(s,[id],country(s))).get(id);if(!f)throw Error('В App Store нет такой игры.');entry={...entry,name:f.name,developer:f.developer,url:f.url};h.record(st,key,today(),f);}
   h.setList(st,p,[...list,{...entry,added:new Date().toISOString()}]);
   return {key,text:'«'+entry.name+'» добавлена в конкуренты'};
  },
  // «Убрать» (red trash) on a card or in settings; the history stays, so «Отменить» restores the entry.
  remove(projectId,key){
   ready();const st=h.store(s),p=project(projectId),list=h.list(st,p),gone=list.find(e=>e.key===key);
   if(!gone)throw Error('Этой игры уже нет в списке.');
   h.setList(st,p,list.filter(e=>e.key!==key));
   return {key,entry:gone,text:'«'+gone.name+'» убрана из конкурентов'};
  },
  restore(projectId,entry){
   ready();const st=h.store(s),p=project(projectId),list=h.list(st,p);
   if(!entry||typeof entry.key!=='string'||!/^(?:appstore|play):/.test(entry.key))throw Error('Нечего вернуть.');
   if(!list.some(e=>e.key===entry.key))h.setList(st,p,[...list,{key:entry.key,store:entry.store==='play'?'play':'appstore',id:String(entry.id||''),name:String(entry.name||'').slice(0,200),developer:String(entry.developer||'').slice(0,200),url:String(entry.url||''),added:entry.added||new Date().toISOString()}]);
   return {key:entry.key,text:'«'+entry.name+'» снова в конкурентах'};
  },
  async search(term){ready();return (await itunes.search(s,term,country(s),6)).map(f=>({store:'appstore',id:f.id,name:f.name,developer:f.developer,rating:f.rating}));}
 }};
}

async function turn(s,command){
 const text=String(command||'');
 if(!query.about(text)||!kit.installed(s,ID))return null;
 try{return await competitorsTurn(s,text);}
 catch(e){return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+(e.message||'App Store недоступен.')});}
}
module.exports={name:'competitors',defaults:{['extension_'+ID]:'false',competitorsCountry:'us'},validate,setup,turn,competitorsTurn,summary,bullets,verified};
