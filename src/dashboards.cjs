// Dashboards: a grid of widgets built from chat cards. A widget keeps its source (how to get fresh data), not
// only the data, so it can refresh by itself:
//   {kind:'extension', extension, command}   — a read-only request an extension accepts (`dashboard.accepts`)
//   {kind:'provider', provider, query, selected} — a chat-reply provider's read (e.g. Jira charts)
//   {kind:'jira', jql}                        — Jira issues by JQL (src/extensions/jira/dashboard.cjs)
//   {kind:'anr', query}                       — Google Play ANR of an app (the Google Play connection)
//   {kind:'web', url, query}                  — a web page read in the chat browser's session (signed in there)
//   {kind:'snapshot'}                         — a card as it was; never refreshed
// Personal dashboards live in the company's dialogue state; shared ones are files in a project's git
// (`.petya/dashboards/<slug>.json`, definitions only — the data is never written there). See docs/dashboards.md.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
// 'auto': the layout chooses (two or three in a row, the row always full); the others are fixed spans.
const SIZES=['auto','s','m','l','w'];
const EVERY=[0,5,15,60,240,1440];
const KINDS=['extension','provider','jira','anr','web','snapshot'];
const LIMIT={dashboards:100,widgets:40,title:120,command:1000,jql:2000};
const DIR=path.join('.petya','dashboards');
const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);

function source(value){
  const kind=KINDS.includes(value?.kind)?value.kind:'snapshot';
  if(kind==='extension'){const extension=text(value.extension,64),command=text(value.command,LIMIT.command);if(!/^[a-z0-9-]+$/.test(extension)||!command)throw Error('Источник виджета указан неверно.');return {kind,extension,command};}
  if(kind==='provider'){const provider=text(value.provider,64),query=text(value.query,LIMIT.command);if(!/^[a-z0-9-]+$/.test(provider)||!query)throw Error('Источник виджета указан неверно.');return {kind,provider,query,...(value.selected?{selected:text(value.selected,100)}:{})};}
  if(kind==='web'){let url='';try{const u=new URL(String(value.url||''));if(u.protocol==='https:'||u.protocol==='http:')url=u.href;}catch{}if(!url)throw Error('Нужна ссылка на страницу (https://…).');return {kind,url:url.slice(0,2000),query:text(value.query,LIMIT.command)};}
  if(kind==='anr')return {kind,query:text(value.query,LIMIT.command)||'ANR'};
  if(kind==='jira'){const jql=text(value.jql,LIMIT.jql);if(!jql)throw Error('Укажите запрос JQL.');return {kind,jql};}
  return {kind};
}
// Where the person put the widget: a 12-column grid, rows of 32 px; `fit` until its height was fitted to its data.
const COLS=12;
function position(value){
  if(!value||typeof value!=='object')return null;
  const n=(v,lo,hi)=>Number.isInteger(Number(v))?Math.min(hi,Math.max(lo,Number(v))):null;
  const w=n(value.w,2,COLS),h=n(value.h,2,60),x=n(value.x,0,COLS-2),y=n(value.y,0,2000);
  if([w,h,x,y].includes(null))return null;
  return {x:Math.min(x,COLS-w),y,w,h,...(value.fit?{fit:true}:{})};
}
function widget(value){
  const out={id:/^[\w-]{6,64}$/.test(String(value?.id||''))?value.id:randomUUID(),title:text(value?.title,LIMIT.title)||'Виджет',
    size:SIZES.includes(value?.size)?value.size:'auto',every:EVERY.includes(Number(value?.every))?Number(value.every):15,source:source(value?.source)};
  if(out.source.kind==='snapshot'){out.every=0;out.data=value?.data&&typeof value.data==='object'?value.data:{};if(value?.text)out.text=String(value.text).slice(0,4000);out.at=Number(value?.at)||Date.now();}
  if(value?.chat&&typeof value.chat==='object')out.chat={topicId:text(value.chat.topicId,80),index:Number.isInteger(value.chat.index)?value.chat.index:undefined};
  const pos=position(value?.pos);if(pos)out.pos=pos;
  return out;
}
function dashboard(value){
  const widgets=(Array.isArray(value?.widgets)?value.widgets:[]).slice(0,LIMIT.widgets).map(w=>{try{return widget(w);}catch{return null;}}).filter(Boolean);
  return {id:String(value?.id||randomUUID()),title:text(value?.title,LIMIT.title)||'Дашборд',projectId:text(value?.projectId,80)||'general',widgets,
    ...(value?.fromChat?{fromChat:text(value.fromChat,80),synced:Number(value.synced)||0}:{}),...(value?.demo?{demo:true}:{}),at:Number(value?.at)||Date.now()};
}
// Shared file: definitions only. Snapshots carry someone's data, so they stay on this computer.
function shareable(d){
  return {version:1,title:d.title,widgets:d.widgets.filter(w=>w.source.kind!=='snapshot').map(({id,title,size,every,source,pos})=>({id,title,size,every,source,...(pos?{pos}:{})}))};
}
const slug=title=>{
  const map={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  return String(title||'').toLowerCase().replace(/[а-яё]/g,c=>map[c]).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'dashboard';
};
function readShared(dir,{read,list}){
  const out=[];
  for(const name of list(path.join(dir,DIR)).filter(n=>/^[a-z0-9-]{1,60}\.json$/.test(n)).sort()){
    let data;try{data=JSON.parse(read(path.join(dir,DIR,name))||'null');}catch{data=null;}
    if(!data||!Array.isArray(data.widgets))continue;
    out.push({file:name,...dashboard({title:data.title,widgets:data.widgets.filter(w=>w?.source?.kind!=='snapshot')})});
  }
  return out;
}
function writeShared(dir,file,d,fs=require('node:fs')){
  const name=/^[a-z0-9-]{1,60}\.json$/.test(file||'')?file:slug(d.title)+'.json';
  const target=path.join(dir,DIR,name);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target+'.tmp',JSON.stringify(shareable(d),null,2)+'\n');fs.renameSync(target+'.tmp',target);
  return name;
}
// «Собери дашборд: баги спринта, крэши за неделю и отзывы» → the phrases, one widget each.
function phrases(description){
  const body=String(description||'').replace(/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:собери|сделай|создай|построй|заведи|сформируй)\s+(?:мне\s+|нам\s+)?(?:нов\p{L}*\s+)?(?:дашборд|дэшборд|dashboard|панел\p{L}*)\p{L}*/iu,'').trim();
  const named=body.match(/^(?:«([^»]{1,80})»|"([^"]{1,80})")\s*/u);
  let rest=named?body.slice(named[0].length):body;
  rest=rest.replace(/^(?:[:—–-]\s*|(?:про|по|для|с|из)\s+)/iu,'');
  const title=named?(named[1]||named[2]):'';
  const parts=rest.split(/\s*(?:[;,\n]|\s+и\s+(?=\S)|\s+а также\s+|\s*\+\s*)\s*/iu).map(p=>p.replace(/^(?:ещё|еще|плюс)\s+/iu,'').trim()).filter(p=>p.length>=3).slice(0,LIMIT.widgets);
  return {title,parts};
}
const wantsDashboard=command=>/^(?:петя[,!\s]+)?(?:пожалуйста[,\s]+)?(?:собери|сделай|создай|построй|заведи|сформируй)\s+(?:мне\s+|нам\s+)?(?:нов\p{L}*\s+)?(?:дашборд|дэшборд|dashboard)/iu.test(String(command||'').trim());
module.exports={COLS,position,SIZES,EVERY,KINDS,LIMIT,DIR,source,widget,dashboard,shareable,slug,readShared,writeShared,phrases,wantsDashboard};
