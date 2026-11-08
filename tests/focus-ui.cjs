// «Фокус» in the real window: the session card (ring timer, today's timeline with meetings, week bars, tasks,
// controls), the report card, the timer in the top bar and the notification-center card with pause/stop, and
// a non-urgent system notification held back by the real Electron Notification during a session.
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='Europe/Moscow';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 // Both clocks (main process: the timer; renderer: the card) are shifted to 11:50 today, so the timeline shows a
 // working day whatever time the test runs at.
 const MIN=60000,day=new Date();day.setHours(0,0,0,0);const now=day.getTime()+(11*60+50)*MIN;
 {const real=Date.now.bind(Date),shift=now-real();Date.now=()=>real()+shift;}
 await js(`(()=>{const real=Date.now.bind(Date),shift=${now}-real();Date.now=()=>real()+shift;})()`);
 const at=(h,m=0)=>new Date(day.getTime()+(h*60+m)*MIN).toISOString();
 const monday=new Date(day);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const week=[0,1,2,3,4,5,6].map(i=>{const d=new Date(monday);d.setDate(d.getDate()+i);const ymd=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const past=d<=day;return {date:ymd,minutes:past?[95,140,60,170,80,30,0][i]:0,count:past?2:0,interruptions:0};});
 const today=week.find(w=>w.date===at(12).slice(0,10))||week[0];today.minutes=93;
 const report={date:'',count:3,minutes:93,interruptions:1,weekMinutes:week.reduce((n,w)=>n+w.minutes,0),week,
  tasks:[{label:'над картой уровня',jira:'',minutes:68,count:2},{label:'баг с сундуками',jira:'BW-123',minutes:25,count:1}],
  timeline:[{kind:'focus',label:'над картой уровня',jira:'',start:at(9,30),end:at(10,20),outcome:'done',minutes:50},{kind:'break',label:'',jira:'',start:at(10,20),end:at(10,25),outcome:'done',minutes:5},
   {kind:'focus',label:'баг с сундуками',jira:'BW-123',start:at(10,50),end:at(11,15),outcome:'stopped',minutes:25},{kind:'focus',label:'над картой уровня',jira:'',start:at(11,32),end:at(11,50),outcome:'active',minutes:18}]};
 const meetings=[{title:'Daily',start:at(10,30),end:at(10,45)},{title:'Планирование спринта <b>x</b>',start:at(12,30),end:at(13,30)},{title:'1:1 с лидом',start:at(16,0),end:at(16,30)}];
 // A real session runs in the main process: the newest card follows it live.
 await js("window.petya.feature('focusApp','start',{minutes:50,label:'над картой уровня'})");
 for(let i=0;i<100;i++){if(await js("!document.querySelector('.focus-pill').hidden"))break;await new Promise(r=>setTimeout(r,30));}
 const active={id:'a',kind:'focus',label:'над картой уровня',jira:'',planned:50*MIN,startedAt:now,endsAt:now+50*MIN,remaining:50*MIN,elapsed:0,state:'running',pausedAt:null,series:null};
 const session={mode:'session',now:new Date(now).toISOString(),active,report,meetings,held:0,jiraUrl:'https://corp.atlassian.net'};
 const summary={mode:'report',period:'today',now:new Date(now-40*MIN).toISOString(),active:null,report:{...report,timeline:report.timeline.slice(0,3),count:2,minutes:75},meetings,held:0,jiraUrl:''};
 await js(`view('home');showDialogueMessages([{role:'user',text:'сколько я сегодня сфокусировался'},{role:'assistant',text:'Сегодня: 2 сессии.',by:'Фокус',extensionData:{focusCard:${JSON.stringify(summary)}}},{role:'user',text:'фокус на 50 минут над картой уровня'},{role:'assistant',text:'Фокус 50 мин над картой уровня.',by:'Фокус',extensionData:{focusCard:${JSON.stringify(session)}}}],'Фокус')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.focus-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.focus-card').length"),2);
 const card="document.querySelectorAll('.focus-card')[1]";
 assert.match(await js(card+".querySelector('.focus-ring-time').textContent"),/^(?:50:00|49:\d\d)$/);
 assert.equal(await js(card+".querySelectorAll('.focus-block.is-meeting').length"),3);
 assert.equal(await js(card+".querySelectorAll('.focus-block.is-stopped').length"),1);
 assert.equal(await js(card+".querySelectorAll('.focus-bar').length"),7);
 assert.equal(await js("document.querySelectorAll('.focus-card b').length"),0,'meeting titles are text, not HTML');
 assert.equal(await js(card+".querySelector('.focus-jira').href"),'https://corp.atlassian.net/browse/BW-123');
 assert.match(await js(card+".querySelector('.focus-next').textContent"),/Планирование спринта <b>x<\/b>» · 12:30 — через 40 мин/);
 const labels=await js("[..."+card+".querySelectorAll('.focus-controls button')].map(b=>b.textContent)");
 assert.deepEqual(labels,['Пауза','Стоп','Ещё 10 минут','Перерыв 5']);
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.focus-card')[0].querySelector('.focus-controls').hidden"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await js("document.querySelectorAll('.focus-card')[0].querySelector('.focus-controls').hidden"),true,'an older card has no controls');
 assert.equal(await js("document.querySelectorAll('.focus-card')[0].querySelector('.focus-ring').hidden"),true,'a report has no ring');
 await new Promise(r=>setTimeout(r,1500));
 await require('./card-shot.cjs')(win,'.focus-card[data-mode="session"]','petya-focus');
 await require('./card-shot.cjs')(win,'.focus-card[data-mode="report"]','petya-focus-report');

 // The live timer in the top bar and the notification center.
 assert.equal(await js("document.querySelector('.focus-pill').hidden"),false);
 assert.match(await js("document.querySelector('.focus-pill-time').textContent"),/^(?:50:00|49:\d\d)$/);
 assert.equal(await js("document.querySelector('.focus-pill').nextElementSibling.classList.contains('notification-bell')"),true,'next to the bell');
 await js("document.querySelector('.focus-pill').click()");
 assert.equal(await js("!document.getElementById('notification-center').hidden"),true,'click opens the notification center');
 const item=await js("[...document.querySelectorAll('.notification-item')].find(n=>n.dataset.notificationId==='focus-session')?.querySelector('.notification-actions')?.textContent");
 assert.equal(item,'ПаузаСтопЕщё 10 минут');
 // A non-urgent system notification during the session is held; an urgent one is not.
 const {Notification}=require('electron');
 assert.ok(Notification.prototype.show.petyaFocusHold,'Electron Notification.show is wrapped');
 new Notification({title:'Петя',body:'Ответ готов.'}).show();
 new Notification({title:'Петя',body:'Нужно уточнить проект для Codex'}).show();
 assert.equal(await js("window.petya.feature('focusApp','status').then(s=>s.held)"),1);
 await js("[...document.querySelectorAll('.notification-item')].find(n=>n.dataset.notificationId==='focus-session').querySelector('.notification-actions button').click()");
 for(let i=0;i<100;i++){if(await js("document.querySelector('.focus-pill').dataset.state==='paused'"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.focus-pill').dataset.state"),'paused','«Пауза» in the center pauses');
 await require('./card-shot.cjs')(win,'.app-chrome','petya-focus-chrome',{width:1100});
 const stopped=await js("window.petya.feature('focusApp','stop')");
 assert.equal(stopped.active,null);assert.equal(stopped.held,0,'held notifications are released at the end');
 for(let i=0;i<100;i++){if(await js("document.querySelector('.focus-pill').hidden"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.focus-pill').hidden"),true);
 assert.ok(await js("[...document.querySelectorAll('.notification-item')].some(n=>n.dataset.notificationId==='focus-held')"),'summary of held notifications');
 console.log('Focus cards: ring timer, timeline with meetings, week bars, tasks, controls; top-bar timer, center actions, held notifications passed');
}};
require('../src/main.cjs');
