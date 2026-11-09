// «Воронки»: a funnel of game events — tutorial, onboarding, install → first purchase, or the user's own steps —
// with conversion and drop-off between steps, the time between steps and a comparison by platform, country and
// version. Everything on the card is computed by code (compute.cjs); no model is involved.
// Where the events come from, in this order:
//  1. a «metrics-source» that reports events and per-player journeys (AppMetrica: Reporting API event names and the
//     Logs API exports) — read at once, it only reads;
//  2. a database of «SQL по словам» with an events table (found in the schema by its columns): the query is written by
//     code (sql.cjs), checked by the SQL app's read-only validator, shown on the card with its cost estimate and run
//     only on «Выполнить» (ipc `run`), exactly as the SQL app does. A preset first needs the period's event names:
//     that query is shown and confirmed the same way.
// «Сохранить воронку» keeps the steps per project (store.cjs); «Выгрузить в Google Таблицы» goes through the
// cross-app kind `spreadsheet-export`.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const S=require('./steps.cjs');
const compute=require('./compute.cjs');
const fsql=require('./sql.cjs');
const store=require('./store.cjs');
const ID='funnels',BY='Воронки';
const deps={now:()=>Date.now(),metrics:null,sql:null};

const ask=(spec,resume)=>require('../../input-required.cjs').ask(spec,resume);
const num=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:0});
const pct=v=>v===null||v===undefined?'—':(Math.round(v*1000)/10).toLocaleString('ru-RU')+'%';
function duration(sec){
 if(sec===null||sec===undefined||!Number.isFinite(sec))return '';
 const s=Math.round(sec);
 if(s<60)return s+' с';
 if(s<3600)return Math.floor(s/60)+' мин'+(s%60&&s<600?' '+s%60+' с':'');
 if(s<86400)return Math.floor(s/3600)+' ч'+(Math.floor(s%3600/60)?' '+Math.floor(s%3600/60)+' мин':'');
 return Math.floor(s/86400)+' д'+(Math.floor(s%86400/3600)?' '+Math.floor(s%86400/3600)+' ч':'');
}
const rangeText=r=>r?(r.hi===null?'больше '+duration(r.lo):duration(r.lo||0)+'–'+duration(r.hi)):'';
const day=ms=>new Date(ms).toISOString().slice(0,10);
function window(days,now=deps.now()){const t=new Date(now),today=Date.UTC(t.getUTCFullYear(),t.getUTCMonth(),t.getUTCDate());return {from:day(today-days*86400000),to:day(today-86400000),days};}

// --- Sources ---------------------------------------------------------------------------------------------------------
function eventSources(s){
 if(deps.metrics)return deps.metrics;
 try{return require('../metrics/sources.cjs').create(s).ready().filter(x=>typeof x.source.events==='function'&&typeof x.source.journeys==='function');}catch{return [];}
}
const sqlSources=()=>deps.sql||require('../sql/sources.cjs');
const maxRows=s=>Math.min(5000,Math.max(10,Number(s.settings.sqlMaxRows)||5000));
async function sqlTarget(s){
 if(s.settings.extension_sql!=='true')return null;
 const S2=require('../sql/schema.cjs'),src=sqlSources();
 let conns=[];try{conns=await src.all(s);}catch{conns=[];}
 for(const conn of conns.slice(0,6)){
  let schema=S2.cached(s.dataRoot,conn.id);
  if(!schema)try{s.requestProgress?.report('Читаю схему базы «'+conn.name+'»');const fresh=await src.engine(s,conn).schema();schema=S2.store(s.dataRoot,conn.id,{database:fresh.database||'',tables:(fresh.tables||[]).slice(0,2000),more:fresh.more||0});}catch{continue;}
  const table=fsql.detect(schema);
  if(table)return {conn,table};
 }
 return null;
}
const publicConn=c=>({id:c.id,name:c.name,dialect:c.dialect,label:c.label||c.name});

// --- Text --------------------------------------------------------------------------------------------------------------
function summary(card){
 const r=card.result,first=r.steps[0],last=r.steps.at(-1);
 if(!first.users)return '«'+card.title+'» '+periodText(card.period.days)+': ни один игрок не начал первый шаг («'+first.label+'»).';
 let text='«'+card.title+'» '+periodText(card.period.days)+': начали '+num(first.users)+' '+kit.plural(first.users,['игрок','игрока','игроков'])+', до шага «'+last.label+'» дошли '+num(last.users)+' ('+pct(r.conversion)+').';
 if(r.worst>0){const w=r.steps[r.worst],t=r.times[r.worst-1];
  text+=' Больше всего уходят между «'+r.steps[r.worst-1].label+'» и «'+w.label+'»: −'+pct(1-w.fromPrev)+' ('+num(w.lost)+' '+kit.plural(w.lost,['игрок','игрока','игроков'])+')'+(t?.median!=null?', медиана времени '+duration(t.median):t?.range?', медиана времени '+rangeText(t.range):'')+'.';}
 return text;
}
const periodText=d=>d===1?'за вчера':'за '+d+' '+kit.plural(d,['день','дня','дней']);

// --- Turns ---------------------------------------------------------------------------------------------------------------
function stepsFor(ask2,events,{install,saved}){
 if(saved)return {steps:saved.steps};
 if(ask2.steps)return S.explicit(ask2.steps,events,{install});
 return S.resolve(ask2.preset,events,{install});
}
function missing(s,text,r){
 return ask({text:r.missing+' Перечислите шаги воронки через стрелку'+(r.candidates?.length?' — например: '+r.candidates.slice(0,4).join(' → '):'')+'.',label:'Шаги воронки',placeholder:'install → tutorial_start → tutorial_complete'},
  answer=>funnelTurn(s,'воронка: '+String(answer||'').trim(),{title:titleOf(query.parse(text),null)}));
}
const titleOf=(a,saved)=>saved?.name||(a.steps?'Своя воронка':S.TITLE[a.preset]||'Воронка');

async function journeysTurn(s,text,a,src,w,saved,title){
 s.requestProgress?.report('Читаю события из '+src.name);
 const install=!!src.source.installs;
 const events=saved?[]:await src.source.events(s,{from:w.from,to:w.to,app:null,platform:null});
 const r=stepsFor(a,events,{install,saved});
 if(r.missing)return missing(s,text,r);
 s.requestProgress?.report('Собираю путь игроков ('+r.steps.length+' '+kit.plural(r.steps.length,['шаг','шага','шагов'])+')');
 const j=await src.source.journeys(s,{from:w.from,to:w.to,app:null,platform:null,events:r.steps.map(x=>x.event),install:r.steps.some(x=>x.event===S.INSTALL)});
 const result=compute.fromJourneys(j?.journeys||[],r.steps,w);
 const card={id:require('node:crypto').randomUUID(),title,preset:a.preset,steps:r.steps,period:w,segment:a.segment||'platform',state:'done',source:{kind:'events',id:src.id,name:src.name},
  result,truncated:!!j?.truncated,saved:!!saved,project:store.project(s).name,at:deps.now()};
 return kit.reply(s,text,{by:BY,text:summary(card)+(card.truncated?' Выгрузка обрезана по объёму — числа неполные.':''),data:{funnelCard:card}});
}

async function estimate(s,conn,sql){
 try{return await sqlSources().engine(s,conn).estimate(sql);}catch(e){return {kind:'unknown',note:e.message};}
}
async function sqlCard(s,base,conn,table,{phase,steps,segment}){
 const V=require('../sql/validate.cjs');
 const sql=phase==='events'?fsql.events(table,{dialect:conn.dialect,from:base.period.from,to:base.period.to}):fsql.funnel(table,{dialect:conn.dialect,from:base.period.from,to:base.period.to,steps,segment});
 const checked=V.check(sql,{dialect:conn.dialect,maxRows:maxRows(s)});
 return {...base,state:'pending',phase,steps:steps||base.steps||null,segment,sql:checked.sql,estimate:await estimate(s,conn,checked.sql)};
}
async function sqlTurn(s,text,a,target,w,saved,title){
 const {conn,table}=target;
 const known=saved?{steps:saved.steps}:a.steps?S.explicit(a.steps,[],{install:false}):null;
 const segment=a.segment&&table[a.segment]?a.segment:table.platform?'platform':table.country?'country':table.version?'version':null;
 const base={id:require('node:crypto').randomUUID(),title,preset:a.preset,period:w,source:{kind:'sql',id:conn.id,name:conn.name},connection:publicConn(conn),table,saved:!!saved,project:store.project(s).name,at:deps.now(),question:String(text).slice(0,300)};
 const card=await sqlCard(s,base,conn,table,known?{phase:'funnel',steps:known.steps,segment}:{phase:'events',steps:null,segment});
 const what=card.phase==='events'?'Сначала найду события '+(a.preset==='purchase'?'установки и покупки':a.preset==='onboarding'?'онбординга':'туториала')+' в таблице '+table.table:'Запрос воронки к таблице '+table.table;
 return kit.reply(s,text,{by:BY,text:what+' («'+conn.name+'»). Проверьте SQL и нажмите «Выполнить» — без этого Петя ничего не запустит.',data:{funnelCard:card}});
}

async function funnelTurn(s,text,{title:forced}={}){
 const a=query.parse(text);
 const saved=a.steps?null:store.find(s,a.name);
 const title=forced||titleOf(a,saved);
 const w=window(a.days);
 const src=eventSources(s)[0];
 if(src)return journeysTurn(s,text,a,src,w,saved,title);
 const target=await sqlTarget(s);
 if(target)return sqlTurn(s,text,a,target,w,saved,title);
 return kit.reply(s,text,{by:BY,question:true,text:'Для воронки нужны события игры. Подключите AppMetrica (Каталог → «AppMetrica», затем токен и приложение в настройках) или базу с таблицей событий в «SQL по словам» (столбцы: игрок, событие, время).'});
}

async function turn(s,command){
 const text=String(command||'');
 let saved=[];try{saved=s.dataRoot?store.list(s):[];}catch{saved=[];}
 const k=query.about(text,{saved});
 if(!k||!kit.installed(s,ID))return null;
 try{
  if(k==='list'){
   if(!saved.length)return kit.reply(s,text,{by:BY,text:'В проекте «'+store.project(s).name+'» сохранённых воронок нет. Постройте воронку и нажмите «Сохранить воронку».'});
   return kit.reply(s,text,{by:BY,text:'Сохранённые воронки проекта «'+store.project(s).name+'»: '+saved.map(f=>'«'+f.name+'» ('+f.steps.map(x=>x.label).join(' → ')+')').join('; ')+'. Скажите «воронка «название»», чтобы построить.'});
  }
  if(k==='ask')return ask({text:'Какую воронку построить?',label:'Воронка',options:['Туториал','Онбординг','От установки до первой покупки',...saved.slice(0,3).map(f=>'«'+f.name+'»')]},
   answer=>{const v=String(answer||'').trim();return funnelTurn(s,/^«/.test(v)?'воронка '+v:'воронка '+v.toLowerCase());});
  return await funnelTurn(s,text);
 }catch(e){
  if(e?.name==='InputRequired')throw e;
  return kit.failure(s,command,BY,e);
 }
}

// --- Card calls ------------------------------------------------------------------------------------------------------------
function findCard(s,id){
 for(const topic of s.dialogue?.state?.topics||[])for(const m of topic.messages||[])if(m.extensionData?.funnelCard?.id===id)return {topic,message:m,card:m.extensionData.funnelCard};
 return null;
}
const notices=new Map();
function publish(s,id,item){
 const notice={id:'funnels:'+id,title:BY,...item};notices.set(notice.id,notice);while(notices.size>10)notices.delete(notices.keys().next().value);
 try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',notice);}catch{/* window closing */}
}
// «Выполнить»: the SQL is taken from the stored card (never from the page), checked again, then run.
async function run(s,id){
 const hit=findCard(s,String(id||''));
 if(!hit)throw Error('Карточка воронки не найдена. Повторите вопрос в чате.');
 const {card}=hit;
 if(card.state!=='pending'||!card.sql)throw Error('Этот запрос уже выполнен или не готов.');
 const conn=(await sqlSources().all(s)).find(c=>c.id===card.connection.id);
 if(!conn)throw Error('Подключение «'+card.connection.name+'» удалено или отключено.');
 const V=require('../sql/validate.cjs');
 const checked=V.check(card.sql,{dialect:conn.dialect,maxRows:maxRows(s)});
 publish(s,card.id,{text:'Выполняю запрос воронки в «'+conn.name+'»',busy:true,kind:'info'});
 let next;
 try{
  const result=await sqlSources().engine(s,conn).run(checked.sql,{maxRows:maxRows(s)});
  if(card.phase==='events'){
   const events=fsql.eventRows(result);
   const r=S.resolve(card.preset,events,{install:false});
   if(r.missing)next={...card,state:'error',error:r.missing+(r.candidates?.length?' Есть события: '+r.candidates.join(', ')+'.':''),events:events.slice(0,40)};
   else next=await sqlCard(s,{...card,events:events.slice(0,40)},conn,card.table,{phase:'funnel',steps:r.steps,segment:card.segment});
  }else{
   const rows=fsql.rows(result);
   next={...card,state:'done',result:compute.fromBuckets(rows,card.steps,{dimension:card.segment}),truncated:!!result.truncated,ranAt:deps.now()};
  }
  publish(s,card.id,{text:next.state==='done'?'Воронка готова: «'+card.title+'»':next.state==='pending'?'События найдены — проверьте запрос воронки':'Воронка: '+next.error,busy:false,kind:next.state==='error'?'attention':'success'});
 }catch(e){
  publish(s,card.id,{text:'Запрос воронки не выполнен: '+e.message,busy:false,kind:'attention'});
  next={...card,state:'error',error:e.message};
 }
 hit.message.extensionData={...hit.message.extensionData,funnelCard:next};
 if(next.state==='done')hit.message.text=summary(next);
 s.dialogue.persist();
 return next;
}
function save(s,id){
 const hit=findCard(s,String(id||''));
 if(!hit)throw Error('Карточка воронки не найдена.');
 const {card}=hit;
 if(!card.steps?.length)throw Error('У этой воронки ещё нет шагов.');
 const row=store.save(s,{name:card.title,steps:card.steps,preset:card.preset});
 hit.message.extensionData={...hit.message.extensionData,funnelCard:{...card,saved:true}};
 s.dialogue.persist();
 return {name:row.name,project:row.project};
}
function setup(s){
 return {ipc:{run:id=>run(s,id),save:id=>save(s,id),saved:()=>store.list(s).map(f=>({id:f.id,name:f.name,steps:f.steps.map(x=>x.label)})),
  progress:()=>[...notices.values()]}};
}
// Dashboards (src/features/dashboards.cjs): a funnel only reads; a database query still waits for «Выполнить».
const dashboard={accepts:text=>query.about(String(text||''))==='funnel',widgets:[{title:'Воронка туториала',command:'Воронка туториала'}]};
module.exports={name:'funnels',dashboard,defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,funnelTurn,run,save,summary,duration,window,deps,teardown(){notices.clear();}};
