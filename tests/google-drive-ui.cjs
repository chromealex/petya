// «Google Диск» cards in the real chat: a file list with the kinds bar, generic kind icons, owners and relative times;
// a document's outline with section bars and its opening lines; an answer with quotes from the document; and a new
// document's preview with an editable title and «Создать документ» (one ipc call, then «Открыть в Google Документах»).
// Safe text throughout: names, quotes and the answer never become HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const {ipcMain}=require('electron'),calls=[];
 const id=n=>n+'x'.repeat(30);
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  calls.push([name,method,...args]);
  if(name==='appLinks'&&method==='available')return [];
  if(name==='googleDrive'&&method==='save')return {done:{id:id('NewDoc'),title:args[1],url:'https://docs.google.com/document/d/'+id('NewDoc')+'/edit',at:new Date().toISOString()}};
  throw Error('unexpected '+name+'.'+method);
 });
 const ago=h=>new Date(Date.now()-h*3600000).toISOString();
 const file=(n,name,kind,h,extra={})=>({id:id(n),name,kind,mime:'',modified:ago(h),url:'https://docs.google.com/document/d/'+id(n)+'/edit',owner:'',mine:false,shared:false,editor:'',size:0,...extra});
 const files={mode:'files',recent:false,query:'релиз',kind:'',more:false,who:'me@studio.dev',files:[
  file('A','План релиза 2.3','document',3,{owner:'Маша Котова',editor:'Олег'}),
  file('B','Релизный чек-лист <img src=x onerror=alert(1)>','spreadsheet',26,{mine:true}),
  file('C','Релиз в Китае: питч для издателя','presentation',50,{owner:'Олег'}),
  file('D','Отчёт по релизу 2.2.pdf','pdf',24*9,{shared:true}),
  file('E','Релизы','folder',24*30,{mine:true}),
  file('F','Скриншоты релиза.png','image',24*40,{owner:'Аня'}),
  file('G','Ретро после релиза 2.2','document',24*45,{mine:true,meaning:true,piece:'Сборка ушла на сутки позже: QA не успел пройти регресс.'})]};
 const doc={mode:'doc',doc:{id:id('A'),title:'План релиза 2.3',url:'https://docs.google.com/document/d/'+id('A')+'/edit',owner:'Маша Котова',mine:false,shared:false,modified:ago(3),editor:'Олег'},
  outline:[{level:1,text:'Цели',words:42},{level:1,text:'Сроки',words:8},{level:2,text:'Бета-тест',words:96},{level:2,text:'Заморозка кода',words:31},{level:3,text:'Исключения для хотфиксов',words:18},{level:1,text:'Ответственные',words:24},{level:1,text:'Риски',words:120}],
  lead:0,total:339,intro:'Выпустить лиги и новый магазин до Нового года.\n\nРелиз 2.3 — последний в этом году; после него заморозка до 10 января.',truncated:false,empty:false};
 const answer={mode:'answer',doc:doc.doc,question:'когда начинается бета-тест?',answer:'Бета-тест начинается 1 декабря и длится две недели; сборка для него — 28 ноября.',state:'answer',model:true,
  quotes:[{n:3,text:'Бета-тест начинается 1 декабря и длится две недели.',path:'Сроки › Бета-тест'},{n:4,text:'Сборка для бета-теста — 28 ноября <b>жирно</b>',path:'Сроки › Бета-тест'}]};
 const md='## Итоги планёрки\n\nРешили выпускать **2.3** по плану.\n\n- Маша готовит сборку к пятнице\n- Олег проверяет лиги\n- Аня обновляет скриншоты в сторах\n\n### Риски\n\nЕсли QA не успеет, сдвигаем релиз на неделю.\n\n| Кто | Что |\n|---|---|\n| Маша | сборка |\n| Олег | лиги |';
 const save={mode:'save',draftId:'d-save',title:'Итоги планёрки',text:md,truncated:false,app:'',sections:2,canCreate:true,writable:true,who:'me@studio.dev',
  preview:[{type:'heading',level:2,text:'Итоги планёрки'},{type:'p',text:'Решили выпускать **2.3** по плану.'},{type:'li',text:'Маша готовит сборку к пятнице',ordered:false,level:0},{type:'li',text:'Олег проверяет лиги',ordered:false,level:0},{type:'li',text:'Аня обновляет скриншоты в сторах',ordered:false,level:0},{type:'heading',level:3,text:'Риски'},{type:'p',text:'Если QA не успеет, сдвигаем релиз на неделю.'},{type:'table',rows:[['Кто','Что'],['Маша','сборка'],['Олег','лиги']]}]};
 const msg=(text,card)=>({role:'assistant',text,by:'Google Диск',extensionData:{driveCard:card}});
 await js(`view('home');showDialogueMessages([{role:'user',text:'найди в гугл диске релиз'},${JSON.stringify(msg('Нашёл.',files))},${JSON.stringify(msg('Документ.',doc))},${JSON.stringify(msg('Ответ.',answer))},${JSON.stringify(msg('Готов к созданию.',save))}],'Диск')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.drive-card').length===4"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.drive-card').length"),4);
 const card=i=>`document.querySelectorAll('.drive-card')[${i}]`;
 // Files: one row per file, a generic icon each, the kinds bar with one segment per kind, relative times.
 assert.equal(await js(card(0)+".querySelectorAll('.gd-file').length"),7);
 assert.equal(await js(card(0)+".querySelectorAll('.gd-icon svg').length"),7);
 assert.equal(await js(card(0)+".querySelectorAll('.gd-kinds-bar span').length"),6);
 assert.equal(await js(card(0)+".querySelectorAll('.gd-file time').length"),7);
 assert.match(await js(card(0)+".querySelector('.gd-file .gd-when').textContent"),/назад|сегодня/);
 assert.deepEqual(await js(`[...${card(0)}.querySelectorAll('.gd-row-actions button')].map(b=>b.textContent)`),['Прочитать','Открыть в чате','Открыть','Открыть','Открыть','Открыть','Прочитать']);
 assert.equal(await js(card(0)+".querySelectorAll('.gd-meaning .gd-tag').length"),1);
 assert.equal(await js("document.querySelectorAll('.drive-card img').length"),0,'file names are never HTML');
 // Document: outline rows with bars, the opening lines.
 assert.equal(await js(card(1)+".querySelectorAll('.gd-sec').length"),7);
 assert.equal(await js(card(1)+".querySelector('.gd-sec:nth-child(7) .gd-sec-track span').style.width"),'100%');
 assert.match(await js(card(1)+".querySelector('.gd-intro').textContent"),/^Выпустить лиги/);
 // Answer: quotes with their section, text stays text.
 assert.equal(await js(card(2)+".querySelectorAll('.gd-quote').length"),2);
 assert.equal(await js(card(2)+".querySelectorAll('.gd-quote b').length"),0);
 assert.match(await js(card(2)+".querySelector('.gd-quote figcaption').textContent"),/§3Сроки › Бета-тест/);
 // Save: the preview and the editable title.
 assert.equal(await js(card(3)+".querySelectorAll('.gd-preview li').length"),3);
 assert.equal(await js(card(3)+".querySelector('.gd-title-field input').value"),'Итоги планёрки');
 await js("document.querySelectorAll('.drive-card').forEach((c,i)=>c.dataset.shot=i===0?'a':i<3?'b':'c')");
 await require('./card-shot.cjs')(win,'.drive-card[data-shot=a]','petya-google-drive');
 await require('./card-shot.cjs')(win,'.drive-card[data-shot=b]','petya-google-drive-doc');
 await require('./card-shot.cjs')(win,'.drive-card[data-shot=c]','petya-google-drive-save');
 // «Создать документ»: one call with the edited title, then the button becomes «Открыть в Google Документах».
 await js(`(()=>{const i=${card(3)}.querySelector('.gd-title-field input');i.value='Итоги планёрки 9 ноября';})()`);
 await js(card(3)+".querySelector('.kit-actions button.primary').click()");
 for(let i=0;i<100;i++){if(await js(card(3)+".querySelector('.kit-chip.tone-done')!==null"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[1]==='save').map(c=>c.slice(2)),[['d-save','Итоги планёрки 9 ноября']]);
 assert.equal(await js(card(3)+".querySelector('.kit-actions button.primary').textContent"),'Открыть в Google Документах');
 assert.equal(await js(card(3)+".querySelector('.gd-title-field input').disabled"),true);
 console.log('Google Drive cards: kinds bar, generic icons, owners and relative times, outline with section bars, quotes, new document preview and one create call passed');
}};
require('../src/main.cjs');
