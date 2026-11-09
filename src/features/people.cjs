// People records (a foundation for apps such as «Встречи 1:1» and «Отсутствия»): one local record per colleague of
// «Команда» (the existing team list, never a second one) with absences, 1:1 notes, agreed follow-ups and an
// anniversary the user typed. Records are written only after the user confirmed them on a card; stored per company,
// encrypted with the OS keychain when available, wiped on request, never sent anywhere.
// Contract for apps: docs/foundations/people.md.
// - Settings: peopleCalendar ('true': absences include out-of-office events of the calendar app while it is added).
// - Services: `s.people` {members(), find(text), absences({from,to,key}), addAbsence, removeAbsence, restoreAbsence,
//   notes(member) (private), addNote, followups(filter), setFollowup, setAnniversary, dates(), draft(id), status(),
//   wipe(part), forget(member)}. IPC: window.petya.feature('people', 'status' | 'wipe').
// - Sources: an app declares `"provides": {"people-source": "<file>.cjs"}`; the file exports {id, name?, ready(settings),
//   async absences(services, {from, to, members, fetcher}) -> [{member|email|name, from, to, kind?, title?}]} — the
//   calendar app is the first one, HR systems are meant to plug in the same way. Rows from sources are read when asked
//   and never stored.
// Privacy: 1:1 notes and follow-ups are private. They are returned only by `notes()` / `followups()`, which only the
// 1:1 app calls in a turn where the user asked about that person; nothing here adds them to «Команда», the model
// context or any other app's prompt.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const text=require('../people/text.cjs');
const KIND='people-source',KINDS=['vacation','sick','dayoff','away'];
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
const validDay=v=>DAY_RE.test(String(v||''))&&text.ymd(new Date(v+'T12:00:00'))===v;
const clip=(v,max)=>String(v??'').replace(/\r/g,'').trim().slice(0,max);

function load(dir){
 return require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).map(({provider:p,...x})=>{
  if(typeof p.absences!=='function'||typeof p.ready!=='function'||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id))throw Error('Invalid people source '+x.extension+'/'+x.file);
  return {id:p.id,extension:x.extension,setting:x.setting,name:p.name||x.name,source:p};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}

function create(s,{now=()=>Date.now(),dir,crypt,sources}={}){
 const where=dir||(()=>s.dataRoot?path.join(s.dataRoot,'people'):'');
 const store=require('../people/store.cjs').create({dir:where,crypt});
 const registry=sources||(()=>{let all=null;return ()=>{if(!all){try{all=load();}catch(e){console.error('People sources:',e.message);all=[];}}return all;};})();
 const added=x=>!x.setting||s.settings?.[x.setting]==='true';
 const ready=x=>{try{return added(x)&&!!x.source.ready(s.settings||{});}catch{return false;}};
 function members(){
  try{return require('../team.cjs').members(s.settings||{}).map(({photo,...m})=>({...m,key:text.memberKey(m)}));}catch{return [];}
 }
 const memberOf=key=>members().find(m=>m.key===key||m.name===key||m.email&&m.email===key)||null;
 const need=member=>{const m=member&&typeof member==='object'?memberOf(member.key||member.name):memberOf(member);if(!m)throw Error('Такого человека нет в «Команде».');return m;};
 const today=()=>text.ymd(now());

 // --- Absences ------------------------------------------------------------------------------------------------------
 function stored({from,to,key}={}){
  const out=[];
  for(const m of members()){
   if(key&&m.key!==key)continue;
   for(const a of store.get(m,m.key).absences||[])if((!from||a.to>=from)&&(!to||a.from<=to))out.push({id:a.id,member:m.key,name:m.name,from:a.from,to:a.to,kind:a.kind,note:a.note||'',source:a.source||'chat',removable:(a.source||'chat')==='chat'});
  }
  return out;
 }
 // Stored absences plus what the ready sources say for [from, to] (inclusive days). Source failures do not hide the
 // rest: each becomes a line in `notes`.
 async function absences({from=today(),to,key,fetcher}={}){
  if(!validDay(from)||to&&!validDay(to))throw Error('Некорректный период отсутствий.');
  const last=to||text.ymd(new Date(new Date(from+'T12:00:00').getTime()+13*text.DAY));
  const team=members(),rows=stored({from,to:last,key}),notes=[];
  const want=key?team.filter(m=>m.key===key):team;
  for(const x of registry().filter(ready)){
   if(x.id==='calendar'&&s.settings?.peopleCalendar==='false')continue;
   try{
    const got=await x.source.absences(s,{from:new Date(from+'T00:00:00'),to:new Date(new Date(last+'T00:00:00').getTime()+text.DAY),members:want,fetcher});
    for(const r of Array.isArray(got)?got:[]){
     const m=want.find(p=>p.key===r.member)||want.find(p=>r.email&&p.email&&p.email.toLowerCase()===String(r.email).toLowerCase())||(r.name?text.member(r.name,want):null);
     if(!m||!validDay(r.from)||!validDay(r.to)||r.to<r.from||r.to<from||r.from>last)continue;
     rows.push({id:'',member:m.key,name:m.name,from:r.from,to:r.to,kind:KINDS.includes(r.kind)?r.kind:'vacation',note:'',title:clip(r.title,120),source:x.id,sourceName:x.name,removable:false});
    }
   }catch(e){if(e?.name==='AbortError')throw e;notes.push(x.name+': '+clip(e?.message||'не прочитано',200)+' — отсутствия оттуда не учтены.');}
  }
  // The same days of one person from two sources are shown once (a typed note wins over a calendar event).
  const seen=new Set();
  const list=rows.filter(r=>{const k=r.member+'|'+r.from+'|'+r.to;if(seen.has(k))return false;seen.add(k);return true;})
   .sort((a,b)=>a.from.localeCompare(b.from)||a.name.localeCompare(b.name));
  return {rows:list,notes,from,to:last};
 }
 function addAbsence(member,{from,to,kind='vacation',note='',draft=''}={}){
  const m=need(member);
  if(!validDay(from)||!validDay(to)||to<from)throw Error('Проверьте даты отсутствия.');
  if((new Date(to)-new Date(from))>120*text.DAY)throw Error('Отсутствие длиннее 120 дней не сохраняю — проверьте даты.');
  return store.update(m,m.key,rec=>{
   const same=rec.absences.find(a=>a.from===from&&a.to===to);
   if(same)return {...same,member:m.key,name:m.name,existed:true};
   const keep=text.ymd(now()-366*text.DAY);
   const row={id:randomUUID(),from,to,kind:KINDS.includes(kind)?kind:'vacation',note:clip(note,300),source:'chat',at:now(),...draft?{draft:String(draft).slice(0,80)}:{}};
   rec.absences=[...rec.absences.filter(a=>a.to>=keep),row].slice(-200);
   return {...row,member:m.key,name:m.name};
  });
 }
 function removeAbsence(key,id){
  const m=need(key);
  return store.update(m,m.key,rec=>{const row=rec.absences.find(a=>a.id===id);if(!row)throw Error('Эта отметка уже удалена.');rec.absences=rec.absences.filter(a=>a.id!==id);return {...row,member:m.key,name:m.name};});
 }
 function restoreAbsence(key,row){
  const m=need(key);
  if(!row||typeof row!=='object'||!validDay(row.from)||!validDay(row.to)||typeof row.id!=='string')throw Error('Нечего вернуть.');
  return store.update(m,m.key,rec=>{if(!rec.absences.some(a=>a.id===row.id))rec.absences.push({id:row.id.slice(0,80),from:row.from,to:row.to,kind:KINDS.includes(row.kind)?row.kind:'vacation',note:clip(row.note,300),source:'chat',at:Number(row.at)||now(),...row.draft?{draft:String(row.draft).slice(0,80)}:{}});return true;});
 }

 // --- 1:1 notes and follow-ups (private) ------------------------------------------------------------------------
 function notes(member,{limit=20}={}){
  const m=need(member);
  return (store.get(m,m.key).notes||[]).slice().sort((a,b)=>b.date.localeCompare(a.date)||b.at-a.at).slice(0,limit);
 }
 function addNote(member,{text:body,date=today(),followups=[],draft=''}={}){
  const m=need(member);
  const t=clip(body,4000);if(!t)throw Error('Пустая заметка.');
  if(!validDay(date))throw Error('Некорректная дата встречи.');
  if(!Array.isArray(followups)||followups.length>20)throw Error('Слишком много договорённостей.');
  return store.update(m,m.key,rec=>{
   if(draft&&rec.notes.some(n=>n.draft===draft))throw Error('Эти итоги уже сохранены.');
   const note={id:randomUUID(),date,text:t,at:now(),...draft?{draft:String(draft).slice(0,80)}:{}};
   const added=followups.map(f=>({id:randomUUID(),text:clip(f.text,300),owner:f.owner==='them'?'them':'me',due:validDay(f.due)?f.due:'',done:false,doneAt:0,at:now(),noteId:note.id})).filter(f=>f.text);
   rec.notes=[...rec.notes,note].slice(-300);rec.followups=[...rec.followups,...added].slice(-500);
   return {note,followups:added,member:m.key,name:m.name};
  });
 }
 // Follow-ups across the team or of one person: {member, owner:'me'|'them', open:true}. Overdue first, then by due.
 function followups({member,owner,open=true}={}){
  const list=member?[need(member)]:members(),out=[];
  for(const m of list)for(const f of store.get(m,m.key).followups||[])if((!owner||f.owner===owner)&&(!open||!f.done))out.push({...f,member:m.key,name:m.name});
  return out.sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999')||a.at-b.at);
 }
 function setFollowup(key,id,done=true){
  const m=need(key);
  return store.update(m,m.key,rec=>{const f=rec.followups.find(x=>x.id===id);if(!f)throw Error('Такой договорённости уже нет.');f.done=!!done;f.doneAt=done?now():0;return {...f,member:m.key,name:m.name};});
 }

 // --- Dates ----------------------------------------------------------------------------------------------------
 function setAnniversary(member,date){
  const m=need(member);if(date&&!validDay(date))throw Error('Дата прихода в команду: ГГГГ-ММ-ДД.');
  return store.update(m,m.key,rec=>{rec.anniversary=date||'';return rec.anniversary;});
 }
 // Birthdays come from the «Команда» card (typed there or filled from a profile), anniversaries from the record.
 function dates(){return members().map(m=>({member:m.key,name:m.name,birthday:m.birthday||'',anniversary:store.get(m,m.key).anniversary||''})).filter(d=>d.birthday||d.anniversary);}

 // Whether a card's draft was already saved (a card drawn again after a restart shows «сохранено»).
 function draft(id){
  if(typeof id!=='string'||!id)return false;
  return store.all().some(r=>(r.absences||[]).some(a=>a.draft===id)||(r.notes||[]).some(n=>n.draft===id));
 }
 function status(){
  const all=store.all();const n=k=>all.reduce((x,r)=>x+(r[k]||[]).length,0);
  return {people:all.length,absences:n('absences'),notes:n('notes'),followups:n('followups'),encrypted:store.encrypted(),calendar:s.settings?.peopleCalendar!=='false',
   sources:registry().filter(ready).map(x=>({id:x.id,name:x.name}))};
 }
 const api={now,members,find:phrase=>text.mentioned(phrase,members()),member:memberOf,absences,stored,addAbsence,removeAbsence,restoreAbsence,
  notes,addNote,followups,setFollowup,setAnniversary,dates,draft,status,
  wipe(part='all'){if(!['all','notes'].includes(part))throw Error('Некорректная очистка.');store.wipe(part);return status();},
  forget(member){return store.forget(need(member));},
  sources:()=>registry().filter(ready).map(x=>({id:x.id,name:x.name}))};
 return api;
}

function validate(next){
 if(next.peopleCalendar!==undefined&&!['true','false'].includes(next.peopleCalendar))throw Error('Некорректная настройка peopleCalendar');
}
function setup(s){
 const electron=(()=>{try{return require('electron');}catch{return null;}})();
 const safe=electron?.safeStorage;
 let crypt=null;try{if(safe?.isEncryptionAvailable?.())crypt={encrypt:v=>safe.encryptString(v),decrypt:b=>safe.decryptString(b)};}catch{crypt=null;}
 const people=create(s,{crypt});
 return {people,ipc:{status:()=>people.status(),wipe:part=>people.wipe(part==='notes'?'notes':'all')}};
}
module.exports={name:'people',defaults:{peopleCalendar:'true'},validate,setup,create,load,KIND};
