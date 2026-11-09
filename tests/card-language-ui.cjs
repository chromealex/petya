// App cards in a chat with the English interface: a card is interface text even though it sits inside the message
// (.message-content, which the interface translation skips), so its chrome is English, while the message text around
// it and the user content inside it ([data-no-i18n]: quotes, the checked text, table cells) stay exactly as written.
// Covers a result-kit card (tone check), a renderer without the kit (Python table), a card first drawn into a
// detached message (a redraw of the chat) and a card repainting itself after a click.
process.env.PETYA_SMOKE_TEST='1';
process.env.PETYA_INTERFACE_LANGUAGE='en';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,what)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}assert.fail('timeout: '+what);};
 await js('window.chatNavigationReady');
 assert.equal(await js('window.petyaLanguage'),'en');
 const text='Как я уже писал, ревью нужно до пятницы. Сохранить';
 const tone={mode:'check',text,audience:'public',language:'ru',sensitivity:'medium',model:false,
  findings:[{kind:'passive',severity:'warning',span:{start:0,end:15,text:'Как я уже писал'},message:'«Как я уже писал / говорил» звучит как упрёк.',suggestion:'Напомню'}]};
 // Cells that are also interface strings («Сохранить» → Save, «Готово» → Done) must stay as the program printed them.
 const python={attempts:[{ok:true,code:'print("Статус,Количество")',stdout:'Статус,Количество\nСохранить,3\nГотово,5\n'}]};
 const chat=JSON.stringify([
  {role:'user',text:'как это звучит'},
  {role:'assistant',text:'Готово',by:'Проверка тона',extensionData:{toneCard:tone}},
  {role:'user',text:'посчитай статусы'},
  {role:'assistant',text:'Сохранить',pythonExecution:python}
 ]);
 // Cyrillic text outside [data-no-i18n] (and code) in the cards, i.e. Russian chrome left in the English interface.
 const leftovers=`[...document.querySelectorAll('.tone-card,.python-result')].flatMap(card=>{const out=[],w=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
  for(let n=w.nextNode();n;n=w.nextNode())if(/[А-Яа-яЁё]/.test(n.nodeValue)&&!n.parentElement.closest('[data-no-i18n],pre,code,textarea'))out.push(n.nodeValue.trim());return out;})`;
 async function check(round){
  await wait("document.querySelector('.tone-card')&&document.querySelector('.python-result')",'cards, '+round);
  assert.deepEqual(await js(leftovers),[],'no Russian chrome in the cards ('+round+')');
  // The message text around the cards is the model's: never translated, even when it equals an interface string.
  assert.deepEqual(await js("[...document.querySelectorAll('.message-assistant .message-content>p')].map(p=>p.textContent)"),['Готово','Сохранить'],round);
  const card="document.querySelector('.tone-card')";
  assert.equal(await js(card+".querySelector('.kit-actions button').textContent"),'Copy',round);
  assert.equal(await js(card+".querySelector('.kit-app').textContent"),'T','the app letter follows the English name');
  assert.equal(await js(card+".querySelector('.kit-app').title"),'Tone check');
  assert.equal(await js(card+".querySelector('.tc-quote').textContent"),'Как я уже писал','the quoted fragment stays Russian');
  assert.equal(await js(card+".querySelector('.tc-text').textContent.replace(/\\d/g,'')"),text,'the checked text stays as written');
  assert.match(await js(card+".querySelector('.tc-message').textContent"),/sounds like a reproach/,'the finding is the app text');
  const py="document.querySelector('.python-result')";
  assert.deepEqual(await js("[..."+py+".querySelectorAll('th,td')].map(c=>c.textContent)"),['Статус','Количество','Сохранить','3','Готово','5'],'program output stays as printed');
  assert.ok(await js("[..."+py+".querySelectorAll('button')].some(b=>b.textContent==='Download CSV')"),round);
 }
 await js(`view('home');showDialogueMessages(${chat},'Карточки')`);
 await check('first render');
 // A redraw: the extension scripts are loaded, so the cards are drawn into the message before it is inserted.
 await js(`showDialogueMessages(${chat},'Карточки')`);
 await check('redraw');
 // The card repaints itself after «Заменить на …»: the new nodes are translated too, the new text stays as written.
 await js("document.querySelector('.tone-card .tc-apply').click()");
 await wait("!!document.querySelector('.tone-card .tc-done')",'applied');
 assert.equal(await js("document.querySelector('.tone-card .tc-done').textContent"),'fixed');
 assert.equal(await js("document.querySelector('.tone-card .tc-text').textContent"),'Напомню, ревью нужно до пятницы. Сохранить');
 assert.deepEqual(await js(leftovers),[],'no Russian chrome after the repaint');
 const shot=await require('./card-shot.cjs')(win,'.tone-card,.python-result','petya-card-language-en');
 console.log('Card language UI ('+shot+'): English chrome in chat cards, Russian quotes, checked text, table cells and message text kept, after a redraw and a repaint passed');
}};
require('../src/main.cjs');
