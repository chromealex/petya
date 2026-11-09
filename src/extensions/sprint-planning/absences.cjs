// «Планирование спринта», absences: notes typed in the chat («Маша в отпуске 12–16») kept per Jira project in the
// app's own folder, and vacation / out-of-office events from the calendar app (if it is added and has access).
// When the people records foundation is loaded (s.people), its absences replace the calendar read here; these
// project notes stay and are added to them (docs/foundations/people.md).
// A note or event counts only for a person of «Команда»; dates are whole local days, inclusive.
const {randomUUID}=require('node:crypto');
const {ymd,dayStart}=require('./plan.cjs');
// The phrase parsing and the name matching live in the people records foundation (src/people/text.cjs).
const {parseNote,member,memberKey,OOO}=require('../../people/text.cjs');

function store(s){return require('../../extension-cache.cjs').store(s.dataRoot,'sprint-planning');}
function notes(s,project){const v=store(s).peek('absences:'+project);return Array.isArray(v)?v:[];}
function addNote(s,project,note){
 const list=notes(s,project).filter(n=>n.to>=ymd(new Date(Date.now()-60*86400000))).filter(n=>!(n.member===note.member&&n.from===note.from&&n.to===note.to));
 const row={id:randomUUID(),...note,at:Date.now()};
 store(s).set('absences:'+project,[...list,row].slice(-100));return row;
}
function removeNote(s,project,id){const list=notes(s,project),next=list.filter(n=>n.id!==id);store(s).set('absences:'+project,next);return next.length!==list.length;}

// Vacation events in the calendar inside [from, to): who by a name in the title, or by the organizer/attendee address.
async function fromCalendar(s,{from,to,members,fetcher=globalThis.fetch}){
 if(s.settings.extension_calendar!=='true')return {rows:[],note:''};
 const {accounts}=require('../calendar/accounts.cjs'),{CalendarClient}=require('../calendar/client.cjs');
 const ready=accounts(s.settings).filter(a=>a.calendar);
 const account=ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
 if(!account)return {rows:[],note:ready.length?'Календарь: выберите календарь в настройках «Календаря», чтобы учесть отпуска.':''};
 const manager=s.mailAccounts?.[account.provider];if(!manager)return {rows:[],note:'Календарь ещё загружается — отпуска из него не учтены.'};
 const client=new CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
 const events=await client.events(from,to);
 const rows=[];
 for(const e of events){
  if(e.declined||!OOO.test(e.title))continue;
  const mail=[e.meta?.organizer,...(e.meta?.attendees||[])].filter(Boolean);
  const title=e.title.replace(OOO,' ');
  const words=title.split(/[^\p{L}-]+/u).filter(w=>w.length>=3);
  let m=null;
  for(let i=0;i<words.length&&!m;i++)m=member(words.slice(i,i+2).join(' '),members)||member(words[i],members);
  if(!m)m=members.find(x=>x.email&&mail.includes(x.email.toLowerCase()))||(mail.length<=1&&account.email?members.find(x=>x.email&&x.email.toLowerCase()===account.email.toLowerCase()):null);
  if(!m)continue;
  const start=new Date(e.start),end=new Date(e.end);
  // All-day events end on the next midnight (exclusive).
  const last=e.allDay?new Date(end.getTime()-1):end;
  rows.push({member:memberKey(m),name:m.name,from:ymd(start),to:ymd(last),kind:/больничн|sick/iu.test(e.title)?'sick':'vacation',source:'calendar',title:e.title.slice(0,120)});
 }
 return {rows,note:''};
}

module.exports={parseNote,member,memberKey,notes,addNote,removeNote,fromCalendar,OOO};
