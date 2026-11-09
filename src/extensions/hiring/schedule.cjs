// «Найм», interview time from the calendar, read only: the user's calendar (and the interviewers' free/busy when their
// addresses are in «Команда») over the next working days, through «Календарь»'s own reader (its account choice,
// working hours and slot ranking). Nothing is created here: an invitation goes out only through the calendar's own
// confirmed flow after the user confirmed the reviewed text on the card.
const DAY=86400000;
function calendar(){return {accounts:require('../calendar/accounts.cjs'),client:require('../calendar/client.cjs'),slots:require('../calendar/slots.cjs'),when:require('../calendar/when.cjs')};}
function ready(s){
 if(s.settings?.extension_calendar!=='true')return {ok:false,why:'Добавьте «Календарь» и разрешите ему доступ — тогда предложу время интервью по свободным слотам.'};
 const c=calendar(),list=c.accounts.accounts(s.settings).filter(a=>a.calendar);
 const account=list.find(a=>a.key===s.settings.calendarAccount)||(list.length===1?list[0]:null);
 if(!list.length)return {ok:false,why:'«Календарь» добавлен, но доступ к календарю не выдан: «Настройки → Календарь» → «Разрешить доступ к календарю».'};
 if(!account)return {ok:false,why:'Выберите календарь в настройках «Календаря» — их несколько.'};
 return {ok:true,account};
}
function hours(settings){
 const {when}=calendar();const a=when.minutes(settings.calendarWorkStart),b=when.minutes(settings.calendarWorkEnd);
 return a!==null&&b!==null&&a<b?{workStart:settings.calendarWorkStart,workEnd:settings.calendarWorkEnd}:{workStart:'10:00',workEnd:'19:00'};
}
// → {slots:[{start,end,note}], people:[{name,email,error?}], range:{from,to}, duration} for the next five working days.
async function slots(s,{interviewers=[],duration=60,now=new Date(),fetcher=globalThis.fetch,limit=5}={}){
 const r=ready(s);if(!r.ok)return {off:r.why};
 const c=calendar(),account=r.account;
 const manager=s.mailAccounts?.[account.provider];if(!manager)throw Error('Почтовые аккаунты ещё загружаются. Повторите через минуту.');
 const client=new c.client.CalendarClient({provider:account.provider,email:account.email,fetcher,token:()=>manager.client(account.id).access()});
 const from=c.when.startOfDay(now);let to=c.when.addDays(from,1),days=0;
 while(days<5){if(to.getDay()!==0&&to.getDay()!==6)days++;to=c.when.addDays(to,1);}
 const range={from,to,label:'в ближайшие дни',single:false};
 const self={name:'Вы',email:account.email.toLowerCase(),self:true};
 const others=interviewers.filter(p=>p.email&&p.email.toLowerCase()!==self.email).slice(0,4);
 const rows=await client.busy([self.email,...others.map(p=>p.email.toLowerCase())],range.from,range.to);
 const lanes=[self,...others].map(p=>({...p,email:p.email.toLowerCase(),...rows.find(x=>x.email===p.email.toLowerCase())||{busy:[],error:'нет данных'}}));
 const found=c.slots.find(lanes,range,{duration,...hours(s.settings),now,limit});
 return {slots:found.slots.map(x=>({start:x.start,end:x.end,note:x.note||''})),people:lanes.map(l=>({name:l.name,email:l.email,self:!!l.self,error:l.error||''})),duration,account:account.email,
  missing:interviewers.filter(p=>!p.email).map(p=>p.name)};
}
// The request the calendar's own flow understands: «Поставь встречу «…» с a@b.c и Олегом 12 ноября в 15:00 на 60 минут».
function request({title,email,interviewers=[],start,duration}){
 const d=new Date(start),month=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'][d.getMonth()];
 const hm=String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 const who=[email,...interviewers.filter(p=>p.email).map(p=>p.email)].filter(Boolean);
 return 'Поставь встречу «'+String(title).replace(/[«»"]/g,'').slice(0,120)+'»'+(who.length?' с '+who.join(' и '):'')+' '+d.getDate()+' '+month+' в '+hm+' на '+duration+' минут';
}
module.exports={ready,slots,request,DAY};
