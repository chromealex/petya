// Today's meetings from the «Календарь» app, when it is added and has calendar access: read-only, through that
// app's own account list and REST client (Google Calendar / Microsoft Graph). Without it focus works as usual.
const {accounts}=require('../calendar/accounts.cjs');
const {CalendarClient}=require('../calendar/client.cjs');
const {startOfDay,addDays,MIN}=require('./store.cjs');

// Whether meetings can be read at all; the chosen calendar account or the only one with access.
function account(s){
 if(s.settings?.extension_calendar!=='true')return null;
 const ready=accounts(s.settings).filter(a=>a.calendar);
 return ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
}
// Busy meetings of the day of `now`: [{title,start,end}] (ISO), or null when the calendar is not available.
async function today(s,{fetcher=globalThis.fetch,now=new Date(),timeout=8000}={}){
 const a=account(s);if(!a)return null;
 const manager=s.mailAccounts?.[a.provider];if(!manager)return null;
 const client=new CalendarClient({provider:a.provider,email:a.email,fetcher,token:()=>manager.client(a.id).access()});
 const from=new Date(startOfDay(+now)),to=new Date(addDays(+from,1));
 let timer;
 try{
  const events=await Promise.race([client.events(from,to),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeout);timer.unref?.();})]);
  return events.filter(e=>!e.allDay&&!e.declined&&!e.free).map(e=>({title:e.title,start:e.start,end:e.end}));
 }catch{return null;}
 finally{clearTimeout(timer);}
}
// The next meeting that starts after `at` (or is in progress), and how many whole minutes of focus fit before it
// with a 5-minute margin, rounded down to 5.
function next(meetings,at){
 const list=(meetings||[]).filter(m=>Date.parse(m.end)>at).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const m=list[0];if(!m)return null;
 const until=Math.floor((Date.parse(m.start)-at)/MIN);
 return {...m,until,fit:Math.max(0,Math.floor((until-5)/5)*5),now:until<=0};
}
module.exports={account,today,next};
