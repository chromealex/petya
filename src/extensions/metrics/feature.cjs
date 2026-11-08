// «Метрики игры»: DAU, new players, retention D1/D7/D30, revenue and ARPDAU of the game for a period, compared
// with the previous period of the same length, with days that break the weekly pattern flagged (> 3σ from the same
// weekday of the 4 previous weeks). The data comes from every connected «metrics-source» (AppMetrica first);
// each source becomes its own block on the card. Every number is computed by code from the sources' daily series;
// the local model only adds an optional one-line comment without numbers.
const kit=require('../app-kit.cjs');
const query=require('./query.cjs');
const compute=require('./compute.cjs');
const registry=require('./sources.cjs');
const ID='metrics',BY='Метрики игры';
// Sources that can be connected today; listed in the «подключите источник» question.
const KNOWN=[{id:'appmetrica',name:'AppMetrica',where:'Каталог → «AppMetrica», затем Настройки → «AppMetrica»: OAuth-токен и приложение'}];

const ru=(n,d=0)=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:d});
const signed=v=>(v>0?'+':v<0?'−':'')+ru(Math.abs(v)*100,1)+'%';
const money=(v,unit)=>ru(v,v<100?2:0)+' '+({'currency:RUB':'₽','currency:USD':'$','currency:EUR':'€'}[unit]||'');
const DAYS_TEXT=d=>d===1?'вчера':'за '+d+' '+kit.plural(d,['день','дня','дней']);
const PREV_TEXT=d=>d===1?'позавчера':'прошлые '+d+' '+kit.plural(d,['день','дня','дней']);

let sources=null;
const list=s=>(sources||(sources=registry.create(s)));

async function readSource(s,x,ask,w){
 const q={from:w.from,to:w.to,metrics:['dau','new','revenue'],platform:ask.platform,version:ask.version,app:null};
 const answer=await x.source.fetch(s,q);
 const series=registry.normalize(x.id,answer);
 let cohorts=null;const unavailable=[...(answer?.unavailable||[])];
 if(typeof x.source.retention==='function'){
  // Six weeks of install cohorts (D30 of the oldest ones) up to yesterday.
  const from=compute.shift(w.end,-41);
  try{cohorts=(await x.source.retention(s,{...q,from,to:w.end}))?.cohorts||null;}
  catch(e){if(e.status===401||e.status===429)throw e;unavailable.push({metric:'retention',reason:'Ретеншн недоступен: '+e.message});}
 }else unavailable.push({metric:'retention',reason:'Источник не отдаёт когорты.'});
 let versions=[];
 if(typeof x.source.facets==='function')try{versions=(await x.source.facets(s,{...q,from:w.start,to:w.end}))?.versions||[];}catch{versions=[];}
 const apps=typeof x.source.apps==='function'?x.source.apps(s.settings):[];
 const app=apps.find(a=>a.id===answer?.app)||null;
 return {...compute.block({id:x.id,name:x.name,app:app?.name||answer?.app||null,series,cohorts,unavailable},w),versions};
}

function summary(b,ask){
 const kpi=id=>b.kpis.find(k=>k.id===id);
 const line=(k,fmt)=>k?k.label+' '+fmt(k.value)+(k.change!==null&&k.change!==undefined?' ('+(k.points?(k.change>0?'+':k.change<0?'−':'')+ru(Math.abs(k.change)*100,1)+' п.п.':signed(k.change))+' к '+PREV_TEXT(ask.days)+')':''):'';
 const users=v=>ru(v,0),share=v=>ru(v*100,1)+'%';
 const parts={dau:line(kpi('dau'),users),new:line(kpi('new'),users),d1:line(kpi('d1'),share),revenue:line(kpi('revenue'),v=>money(v,kpi('revenue').unit)),arpdau:line(kpi('arpdau'),v=>money(v,kpi('arpdau').unit))};
 const order={dau:['dau','new','d1','revenue'],new:['new','dau'],retention:['d1','dau'],revenue:['revenue','arpdau','dau']}[ask.focus]||['dau','new','d1','revenue'];
 let text=b.name+(b.app?' · '+b.app:'')+', '+DAYS_TEXT(ask.days)+': '+order.map(k=>parts[k]).filter(Boolean).join(', ')+'.';
 if(ask.focus==='retention'&&b.retention?.rows?.length){
  const r=b.retention.rows.find(x=>x.d30)||b.retention.rows.find(x=>x.d7)||b.retention.rows[0];
  text+=' Когорта недели '+new Date(r.week+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+': '+[['D1',r.d1],['D7',r.d7],['D30',r.d30]].filter(x=>x[1]).map(([n,c])=>n+' '+share(c.value)).join(', ')+'.';
 }
 if(ask.focus==='revenue'&&!kpi('revenue')){const u=b.unavailable.find(x=>x.metric==='revenue');if(u)text+=' '+u.reason;}
 if(ask.focus==='retention'&&!b.retention){const u=b.unavailable.find(x=>x.metric==='retention');if(u)text+=' '+u.reason;}
 if(b.anomalies.length){const LABEL={dau:'DAU',new:'новые',revenue:'выручка'};text+=' Необычные дни: '+b.anomalies.slice(-3).map(a=>new Date(a.date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short'})+' — '+LABEL[a.metric]+(a.direction==='up'?' выше':' ниже')+' нормы').join('; ')+'.';}
 return text;
}

// Optional one-line comment by the local model: words only, a line with digits is dropped (numbers are code's).
async function comment(s,b){
 if(!s.settings.model||!b.kpis.length)return '';
 try{
  const r=await kit.modelJSON(s,{system:'Ниже метрики мобильной игры за период и их изменение к прошлому периоду. Одной короткой фразой по-русски (до 15 слов) скажи главное, без чисел и без догадок о причинах.',
   user:{kpis:b.kpis.map(k=>({name:k.label,change:k.change})),anomalies:b.anomalies.map(a=>({metric:a.metric,direction:a.direction}))},schema:{type:'object',properties:{line:{type:'string'}},required:['line']},predict:80,temperature:0.1});
  const line=String(r?.line||'').replace(/\s+/g,' ').trim();
  return line.length>=8&&!/\d/.test(line)?line.slice(0,160):'';
 }catch{return '';}
}

async function metricsTurn(s,command,now=new Date()){
 const ask=query.parse(command);
 const ready=list(s).ready().filter(x=>!ask.source||x.id===ask.source);
 if(!ready.length){
  const added=list(s).added();
  const text=added.length?'Источник «'+added.map(x=>x.name).join('», «')+'» добавлен, но не подключён. Откройте Настройки → «'+added[0].name+'» и сохраните доступ — потом повторите вопрос.':
   'Чтобы показать метрики игры, подключите источник данных: '+KNOWN.map(x=>x.name+' ('+x.where+')').join('; ')+'. GameAnalytics и Firebase Analytics появятся позже.';
  return kit.reply(s,command,{by:BY,question:true,text});
 }
 const w=compute.window(ask.days,now);
 s.requestProgress?.report('Читаю метрики: '+ready.map(x=>x.name).join(', '));
 const blocks=[],failed=[];
 for(const x of ready){
  try{blocks.push(await readSource(s,x,ask,w));}
  catch(e){failed.push({id:x.id,name:x.name,error:e.message||'нет ответа'});}
 }
 if(!blocks.length)return kit.reply(s,command,{by:BY,error:true,text:BY+' · '+failed.map(f=>f.name+': '+f.error).join('; ')});
 const first=blocks[0];
 if(first.kpis.length)s.requestProgress?.report('Подвожу итог');
 const line=await comment(s,first);
 const text=summary(first,ask)+(failed.length?' Не ответил: '+failed.map(f=>f.name+' ('+f.error+')').join(', ')+'.':'');
 const card={period:{days:ask.days,from:w.start,to:w.end,prevFrom:w.prevStart,prevTo:w.prevEnd},focus:ask.focus,platform:ask.platform,version:ask.version,compare:ask.compare,
  sources:blocks,failed,comment:line,generated:now.toISOString()};
 return kit.reply(s,command,{by:BY,text,data:{metricsCard:card}});
}

function setup(){return {};}
async function turn(s,command){
 const text=String(command||'');
 if(!query.about(text)||!kit.installed(s,ID))return null;
 try{return await metricsTurn(s,text);}
 catch(e){return kit.failure(s,command,BY,e);}
}
module.exports={name:'gameMetrics',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,metricsTurn,summary,reset:()=>{sources=null;},useSources:x=>{sources=x;}};
