// Outgoing-message pipeline: every place where Petya sends text on the user's behalf (after the user's
// confirmation) passes the draft through `review(draft)` before the confirmation is shown. Registered checks find
// problems in the draft; the confirmation shows them, the user may apply a suggestion or send as is.
// Contract for other apps: docs/foundations/outgoing.md. An extension declares in its extension.json
//   "provides": { "outgoing-check": "<file>.cjs" }
// (the `provides` map read by src/features/app-links.cjs `scan`), and the file exports
//   { id?, name?, order?,                      // order: lower runs and is listed first (default 1000)
//     ready?(settings) -> bool,                // connected / enabled (the registry adds «the extension is added»)
//     fits?(channel, settings) -> bool,        // whether it checks this channel ({service, target, audience})
//     timeoutMs?,                              // its own budget, 200..8000 ms (default 4000)
//     async check(services, draft) -> [finding] }
// draft: {text, channel:{service, target, audience}, language, context} — a frozen copy: a check cannot edit it.
// finding: {severity:'info'|'warning'|'problem', span:{start, end, text}|null, message, suggestion?}; a suggestion
// replaces the span (or the whole text when there is no span) only when the user applies it.
// Rules of the pipeline: it never blocks sending (a slow or failing check is skipped, `review` never throws) and
// never changes the text by itself (`review` returns the text it was given; only `apply` with a finding the user
// chose produces a new text, and only when the span is still where the finding saw it).
const KIND='outgoing-check';
const SEVERITIES=['info','warning','problem'];
const AUDIENCES=['public','team','direct','customer'];
const DEFAULT_TIMEOUT=4000,MIN_TIMEOUT=200,MAX_TIMEOUT=8000,MAX_TEXT=20000,MAX_FINDINGS=30;

const line=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  const bad=()=>Error('Invalid outgoing check '+x.extension+'/'+x.file);
  if(typeof p.check!=='function')throw bad();
  for(const hook of ['ready','fits'])if(p[hook]!==undefined&&typeof p[hook]!=='function')throw bad();
  return {id:p.id||x.extension,extension:x.extension,setting:x.setting,name:p.name||x.name,order:Number.isFinite(p.order)?p.order:1000,provider:p};
 }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

// The language of a draft by its letters: 'ru', 'en' or '' (too little text to tell).
function language(text){
 const cyr=(String(text).match(/[а-яё]/giu)||[]).length,lat=(String(text).match(/[a-z]/gi)||[]).length;
 if(cyr+lat<3)return '';
 return cyr>=lat?'ru':'en';
}
function plain(value,depth=0){
 if(value===null||['string','number','boolean'].includes(typeof value))return typeof value==='string'?value.slice(0,2000):value;
 if(depth>3||typeof value!=='object')return undefined;
 if(Array.isArray(value))return value.slice(0,20).map(v=>plain(v,depth+1)).filter(v=>v!==undefined);
 return Object.fromEntries(Object.entries(value).slice(0,30).map(([k,v])=>[k,plain(v,depth+1)]).filter(([,v])=>v!==undefined));
}
function freeze(value){if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;}
// The draft as checks see it.
function draft(input){
 const raw=input&&typeof input==='object'?input:{};
 const text=String(raw.text??'').replace(/\r\n?/g,'\n').slice(0,MAX_TEXT);
 const c=raw.channel&&typeof raw.channel==='object'?raw.channel:{};
 const channel={service:line(c.service,40).toLowerCase(),target:line(c.target,200),audience:AUDIENCES.includes(c.audience)?c.audience:'team'};
 const lang=/^[a-z]{2}$/.test(String(raw.language||''))?String(raw.language):language(text);
 const context=raw.context&&typeof raw.context==='object'&&!Array.isArray(raw.context)?plain(raw.context):{};
 return {text,channel,language:lang,context};
}

// Where a finding's span is in the text: the given offsets when they still hold the span's text, otherwise the
// only occurrence of that text. null when it cannot be placed (the finding is then about the whole message).
function locate(text,span){
 if(!span||typeof span!=='object')return null;
 const want=typeof span.text==='string'?span.text:null;
 const {start,end}=span;
 if(Number.isInteger(start)&&Number.isInteger(end)&&start>=0&&end>start&&end<=text.length){
  const actual=text.slice(start,end);
  if(want===null||want===actual)return {start,end,text:actual};
 }
 if(want){
  const first=text.indexOf(want);if(first<0)return null;
  // Several occurrences: the one nearest the offsets the check gave.
  let best=first;
  if(Number.isInteger(start))for(let i=first;i>=0;i=text.indexOf(want,i+1))if(Math.abs(i-start)<Math.abs(best-start))best=i;
  return {start:best,end:best+want.length,text:want};
 }
 return null;
}
function finding(raw,provider,text,index){
 if(!raw||typeof raw!=='object')return null;
 const message=line(raw.message,400);if(!message)return null;
 const span=locate(text,raw.span);
 let suggestion=typeof raw.suggestion==='string'?raw.suggestion.replace(/\r\n?/g,'\n').slice(0,MAX_TEXT):undefined;
 // A suggestion for a span that is not in the text is dropped: it must never turn into a whole-text rewrite.
 if(raw.span&&!span)suggestion=undefined;
 if(suggestion!==undefined&&(!suggestion.trim()&&!span||suggestion===(span?span.text:text)))suggestion=undefined;
 return {id:provider.id+':'+index,provider:provider.id,providerName:provider.name,severity:SEVERITIES.includes(raw.severity)?raw.severity:'warning',
  span,message,...suggestion!==undefined?{suggestion}:{},...raw.kind?{kind:line(raw.kind,40)}:{}};
}

// A suggestion applied to the text the user has now: null when the span is no longer there (re-review instead).
function apply(text,f){
 text=String(text??'');
 if(!f||typeof f.suggestion!=='string')throw Error('У замечания нет предложенной замены.');
 if(!f.span)return f.suggestion;
 const {start,end,text:want}=f.span;
 let at=-1;
 if(text.slice(start,end)===want)at=start;
 else{const i=text.indexOf(want);if(i>=0&&i===text.lastIndexOf(want))at=i;}
 if(at<0)return null;
 return text.slice(0,at)+f.suggestion+text.slice(at+want.length);
}
// All span suggestions at once (overlapping ones: the first kept); whole-text rewrites are left for the user.
function applyAll(text,findings){
 const list=(findings||[]).filter(f=>f?.span&&typeof f.suggestion==='string').sort((a,b)=>a.span.start-b.span.start);
 const chosen=[];let edge=-1;
 for(const f of list)if(f.span.start>=edge&&String(text).slice(f.span.start,f.span.end)===f.span.text){chosen.push(f);edge=f.span.end;}
 let out=String(text);
 for(const f of [...chosen].reverse())out=out.slice(0,f.span.start)+f.suggestion+out.slice(f.span.end);
 return {text:out,applied:chosen.map(f=>f.id)};
}
// Findings as plain lines for a confirmation that is text only (the shared question panel).
function confirmation(review){
 const list=review?.findings||[];if(!list.length)return '';
 const rows=list.slice(0,6).map(f=>'• '+(f.span?'«'+line(f.span.text,60)+'» — ':'')+f.message+(typeof f.suggestion==='string'&&f.span?' → «'+line(f.suggestion,80)+'»':''));
 return 'Проверка перед отправкой:\n'+rows.join('\n')+(list.length>6?'\n• и ещё '+(list.length-6):'');
}

function within(promise,ms){
 let timer;
 const limit=new Promise(resolve=>{timer=setTimeout(()=>resolve({timeout:true}),ms);});
 return Promise.race([promise.then(value=>({value}),error=>({error})),limit]).finally(()=>clearTimeout(timer));
}
const empty=d=>({text:d.text,channel:d.channel,language:d.language,findings:[],checked:[],skipped:[],ms:0});

// The pipeline bound to live services: which checks are added and ready is read at every review.
function create(s,{providers=load(),now=Date.now}={}){
 const added=p=>!p.setting||s.settings?.[p.setting]==='true';
 const ready=p=>{try{return added(p)&&(typeof p.provider.ready!=='function'||!!p.provider.ready(s.settings||{}));}catch{return false;}};
 const fits=(p,channel)=>{try{return typeof p.provider.fits!=='function'||!!p.provider.fits(channel,s.settings||{});}catch{return false;}};
 const budget=p=>{const n=Number(p.provider.timeoutMs);return Number.isFinite(n)?Math.min(MAX_TIMEOUT,Math.max(MIN_TIMEOUT,n)):DEFAULT_TIMEOUT;};
 async function review(input){
  const d=draft(input),started=now();
  if(!d.text.trim())return empty(d);
  const list=providers.filter(p=>ready(p)&&fits(p,d.channel));
  const runs=await Promise.all(list.map(p=>within(Promise.resolve().then(()=>p.provider.check(s,freeze(structuredClone(d)))),budget(p))));
  const findings=[],checked=[],skipped=[];
  runs.forEach((r,i)=>{
   const p=list[i];
   if(r.timeout){skipped.push({id:p.id,name:p.name,reason:'timeout'});return;}
   if(r.error||!Array.isArray(r.value)){skipped.push({id:p.id,name:p.name,reason:'error'});return;}
   checked.push(p.id);
   const seen=new Set();
   r.value.forEach((raw,j)=>{const f=finding(raw,p,d.text,j);if(!f)return;const key=(f.span?f.span.start+':'+f.span.end:'*')+'|'+f.message;if(seen.has(key))return;seen.add(key);findings.push(f);});
  });
  // Checks in their order; inside a check, by place in the text (whole-message remarks last).
  const rank=new Map(list.map((p,i)=>[p.id,i]));
  findings.sort((a,b)=>rank.get(a.provider)-rank.get(b.provider)||(a.span?a.span.start:Infinity)-(b.span?b.span.start:Infinity));
  return {text:d.text,channel:d.channel,language:d.language,findings:findings.slice(0,MAX_FINDINGS),checked,skipped,ms:now()-started};
 }
 return {review,apply,applyAll,providers:()=>providers.map(p=>({id:p.id,extension:p.extension,name:p.name,ready:ready(p)}))};
}

// The pipeline of the running app, for main-process flows that are not features (e.g. src/extensions/slack/team-request.cjs).
// Before the feature is set up (tests, early start) a review simply finds nothing.
let bound=null;
async function review(input){try{return bound?await bound.review(input):empty(draft(input));}catch{return empty(draft(input));}}

module.exports={name:'outgoing',defaults:{},validate(){},KIND,SEVERITIES,AUDIENCES,load,create,draft,language,locate,apply,applyAll,confirmation,review,
 setup(s){
  bound=create(s);
  return {outgoing:bound,ipc:{review:input=>review(input),providers:()=>bound.providers()}};
 }};
