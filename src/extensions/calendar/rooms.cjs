// Known meeting rooms: video links Petya saw in the user's own calendar on different days (a daily stand-up's call,
// a weekly sync's video room) plus links the user typed in the confirm step. Learned from the events the calendar already
// reads (and one 60-day look-back a day at most), normalized (tracking parameters dropped), named by the most common
// event title. Stored per company in a small private JSON file; never sent anywhere.
// Links of meeting services that have their own app (extension) are recognised by that app's provider
// (`recognizeLink`, passed in as `recognize`); the calendar itself knows only a few services without an app.
const fs=require('node:fs');
const path=require('node:path');
const DAY=86400000,LOOKBACK=60;
const KIND={webex:'Webex',jitsi:'Jitsi',telemost:'Телемост'};
const URLS=/https:\/\/[^\s<>"'\])}]+/g;
const TRACKING=/^(?:utm_\w+|fbclid|gclid|mc_eid|mc_cid|_ga|ref|source)$/i;
const ymd=d=>{const x=new Date(d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
const plural=(n,[one,few,many])=>{const a=Math.abs(n)%100,b=a%10;return a>10&&a<20?many:b===1?one:b>=2&&b<=4?few:many;};

// A meeting link → {kind,key,url,app?}; `any` also accepts other https links (typed by the user), null otherwise.
// `recognize(url)` → {kind,key,url,name} from the providers of added apps comes first.
function normalize(raw,{any=false,recognize=null}={}){
 let u;try{u=new URL(String(raw||'').trim().replace(/[.,;:!?)»]+$/,''));}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port||String(raw).length>2000)return null;
 const host=u.hostname.toLowerCase().replace(/\.$/,'');u.hash='';
 if(typeof recognize==='function'){let known=null;try{known=recognize(u.href);}catch{known=null;}if(known&&typeof known.key==='string'&&typeof known.url==='string')return {kind:String(known.kind||'link'),key:known.key,url:known.url,...known.name?{app:String(known.name)}:{}};}
 if(/(?:^|\.)webex\.com$/.test(host)&&u.pathname.length>1)return {...plain(u,host),kind:'webex'};
 if(host==='meet.jit.si'&&u.pathname.length>1)return {...plain(u,host),kind:'jitsi'};
 if(/^telemost\.(?:360\.)?yandex\.(?:ru|com)$/.test(host)&&/^\/j\/\d+/.test(u.pathname))return {...plain(u,host),kind:'telemost',key:'telemost:'+u.pathname.replace(/\/$/,'')};
 return any?plain(u,host):null;
}
function plain(u,host){
 for(const k of [...u.searchParams.keys()])if(TRACKING.test(k))u.searchParams.delete(k);
 const url='https://'+host+u.pathname+(u.searchParams.toString()?'?'+u.searchParams:'');
 return {kind:'link',key:host+u.pathname.replace(/\/$/,'')+(u.search?'?'+u.searchParams:''),url};
}
// Meeting links of one event: the conference link, the location and the description.
function linksOf(event,recognize=null){
 const seen=new Map();
 for(const text of [event.link,event.location,event.description,...(event.urls||[])])
  for(const raw of String(text||'').match(URLS)||[]){const n=normalize(raw,{recognize});if(n&&!seen.has(n.key))seen.set(n.key,n);}
 return [...seen.values()];
}
const tokens=t=>new Set(String(t||'').toLocaleLowerCase().replace(/ё/g,'е').match(/[\p{L}\p{N}]{3,}/gu)||[]);
const jaccard=(a,b)=>{if(!a.size||!b.size)return 0;let n=0;for(const x of a)if(b.has(x))n++;return n/(a.size+b.size-n);};
const top=counts=>Object.entries(counts||{}).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'';

class Rooms{
 constructor({file='',now=()=>Date.now(),recognize=null}={}){
  this.file=file;this.now=now;this.recognize=recognize;this.data={version:1,rooms:{},forgotten:[],refreshed:0};
  try{if(file&&fs.existsSync(file)){const d=JSON.parse(fs.readFileSync(file,'utf8'));if(d?.version===1&&d.rooms&&typeof d.rooms==='object')this.data={...this.data,...d};}}catch{/* a damaged file is started over */}
 }
 save(){
  if(!this.file)return;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});
  fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);
 }
 room(n){
  const r=this.data.rooms[n.key]||(this.data.rooms[n.key]={key:n.key,kind:n.kind,url:n.url,events:{},titles:{},people:{},manual:false,name:'',last:0});
  r.url=n.url;if(n.app)r.app=n.app;return r;
 }
 // Events the calendar read: [{id,title,start,attendees:[emails],organizer,link,location,description}].
 learn(events,{self=''}={}){
  let changed=false;const forgotten=new Set(this.data.forgotten);
  for(const e of events||[]){
   if(!e||e.declined||!e.start||Number.isNaN(Date.parse(e.start)))continue;
   for(const n of linksOf(e,this.recognize)){
    if(forgotten.has(n.key))continue;
    const r=this.room(n),id=String(e.id||e.start);
    if(r.events[id])continue;
    r.events[id]=ymd(e.start);changed=true;
    if(e.title)r.titles[e.title]=(r.titles[e.title]||0)+1;
    for(const p of new Set([...(e.attendees||[]),e.organizer].map(x=>String(x||'').toLowerCase()).filter(x=>x&&x!==self)))r.people[p]=(r.people[p]||0)+1;
    r.last=Math.max(r.last||0,Date.parse(e.start));
    this.trim(r);
   }
  }
  if(changed)this.save();
  return changed;
 }
 trim(r){
  const ids=Object.keys(r.events);if(ids.length>200)for(const id of ids.slice(0,ids.length-200))delete r.events[id];
  for(const field of ['titles','people']){const rows=Object.entries(r[field]);if(rows.length>40)r[field]=Object.fromEntries(rows.sort((a,b)=>b[1]-a[1]).slice(0,40));}
 }
 // A link the user typed in the confirm step: known at once.
 remember(raw,{title='',attendees=[],at=this.now()}={}){
  const n=normalize(raw,{any:true,recognize:this.recognize});if(!n)throw Error('Нужна ссылка https:// на встречу.');
  this.data.forgotten=this.data.forgotten.filter(k=>k!==n.key);
  const r=this.room(n);r.manual=true;r.last=Math.max(r.last||0,at);
  r.events['manual:'+at]=ymd(at);if(title)r.titles[title]=(r.titles[title]||0)+1;
  for(const p of attendees.map(x=>String(x||'').toLowerCase()).filter(Boolean))r.people[p]=(r.people[p]||0)+1;
  this.trim(r);this.save();return this.view(r);
 }
 // A known room was used again for a new event.
 use(key,{title='',attendees=[],at=this.now()}={}){
  const r=this.data.rooms[key];if(!r)return null;
  r.events['use:'+at]=ymd(at);r.last=Math.max(r.last||0,at);if(title)r.titles[title]=(r.titles[title]||0)+1;
  for(const p of attendees.map(x=>String(x||'').toLowerCase()).filter(Boolean))r.people[p]=(r.people[p]||0)+1;
  this.trim(r);this.save();return this.view(r);
 }
 days(r){return new Set(Object.values(r.events)).size;}
 count(r){return Object.keys(r.events).length;}
 isKnown(r){return !this.data.forgotten.includes(r.key)&&(r.manual||this.days(r)>=2);}
 label(r){const kind=r.app||this.appName(r)||KIND[r.kind]||(()=>{try{return new URL(r.url).hostname;}catch{return 'ссылка';}})();return r.name||(top(r.titles)?top(r.titles)+' · '+kind:kind);}
 appName(r){if(typeof this.recognize!=='function')return '';try{return String(this.recognize(r.url)?.name||'');}catch{return '';}}
 view(r){return {key:r.key,kind:r.kind,url:r.url,name:this.label(r),custom:!!r.name,manual:!!r.manual,count:this.count(r),days:this.days(r),last:r.last?new Date(r.last).toISOString():''};}
 list(){return Object.values(this.data.rooms).filter(r=>this.isKnown(r)).sort((a,b)=>this.count(b)-this.count(a)||(b.last||0)-(a.last||0)).map(r=>this.view(r));}
 get(key){const r=this.data.rooms[key];return r&&this.isKnown(r)?this.view(r):null;}
 rename(key,name){const r=this.data.rooms[key];if(!r||!this.isKnown(r))throw Error('Комната не найдена.');r.name=String(name||'').replace(/\s+/g,' ').trim().slice(0,80);this.save();return this.view(r);}
 forget(key){if(!this.data.rooms[key])throw Error('Комната не найдена.');delete this.data.rooms[key];if(!this.data.forgotten.includes(key))this.data.forgotten.push(key);this.data.forgotten=this.data.forgotten.slice(-200);this.save();return this.list();}
 // Ranked for a new meeting: same people first, then a similar title, then how often and how recently.
 rank({title='',attendees=[]}={},limit=4){
  const want=new Set(attendees.map(x=>String(x||'').toLowerCase()).filter(Boolean)),words=tokens(title),now=this.now();
  return Object.values(this.data.rooms).filter(r=>this.isKnown(r)).map(r=>{
   const people=want.size?[...want].filter(p=>r.people[p]).length/want.size:0;
   const similar=Math.max(0,...Object.keys(r.titles).map(t=>jaccard(words,tokens(t))));
   const count=this.count(r),recent=r.last&&now-r.last<14*DAY?1:0;
   const score=100*people+40*similar+5*Math.log2(1+count)+3*recent;
   const why=[];
   if(people>=0.5)why.push(people===1?'те же участники':'часть участников та же');
   if(similar>=0.3)why.push('похожее название');
   why.push('использовалась '+count+' '+plural(count,['раз','раза','раз']));
   return {...this.view(r),score,reason:why.join(' · '),strong:people>=0.67||similar>=0.8||similar>=0.3&&people>0};
  }).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).slice(0,limit);
 }
 due(){return this.now()-(this.data.refreshed||0)>DAY;}
 refreshed(){this.data.refreshed=this.now();this.save();}
}
// The meeting a known room is for: the name the user gave it or the most common title of its events (for apps that
// see a call by its link or code and want to name the recording), '' when the room is not known.
function meetingTitle(file,key){
 try{const r=new Rooms({file}).data.rooms[key];return r?String(r.name||top(r.titles)||''):'';}catch{return '';}
}
module.exports={Rooms,normalize,linksOf,meetingTitle,LOOKBACK,KIND};
