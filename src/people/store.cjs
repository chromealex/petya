// People records on disk: `<dir>/people.json` (folder 0700, file 0600), encrypted with the OS keychain (Electron
// safeStorage) when `crypt` is given. One record per colleague of «Команда», under the colleague's key
// (Jira account id, else email, else name); a record is also found by the other identities it was saved with, so
// adding a Jira account to a card later does not orphan it.
// Record: {key, name, email, absences:[{id, from, to, kind, note, source, at, draft?}],
//  notes:[{id, date, text, at, draft?}], followups:[{id, text, owner:'me'|'them', due, done, doneAt, at, noteId}],
//  anniversary:'YYYY-MM-DD'|''}.
const fs=require('node:fs'),path=require('node:path');

function create({dir,crypt=null}){
 const where=()=>typeof dir==='function'?dir():dir;
 const file=()=>path.join(where(),'people.json');
 const empty=()=>({version:1,people:{}});
 function load(){
  const d=where();if(!d)return empty();
  try{
   let raw=fs.readFileSync(file(),'utf8');
   if(raw.startsWith('enc:')){if(!crypt)return empty();raw=crypt.decrypt(Buffer.from(raw.slice(4),'base64'));}
   const data=JSON.parse(raw);
   return {version:1,people:data.people&&typeof data.people==='object'&&!Array.isArray(data.people)?data.people:{}};
  }catch{return empty();}
 }
 function save(data){
  const d=where();if(!d)throw Error('Нет папки компании для записей о коллегах.');
  fs.mkdirSync(d,{recursive:true,mode:0o700});
  const json=JSON.stringify(data);
  const body=crypt?'enc:'+crypt.encrypt(json).toString('base64'):json;
  fs.writeFileSync(file()+'.tmp',body,{mode:0o600});fs.renameSync(file()+'.tmp',file());
 }
 // The stored key of a member: its own key, or a record saved under another identity of the same person.
 function keyOf(data,member){
  const ids=[member.jiraId,member.email,member.name].filter(Boolean);
  for(const id of ids)if(data.people[id])return id;
  const low=v=>String(v||'').toLowerCase();
  return Object.keys(data.people).find(k=>{const r=data.people[k];return r.name===member.name||member.email&&low(r.email)===low(member.email);})||null;
 }
 const blank=(key,member)=>({key,name:member.name,email:member.email||'',absences:[],notes:[],followups:[],anniversary:''});
 // Reads one record (a fresh empty one when there is none).
 function get(member,key){const data=load();const k=keyOf(data,member);return k?{...blank(k,member),...data.people[k]}:blank(key,member);}
 // Changes one record in place and saves; `change(record)` may return a value.
 function update(member,key,change){
  const data=load();const k=keyOf(data,member)||key;
  const rec={...blank(k,member),...data.people[k]};
  if(k!==key&&!data.people[key]){delete data.people[k];rec.key=key;}
  rec.name=member.name;rec.email=member.email||rec.email||'';
  const out=change(rec);
  data.people[rec.key]=rec;save(data);return out;
 }
 return {
  load,get,update,
  all:()=>Object.values(load().people),
  forget(member){const data=load();const k=keyOf(data,member);if(!k)return false;delete data.people[k];save(data);return true;},
  // Removes only private parts (1:1 notes and follow-ups) or everything.
  wipe(part='all'){
   const d=where();if(!d)return;
   if(part==='all'){fs.rmSync(d,{recursive:true,force:true});return;}
   const data=load();for(const r of Object.values(data.people)){r.notes=[];r.followups=[];}save(data);
  },
  encrypted:()=>!!crypt,
  folder:()=>where()||''
 };
}
module.exports={create};
