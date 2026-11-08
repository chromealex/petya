// «Напоминания» cards in the real chat: the confirmation of a new reminder (time in words + absolute date,
// «Изменить» with an inline editor), the grouped list with trigger icons, next check times and today's strip,
// a fired reminder with «Готово» / «Отложить», and red trash delete with undo. The reminders are made in the app's
// live backend (this company's storage, real IPC), so the card's refresh and actions go through the real path.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now(),MIN=60000,HOUR=60*MIN;
 const day0=new Date(now);day0.setHours(0,0,0,0);
 const todayAt=(h,m)=>{const d=new Date(day0);d.setHours(h,m,0,0);return d.getTime();};
 // Times that fall today whatever hour the test runs: a past one, the next hours, and the late evening.
 const later=Math.min(now+2*HOUR,todayAt(23,40)),evening=Math.min(Math.max(now+3*HOUR,todayAt(21,0)),todayAt(23,55));
 // The live backend of this company: real IPC, real storage.
 const svc=require('../src/extensions/reminders/feature.cjs').instance();
 const add=(text,extra)=>svc.add({text,topicId:'t',projectId:'general',...extra});
 const r1=add('Позвонить в банк <img src=x onerror=alert(1)>',{time:{at:later}});
 const r2=add('Выпить воды',{time:{at:now-1000}});
 add('Таблетки',{time:{at:evening,repeat:{days:[0,1,2,3,4,5,6],h:new Date(evening).getHours(),m:new Date(evening).getMinutes()}}});
 const monday=new Date(day0);monday.setDate(monday.getDate()+((8-monday.getDay())%7||7));monday.setHours(10,0,0,0);
 add('Планёрка',{time:{at:monday.getTime(),repeat:{days:[1],h:10,m:0}}});
 add('Отправить отчёт по спринту',{time:{at:todayAt(10,0)+24*HOUR}});
 add('BW-123 закроют',{trigger:{id:'jira-status',name:'Статус задачи Jira',icon:'task',params:{key:'BW-123'},label:'BW-123 закроют',url:'https://acme.atlassian.net/browse/BW-123'}});
 const r7=add('Олег Петров появится в сети',{trigger:{id:'slack-presence',name:'Коллега в сети (Slack)',icon:'presence',params:{user:'U0OLEG'},label:'Олег Петров появится в сети'}});
 add('Проверить фикс',{trigger:{id:'ci-build',name:'Сборка CI',icon:'build',params:{key:'gh:acme/game:77'},label:'сборка «Android» #12 (main) завершится',url:'https://github.com/acme/game/actions/runs/77'}});
 // «Выпить воды» fires through the real path; the Slack check runs now and finds Slack not connected.
 await svc.checkNow(r7.id);
 assert.equal(svc.view(r2.id).status,'fired');
 const items=svc.list();
 const created={mode:'created',now,created:r1.id,items};
 const list={mode:'list',now,items};
 const fired={mode:'fired',now,fired:r2.id,items};
 await js(`view('home');showDialogueMessages([
  {role:'user',text:'напомни через 2 часа позвонить в банк'},{role:'assistant',text:'Напомню сегодня.',by:'Напоминания',extensionData:{reminderCard:${JSON.stringify(created)}}},
  {role:'user',text:'какие у меня напоминания?'},{role:'assistant',text:'Напоминаний: 8.',by:'Напоминания',extensionData:{reminderCard:${JSON.stringify(list)}}},
  {role:'assistant',text:'⏰ Напоминание: Выпить воды',by:'Напоминания',extensionData:{reminderCard:${JSON.stringify(fired)}}}],'Напоминания')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.reminder-card').length===3&&!!document.querySelector('.rem-groups')"))break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,200));
 assert.equal(await js("document.querySelectorAll('.reminder-card').length"),3);
 assert.equal(await js("document.querySelectorAll('.reminder-card img').length"),0,'reminder text is never HTML');
 // Confirmation: how Petya understood it, the absolute date, «Изменить», red trash.
 assert.match(await js("document.querySelector('.rem-understood .rem-when-big').textContent"),/^Сегодня, \d\d:\d\d$/);
 assert.match(await js("document.querySelector('.rem-understood .rem-absolute').textContent"),/\d{4}/);
 assert.ok(await js("!!document.querySelector('.rem-understood .delete-button')"),'delete is the red trash button');
 // The list: groups in order, icons, next check of event reminders, errors, today's strip.
 const list2="document.querySelectorAll('.reminder-card')[1]";
 assert.deepEqual(await js(`[...${list2}.querySelectorAll('.rem-group')].map(g=>g.dataset.group)`),['fired','today','later','event']);
 assert.equal(await js(`${list2}.querySelectorAll('.rem-group[data-group=event] .rem-check').length`),3);
 assert.match(await js(`${list2}.querySelector('.rem-group[data-group=event] .rem-check').textContent`),/^проверю в \d\d:\d\d$/);
 assert.equal(await js(`${list2}.querySelectorAll('.rem-icon-task,.rem-icon-presence,.rem-icon-build').length`),3);
 assert.match(await js(`${list2}.querySelector('.rem-error').textContent`),/не подключено/);
 assert.equal(await js(`${list2}.querySelectorAll('.rem-strip-dot').length`),3,'three reminders fall today');
 assert.equal(await js(`${list2}.querySelectorAll('.rem-strip-now').length`),1);
 win.setContentSize(1180,1900);
 await require('./card-shot.cjs')(win,'.reminder-card','petya-reminders');
 await js("document.getElementById('card-shot')?.remove()");
 // Actions: «Изменить» opens the editor and saves; «Готово» marks the fired one; delete offers undo.
 await js(`showDialogueMessages([{role:'assistant',text:'Напомню.',by:'Напоминания',extensionData:{reminderCard:${JSON.stringify(created)}}},{role:'assistant',text:'⏰',by:'Напоминания',extensionData:{reminderCard:${JSON.stringify(fired)}}}],'Напоминания')`);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.reminder-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,200));
 await js("[...document.querySelectorAll('.rem-understood .rem-actions button')].find(b=>!b.classList.contains('delete-button')).click()");
 assert.equal(await js("document.querySelector('.rem-edit input[type=text]').value"),'Позвонить в банк <img src=x onerror=alert(1)>');
 await js("const f=document.querySelector('.rem-edit');f.querySelector('input[type=text]').value='Позвонить в банк про карту';f.requestSubmit()");
 await new Promise(r=>setTimeout(r,300));
 assert.equal(svc.view(r1.id).text,'Позвонить в банк про карту','saved in the backend');
 assert.equal(await js("document.querySelector('.rem-understood .rem-big').textContent"),'Позвонить в банк про карту');
 const firedCard="document.querySelectorAll('.reminder-card')[1]";
 assert.ok(await js(`!!${firedCard}.querySelector('.rem-row.fired')`));
 await js(`[...${firedCard}.querySelectorAll('.rem-row.fired button')].find(b=>b.classList.contains('primary')).click()`);
 await new Promise(r=>setTimeout(r,300));
 assert.match(await js(`${firedCard}.textContent`),/уже выполнено или удалено/);
 await js("document.querySelector('.rem-understood .delete-button').click()");
 await new Promise(r=>setTimeout(r,300));
 assert.ok(await js("[...document.querySelectorAll('.kit-toast button')].some(b=>b.textContent==='Отменить')"),'delete offers undo');
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 await new Promise(r=>setTimeout(r,300));
 assert.ok(svc.list().some(i=>i.id===r1.id),'restored in the backend');
 assert.equal(svc.view(r2.id).status,'done','«Готово» reached the backend');
 console.log('Reminder cards: understood time with absolute date and inline edit, grouped list with icons, next checks, errors and today strip, done, delete with undo passed');
}};
require('../src/main.cjs');
