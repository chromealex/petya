// Messenger sources: read access to the team's messengers (Slack, Telegram, Discord, Mattermost, VK Teams, …) in one
// shape, so digests, search, «Кто знает» and the standup can read any connected messenger without knowing it.
// Petya itself knows no messenger here. An extension declares in its extension.json
//   "provides": { "messenger-source": "<file>.cjs" }   (or a list of files)
// (the same `provides` map as cross-app links, read by src/features/app-links.cjs `scan`), and each file exports
//   { id, name, ready(settings) -> bool, hint?(settings) -> text,
//     names?: [RegExp],                        // how a request names it («в маттермосте», «в VK Teams»)
//     memory?: true,                           // it reads what Petya already keeps in the context memory (Slack,
//                                              // Telegram): «Поиск по всему» searches the memory itself and skips it
//     async channels(services, {check}) -> [{id, name, kind:'channel'|'group'|'direct', url?, topic?}],
//     async messages(services, {channel, since, until, limit, check}) -> {messages:[raw], notes?, truncated?},
//     async thread?(services, {channel?, id, check}) -> {messages:[raw]},          // root first
//     async search?(services, {query, since, until, limit, check}) -> {messages:[raw], notes?, truncated?},
//     async presence?(services, {users:[id], check}) -> [{user, status:'online'|'away'|'dnd'|'offline', at?}] }
// A source only reads. Every raw message becomes (see `message`):
//   {id, source, channel:{id, name}, thread, replyTo, author:{id, name}, bot, text, at, url, replies, files}
// `thread` is the id of the thread's root (null for a message outside a thread; a root carries its own id when it has
// replies), `at` is ISO, `url` an http(s) link to the message or ''. The registry bounds every request (period ≤ 31 days,
// ≤ 500 messages, query ≤ 200 characters), drops what falls outside the period and sorts newest first.
// Docs: docs/foundations/messengers.md.
const KIND='messenger-source';
const DAY=86400000,MAX_DAYS=31,MAX_LIMIT=500,DEFAULT_LIMIT=200,MAX_TEXT=4000;
const STATUSES=['online','away','dnd','offline'];

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const bad=()=>Error('Invalid messenger source '+x.extension+'/'+x.file);
  const fn=k=>p[k]===undefined||typeof p[k]==='function';
  if(typeof p.name!=='string'||typeof p.ready!=='function'||typeof p.channels!=='function'||typeof p.messages!=='function'||!['thread','search','presence','hint'].every(fn)||
   p.names!==undefined&&(!Array.isArray(p.names)||p.names.some(r=>!(r instanceof RegExp)))){
   // An installed extension with a broken source is reported and skipped; a bundled one is a bug.
   if(x.origin&&x.origin!=='bundled'){const reg=require('../extension-registry.cjs');reg.report(reg.entry(x.extension),bad(),x.file);return [];}
   throw bad();
  }
  return [{id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name,source:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

// --- Normalization ------------------------------------------------------------------------------------------------
const line=(v,max=200)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
// Message text keeps its line breaks (quotes are checked against it), only control characters are removed.
const body=v=>String(v??'').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim().slice(0,MAX_TEXT);
const link=v=>{try{const u=new URL(String(v||''));return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}};
const id=v=>line(v,200);
// `at` may be ms, Unix seconds (below 1e11 — a year before 1973 in ms) or an ISO string.
function iso(v){
 const raw=typeof v==='number'?v:/^\d{9,13}$/.test(String(v??''))?Number(v):Date.parse(String(v||''));
 const n=typeof v==='number'||/^\d+$/.test(String(v??''))?(raw<1e11?raw*1000:raw):raw;
 return Number.isFinite(n)&&n>0?new Date(n).toISOString():'';
}
function message(raw,source){
 const channel=raw?.channel&&typeof raw.channel==='object'?raw.channel:{id:raw?.channel};
 const author=raw?.author&&typeof raw.author==='object'?raw.author:{id:raw?.author,name:raw?.author};
 return {id:id(raw?.id),source,channel:{id:id(channel.id),name:line(channel.name||channel.id,120)},thread:raw?.thread?id(raw.thread):null,replyTo:raw?.replyTo?id(raw.replyTo):null,
  author:{id:id(author.id||author.name),name:line(author.name||author.id,120)||'?'},bot:!!raw?.bot,text:body(raw?.text),at:iso(raw?.at),url:link(raw?.url),
  replies:Math.max(0,Math.round(Number(raw?.replies)||0)),files:Math.max(0,Math.round(Number(raw?.files)||0))};
}
function channel(raw){
 const kind=['channel','group','direct'].includes(raw?.kind)?raw.kind:'channel';
 return {id:id(raw?.id),name:line(raw?.name||raw?.id,120),kind,url:link(raw?.url),topic:line(raw?.topic,300)};
}

// --- Bounds -------------------------------------------------------------------------------------------------------
// {since, until, limit, query} → the request a source receives: never in the future, at most MAX_DAYS long.
function bound(spec={},{now=Date.now(),maxDays=MAX_DAYS}={}){
 const notes=[];
 let until=Date.parse(spec.until||'')||now;if(until>now)until=now;
 const days=Math.max(1,Math.min(Number(maxDays)||MAX_DAYS,MAX_DAYS));
 let since=Date.parse(spec.since||'')||(Number.isFinite(spec.days)?until-Math.max(1,spec.days)*DAY:until-DAY);
 if(since>until)since=until-DAY;
 if(until-since>days*DAY){since=until-days*DAY;notes.push('Период сокращён до '+days+' дней.');}
 const limit=Math.max(1,Math.min(MAX_LIMIT,Math.round(Number(spec.limit)||DEFAULT_LIMIT)));
 const query=line(spec.query,200);
 return {since:new Date(since).toISOString(),until:new Date(until).toISOString(),limit,...(spec.query!==undefined?{query}:{}),...(spec.channel!==undefined?{channel:id(spec.channel)}:{}),notes};
}

// «за неделю» → 7, «за 3 дня» → 3, «сегодня» → 1, «вчера» → 2, «за месяц» → 30; null when the text names no period.
function period(text){
 const t=String(text||'').toLowerCase().replace(/ё/g,'е');
 const n=t.match(/(?:за|последни\p{L}*)\s+(\d{1,2})\s*(?:дн|сут|день)/u);if(n)return Math.min(MAX_DAYS,Math.max(1,Number(n[1])));
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/за\s+(?:последн\p{L}*\s+)?(?:месяц|30)/u.test(t))return 30;
 if(/недел/u.test(t))return 7;
 if(/вчера/u.test(t))return 2;
 if(/сегодня|за\s+(?:сутки|день)/u.test(t))return 1;
 return null;
}

// --- Evidence helpers for consumers -------------------------------------------------------------------------------
const flat=v=>String(v||'').replace(/\s+/g,' ').trim();
// A quote counts only when it is literally in a message (whitespace normalized) and at least 6 characters long.
function verbatim(quote,messages){
 const q=flat(String(quote||'').replace(/^[\s«"'“„]+|[\s»"'”]+$/gu,''));
 if(q.length<6)return null;
 for(const m of messages||[])if(flat(m.text).includes(q))return {text:q,message:m};
 return null;
}
// Messages per day of the window, every day present.
function activity(messages,since,until){
 const days=[];const end=Date.parse(until);
 for(let t=Date.parse(String(since).slice(0,10)+'T00:00:00Z');t<=end;t+=DAY)days.push({date:new Date(t).toISOString().slice(0,10),count:0});
 for(const m of messages){const d=days.find(x=>x.date===String(m.at).slice(0,10));if(d)d.count++;}
 return days;
}
// Who wrote most, people only.
function authors(messages,max=8){
 const map=new Map();
 for(const m of messages){if(m.bot)continue;const k=m.author.id||m.author.name;const a=map.get(k)||{id:m.author.id,name:m.author.name,count:0,last:''};a.count++;if(m.at>a.last)a.last=m.at;map.set(k,a);}
 return [...map.values()].sort((a,b)=>b.count-a.count||b.last.localeCompare(a.last)).slice(0,max);
}
// Threads active in the window: roots with replies, most replies first. `roots` are root messages already known.
function threads(messages,max=6){
 const map=new Map(),roots=new Set(messages.map(m=>m.thread).filter(Boolean));
 for(const m of messages){
  const root=m.thread||(m.replies||roots.has(m.id)?m.id:null);if(!root)continue;
  const t=map.get(root)||{id:root,channel:m.channel,root:null,count:0,last:'',people:new Set()};
  if(m.id===root)t.root=m;else t.count++;
  if(m.at>t.last)t.last=m.at;if(!m.bot)t.people.add(m.author.name);
  if(m.id===root&&m.replies>t.count)t.total=m.replies;
  map.set(root,t);
 }
 return [...map.values()].filter(t=>t.count>0||t.total>0).map(t=>({id:t.id,channel:t.channel,title:flat(t.root?.text).slice(0,140),url:t.root?.url||'',replies:Math.max(t.count,t.total||0),last:t.last,people:[...t.people].slice(0,6)}))
  .sort((a,b)=>b.replies-a.replies||b.last.localeCompare(a.last)).slice(0,max);
}

// --- The registry bound to live services --------------------------------------------------------------------------
function create(s,{sources,now=()=>Date.now()}={}){
 const all=()=>sources||require('../extension-registry.cjs').cached('messenger-sources',()=>load());
 // Core service modules (Slack, Telegram) are switched with module_<id>, which is on unless 'false'.
 const added=x=>{if(!x.setting)return true;const v=s.settings?.[x.setting];if(/^module_/.test(x.setting)){try{return require('../modules.cjs').enabled(s.settings||{},x.setting.slice(7));}catch{return v!=='false';}}return v==='true';};
 const connected=x=>{try{return !!x.source.ready(s.settings||{});}catch{return false;}};
 const ready=x=>added(x)&&connected(x);
 const hint=x=>{try{return typeof x.source.hint==='function'?String(x.source.hint(s.settings||{})||''):'';}catch{return '';}};
 const describe=x=>({id:x.id,name:x.name,extension:x.extension,added:added(x),connected:connected(x),ready:ready(x),hint:hint(x),memory:!!x.source.memory,
  thread:typeof x.source.thread==='function',search:typeof x.source.search==='function',presence:typeof x.source.presence==='function'});
 const live=sourceId=>{const x=all().find(y=>y.id===sourceId);if(!x)throw Error('Нет такого мессенджера.');if(!ready(x))throw Error('Мессенджер «'+x.name+'» не добавлен или не подключён.');return x;};
 const guard=(x,check)=>()=>{check?.();if(!ready(x))throw Error('Подключение «'+x.name+'» изменилось. Повторите запрос.');};
 const list=(out,x,spec,{root}={})=>{
  const raw=Array.isArray(out)?out:Array.isArray(out?.messages)?out.messages:null;
  if(!raw)throw Error(x.name+' вернул некорректный список сообщений.');
  let rows=raw.slice(0,MAX_LIMIT*2).map(r=>message(r,x.id)).filter(m=>m.id&&m.at);
  if(spec)rows=rows.filter(m=>m.at>=spec.since&&m.at<=spec.until);
  rows=root?rows:rows.sort((a,b)=>b.at.localeCompare(a.at)).slice(0,spec?.limit||MAX_LIMIT);
  return {source:{id:x.id,name:x.name},messages:rows,truncated:!!out?.truncated||raw.length>(spec?.limit||MAX_LIMIT),notes:[...(spec?.notes||[]),...(Array.isArray(out?.notes)?out.notes.map(n=>line(n,300)):[])].slice(0,6),...(spec?{since:spec.since,until:spec.until}:{})};
 };
 async function channels(sourceId,{check}={}){
  const x=live(sourceId);const out=await x.source.channels(s,{check:guard(x,check)});guard(x,check)();
  if(!Array.isArray(out))throw Error(x.name+' вернул некорректный список каналов.');
  return out.slice(0,500).map(channel).filter(c=>c.id);
 }
 async function messages(sourceId,spec={},{check}={}){
  const x=live(sourceId),b=bound(spec,{now:now(),maxDays:x.source.maxDays});
  if(!b.channel)throw Error('Не указан канал.');
  const out=await x.source.messages(s,{channel:b.channel,since:b.since,until:b.until,limit:b.limit,check:guard(x,check)});guard(x,check)();
  return list(out,x,b);
 }
 async function thread(sourceId,{channel:ch,id:rootId}={},{check}={}){
  const x=live(sourceId);
  if(typeof x.source.thread!=='function')throw Error(x.name+' не умеет читать треды.');
  const root=id(rootId);if(!root)throw Error('Не указан тред.');
  const out=await x.source.thread(s,{channel:ch?id(ch):undefined,id:root,check:guard(x,check)});guard(x,check)();
  const r=list(out,x,null,{root:true});
  // Root first, then replies in order of time.
  const head=r.messages.find(m=>m.id===root);
  r.messages=[...(head?[head]:[]),...r.messages.filter(m=>m.id!==root).sort((a,b)=>a.at.localeCompare(b.at))].slice(0,MAX_LIMIT);
  return r;
 }
 async function search(sourceId,spec={},{check}={}){
  const x=live(sourceId);
  if(typeof x.source.search!=='function')throw Error('В '+x.name+' нет поиска.');
  const b=bound({days:MAX_DAYS,...spec},{now:now(),maxDays:x.source.maxDays});
  if(!b.query)throw Error('Нечего искать.');
  const out=await x.source.search(s,{query:b.query,since:b.since,until:b.until,limit:b.limit,check:guard(x,check)});guard(x,check)();
  return list(out,x,b);
 }
 // Every ready source that can search: what failed is reported next to what was found. `memory:false` skips the
 // sources that only read Petya's context memory (the caller searches the memory itself).
 async function searchAll(spec={},{memory=true,check}={}){
  const found=[],used=[],failed=[];
  for(const x of all().filter(y=>ready(y)&&typeof y.source.search==='function'&&(memory||!y.source.memory))){
   try{const r=await search(x.id,spec,{check});found.push(...r.messages);used.push(r.source);}
   catch(e){failed.push({id:x.id,name:x.name,error:e.message});}
  }
  return {messages:found.sort((a,b)=>b.at.localeCompare(a.at)),used,failed};
 }
 async function presence(sourceId,users=[],{check}={}){
  const x=live(sourceId);
  if(typeof x.source.presence!=='function')return [];
  const ids=[...new Set((users||[]).map(id).filter(Boolean))].slice(0,200);if(!ids.length)return [];
  const out=await x.source.presence(s,{users:ids,check:guard(x,check)});guard(x,check)();
  return (Array.isArray(out)?out:[]).map(p=>({user:id(p?.user),status:STATUSES.includes(p?.status)?p.status:'offline',at:iso(p?.at)})).filter(p=>ids.includes(p.user));
 }
 const named=command=>all().filter(x=>(x.source.names||[]).some(r=>{r.lastIndex=0;return r.test(String(command||''));})).map(x=>x.id);
 return {all:()=>all().map(describe),list:()=>all().filter(ready).map(describe),find:sourceId=>{const x=all().find(y=>y.id===sourceId);return x?describe(x):null;},named,channels,messages,thread,search,searchAll,presence};
}

module.exports={name:'messengerSources',defaults:{},validate(){},KIND,DAY,MAX_DAYS,MAX_LIMIT,STATUSES,load,create,message,channel,bound,period,verbatim,activity,authors,threads,
 setup(s){return {messengerSources:create(s)};}};
