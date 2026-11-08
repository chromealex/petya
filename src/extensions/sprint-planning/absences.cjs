// «Планирование спринта», absences: notes typed in the chat («Маша в отпуске 12–16») kept per Jira project in the
// app's own folder, and vacation / out-of-office events from the calendar app (if it is added and has access).
// A note or event counts only for a person of «Команда»; dates are whole local days, inclusive.
const {randomUUID}=require('node:crypto');
const match=require('../../team-match.cjs');
const {ymd,dayStart}=require('./plan.cjs');
const MONTHS=['январ','феврал','март','апрел','ма[йя]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const MONTH=new RegExp('('+MONTHS.join('|')+')\\p{L}*','iu');
const monthOf=word=>{const w=String(word||'').toLocaleLowerCase('ru');return MONTHS.findIndex(m=>new RegExp('^'+m,'u').test(w));};
const ABSENT=/(?:в\s+отпуск\p{L}*|на\s+больничн\p{L}*|в\s+отгул\p{L}*|не\s+будет|отсутству\p{L}*|в\s+командировк\p{L}*|на\s+конференци\p{L}*|болеет|уезжа\p{L}*)/iu;
// «12–16», «с 12 по 16 ноября», «12.11–16.11», «12 ноября – 3 декабря», «до 20-го», «20 ноября» (one day).
const RANGE=/(?:с\s+)?(\d{1,2})(?:[./](\d{1,2}))?(?:\s+([а-яё]+))?\s*(?:[-–—]|по|до)\s*(\d{1,2})(?:[./](\d{1,2}))?(?:-?го)?(?:\s+([а-яё]+))?/iu;
const UNTIL=/(?:^|\s)до\s+(\d{1,2})(?:[./](\d{1,2}))?(?:-?го)?(?:\s+([а-яё]+))?/iu;
const SINGLE=/(?:^|\s)(\d{1,2})(?:[./](\d{1,2}))?(?:\s+([а-яё]+))?(?=\s|$|[,.!?])/iu;

// A chat note about someone's absence: {who, from, to} (YYYY-MM-DD) or null.
function parseNote(text,now=new Date()){
 const t=String(text||'').replace(/^петя[,!\s]+/iu,'').trim();
 const verb=ABSENT.exec(t);if(!verb)return null;
 const who=t.slice(0,verb.index).replace(/^(?:а\s+|кстати\s+|запомни,?\s*(?:что\s+)?)/iu,'').replace(/[,:]+$/,'').trim();
 if(!who||who.split(/\s+/).length>3||!/^\p{L}/u.test(who))return null;
 const rest=t.slice(verb.index+verb[0].length);
 const today=dayStart(now);let a,b;
 const month=(m,name)=>m?Number(m)-1:name&&monthOf(name)>=0?monthOf(name):null;
 const r=RANGE.exec(rest);
 if(r){
  const m2=month(r[5],r[6]),m1=month(r[2],r[3])??m2;
  a={d:Number(r[1]),m:m1};b={d:Number(r[4]),m:m2??m1};
 }else{
  const u=UNTIL.exec(rest);
  if(u){a={d:today.getDate(),m:today.getMonth()};b={d:Number(u[1]),m:month(u[2],u[3])};}
  else if(/сегодня/iu.test(rest)){a=b={d:today.getDate(),m:today.getMonth()};}
  else if(/завтра/iu.test(rest)){const d=new Date(today);d.setDate(d.getDate()+1);a=b={d:d.getDate(),m:d.getMonth()};}
  else{const one=SINGLE.exec(rest);if(!one)return null;a=b={d:Number(one[1]),m:month(one[2],one[3])};}
 }
 // Without a month: the nearest such days not entirely in the past.
 let from=new Date(today.getFullYear(),a.m??today.getMonth(),a.d),to=new Date(today.getFullYear(),b.m??(a.m??today.getMonth()),b.d);
 if(b.m==null&&a.m==null&&b.d<a.d)to=new Date(from.getFullYear(),from.getMonth()+1,b.d);
 if(to<from)to.setFullYear(to.getFullYear()+1);
 if(to<new Date(today.getTime()-86400000)){if(a.m==null){from.setMonth(from.getMonth()+1);to.setMonth(to.getMonth()+1);}else{from.setFullYear(from.getFullYear()+1);to.setFullYear(to.getFullYear()+1);}}
 if(from.getDate()!==a.d||to.getDate()!==b.d||(to-from)>120*86400000)return null;
 const kind=/больничн|болеет/iu.test(verb[0])?'sick':/отпуск/iu.test(verb[0])?'vacation':'away';
 return {who,from:ymd(from),to:ymd(to),kind};
}

// «Маши», «Олегу», «Мария Петрова»: a member of «Команда» by name, alias or the Jira name, also in another case.
// A word matches a name word with a case ending: «Маши» — «Маша», «Олегу» — «Олег», not «Пётр» — «Петрова».
const low=w=>String(w||'').toLocaleLowerCase('ru').replace(/ё/g,'е');
const sameWord=(w,n)=>w===n||n.length>=3&&w.length-n.length<=2&&w.length>=n.length&&w.startsWith(n.length>3?n.slice(0,-1):n)||n.length>3&&w.length===n.length&&w.slice(0,-1)===n.slice(0,-1);
function member(who,members){
 const asked=String(who).split(/[\s-]+/).filter(w=>w.length>=2).map(low);
 if(!asked.length)return null;
 const names=m=>[m.name,m.jiraName,...String(m.aliases||'').split(/[,;]/)].join(' ').split(/[\s-]+/).filter(Boolean).map(low);
 const hits=members.filter(m=>asked.every(a=>names(m).some(n=>sameWord(a,n))));
 if(hits.length===1)return hits[0];
 const direct=hits.length?null:match.match(who,members);
 return direct&&asked.every(a=>names(direct).some(n=>sameWord(a,n)||latinSame(a,n)))?direct:null;
}
const latinSame=(a,b)=>match.latin(a)===match.latin(b);
const memberKey=m=>m.jiraId||m.email||m.name;

function store(s){return require('../../extension-cache.cjs').store(s.dataRoot,'sprint-planning');}
function notes(s,project){const v=store(s).peek('absences:'+project);return Array.isArray(v)?v:[];}
function addNote(s,project,note){
 const list=notes(s,project).filter(n=>n.to>=ymd(new Date(Date.now()-60*86400000))).filter(n=>!(n.member===note.member&&n.from===note.from&&n.to===note.to));
 const row={id:randomUUID(),...note,at:Date.now()};
 store(s).set('absences:'+project,[...list,row].slice(-100));return row;
}
function removeNote(s,project,id){const list=notes(s,project),next=list.filter(n=>n.id!==id);store(s).set('absences:'+project,next);return next.length!==list.length;}

const OOO=/отпуск|vacation|holiday|\booo\b|out of office|больничн|\bsick\b|day[\s-]?off|отгул|выходн\p{L}*\s+день/iu;
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
