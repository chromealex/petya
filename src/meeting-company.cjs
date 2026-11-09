// Which company a meeting belongs to, by the people in it. When a meeting source sees a meeting and names its
// participants (the meeting app's window), each company's «Команда» is compared with those names; the meeting is recorded
// in the company with clearly the most of its people there, switching to it before the recording starts, instead
// of writing into whichever company happens to be open. No names, no match or a tie keeps the current company.
const fs=require('node:fs');
const path=require('node:path');
const HOURS=3*3600000;
// One decision per meeting, kept across a company switch (this module outlives the per-company services).
let decided=null;

const norm=s=>String(s||'').toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s*\([^)]*\)/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const words=s=>norm(s).split(' ').filter(w=>w.length>=2);

// The names one colleague can show up under in a meeting: the full name, «Имя на встречах», aliases, the email's name.
function namesOf(member){
 const out=[member.name,member.meetingName,...String(member.aliases||'').split(',')];
 const local=String(member.email||'').split('@')[0];if(local)out.push(local.replace(/[._-]+/g,' '));
 return out.map(norm).filter(Boolean);
}

// Does a participant name (as the meeting shows it) stand for this colleague? Whole names match exactly or as the
// same words in any order («Петров Иван»); one word («Аня») matches only a first name or alias no one else shares.
function same(participant,member,firstNames){
 const p=words(participant);if(!p.length)return false;
 for(const n of namesOf(member)){
  const w=n.split(' ').filter(x=>x.length>=2);if(!w.length)continue;
  if(p.join(' ')===w.join(' '))return true;
  if(w.length>=2&&p.length>=2&&w.every(x=>p.includes(x)))return true;
  if(p.length===1&&w.length===1&&p[0]===w[0]&&(firstNames.get(p[0])||0)===1)return true;
  if(p.length===1&&w.length>=2&&p[0]===w[0]&&(firstNames.get(p[0])||0)===1)return true;
 }
 return false;
}

// participants: names from the meeting; companies: [{id, name, members:[cards]}] → {id, name, people:[names]}, or
// null when nobody matches or two companies have the same number of their people in the meeting.
function match(participants,companies){
 const names=[...new Set((participants||[]).map(n=>String(n||'').trim()).filter(n=>n&&n.length<=80))];
 if(!names.length)return null;
 const scored=companies.map(c=>{
  const first=new Map();for(const m of c.members||[])for(const n of new Set(namesOf(m).map(x=>x.split(' ')[0])))first.set(n,(first.get(n)||0)+1);
  const people=names.filter(p=>(c.members||[]).some(m=>same(p,m,first)));
  return {id:c.id,name:c.name,people};
 }).filter(c=>c.people.length).sort((a,b)=>b.people.length-a.people.length);
 if(!scored.length||scored[1]?.people.length===scored[0].people.length)return null;
 return scored[0];
}

// Each company's saved team, read from its own settings file (teamMembers is encrypted with the OS keychain).
function teams(companies,decrypt){
 return companies.list().companies.map(c=>{
  let members=[];
  try{
   const saved=JSON.parse(fs.readFileSync(path.join(companies.directory(c.id),'settings.json'),'utf8'));
   if(typeof saved.teamMembers==='string'&&saved.teamMembers)members=require('./team.cjs').validate(JSON.parse(decrypt(saved.teamMembers)));
  }catch{/* no team or unreadable: this company is not a candidate */}
  return {id:c.id,name:c.name,members};
 });
}

// Called when a meeting is seen, before recording. Returns {record:true, note} to record here, or {record:false}
// when the meeting belongs to another company and the switch to it has started (that company records it).
async function place(s,state,{decrypt,now=Date.now()}={}){
 if(decided&&now-decided.at>HOURS)decided=null;
 if(decided){
  if(decided.companyId===s.companyId){const note=decided.note;decided.note='';return {record:true,note};}
  // Decided for another company, but this one asks again: the switch did not land or the user went back. Record here.
  if(decided.failed||decided.switched)return {record:true,note:''};
 }
 const companies=s.companies;
 if(!companies||companies.list().companies.length<2)return {record:true,note:''};
 const best=match(state?.participants||[],teams(companies,decrypt));
 if(!best||best.id===s.companyId){decided={companyId:s.companyId,at:now,note:''};return {record:true,note:best?'Участники из команды: '+best.people.slice(0,3).join(', ')+'.':''};}
 const note='Встреча с '+best.people.slice(0,3).join(', ')+(best.people.length>3?' и ещё '+(best.people.length-3):'')+' — записываю в компанию «'+best.name+'».';
 decided={companyId:best.id,at:now,note};
 try{const r=await s.switchCompany(best.id);if(r?.switching){decided.switched=true;return {record:false};}}
 catch(error){decided={companyId:s.companyId,at:now,note:'',failed:true};return {record:true,note:'Похоже, это встреча компании «'+best.name+'», но переключиться не удалось: '+error.message+' Записываю сюда.'};}
 decided.failed=true;return {record:true,note:''};
}
// The meeting ended: the next one is placed afresh.
function reset(){decided=null;}
module.exports={match,place,reset,teams,_state:()=>decided};
