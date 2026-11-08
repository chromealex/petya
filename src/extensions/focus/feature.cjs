// «Фокус»: focus sessions and pomodoro in the chat. One persistent timer (survives closing the window and a
// restart), shown in Petya's top bar and in the notification center with pause / stop. During a focus session
// Petya's own non-urgent system notifications are held back (hold.cjs) and shown as one summary afterwards;
// urgent ones pass. With the «Календарь» app the next meeting is read: a session that would run into it gets a
// length that fits, and a warning comes 5 minutes before. Everything is computed by code; the model is not used.
// macOS Focus / Windows Focus assist are not switched: neither has a documented API an app may call without
// extra entitlements or user-made shortcuts.
const path=require('node:path');
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const {FocusStore,MIN}=require('./store.cjs');
const parse=require('./parse.cjs');
const hold=require('./hold.cjs');
const calendar=require('./meetings.cjs');
const ID='focus',BY='Фокус',NID='focus-session',HELD='focus-held',WARN_BEFORE=5;

const pad=n=>String(n).padStart(2,'0');
const hm=t=>{const d=new Date(t);return pad(d.getHours())+':'+pad(d.getMinutes());};
function dur(minutes){const m=Math.max(0,Math.round(minutes));const h=Math.floor(m/60),r=m%60;return h?h+' ч'+(r?' '+r+' мин':''):r+' мин';}
const sessions=n=>n+' '+kit.plural(n,['сессия','сессии','сессий']);
const tr=text=>{try{return require('../../interface-language.cjs').t(text);}catch{return text;}};
const named=v=>v?.label||v?.jira||'';

// --- The engine: store + timer + notifications, one per company data folder -----------------------------------
const engines=new Map();
function create(s,{now=()=>Date.now(),electron=null}={}){
 const store=new FocusStore({file:s.dataRoot?path.join(s.dataRoot,'focus.json'):'',now});
 const e={store,meetings:{day:'',list:[]},lastPublish:0,electron,sent:[]};
 const send=item=>{try{if(s.win&&!s.win.isDestroyed?.()&&!s.win.webContents?.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);}catch{/* window closing */}};
 // System notification of the app itself; marked so the hold lets it through.
 e.notify=(title,body)=>{
  e.sent=e.sent.concat({title,body}).slice(-20);
  const N=e.electron?.Notification;
  if(s.smoke||!N?.isSupported?.())return;
  try{const n=new N({title:tr('Петя')+' · '+tr(title),body:String(body).slice(0,250)});n.petyaFocus=true;n.on?.('click',()=>{try{s.win?.show?.();}catch{}});n.show();}catch{/* no notification service */}
 };
 e.status=()=>{const at=now();return {active:store.view(at),held:store.held.length,now:at};};
 // The notification center card of the running session, updated in place (one id, version per session).
 e.item=()=>{
  const at=now(),v=store.view(at);
  if(!v)return e.finished||{id:NID,title:BY,text:'Фокус не идёт.',busy:false,version:'idle',kind:'info',focus:e.status()};
  const left=Math.ceil(v.remaining/MIN),percent=Math.min(100,Math.floor(v.elapsed*100/v.planned));
  const title=v.kind==='break'?'Перерыв':'Фокус'+(named(v)?' · '+named(v):'');
  const parts=[v.state==='paused'?'На паузе · осталось '+dur(left):'Осталось '+dur(left)+' · до '+hm(v.endsAt)];
  if(v.series)parts.push('помидор '+Math.max(1,v.series.round)+' из '+v.series.total);
  if(v.kind==='focus'&&store.held.length)parts.push('придержано уведомлений: '+store.held.length);
  return {id:NID,title,text:parts.join(' · '),busy:true,percent,version:'run:'+v.id,kind:'info',focus:e.status()};
 };
 e.publish=()=>{e.lastPublish=now();send(e.item());};
 // Held notifications are shown as one summary when the focus ends.
 e.release=()=>{
  if(!store.held.length)return;
  const list=store.held.splice(0);store.save();
  const text=list.slice(0,4).map(n=>n.body||n.title).join(' · ')+(list.length>4?' · и ещё '+(list.length-4):'');
  send({id:HELD,title:'Пока вы были в фокусе',text:list.length+' '+kit.plural(list.length,['уведомление','уведомления','уведомлений'])+': '+text,busy:false,version:'held:'+now(),kind:'info'});
  e.notify('Пока вы были в фокусе',list.length+' '+kit.plural(list.length,['уведомление','уведомления','уведомлений'])+' — в центре уведомлений.');
 };
 e.handle=events=>{
  for(const ev of events){
   if(ev.type==='finished'&&ev.session.kind==='focus'&&ev.session.outcome!=='switched'){
    const r=ev.session,report=store.report(now());
    const text=(r.outcome==='stopped'?'Остановлено на '+dur(r.focused/MIN)+' из '+dur(r.planned/MIN):dur(r.focused/MIN)+' фокуса')+(named(r)?' · '+named(r):'')+'. Сегодня всего '+dur(report.minutes)+'.';
    e.finished={id:NID,title:r.outcome==='stopped'?'Фокус остановлен':'Фокус завершён',text,busy:false,version:'end:'+r.id,kind:r.outcome==='stopped'?'info':'success',ended:'focus',focus:null};
    if(r.outcome==='done')e.notify('Фокус завершён',text);
    e.release();
   }
   if(ev.type==='finished'&&ev.session.kind==='break'&&ev.session.outcome==='done'&&!store.active){
    e.finished={id:NID,title:'Перерыв окончен',text:'Можно возвращаться к работе.',busy:false,version:'end:'+ev.session.id,kind:'success',ended:'break',focus:null};
    e.notify('Перерыв окончен','Можно возвращаться к работе.');
   }
   if(ev.type==='started'&&ev.session.series){
    const v=ev.session;
    e.notify(v.kind==='break'?'Перерыв':'Фокус',v.kind==='break'?'Перерыв '+dur(v.planned/MIN)+'.':'Помидор '+v.series.round+' из '+v.series.total+': '+dur(v.planned/MIN)+(named(v)?' · '+named(v):'')+'.');
   }
   if(ev.type==='series-done')e.notify('Помодоро завершено',ev.series.total+' '+kit.plural(ev.series.total,['помидор','помидора','помидоров'])+' готово.');
  }
  if(events.length){if(store.active)e.finished=null;e.publish();}
 };
 // Called every second: closes finished sessions, warns before a meeting, refreshes the center every 30 s.
 e.tick=()=>{
  const at=now();
  e.handle(store.tick(at));
  const a=store.active;
  if(a&&a.kind==='focus'&&!a.pausedAt){
   for(const m of e.meetings.list){
    const start=Date.parse(m.start),key=m.start+'|'+m.title;
    if(start>at&&start-at<=WARN_BEFORE*MIN&&!a.warned.includes(key)){
     a.warned.push(key);store.save();
     const text='Через '+Math.max(1,Math.round((start-at)/MIN))+' мин встреча «'+m.title+'» в '+hm(start)+'.';
     e.notify('Встреча скоро',text);
     send({id:'focus-meeting',title:'Встреча скоро',text,busy:false,version:'meet:'+key,kind:'attention'});
    }
   }
  }
  if(a&&at-e.lastPublish>=30000)e.publish();
 };
 // Whether a system notification waits until the focus ends.
 e.gate=n=>{
  const a=store.active;
  if(!a||a.kind!=='focus'||hold.urgent(n))return false;
  store.held.push({title:String(n.title||'').slice(0,120),body:String(n.body||'').slice(0,250),at:now()});
  store.held=store.held.slice(-50);store.save();
  if(now()-e.lastPublish>1000)e.publish();
  return true;
 };
 const act=fn=>(...args)=>{const r=fn(...args);e.handle(Array.isArray(r)?r:[]);if(!Array.isArray(r))e.publish();return {...e.status(),report:store.report(now())};};
 e.ipc={
  status:()=>({...e.status(),report:store.report(now()),meetings:e.meetings.list,jiraUrl:String(s.settings?.jiraUrl||'')}),
  item:()=>e.item(),
  pause:act(()=>store.pause()),
  resume:act(()=>store.resume()),
  stop:act(()=>[store.stop()]),
  extend:act(minutes=>store.extend(clampMinutes(minutes,10))),
  breakNow:act(minutes=>store.takeBreak(clampMinutes(minutes,5))),
  start:act(o=>store.start({minutes:clampMinutes(o?.minutes,25),label:String(o?.label||'').slice(0,120),jira:parse.JIRA.exec(String(o?.jira||''))?.[1]||''}))
 };
 return e;
}
const clampMinutes=(v,fallback)=>{const n=Math.round(Number(v));return Number.isFinite(n)&&n>=1&&n<=240?n:fallback;};
function engine(s,options){
 const key=s.dataRoot||s;
 if(!engines.has(key))engines.set(key,create(s,options));
 return engines.get(key);
}

// --- Chat turns ------------------------------------------------------------------------------------------------
async function refreshMeetings(s,e,{fetcher,now}){
 const day=new Date(now).toDateString();
 const list=await calendar.today(s,{fetcher,now:new Date(now)});
 if(list)e.meetings={day,list};
 else if(e.meetings.day!==day)e.meetings={day,list:[]};
 return list;
}
function card(s,e,mode,extra={}){
 const at=e.store.now();
 return {focusCard:{mode,now:new Date(at).toISOString(),active:e.store.view(at),report:e.store.report(at),meetings:e.meetings.list,held:e.store.held.length,jiraUrl:String(s.settings?.jiraUrl||''),...extra}};
}
function startText(v,meeting){
 const what=v.kind==='break'?'Перерыв '+dur(v.planned/MIN):'Фокус '+dur(v.planned/MIN)+(v.label?' '+v.label:'')+(v.jira?' ('+v.jira+')':'');
 let text=what+' — до '+hm(v.endsAt)+'.';
 if(v.kind==='focus')text+=' Не срочные уведомления придержу до конца.';
 if(meeting&&Date.parse(meeting.start)<v.endsAt+MIN)text+=' Встреча «'+meeting.title+'» в '+hm(Date.parse(meeting.start))+' — предупрежу за '+WARN_BEFORE+' минут.';
 else if(meeting)text+=' Следующая встреча — «'+meeting.title+'» в '+hm(Date.parse(meeting.start))+'.';
 return text;
}
function begin(s,command,e,want,meeting){
 const at=e.store.now();
 let events;
 if(want.action==='pomodoro')events=e.store.start({minutes:want.minutes,label:want.label,jira:want.jira,series:{total:want.count,done:0,focus:want.minutes,short:5,long:15,label:want.label,jira:want.jira}},at);
 else events=e.store.start({minutes:want.minutes,label:want.label,jira:want.jira},at);
 e.handle(events);
 const v=e.store.view(at);
 let text=startText(v,meeting);
 if(want.action==='pomodoro'){
  const total=want.count*want.minutes+(want.count-1)*5;
  text='Помодоро: '+want.count+' × '+dur(want.minutes)+' с перерывами по 5 минут, всего около '+dur(total)+' — до '+hm(at+total*MIN)+'. '+text.replace(/^Фокус [^—]+— до \d\d:\d\d\. /,'');
  if(meeting&&Date.parse(meeting.start)<at+total*MIN&&!/предупрежу/.test(text))text+=' Встреча «'+meeting.title+'» в '+hm(Date.parse(meeting.start))+' попадает на серию — предупрежу за '+WARN_BEFORE+' минут.';
 }
 return kit.reply(s,command,{by:BY,text,data:card(s,e,'session')});
}
async function startTurn(s,command,e,want,deps){
 s.requestProgress?.report?.('Смотрю календарь');
 const list=await refreshMeetings(s,e,deps);
 const at=e.store.now();
 const meeting=list?calendar.next(list,at):null;
 const length=want.action==='pomodoro'?want.count*want.minutes+(want.count-1)*5:want.minutes;
 // A single session that would run into the next meeting: ask for a length that fits (one question, then start).
 if(meeting&&want.action==='start'&&!meeting.now&&Date.parse(meeting.start)<at+length*MIN){
  const when='Встреча «'+meeting.title+'» в '+hm(Date.parse(meeting.start))+', до неё '+dur(meeting.until)+'.';
  if(meeting.fit>=10){
   const options=[meeting.fit+' минут',want.minutes+' минут'];
   return ask({text:when+' Поставить фокус на '+meeting.fit+' минут, чтобы успеть, или на '+want.minutes+', как вы сказали?',label:'Длина фокуса',options,strictChoices:true},answer=>{
    const m=parse.minutesOf(String(answer))||want.minutes;
    return begin(s,command,engine(s),{...want,minutes:m},meeting);
   });
  }
  return ask({text:when+' Фокус до неё не поместится. Всё равно начать на '+want.minutes+' минут?',label:'Фокус перед встречей',options:['Начать на '+want.minutes+' минут','Не сейчас'],strictChoices:true},answer=>{
   if(/не сейчас/iu.test(String(answer)))return kit.reply(s,command,{by:BY,text:'Хорошо, не начинаю. Скажите «фокус на 50 минут» после встречи.'});
   return begin(s,command,engine(s),want,meeting);
  });
 }
 return begin(s,command,e,want,meeting);
}
function reportText(r,period){
 if(period==='week'){
  if(!r.weekMinutes)return 'На этой неделе фокус-сессий ещё не было.';
  const best=[...r.week].sort((a,b)=>b.minutes-a.minutes)[0];
  const count=r.week.reduce((n,d)=>n+d.count,0),stops=r.week.reduce((n,d)=>n+d.interruptions,0);
  const day=new Date(best.date+'T12:00').toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'});
  return 'За неделю: '+dur(r.weekMinutes)+' фокуса, '+sessions(count)+(stops?', прервано '+stops:'')+'; больше всего — '+day+' ('+dur(best.minutes)+').';
 }
 if(!r.count)return 'Сегодня фокус-сессий ещё не было. Скажите, например: «фокус на 50 минут над картой уровня».';
 const tasks=r.tasks.filter(t=>t.label||t.jira).slice(0,4).map(t=>[t.jira,t.label].filter(Boolean).join(' ')+' — '+dur(t.minutes));
 return 'Сегодня: '+sessions(r.count)+' фокуса, '+dur(r.minutes)+(r.interruptions?', прервано '+r.interruptions:', без прерываний')+'.'+(tasks.length?' Задачи: '+tasks.join('; ')+'.':'');
}

function setup(s){
 const electron=(()=>{try{return require('electron');}catch{return null;}})();
 const e=engine(s,{electron});
 e.electron=electron;
 hold.install(electron,n=>engine(s).gate(n));
 // A session that ended while Petya was closed is closed at its planned end.
 e.tick();
 if(!s.smoke||process.env.PETYA_FOCUS_TIMER==='1'){const timer=setInterval(()=>{try{engine(s).tick();}catch{/* next second */}},1000);timer.unref?.();}
 return {ipc:e.ipc};
}

async function turn(s,command,{fetcher=globalThis.fetch}={}){
 if(!kit.installed(s,ID))return null;
 const e=engine(s);
 const want=parse.intent(command,{active:!!e.store.active});
 if(!want)return null;
 const deps={fetcher,now:e.store.now()};
 const reply=(text,mode='session',extra)=>kit.reply(s,command,{by:BY,text,data:card(s,e,mode,extra)});
 switch(want.action){
  case 'start':case 'pomodoro':return startTurn(s,command,e,want,deps);
  case 'break':{e.handle(e.store.takeBreak(want.minutes));return reply(startText(e.store.view())); }
  case 'help':return ask({text:'Давайте запущу фокус-сессию: не срочные уведомления подождут, а о ближайшей встрече я предупрежу. На сколько?',label:'Фокус',options:['25 минут','50 минут','Помодоро 4 раза','Не сейчас'],strictChoices:true},answer=>{
   const a=String(answer);if(/не сейчас/iu.test(a))return kit.reply(s,command,{by:BY,text:'Хорошо. Когда будете готовы, скажите «фокус на 25 минут».'});
   const next=/помодоро/iu.test(a)?{action:'pomodoro',count:4,minutes:25,label:'',jira:''}:{action:'start',minutes:parse.minutesOf(a)||25,label:'',jira:''};
   return startTurn(s,command,engine(s),next,deps);
  });
  case 'report':{await refreshMeetings(s,e,deps);const r=e.store.report();return reply(reportText(r,want.period),'report',{period:want.period});}
 }
 if(!e.store.active)return kit.reply(s,command,{by:BY,text:'Сейчас фокус не идёт. Скажите, например: «фокус на 50 минут» или «помодоро 4 раза».'});
 if(want.action==='pause'){e.store.pause();e.publish();return reply('Пауза. Осталось '+dur(e.store.remaining()/MIN)+'. Скажите «продолжи», когда вернётесь.');}
 if(want.action==='resume'){e.store.resume();e.publish();return reply('Продолжаем: осталось '+dur(e.store.remaining()/MIN)+', до '+hm(e.store.endsAt())+'.');}
 if(want.action==='extend'){e.store.extend(want.minutes);e.publish();return reply('Добавил '+dur(want.minutes)+': теперь до '+hm(e.store.endsAt())+'.');}
 if(want.action==='status'){const v=e.store.view();return reply((v.kind==='break'?'Перерыв':'Фокус')+(v.state==='paused'?' на паузе':'')+': осталось '+dur(Math.ceil(v.remaining/MIN))+', до '+hm(v.endsAt)+'.');}
 if(want.action==='stop'){
  const kind=e.store.active.kind;const ev=e.store.stop();e.handle([ev]);
  const r=ev.session;
  const text=kind==='break'?'Перерыв закончен.':(r.outcome==='stopped'?'Остановил фокус на '+dur(r.focused/MIN)+' из '+dur(r.planned/MIN)+'.':'Фокус завершён: '+dur(r.focused/MIN)+'.')+' Сегодня всего '+dur(e.store.report().minutes)+'.';
  return reply(text,'report',{period:'today'});
 }
 return null;
}
module.exports={name:'focusApp',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,engine,reportText,dur};
