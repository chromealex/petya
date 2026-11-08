// «Регулярки и cron» cards in the real chat: highlighted matches, ✓/✗ for drafted patterns, cron fields and runs.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const regexCard={mode:'test',pattern:'^(\\d{3})-\\d{2}$',flags:'',summary:'Три цифры, дефис и ещё две цифры — вся строка.',parts:[{part:'^',meaning:'начало строки'},{part:'(\\d{3})',meaning:'три цифры, группа 1'},{part:'-\\d{2}',meaning:'дефис и две цифры'},{part:'$',meaning:'конец строки'}],
  rows:[{line:'123-45',matches:[{index:0,text:'123-45',groups:['123']}]},{line:'12-345',matches:[]},{line:'<img src=x onerror=alert(1)>',matches:[]}],risky:false};
 const draft={mode:'draft',pattern:'^\\d+$',flags:'',summary:'Только цифры.',verified:false,rows:[{line:'12',expect:'match',ok:true,matches:[{index:0,text:'12',groups:[]}]},{line:'a1',expect:'no',ok:true,matches:[]},{line:'',expect:'no',ok:false,matches:[{index:0,text:'',groups:[]}]}]};
 const cronCard={expression:'*/15 9-18 * * 1-5',fields:['*/15','9-18','*','*','1-5'],description:'каждые 15 мин с 09:00 до 18:45 по будням',runs:['2026-11-09T06:00:00.000Z','2026-11-09T06:15:00.000Z','2026-11-09T06:30:00.000Z']};
 await js(`view('home');showDialogueMessages([{role:'user',text:'проверь регулярку'},{role:'assistant',text:'Совпадает 1 из 3 строк.',by:'Регулярки и cron',extensionData:{regexCard:${JSON.stringify(regexCard)}}},{role:'assistant',text:'Составил.',by:'Регулярки и cron',extensionData:{regexCard:${JSON.stringify(draft)}}},{role:'assistant',text:'Расписание.',by:'Регулярки и cron',extensionData:{cronCard:${JSON.stringify(cronCard)}}}],'Регулярки')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.regex-card').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.regex-card').length"),3);
 assert.equal(await js("document.querySelector('.regex-lines mark').textContent"),'123-45');
 assert.equal(await js("document.querySelectorAll('.regex-card img').length"),0,'sample text is never HTML');
 assert.equal(await js("document.querySelectorAll('.regex-lines li.bad').length"),1);
 assert.equal(await js("document.querySelectorAll('.cron-field').length"),5);
 assert.equal(await js("document.querySelectorAll('.cron-runs li').length"),3);
 await require('./card-shot.cjs')(win,'.regex-card','petya-regex-cron');
 console.log('Regex and cron cards: highlighted matches, safe text, drafted ✓/✗, cron fields and runs passed');
}};
require('../src/main.cjs');
