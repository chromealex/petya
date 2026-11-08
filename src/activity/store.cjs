// Activity spans on disk: one JSON file per local day in `<dir>/YYYY-MM-DD.json` ({version, spans}), and the span
// still being extended in `<dir>/current.json`, so a restart loses at most one sample. Folder 0700, files 0600.
// A span that crosses midnight is split between the two days. Days older than the retention are deleted.
const fs=require('node:fs'),path=require('node:path');
const DAY=86400000;
const pad=v=>String(v).padStart(2,'0');
const ymd=t=>{const d=new Date(t);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
const startOfDay=t=>{const d=new Date(t);d.setHours(0,0,0,0);return d.getTime();};
const nextDay=t=>{const d=new Date(startOfDay(t));d.setDate(d.getDate()+1);return d.getTime();};
const FILE=/^(\d{4})-(\d{2})-(\d{2})\.json$/;

function clean(span){
 const out={app:String(span.app||'').slice(0,80),title:String(span.title||'').slice(0,200),start:Math.round(span.start),end:Math.round(span.end)};
 if(span.private)out.private=String(span.private);
 return out;
}
function create({dir}){
 const where=()=>typeof dir==='function'?dir():dir;
 const write=(file,data)=>{const d=where();fs.mkdirSync(d,{recursive:true,mode:0o700});const f=path.join(d,file);fs.writeFileSync(f+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(f+'.tmp',f);};
 const read=file=>{try{const d=JSON.parse(fs.readFileSync(path.join(where(),file),'utf8'));return Array.isArray(d.spans)?d.spans.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start):[];}catch{return [];}};
 // Adds a finished span (split at midnights).
 function add(span){
  if(!where()||!(span.end>span.start))return;
  let a=span.start;
  while(a<span.end){
   const b=Math.min(span.end,nextDay(a)),file=ymd(a)+'.json';
   const list=read(file);list.push(clean({...span,start:a,end:b}));
   write(file,{version:1,spans:list});a=b;
  }
 }
 function days(){try{return fs.readdirSync(where()).filter(f=>FILE.test(f)).sort();}catch{return [];}}
 // Spans that overlap [from, to), as stored (not clipped).
 function range(from,to){
  const out=[];
  for(const f of days()){const [,y,m,d]=FILE.exec(f);const a=new Date(+y,+m-1,+d).getTime();if(a>=to||nextDay(a)<=from)continue;for(const s of read(f))if(s.end>from&&s.start<to)out.push(s);}
  return out.sort((x,y)=>x.start-y.start);
 }
 const current={
  get(){try{const d=JSON.parse(fs.readFileSync(path.join(where(),'current.json'),'utf8'));return d&&Number.isFinite(d.start)&&Number.isFinite(d.end)?d:null;}catch{return null;}},
  set(span){if(!where())return;if(span)write('current.json',clean(span));else try{fs.rmSync(path.join(where(),'current.json'),{force:true});}catch{/* already gone */}}
 };
 // Deletes the days that ended more than `keepDays` days before `now`. Returns how many files were removed.
 function prune(keepDays,now){
  const limit=startOfDay(now)-Math.max(1,keepDays)*DAY;let removed=0;
  for(const f of days()){const [,y,m,d]=FILE.exec(f);if(new Date(+y,+m-1,+d).getTime()<limit){try{fs.rmSync(path.join(where(),f),{force:true});removed++;}catch{/* next time */}}}
  return removed;
 }
 function wipe(){const d=where();if(d)fs.rmSync(d,{recursive:true,force:true});}
 const size=()=>days().reduce((n,f)=>{try{return n+fs.statSync(path.join(where(),f)).size;}catch{return n;}},0);
 return {add,range,current,prune,wipe,days,size,dir:where};
}
module.exports={create,ymd,startOfDay,nextDay,DAY};
