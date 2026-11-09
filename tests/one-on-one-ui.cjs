// «Встречи 1:1» cards in the real chat: the prep card (half-year line with a dot per meeting, both sides' follow-ups
// with dates and checks, the agenda, Jira issues and PRs, absences, folded notes), the outcome card (uncheck, give to
// the other side, edit; «Сохранить» sends exactly the edited list once) and the promises list with closing and
// «Отменить». Notes are never HTML. Feature calls are stubbed.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='oneOnOne'){calls.push([method,...args]);
   if(method==='done')return {ok:true,done:args[2]!==false,text:args[2]!==false?'Отмечено выполненным':'Снова открыто'};
   if(method==='confirm')return {ok:true,saved:args[1].length,text:'Сохранено: заметка и договорённостей — '+args[1].length};
   if(method==='state')return 'pending';
  }
  return null;
 });
 const day=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const today=day(0),person={member:'u-oleg',name:'Олег Смирнов',role:'Серверный разработчик'};
 const prep={mode:'prep',today,person,history:[day(-1),day(-15),day(-29),day(-43),day(-71),day(-99),day(-200)],
  notes:[{id:'n1',date:day(-1),text:'Обсудили переход на новый SDK. Устал от дежурств — в следующий раз обсудить ротацию.\n<b>не HTML</b>'},{id:'n2',date:day(-15),text:'Хочет вести архитектуру матчмейкинга.'}],
  mine:[{id:'f1',text:'Выбить бюджет на курсы',owner:'me',due:day(-2),done:false},{id:'f2',text:'Познакомить с Ирой из бэкенда',owner:'me',due:'',done:false}],
  theirs:[{id:'f3',text:'Сделает ревью архитектуры',owner:'them',due:day(4),done:false},{id:'f4',text:'Подготовит план миграции',owner:'them',due:day(0),done:false}],closed:5,
  absences:[{from:day(14),to:day(18),kind:'vacation',source:'calendar'}],
  jira:{connected:true,items:[{key:'GAME-12',title:'Матчмейкинг: очередь по рейтингу',status:'In Progress',category:'progress',url:'https://studio.atlassian.net/browse/GAME-12'},{key:'GAME-9',title:'Логи сервера',status:'Done',category:'done',url:'https://studio.atlassian.net/browse/GAME-9'}]},
  prs:{connected:true,items:[{repo:'studio/game',number:41,title:'Новый матчмейкер',state:'open',url:'https://github.com/studio/game/pull/41'},{repo:'studio/game',number:38,title:'Метрики очереди',state:'merged',url:'https://github.com/studio/game/pull/38'}]},
  agenda:['Как дела, что изменилось с прошлой встречи (8 ноября)','Моё обещание: Выбить бюджет на курсы (просрочено)','Статус: Сделает ревью архитектуры','Задачи в работе: GAME-12','PR ждут ревью дольше трёх дней: #41','Отсутствие с 23 ноября: кто подхватит дела','Вернуться к: ротация дежурств','Обратная связь в обе стороны'],notices:[]};
 const confirm={mode:'confirm',today,person,draft:{id:'draft-1',date:today,text:'Обсудили переход на новый SDK. Я обещал выбить бюджет на курсы до пятницы; Олег сделает ревью архитектуры к 20 ноября. С меня — познакомить его с Ирой.',
  followups:[{tid:'f0',owner:'me',text:'Выбить бюджет на курсы',due:day(4)},{tid:'f1',owner:'them',text:'Сделает ревью архитектуры',due:day(11)},{tid:'f2',owner:'me',text:'Познакомить его с Ирой',due:''}]}};
 const list={mode:'list',today,owner:'me',person:null,items:[{id:'a1',member:'u-oleg',name:'Олег Смирнов',text:'Выбить бюджет на курсы',owner:'me',due:day(-2),done:false},{id:'a2',member:'masha',name:'Маша Петрова',text:'Поговорить с лидом про геймплей',owner:'me',due:day(2),done:false},
  {id:'a3',member:'masha',name:'Маша Петрова',text:'Найти ментора по шейдерам',owner:'me',due:'',done:false},{id:'a4',member:'u-oleg',name:'Олег Смирнов',text:'Познакомить с Ирой',owner:'me',due:'',done:false}]};
 await js(`view('home');showDialogueMessages([{role:'user',text:'подготовь 1:1 с Олегом'},{role:'assistant',text:'1:1 · Олег Смирнов: …',by:'Встречи 1:1',extensionData:{oneOnOneCard:${JSON.stringify(prep)}}},
  {role:'user',text:'запиши итоги 1:1 с Олегом: …'},{role:'assistant',text:'Итоги 1:1 · Олег Смирнов: …',by:'Встречи 1:1',extensionData:{oneOnOneCard:${JSON.stringify(confirm)}}},
  {role:'user',text:'что я обещал на 1:1'},{role:'assistant',text:'Ваши обещания …',by:'Встречи 1:1',extensionData:{oneOnOneCard:${JSON.stringify(list)}}}],'1:1')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.one-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 const q=(i,sel)=>js(`document.querySelectorAll('.one-card')[${i}].querySelectorAll(${JSON.stringify(sel)}).length`);
 assert.equal(await q(0,'.one-history-dot'),6,'a dot per meeting of the last half-year');
 assert.equal(await q(0,'.one-fu'),4);assert.equal(await q(0,'.one-due.is-late'),1);assert.equal(await q(0,'.one-due.is-today'),1);
 assert.equal(await q(0,'.one-agenda-list li'),8);assert.equal(await q(0,'.one-work'),4);assert.equal(await q(0,'.one-note'),2);
 assert.equal(await js("document.querySelectorAll('.one-card b').length>0&&[...document.querySelectorAll('.one-note p')].some(p=>p.textContent.includes('<b>'))"),true,'notes are text, never HTML');
 assert.equal(await q(1,'.one-edit-row'),3);assert.equal(await q(2,'.one-fu'),4);assert.equal(await q(2,'.one-bars li'),2);
 assert.equal(await js("document.querySelectorAll('.one-card')[2].querySelector('.kit-chip').textContent"),'просрочено: 1');
 await js("document.querySelectorAll('.one-notes').forEach(d=>d.open=true)");
 // The outcome: uncheck the third, give the review to me, reword the first; «Сохранить» once.
 await js(`(()=>{const rows=document.querySelectorAll('.one-card')[1].querySelectorAll('.one-edit-row');
  const t=rows[0].querySelector('.one-edit-text');t.value='Выбить бюджет на курсы Unity';t.dispatchEvent(new Event('input'));
  rows[1].querySelector('.one-owner').click();
  const c=rows[2].querySelector('input[type=checkbox]');c.checked=false;c.dispatchEvent(new Event('change'));})()`);
 await js("[...document.querySelectorAll('.one-card')[1].querySelectorAll('.kit-actions button')].find(b=>b.classList.contains('primary')).click()");
 for(let i=0;i<60;i++){if(await js("!document.querySelectorAll('.one-card')[1].querySelector('.kit-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[0]==='confirm'),[['confirm','draft-1',[{text:'Выбить бюджет на курсы Unity',owner:'me',due:day(4)},{text:'Сделает ревью архитектуры',owner:'me',due:day(11)}]]]);
 assert.equal(await js("document.querySelectorAll('.one-card')[1].querySelector('.kit-chip').textContent"),'сохранено');
 assert.equal(await q(1,'input:not([disabled])'),0,'saved: nothing to edit');
 // Close a promise, then «Отменить».
 await js("document.querySelectorAll('.one-card')[2].querySelector('.one-check').click()");
 for(let i=0;i<60;i++){if(await js("!!document.querySelectorAll('.one-card')[2].querySelector('.one-fu.is-done')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='done'),['done','u-oleg','a1',true]);
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<60;i++){if(await js("!document.querySelectorAll('.one-card')[2].querySelector('.one-fu.is-done')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[0]==='done').at(-1),['done','u-oleg','a1',false]);
 await require('./card-shot.cjs')(win,'.one-confirm,.one-list','petya-one-on-one-saved');
 await require('./card-shot.cjs')(win,'.one-prep','petya-one-on-one');
 console.log('One-on-one cards: prep with history, follow-ups, agenda and work, outcome edited and saved once, promises closed with undo passed');
}};
require('../src/main.cjs');
