// «Архитектурные решения» cards in the real chat: the draft shows the exact file (folder, path, full text in an
// editor) with the section strip that follows edits; «Сохранить в проект» sends exactly the editor's text through the
// app's IPC and turns the card into «сохранено» (also when the card is drawn again); Confluence only when connected;
// the search card with the strip of all decisions and the found ones; the check card with the verdict and quotes.
// Text from files and the model never becomes HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const TEXT='# 0004. Переход на Addressables\n\n- Дата: 2026-11-09\n- Статус: Принято\n\n## Контекст\n\nУровни грузятся по 20 секунд из Resources, память на телефонах кончается.\n\n## Решение\n\nПереходим на Addressables в следующем спринте.\n\n## Альтернативы\n\n- Оставить Resources и резать уровни на части — не решает память.\n\n## Последствия\n\n- —\n\n## Источники\n\n- Чат «Загрузка уровней»\n- Встреча · 5 нояб., 12:00 · решение\n';
const draft={mode:'draft',draftId:'11111111-2222-3333-4444-555555555555',folder:{name:'game',path:'/Users/lead/Projects/game'},path:'docs/adr/0004-perehod-na-addressables.md',number:4,title:'Переход на Addressables',text:TEXT,date:'2026-11-09',by:'rules',
 sources:[{kind:'chat',label:'Чат «Загрузка уровней»',text:'Уровни грузятся по 20 секунд из Resources, память на телефонах кончается.'},{kind:'meeting',label:'Встреча · 5 нояб., 12:00 · решение',text:'Переходим на Addressables в следующем спринте'},{kind:'index',label:'Файл Assets/Scripts/LevelLoader.cs',text:'LevelLoader.Load() тянет весь уровень из Resources синхронно <img src=x onerror=alert(1)>'}],
 related:[{number:3,title:'Ресурсы в папке Resources',path:'docs/adr/0003-resursy-v-resources.md',status:'superseded',date:'2025-12-01'}],existing:3,confluence:'ARCH'};
const search={mode:'search',query:'сеть',folder:{name:'game',path:'/Users/lead/Projects/game'},
 all:[{number:1,title:'Сетевой протокол: UDP',date:'2026-03-02',status:'accepted'},{number:2,title:'Хранение сохранений',date:'2026-05-10',status:'accepted'},{number:3,title:'Ресурсы в папке Resources',date:'2025-12-01',status:'superseded'},{number:4,title:'Переход на Addressables',date:'2026-11-09',status:'accepted'},{number:5,title:'Матчмейкинг по рейтингу',date:'2026-11-10',status:'proposed'},{number:6,title:'Сетевой код: предсказание',date:'2026-11-11',status:'proposed'}],
 found:[{number:1,title:'Сетевой протокол: UDP',path:'docs/adr/0001-setevoy-protokol-udp.md',status:'accepted',date:'2026-03-02',excerpt:'Для синхронизации матча используем UDP с собственной надёжной доставкой важных сообщений.',byMeaning:false},
  {number:6,title:'Сетевой код: предсказание',path:'docs/adr/0006-setevoy-kod-predskazanie.md',status:'proposed',date:'2026-11-11',excerpt:'Клиент предсказывает движение и откатывается по снимкам сервера.',byMeaning:true}]};
const check={mode:'check',subject:'Давай перейдём на TCP для синхронизации матча, так проще.',verdict:'contradicts',by:'model',folder:{name:'game',path:'/x'},
 items:[{number:1,title:'Сетевой протокол: UDP',path:'docs/adr/0001-setevoy-protokol-udp.md',status:'accepted',quote:'TCP для игрового трафика не используем',verified:true,verdict:'contradicts',explanation:'Решение 0001 запрещает TCP для матча.'},
  {number:6,title:'Сетевой код: предсказание',path:'docs/adr/0006-setevoy-kod-predskazanie.md',status:'proposed',quote:'Клиент предсказывает движение и откатывается по снимкам сервера.',verified:false,verdict:'unclear',explanation:''}]};

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js("window.resultKit.availableLinks=async kind=>kind==='document-export'?[{id:'google-drive',name:'Google Диск',label:'Сохранить в Google Документы'}]:[];0");
 const {ipcMain}=require('electron'),calls=[];let state='draft';
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name!=='adr')return null;
  calls.push([method,...args]);
  if(method==='state')return {state,confluenceUrl:''};
  if(method==='save'){state='saved';return {ok:true,path:draft.path,text:'Сохранено: '+draft.path};}
  if(method==='confluence')return {ok:true,url:'https://studio.atlassian.net/wiki/spaces/ARCH/pages/111',text:'Страница создана в Confluence: 0004. Переход на Addressables'};
  return null;
 });
 const show=async(card,user)=>{
  await js(`view('home');showDialogueMessages([{role:'user',text:${JSON.stringify(user)}},{role:'assistant',text:'Готово.',by:'Архитектурные решения',extensionData:{adrCard:${JSON.stringify(card)}}}],'ADR')`);
  for(let i=0;i<150;i++){if(await js("!!document.querySelector('.adr-card')"))break;await new Promise(r=>setTimeout(r,30));}
 };
 // --- Draft ------------------------------------------------------------------------------------------------------------
 await show(draft,'оформи ADR про переход на Addressables');
 assert.equal(await js("document.querySelector('.adr-path').textContent"),draft.path);
 assert.equal(await js("document.querySelector('.adr-text').value"),TEXT,'the exact file text');
 assert.equal(await js("document.querySelectorAll('.adr-cell').length"),4);
 assert.equal(await js("document.querySelectorAll('.adr-cell.on').length"),3,'«Последствия» is empty');
 assert.equal(await js("document.querySelectorAll('.adr-card img').length"),0,'sources are never HTML');
 await js("(()=>{const a=document.querySelector('.adr-text');a.value=a.value.replace('## Последствия\\n\\n- —','## Последствия\\n\\n- Загрузка асинхронная');a.dispatchEvent(new Event('input'));})()");
 assert.equal(await js("document.querySelectorAll('.adr-cell.on').length"),4);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.adr-card .kit-link').length>0"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.adr-card .kit-link').textContent"),'Сохранить в Google Документы');
 const file=await require('./card-shot.cjs')(win,'.adr-card','petya-adr');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-adr-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot')?.remove()");
 // The screenshot moved the card away: draw it again and edit the same way before saving.
 await show(draft,'оформи ADR про переход на Addressables');
 await js("(()=>{const a=document.querySelector('.adr-text');a.value=a.value.replace('## Последствия\\n\\n- —','## Последствия\\n\\n- Загрузка асинхронная');a.dispatchEvent(new Event('input'));})()");
 await js("[...document.querySelectorAll('.adr-card .kit-actions button')].find(b=>b.classList.contains('primary')).click()");
 for(let i=0;i<100;i++){if(calls.some(c=>c[0]==='save'))break;await new Promise(r=>setTimeout(r,30));}
 const save=calls.find(c=>c[0]==='save');
 assert.equal(save[1],draft.draftId);assert.match(save[2],/- Загрузка асинхронная/,'the edited text is what is saved');
 for(let i=0;i<50;i++){if(await js("document.querySelector('.adr-text').readOnly"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.adr-text').readOnly"),true);
 const conf=await js("(async()=>{const b=[...document.querySelectorAll('.adr-card .kit-actions button')].find(x=>/Confluence/.test(x.textContent));b.click();await new Promise(r=>setTimeout(r,200));return b.textContent;})()");
 assert.match(conf,/создана/);assert.deepEqual(calls.filter(c=>c[0]==='confluence').map(c=>c[1]),[draft.draftId]);
 // Drawn again: the app says it is saved.
 await show(draft,'оформи ADR про переход на Addressables');
 for(let i=0;i<50;i++){if(await js("document.querySelector('.adr-text').readOnly"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.adr-card .kit-actions button.primary').disabled"),true);
 // --- Search ----------------------------------------------------------------------------------------------------------
 await show(search,'какие решения принимали про сеть');
 assert.equal(await js("document.querySelectorAll('.adr-tick').length"),6);
 assert.equal(await js("document.querySelectorAll('.adr-tick.found').length"),2);
 assert.equal(await js("document.querySelectorAll('.adr-item').length"),2);
 const searchShot=await require('./card-shot.cjs')(win,'.adr-card','petya-adr-search');
 await js("document.getElementById('card-shot')?.remove()");
 // --- Check -----------------------------------------------------------------------------------------------------------
 await show(check,'противоречит ли это решению про сеть');
 assert.equal(await js("document.querySelector('.adr-verdict').classList.contains('tone-alert')"),true);
 assert.equal(await js("document.querySelectorAll('.adr-quote.verified').length"),1);
 const asked=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};[...document.querySelectorAll('.adr-card .kit-actions button')][0].click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.equal(asked,'Запиши решение: '+check.subject);
 const checkShot=await require('./card-shot.cjs')(win,'.adr-card','petya-adr-check');
 console.log('ADR cards ('+file+', '+searchShot+', '+checkShot+'): exact file, section strip, save through IPC, Confluence, search strip, verbatim check passed');
}};
require('../src/main.cjs');
