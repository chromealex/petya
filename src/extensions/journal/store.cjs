// The journal of one company: notes («запиши в дневник: …»), answers to the reflection question, tomorrow's plan
// and the last totals of each day, in <company data>/extensions/journal/journal.json. The file is encrypted with the
// OS keychain (Electron safeStorage) when available — notes and reflections are private and never leave the computer.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const KEEP_DAYS=400;
function create(file,{encrypt=null,decrypt=null}={}){
 let data={days:{},meta:{}};
 try{
  const raw=JSON.parse(fs.readFileSync(file,'utf8'));
  const body=raw.encrypted&&decrypt?JSON.parse(decrypt(Buffer.from(raw.encrypted,'base64'))):raw.data||raw;
  data={days:body.days&&typeof body.days==='object'?body.days:{},meta:body.meta&&typeof body.meta==='object'?body.meta:{}};
 }catch{data={days:{},meta:{}};}
 function save(){
  const keys=Object.keys(data.days).sort();for(const k of keys.slice(0,Math.max(0,keys.length-KEEP_DAYS)))delete data.days[k];
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const json=JSON.stringify({version:1,days:data.days,meta:data.meta});
  const out=encrypt?JSON.stringify({version:1,encrypted:Buffer.from(encrypt(json)).toString('base64')}):JSON.stringify({version:1,data:JSON.parse(json)});
  fs.writeFileSync(file+'.tmp',out,{mode:0o600});fs.renameSync(file+'.tmp',file);
 }
 const day=key=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(key))throw Error('Некорректная дата.');return data.days[key]||(data.days[key]={notes:[],plan:[]});};
 const peek=key=>data.days[key]||null;
 const clean=(v,max)=>String(v??'').replace(/\r/g,'').trim().slice(0,max);
 return {
  peek,file,
  note(key,text,at=Date.now()){const t=clean(text,4000);if(!t)throw Error('Пустая запись.');const d=day(key);const n={id:randomUUID(),at,text:t};d.notes.push(n);if(d.notes.length>100)d.notes.shift();save();return n;},
  removeNote(key,id){const d=day(key);d.notes=d.notes.filter(n=>n.id!==id);save();},
  reflect(key,prompt,answer,at=Date.now()){const d=day(key);d.reflection={prompt:clean(prompt,200),answer:clean(answer,4000),at};save();return d.reflection;},
  // Tomorrow's plan: the chosen open items (titles kept, so the plan reads the same after the source changes).
  plan(key,items){const d=day(key);const seen=new Set(d.plan.map(p=>p.id));for(const i of items.slice(0,30)){if(!i?.id||seen.has(i.id))continue;seen.add(i.id);d.plan.push({id:clean(i.id,200),title:clean(i.title,240),detail:clean(i.detail,240),url:/^https:\/\//.test(i.url||'')?String(i.url).slice(0,500):'',source:clean(i.source,40),done:false});}save();return d.plan;},
  unplan(key,id){const d=day(key);d.plan=d.plan.filter(p=>p.id!==id);save();return d.plan;},
  check(key,id,done){const d=day(key);const p=d.plan.find(x=>x.id===id);if(!p)throw Error('Пункт плана не найден.');p.done=!!done;save();return d.plan;},
  totals(key,totals){const d=day(key);d.totals={...totals};save();},
  meta(k,v){if(v===undefined)return data.meta[k];data.meta[k]=v;save();return v;},
  days:()=>Object.keys(data.days).sort()
 };
}
module.exports={create};
