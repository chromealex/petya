// «Календарь» as a people source (src/features/people.cjs, docs/foundations/people.md): vacation and out-of-office
// events of the chosen calendar account become colleagues' absences for «Отсутствия», «Встречи 1:1» and sprint
// capacity. Read when asked, never stored. Whose absence: a name of «Команда» in the title («Отпуск Олег»), else the
// organizer's or the only attendee's address; the user's own out-of-office event counts for the user's own card.
const text=require('../../people/text.cjs');
const {accounts,connected}=require('./accounts.cjs');
module.exports={
 id:'calendar',name:'Календарь',
 ready:settings=>settings.extension_calendar==='true'&&connected(settings),
 async absences(s,{from,to,members,fetcher=globalThis.fetch}){
  const {CalendarClient}=require('./client.cjs');
  const ready=accounts(s.settings).filter(a=>a.calendar);
  const account=ready.find(a=>a.key===s.settings.calendarAccount)||(ready.length===1?ready[0]:null);
  if(!account){if(ready.length)throw Error('выберите календарь в настройках «Календаря»');return [];}
  const manager=s.mailAccounts?.[account.provider];if(!manager)throw Error('календарь ещё загружается');
  const client=new CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
  const rows=[];
  for(const e of await client.events(from,to)){
   if(e.declined||!(e.meta?.ooo||text.OOO.test(e.title)))continue;
   const mail=[e.meta?.organizer,...(e.meta?.attendees||[])].filter(Boolean);
   const words=e.title.replace(text.OOO,' ').split(/[^\p{L}-]+/u).filter(w=>w.length>=3);
   let m=null;
   for(let i=0;i<words.length&&!m;i++)m=text.member(words.slice(i,i+2).join(' '),members)||text.member(words[i],members);
   if(!m)m=members.find(x=>x.email&&mail.includes(x.email.toLowerCase()))||(mail.length<=1&&account.email?members.find(x=>x.email&&x.email.toLowerCase()===account.email.toLowerCase()):null);
   if(!m)continue;
   const start=new Date(e.start),end=new Date(e.end);
   // All-day events end on the next midnight (exclusive).
   const last=e.allDay?new Date(end.getTime()-1):end;
   rows.push({member:text.memberKey(m),from:text.ymd(start),to:text.ymd(last),kind:text.kindOf(e.title)==='away'?'vacation':text.kindOf(e.title),title:e.title.slice(0,120)});
  }
  return rows;
 }
};
