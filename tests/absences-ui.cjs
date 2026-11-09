// «Отсутствия» cards in the real chat: the two-week strip with a bar per absence (weekends, today, kinds, sources),
// details with the red trash and «Отменить» (stubbed feature calls), names never HTML; the confirmation card with a
// dashed bar that turns into a saved one after «Сохранить»; a confirmation drawn again shows «сохранено».
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 const day=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const monday=-((new Date().getDay()+6)%7);
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name==='absences'){calls.push([method,...args]);
   if(method==='remove')return {ok:true,row:{id:args[1],from:'2026-11-10',to:'2026-11-20'},text:'Отметка удалена: Маша Петрова — с 10 по 20 ноября'};
   if(method==='restore')return {ok:true,text:'Отметка возвращена'};
   if(method==='confirm')return {ok:true,saved:true,row:{id:'new-row',member:'u-oleg',name:'Олег Смирнов',from:day(monday+14),to:day(monday+18),kind:'vacation',source:'chat'},text:'Сохранено: Олег Смирнов — отпуск с 16 по 20 ноября'};
   if(method==='state')return args[0]==='draft-old'?'saved':'pending';
  }
  return null;
 });
 const list={mode:'list',from:day(monday),to:day(monday+13),label:'за две недели',today:day(0),focus:'',present:5,notes:['HR: HTTP 503 — отсутствия оттуда не учтены.'],
  people:[{member:'masha',name:'Маша Петрова',role:'Клиент'},{member:'u-oleg',name:'Олег Смирнов',role:'Сервер'},{member:'ivan',name:'Иван Козлов',role:'Геймплей'},{member:'x',name:'<img src=x onerror=alert(1)>',role:''}],
  rows:[{id:'r-masha-1',member:'masha',name:'Маша Петрова',from:day(monday+1),to:day(monday+11),kind:'vacation',source:'chat',sourceName:'',title:'',note:'',removable:true},
   {id:'',member:'u-oleg',name:'Олег Смирнов',from:day(monday+3),to:day(monday+4),kind:'sick',source:'calendar',sourceName:'Календарь',title:'Больничный',note:'',removable:false},
   {id:'r-ivan-1',member:'ivan',name:'Иван Козлов',from:day(monday+4),to:day(monday+4),kind:'dayoff',source:'chat',sourceName:'',title:'',note:'',removable:true},
   {id:'',member:'ivan',name:'Иван Козлов',from:day(monday+9),to:day(monday+16),kind:'vacation',source:'calendar',sourceName:'Календарь',title:'Отпуск Ваня',note:'',removable:false},
   {id:'',member:'x',name:'<img src=x onerror=alert(1)>',from:day(monday+7),to:day(monday+7),kind:'away',source:'calendar',sourceName:'Календарь',title:'',note:'',removable:false}]};
 const confirm={mode:'confirm',from:day(monday+7),to:day(monday+20),label:'',today:day(0),focus:'u-oleg',present:0,notes:[],people:[{member:'u-oleg',name:'Олег Смирнов',role:'Сервер'}],
  rows:[{id:'r1',member:'u-oleg',name:'Олег Смирнов',from:day(monday+8),to:day(monday+8),kind:'dayoff',source:'chat',removable:true}],
  draft:{id:'draft-new',member:'u-oleg',name:'Олег Смирнов',from:day(monday+14),to:day(monday+18),kind:'vacation',note:'Олег в отпуске с 16 по 20'}};
 const old={...confirm,draft:{...confirm.draft,id:'draft-old'}};
 await js(`view('home');showDialogueMessages([{role:'user',text:'отпуска команды'},{role:'assistant',text:'Отсутствуют за две недели: …',by:'Отсутствия',extensionData:{absenceCard:${JSON.stringify(list)}}},
  {role:'user',text:'Олег в отпуске с 16 по 20'},{role:'assistant',text:'Отметить: Олег Смирнов — отпуск?',by:'Отсутствия',extensionData:{absenceCard:${JSON.stringify(confirm)}}},
  {role:'user',text:'Олег в отпуске с 16 по 20'},{role:'assistant',text:'Отметить: Олег Смирнов — отпуск?',by:'Отсутствия',extensionData:{absenceCard:${JSON.stringify(old)}}}],'Отсутствия')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.absence-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 const q=(i,sel)=>js(`document.querySelectorAll('.absence-card')[${i}].querySelectorAll(${JSON.stringify(sel)}).length`);
 assert.equal(await q(0,'.abs-head .abs-day'),14,'two weeks of days');
 assert.equal(await q(0,'.abs-head .abs-day.is-weekend'),4);assert.equal(await q(0,'.abs-head .abs-day.is-today'),1);
 assert.equal(await q(0,'.abs-row:not(.abs-head)'),4);assert.equal(await q(0,'.abs-bar'),5);
 assert.equal(await q(0,'.abs-bar.cut-end'),1,'Иван\'s vacation goes beyond the strip');
 assert.equal(await q(0,'.abs-key'),4,'legend: vacation, sick, day off, away');
 assert.equal(await q(0,'.abs-detail'),5);assert.equal(await q(0,'.abs-detail .delete-button'),2,'only typed absences are removable');
 assert.equal(await js("document.querySelectorAll('.absence-card img').length"),0,'names are never HTML');
 assert.equal(await js("document.querySelectorAll('.absence-card')[0].querySelector('.kit-chip').textContent"),'отсутствуют: 4');
 assert.match(await js("document.querySelectorAll('.absence-card')[0].querySelector('.abs-note').textContent"),/HR: HTTP 503/);
 // The confirmation: a dashed bar and the buttons; the old one shows it was saved.
 assert.equal(await q(1,'.abs-bar.is-draft'),1);assert.equal(await q(1,'.kit-actions button'),2);
 for(let i=0;i<60;i++){if(await js("!document.querySelectorAll('.absence-card')[2].querySelector('.kit-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.absence-card')[2].querySelector('.kit-chip').textContent"),'сохранено');
 assert.equal(await q(2,'.abs-bar.is-draft'),0);
 await require('./card-shot.cjs')(win,'.absence-card','petya-absences');
 // Delete a typed absence, then «Отменить».
 await js("document.querySelectorAll('.absence-card')[0].querySelector('.abs-detail .delete-button').click()");
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.absence-card')[0].querySelectorAll('.abs-detail').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.find(c=>c[0]==='remove'),['remove','masha','r-masha-1']);
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<60;i++){if(calls.some(c=>c[0]==='restore'))break;await new Promise(r=>setTimeout(r,30));}
 for(let i=0;i<60;i++){if(await js("document.querySelectorAll('.absence-card')[0].querySelectorAll('.abs-detail').length===5"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await q(0,'.abs-detail'),5,'restored');
 // «Сохранить»: one call, then saved.
 await js("[...document.querySelectorAll('.absence-card')[1].querySelectorAll('.kit-actions button')].find(b=>b.classList.contains('primary')).click()");
 for(let i=0;i<60;i++){if(await js("!document.querySelectorAll('.absence-card')[1].querySelector('.kit-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[0]==='confirm'),[['confirm','draft-new']]);
 assert.equal(await js("document.querySelectorAll('.absence-card')[1].querySelector('.kit-chip').textContent"),'сохранено');
 assert.equal(await q(1,'.abs-bar.is-draft'),0);assert.equal(await q(1,'.abs-bar'),2);
 assert.equal(await js("document.querySelectorAll('.absence-card')[1].querySelector('.kit-title').textContent"),'Отсутствие отмечено');
 await require('./card-shot.cjs')(win,'.absence-card:nth-of-type(n)','petya-absences-saved');
 console.log('Absences card: strip with kinds, weekends and today, details with trash and undo, confirmation saved once passed');
}};
require('../src/main.cjs');
