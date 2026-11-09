// What is drawn over the activity timeline: meetings from «Календарь» (when it is added and has calendar access, read
// only through its own account list and REST client) and focus sessions of «Фокус» (its own file in the company
// data folder, read only). Without those apps the overlay is empty; a calendar that does not answer in time is skipped.
const fs=require('node:fs'),path=require('node:path');

async function meetings(s,{from,to,fetcher=globalThis.fetch,timeout=8000}={}){
 if(s.settings?.extension_calendar!=='true')return null;
 let account;
 try{const ready=require('../calendar/accounts.cjs').accounts(s.settings).filter(a=>a.calendar);account=ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);}catch{return null;}
 const manager=account&&s.mailAccounts?.[account.provider];if(!manager)return null;
 const {CalendarClient}=require('../calendar/client.cjs');
 const client=new CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
 let timer;
 try{
  const events=await Promise.race([client.events(new Date(from),new Date(to)),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeout);timer.unref?.();})]);
  return events.filter(e=>!e.allDay&&!e.declined&&!e.free).map(e=>({title:String(e.title||'Встреча').slice(0,120),start:Date.parse(e.start),end:Date.parse(e.end)})).filter(e=>e.end>from&&e.start<to);
 }catch{return null;}
 finally{clearTimeout(timer);}
}
function focus(s,{from,to}){
 if(s.settings?.extension_focus!=='true'||!s.dataRoot)return [];
 try{
  const d=JSON.parse(fs.readFileSync(path.join(s.dataRoot,'focus.json'),'utf8'));
  return (Array.isArray(d.history)?d.history:[]).filter(h=>h.kind==='focus'&&h.end>from&&h.start<to).map(h=>({start:Math.max(from,h.start),end:Math.min(to,h.end),label:[h.jira,h.label].filter(Boolean).join(' ').slice(0,120)}));
 }catch{return [];}
}
module.exports={meetings,focus};
