// «Дневник дня» cards in the real chat: totals tiles, the week as stacked bars, the day's timeline with an icon per
// source, «Перенести на завтра» with checkboxes (saved through the app's real IPC into this company's journal),
// tomorrow's plan, the reflection question and private notes read from the app (never from the message), red trash
// with undo for a note, the evening switch, and the week card.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{console.log("JS FAILED:",code.slice(0,160));throw e;});
 await js('window.chatNavigationReady');
 const pad=v=>String(v).padStart(2,'0');
 const now=new Date();const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const day0=new Date(now);day0.setHours(0,0,0,0);const at=(h,m)=>{const d=new Date(day0);d.setHours(h,m,0,0);return d.getTime();};
 const monday=new Date(day0);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const key=ymd(day0),tomorrow=ymd(new Date(day0.getTime()+86400000));
 const T=(meetings,tasks,commits,chats,messages,reminders,focusMinutes=0)=>({meetings,meetingMinutes:meetings*40,tasks,commits,focusMinutes,chats,messages,reminders,notes:0});
 const sample=[T(2,3,5,4,1,1,50),T(1,2,8,3,0,2,25),T(3,1,2,6,2,0,0),T(0,4,6,2,1,1,100),T(1,1,3,1,0,0,0),T(0,0,1,0,0,0,0),T(0,0,0,1,0,0,0)];
 const days=[...Array(7)].map((_,i)=>{const d=new Date(monday);d.setDate(d.getDate()+i);return {date:ymd(d),future:d>day0,totals:d>day0?T(0,0,0,0,0,0):sample[i]};});
 const it=(h,m,kind,icon,title,detail,url='')=>({at:at(h,m),kind,icon,title,detail,url,source:kind});
 const timeline=[
  it(9,40,'chat','chat','Почему падает билд на Android','3 запроса · Bunker Wars'),
  it(10,5,'reminder','reminder','Позвонить в банк','отмечено как готовое'),
  it(10,30,'meeting','meeting','Синк по UI','≈ 45 мин'),
  it(11,12,'commit','commit','Fix crash on startup when the save file is missing <img src=x onerror=alert(1)>','a1b2c3d · bunker-wars'),
  it(12,0,'message','message','Сообщение в #bw-dev','Билд починен, можно тестировать'),
  it(13,0,'task','task','Создана задача BW-130','Краш на Android 9','https://acme.atlassian.net/browse/BW-130'),
  it(14,20,'focus','focus','Фокус-сессия','50 мин'),
  it(15,10,'transition','task','BW-123 Краш на старте','In Progress → Review','https://acme.atlassian.net/browse/BW-123'),
  it(16,0,'meeting','meeting','Планирование спринта','≈ 60 мин'),
  it(16,45,'commit','commit','Bump ads SDK to 12.1','d4e5f6a · bunker-wars'),
  it(17,30,'note','note','Запись в дневнике','',''),
  it(17,55,'commit','commit','Update localization keys','99aa001 · bunker-wars')];
 timeline[10].private=true;
 const carry=[{id:'jira:BW-140',title:'BW-140 Обновить SDK рекламы',detail:'срок '+tomorrow+' · To Do',source:'jira',url:'https://acme.atlassian.net/browse/BW-140'},
  {id:'jira:BW-141',title:'BW-141 Иконки магазина для iPad',detail:'срок '+tomorrow+' · In Progress',source:'jira'},
  {id:'reminder:r9',title:'Отправить отчёт по спринту',detail:'сработало, не отмечено',source:'reminders'}];
 const card={mode:'day',date:key,now:now.getTime(),tomorrow,timeline,totals:T(2,3,3,1,1,1,50),week:days,carry,planned:[],prompt:'Что сегодня получилось лучше всего?',reflected:false,evening:'',errors:[],sources:[],focus:true};
 const weekCard={...card,mode:'week',totals:days.reduce((a,d)=>{for(const k in a)a[k]+=d.totals[k];return a;},T(0,0,0,0,0,0)),timeline:timeline.map((x,i)=>({...x,at:x.at-((i%3)*86400000)})).sort((a,b)=>a.at-b.at)};
 // Private notes live in the app's journal of this company, not in the message.
 const journal=require('../src/extensions/journal/feature.cjs').instance();
 journal.store().note(key,'Договорились с дизайнером о новом меню',at(17,30));
 await js(`view('home');showDialogueMessages([{role:'user',text:'что я сегодня сделал?'},{role:'assistant',text:'Сегодня: 2 встречи, 3 задачи в Jira, 3 коммита.',by:'Дневник дня',extensionData:{journalCard:${JSON.stringify(card)}}},
  {role:'user',text:'итоги недели'},{role:'assistant',text:'За неделю…',by:'Дневник дня',extensionData:{journalCard:${JSON.stringify(weekCard)}}}],'Дневник')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.journal-card').length===2&&document.querySelectorAll('.jr-notes li').length>0"))break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,200));
 const day="document.querySelectorAll('.journal-card')[0]";
 assert.equal(await js("document.querySelectorAll('.journal-card').length"),2);
 assert.equal(await js("document.querySelectorAll('.journal-card img').length"),0,'titles are never HTML');
 assert.deepEqual(await js(`[...${day}.querySelectorAll('.jr-tile')].map(t=>t.dataset.kind+'='+t.querySelector('.jr-tile-value').textContent)`),['meetings=2','tasks=3','commits=3','focusMinutes=50','chats=1','messages=1']);
 assert.equal(await js(`${day}.querySelectorAll('.jr-day').length`),7);
 assert.equal(await js(`${day}.querySelectorAll('.jr-day.current').length`),1);
 assert.ok(await js(`${day}.querySelectorAll('.jr-seg').length`)>5,'stacked bars');
 assert.equal(await js(`${day}.querySelectorAll('.jr-timeline .jr-item').length`),12);
 assert.equal(await js(`${day}.querySelectorAll('.jr-timeline > .jr-item').length`),8,'the rest behind «Показать ещё»');
 assert.equal(await js(`${day}.querySelectorAll('.jr-carry input[type=checkbox]').length`),3);
 assert.equal(await js(`${day}.querySelector('.jr-notes li span').textContent`),'Договорились с дизайнером о новом меню','notes come from the app');
 assert.ok(await js(`!!${day}.querySelector('.jr-notes .delete-button')`),'red trash for a note');
 assert.equal(await js(`${day}.querySelector('.jr-evening input[type=checkbox]').checked`),false,'evening summary off by default');
 win.setContentSize(1180,2300);
 await require('./card-shot.cjs')(win,'.journal-card','petya-journal');
 await js("document.getElementById('card-shot')?.remove()");
 // Carry two items to tomorrow through the real IPC; the card refreshes with the plan.
 await js(`showDialogueMessages([{role:'assistant',text:'Сегодня…',by:'Дневник дня',extensionData:{journalCard:${JSON.stringify(card)}}}],'Дневник')`);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.jr-carry input').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 await js("{const b=[...document.querySelectorAll('.jr-carry input')];b[0].checked=true;b[2].checked=true;[...document.querySelectorAll('.jr-section button.primary')].find(x=>x.closest('.jr-section').querySelector('.jr-carry')).click()}");
 for(let i=0;i<100;i++){if((journal.store().peek(tomorrow)?.plan||[]).length===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(journal.store().peek(tomorrow).plan.map(p=>p.id),['jira:BW-140','reminder:r9']);
 // The card refreshes from the app and shows tomorrow's plan.
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.jr-plan li').length===2&&!!document.querySelector('.jr-notes .delete-button')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.jr-plan li').length"),2);
 // A reflection answer and a note are saved privately; deleting a note offers undo.
 await js("document.querySelector('.jr-answer').value='Починили краш до релиза';[...document.querySelectorAll('.jr-private button')].find(b=>!b.classList.contains('delete-button')&&b.closest('.jr-private')&&b.previousElementSibling?.classList.contains('jr-answer')).click()");
 for(let i=0;i<100;i++){if(journal.store().peek(key)?.reflection?.answer)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(journal.store().peek(key).reflection.answer,'Починили краш до релиза');
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.jr-notes .delete-button')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("document.querySelector('.jr-notes .delete-button').click()");
 for(let i=0;i<100;i++){if(!(journal.store().peek(key).notes||[]).length)break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(journal.store().peek(key).notes.length,0);
 assert.ok(await js("[...document.querySelectorAll('.kit-toast button')].some(b=>b.textContent==='Отменить')"),'note delete offers undo');
 // The evening switch saves the setting.
 await js("{const b=document.querySelector('.jr-evening input[type=checkbox]');b.checked=true;b.dispatchEvent(new Event('change'))}");
 for(let i=0;i<100;i++){if((await js("window.petya.settings()")).journalEvening==='19:00')break;await new Promise(r=>setTimeout(r,30));}
 assert.equal((await js("window.petya.settings()")).journalEvening,'19:00');
 console.log('Journal cards: totals tiles, week bars, timeline with source icons, carry to tomorrow through IPC, private reflection and notes with undo, evening switch, week card passed');
}};
require('../src/main.cjs');
