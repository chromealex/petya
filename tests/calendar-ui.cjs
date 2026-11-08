// «Календарь» cards in the real chat: day timeline with events, free gaps and the «сейчас» line, week strip,
// slot search with lanes and the chosen slot, the confirm step (editable title) and the created state.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const n=new Date(),Y=n.getFullYear(),M=n.getMonth(),D=n.getDate();
 const t=(dd,h,m=0)=>new Date(Y,M,D+dd,h,m).toISOString();
 const ymd=d=>{const x=new Date(Y,M,D+d);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');};
 const day={mode:'day',date:ymd(0),label:'сегодня',accountEmail:'me@corp.ru',provider:'google',workStart:'10:00',workEnd:'19:00',now:n.toISOString(),events:[
  {id:'1',title:'Стендап команды',start:t(0,10),end:t(0,10,15),link:'https://meet.google.com/abc-defg-hij',url:'https://calendar.google.com/event?eid=1'},
  {id:'2',title:'Ревью дизайна главного экрана',start:t(0,11,30),end:t(0,12,30),location:'Переговорная 3, 5 этаж',link:'https://meet.google.com/xyz'},
  {id:'3',title:'1:1 с Олегом',start:t(0,12),end:t(0,12,45)},
  {id:'4',title:'<img src=x onerror=alert(1)>',start:t(0,15),end:t(0,16),tentative:true},
  {id:'5',title:'Обед с партнёром',start:t(0,13),end:t(0,14),declined:true},
  {id:'6',title:'Конференция DevDays',start:t(0,0),end:t(1,0),allDay:true}],
  free:[{start:t(0,16),end:t(0,19)}]};
 const week={mode:'week',label:'на этой неделе',accountEmail:'me@corp.ru',provider:'google',workStart:'10:00',workEnd:'19:00',days:[0,1,2,3,4].map(d=>({date:ymd(d),events:d===2?[]:[{id:'a'+d,title:'Стендап',start:t(d,10),end:t(d,10,15)},{id:'b'+d,title:'Планирование',start:t(d,12+d%3),end:t(d,13+d%3,30)},...d===1?[{id:'c',title:'Демо',start:t(d,16),end:t(d,17)}]:[]]}))};
 const slots={mode:'slots',draftId:'draft-ui',account:'google:g1',accountEmail:'me@corp.ru',provider:'google',title:'Синк по релизу',duration:60,label:'на этой неделе',workStart:'10:00',workEnd:'19:00',chosen:0,
  people:[{name:'Вы',email:'me@corp.ru',self:true,busy:[{start:t(1,10),end:t(1,11)},{start:t(1,14),end:t(1,15,30)}]},{name:'Мария Петрова',email:'maria@corp.ru',busy:[{start:t(1,12),end:t(1,13)},{start:t(1,16),end:t(1,18)}]},{name:'Олег Иванов',email:'oleg@corp.ru',busy:[],error:'нет доступа к календарю'}],
  attendees:[{name:'Мария Петрова',email:'maria@corp.ru'},{name:'Олег Иванов',email:'oleg@corp.ru'}],
  slots:[{start:t(1,11),end:t(1,12),busy:[],note:'свободны все доступные, без встреч впритык'},{start:t(2,11),end:t(2,12),busy:[],note:'свободны все доступные, без встреч впритык'},{start:t(1,15,30),end:t(1,16,30),busy:[],note:'свободны все доступные'},{start:t(1,12),end:t(1,13),busy:['maria@corp.ru'],note:'заняты: Мария Петрова'}]};
 const created={...slots,draftId:'draft-done',chosen:1,created:{title:'Синк по релизу',start:t(2,11),end:t(2,12),url:'https://calendar.google.com/event?eid=new',link:'https://meet.google.com/new-link',attendees:['maria@corp.ru']}};
 const msg=(text,card)=>({role:'assistant',text,by:'Календарь',extensionData:{calendarCard:card}});
 await js(`view('home');showDialogueMessages([{role:'user',text:'что у меня сегодня'},${JSON.stringify(msg('Сегодня 4 встречи.',day))},${JSON.stringify(msg('На этой неделе 11 встреч.',week))},${JSON.stringify(msg('Нашёл 4 варианта.',slots))},${JSON.stringify(msg('Создано.',created))}],'Календарь')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.cal-card').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.cal-card').length"),4);
 assert.equal(await js("document.querySelectorAll('.cal-card')[0].querySelectorAll('.cal-event').length"),5);
 assert.equal(await js("document.querySelectorAll('.cal-card img').length"),0,'event titles are never HTML');
 assert.equal(await js("document.querySelectorAll('.cal-event.declined').length"),1);
 assert.equal(await js("document.querySelector('.cal-allday-chip').textContent"),'Конференция DevDays');
 assert.equal(await js("document.querySelector('.cal-join').href"),'https://meet.google.com/abc-defg-hij');
 assert.equal(await js("document.querySelectorAll('.cal-free').length"),1);
 assert.equal(await js("document.querySelectorAll('.cal-now').length"),n.getHours()>=10&&n.getHours()<19?1:0,'«сейчас» line inside the shown hours');
 // Overlapping 11:30–12:30 and 12:00–12:45 are side by side.
 assert.ok(await js("(()=>{const [a,b]=[...document.querySelectorAll('.cal-event')].filter(e=>/Ревью|1:1/.test(e.textContent));return a.getBoundingClientRect().left!==b.getBoundingClientRect().left;})()"));
 assert.equal(await js("document.querySelectorAll('.cal-week-day').length"),5);
 assert.equal(await js("document.querySelectorAll('.cal-week-event').length"),9);
 const slotCard="document.querySelectorAll('.cal-card')[2]";
 assert.equal(await js(slotCard+".querySelectorAll('.cal-slot').length"),4);
 assert.equal(await js(slotCard+".querySelectorAll('.cal-lane:not(.cal-axis)').length"),3);
 assert.equal(await js(slotCard+".querySelectorAll('.cal-lane.unknown').length"),1);
 assert.equal(await js(slotCard+".querySelectorAll('.cal-band').length"),3,'chosen slot is highlighted in every lane');
 assert.equal(await js(slotCard+".querySelector('.cal-slot.chosen .cal-rank').textContent"),'1');
 // Pick the conflicting slot: Maria's lane turns into a conflict.
 await js(slotCard+".querySelectorAll('.cal-slot')[3].click()");
 assert.equal(await js(slotCard+".querySelectorAll('.cal-lane.conflict').length"),1);
 await js(slotCard+".querySelectorAll('.cal-slot')[0].click()");
 // «Поставить встречу» only opens the confirm step.
 await js(slotCard+".querySelector('.kit-actions button.primary').click()");
 assert.equal(await js(slotCard+".querySelector('.cal-confirm input[type=text]').value"),'Синк по релизу');
 assert.match(await js(slotCard+".querySelector('.cal-confirm-who').textContent"),/maria@corp\.ru/);
 assert.equal(await js(slotCard+".querySelector(':scope>.kit-actions').hidden"),true,'the main buttons hide while confirming');
 assert.equal(await js("document.querySelectorAll('.cal-created').length"),1,'only the created card shows a result');
 assert.equal(await js("document.querySelectorAll('.cal-card')[3].querySelector('.kit-actions')"),null,'a created meeting has no create button');
 assert.equal(await js("document.querySelectorAll('.cal-card')[3].querySelector('.kit-card-head .kit-chip').textContent"),'создано');
 assert.ok(await js("document.querySelectorAll('.cal-card [data-no-i18n]').length>10"),'service content is excluded from translation');
 const file=await require('./card-shot.cjs')(win,'.cal-card','petya-calendar');
 const slotsFile=await require('./card-shot.cjs')(win,'#card-shot .cal-card:nth-child(n+3)','petya-calendar-slots');
 console.log('Calendar cards: timeline with overlaps, free gaps, safe titles, week strip, slot lanes with chosen band and conflicts, confirm step, created state passed — '+file+', '+slotsFile);
}};
require('../src/main.cjs');
