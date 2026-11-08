// Reminder trigger «начинается встреча с человеком»: «напомни, когда начнётся следующая встреча с Машей»,
// «напомни за 10 минут до встречи с Олегом». Reads the user's calendar through «Календарь» (Google Calendar API v3 /
// Microsoft Graph calendarView, the same account and client): the next event in two weeks where the person is an
// attendee (email from «Команда») or named in the title. The event is re-read while waiting, so a moved meeting
// moves the reminder and a cancelled one is reported.
const {TriggerError}=require('./triggers.cjs');
const people=require('./people.cjs');
const MEETING='(?:встреч\\p{L}*|созвон\\p{L}*|митинг\\p{L}*|звон\\p{L}*|звонк\\p{L}*|синк\\p{L}*|1:1|one-on-one|ван-ту-ван\\p{L}*)';
const START=new RegExp('когда\\s+начн[её]тся\\s+(?:(?:следующ|ближайш)\\p{L}*\\s+)?'+MEETING+'\\s+с\\s+(\\p{L}{3,25})','iu');
const BEFORE=new RegExp('за\\s+(\\d{1,3}|пять|десять|пятнадцать|двадцать|полчаса|час)\\s*(?:минут\\p{L}*|мин)?\\s+до\\s+(?:(?:следующ|ближайш)\\p{L}*\\s+)?'+MEETING+'\\s+с\\s+(\\p{L}{3,25})','iu');
const WORDS={пять:5,десять:10,пятнадцать:15,двадцать:20,полчаса:30,час:60};
const DAY=86400000,MIN=60000;
function calendarAccount(s){
 const {accounts}=require('../calendar/accounts.cjs');
 const ready=accounts(s.settings).filter(a=>a.calendar);
 return ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
}
function client(s,account){
 const {CalendarClient}=require('../calendar/client.cjs');
 const manager=s.mailAccounts?.[account.provider];
 if(!manager)throw Error('Почтовые аккаунты ещё загружаются. Повторите через минуту.');
 return new CalendarClient({provider:account.provider,email:account.email,fetcher:s.calendarFetch||globalThis.fetch,token:()=>manager.client(account.id).access()});
}
// Events from now on (an event that already started is not «the next one»), the first one with the person.
function pick(events,params,now){
 const stem=people.stem(params.name);
 return events.filter(e=>!e.allDay&&!e.declined&&Date.parse(e.start)>now-MIN).find(e=>
  params.email&&(e.meta?.attendees||[]).includes(params.email)||people.norm(e.title).split(/[^\p{L}]+/u).some(w=>w.startsWith(stem)));
}
async function upcoming(s,params,now){
 const account=calendarAccount(s);
 if(!account)throw new TriggerError('not-found','Выберите календарь в настройках «Календаря» — их подключено несколько или ни одного.');
 return {account,events:await client(s,account).events(new Date(now-MIN),new Date(now+14*DAY))};
}
module.exports={
 id:'calendar-meeting',name:'Встреча в календаре',icon:'calendar',
 connect:'Добавьте «Календарь» и разрешите доступ к календарю в его настройках.',
 match(text){
  const t=String(text);let m=BEFORE.exec(t);
  if(m)return {name:m[2],lead:/^\d+$/.test(m[1])?Math.min(180,Number(m[1])):WORDS[m[1].toLocaleLowerCase('ru')]};
  m=START.exec(t);return m?{name:m[1],lead:0}:null;
 },
 ready(settings){try{return settings.extension_calendar==='true'&&require('../calendar/accounts.cjs').connected(settings);}catch{return false;}},
 async prepare(s,params,{now=Date.now()}={}){
  const found=people.find(s.settings,params.name);
  const person=found.length===1?found[0]:null;
  const want={...params,name:person?.name||params.name,email:person?.email||''};
  const {account,events}=await upcoming(s,want,now);
  const event=pick(events,{...want,name:params.name},now);
  if(!event)throw new TriggerError('not-found','В ближайшие две недели встреч с '+params.name+' в календаре не нашёл.');
  const fireAt=Date.parse(event.start)-want.lead*MIN;
  return {params:{...want,query:params.name,account:account.key,eventId:event.id,title:event.title,start:event.start},fireAt:Math.max(now,fireAt),
   label:want.lead?'до встречи «'+event.title+'» останется '+want.lead+' мин':'начнётся встреча «'+event.title+'»',url:event.link||event.url||''};
 },
 async check(s,params,{now=Date.now()}={}){
  const {events}=await upcoming(s,params,now);
  let event=events.find(e=>e.id===params.eventId);
  if(!event||event.declined)return {fired:false,gone:true,text:'Встреча «'+params.title+'» пропала из календаря или отменена.'};
  const fireAt=Date.parse(event.start)-(params.lead||0)*MIN;
  const next={...params,start:event.start,title:event.title};
  if(now<fireAt)return {fired:false,params:next,fireAt};
  const at=new Date(event.start);
  return {fired:true,params:next,text:(params.lead?'Через '+params.lead+' мин':'Начинается')+' встреча «'+event.title+'» в '+String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0')+'.',url:event.link||event.url||''};
 },
 // Looks again every half an hour while the meeting is far away, then right at the moment.
 every(checks,params,now){const fireAt=Date.parse(params.start)-(params.lead||0)*MIN;return Math.max(30000,Math.min(30*MIN,fireAt-now));}
};
