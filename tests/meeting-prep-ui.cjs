// «Подготовка к встрече» card in the real chat: meeting time and join link, attendees, the «В прошлый раз»
// timeline, tasks with tracker chips and a progress bar, Slack threads, cited agenda points, safe text, and the
// two-step «В описание встречи» confirmation (nothing is written before «Подтвердить»).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now(),iso=ms=>new Date(ms).toISOString(),day=86400000;
 const start=Math.ceil((now+8*60000)/60000)*60000;
 const prep={prepId:'prep-ui',mode:'prep',account:'google:a1',provider:'google',now:iso(now),
  event:{id:'e1',title:'Синк по релизу 1.5',start:iso(start),end:iso(start+30*60000),link:'https://meet.google.com/abc-defg-hij',url:'https://calendar.google.com/event?eid=e1',location:'Переговорка «Нептун»',organizer:true,description:true},
  attendees:[{name:'me@corp.ru',email:'me@corp.ru',role:'',known:false,self:true},{name:'Мария Петрова',email:'maria@corp.ru',role:'QA-лид',known:true,self:false},{name:'Олег Иванов',email:'oleg@corp.ru',role:'Тимлид клиента',known:true,self:false},{name:'guest@partner.io',email:'guest@partner.io',role:'',known:false,self:false}],
  history:[{at:now-4*day,end:now-4*day+1800000,title:'Синк по релизу 1.5',sessionId:'s5',recorded:true,summaryId:'summary:s5',basis:'transcript',speakers:['Олег Иванов'],decisions:['Релиз 1.5 переносим на 12 ноября','Фичефлаг магазина выключен до QA','<img src=x onerror=alert(1)>'],tasks:[{who:'Олег',what:'Обновить SDK',due:''}],open:['Кто дежурит в выходные релиза']},
   {at:now-6*day,end:now-6*day+1800000,title:'Синк по релизу 1.5',sessionId:'s3',recorded:true,summaryId:'',basis:'',speakers:[],decisions:[],tasks:[],open:[]},
   {at:now-7*day,end:now-7*day+1800000,title:'Синк по релизу 1.5',sessionId:'',recorded:false,summaryId:'',basis:'',speakers:[],decisions:[],tasks:[],open:[]}],
  tasks:[{id:'T1',who:'Олег Иванов',what:'Обновить SDK рекламы до 7.2',due:'10.11',from:{title:'Синк по релизу 1.5',at:now-4*day},tracker:{system:'jira',key:'REL-80',title:'Обновить SDK рекламы до 7.2',status:'В работе',category:'progress',url:'https://corp.atlassian.net/browse/REL-80'}},
   {id:'T2',who:'Мария Петрова',what:'Прогнать регресс магазина',due:'',from:{title:'Синк по релизу 1.5',at:now-4*day},tracker:null},
   {id:'T3',who:'',what:'REL-77 согласовать текст патчноута',due:'',from:{title:'Синк по релизу 1.5',at:now-4*day},tracker:{system:'jira',key:'REL-77',title:'Согласовать текст патчноута',status:'Готово',category:'done',url:'https://corp.atlassian.net/browse/REL-77'}}],
  slack:[{id:'S1',title:'SDK рекламы 7.2 падает на старте',url:'https://app.slack.com/archives/C1/p1',channel:'C1',at:now-day,excerpt:'SDK 7.2 падает на Android 8, нужен хотфикс'}],
  facts:[{id:'D1',kind:'decision',text:'Релиз 1.5 переносим на 12 ноября',source:'Решение · Синк по релизу 1.5 · 5 нояб.'},{id:'Q1',kind:'open',text:'Кто дежурит в выходные релиза',source:'Не обсудили · Синк по релизу 1.5 · 5 нояб.'},
   {id:'T1',kind:'task',text:'Обновить SDK рекламы до 7.2 — Олег Иванов',source:'Задача · Синк по релизу 1.5 · 5 нояб. · REL-80'},{id:'T2',kind:'task',text:'Прогнать регресс магазина — Мария Петрова',source:'Задача · Синк по релизу 1.5 · 5 нояб.'},{id:'S1',kind:'slack',text:'SDK рекламы 7.2 падает на старте',source:'Slack · SDK рекламы 7.2 падает на старте'}],
  agenda:[{text:'SDK 7.2: успеваем ли с хотфиксом до релиза 12 ноября',sources:['T1','S1','D1']},{text:'Регресс магазина — кто и когда закончит',sources:['T2']},{text:'Дежурство на выходных релиза',sources:['Q1']}],
  agendaModel:true,trackers:['jira'],trackerError:'',remind:false};
 const history={...prep,prepId:'prep-ui-2',mode:'history',event:null,person:['Олег Смирнов'],attendees:[prep.attendees[0],{name:'Олег Смирнов',email:'smirnov@corp.ru',role:'',known:true,self:false}],tasks:[],slack:[],agenda:[],facts:[],trackers:[],history:prep.history.slice(2)};
 await js(`view('home');showDialogueMessages([{role:'user',text:'подготовь меня к встрече'},{role:'assistant',text:'Синк по релизу 1.5 — сегодня в 15:00, 4 участника.\\nПредлагаю обсудить:\\n1. …',by:'Подготовка к встрече',extensionData:{meetingPrep:${JSON.stringify(prep)}}},{role:'assistant',text:'Ближайших встреч, где есть Олег Смирнов, в календаре нет.',by:'Подготовка к встрече',extensionData:{meetingPrep:${JSON.stringify(history)}}}],'Подготовка')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.mp-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.mp-card').length"),2);
 assert.equal(await js("document.querySelector('.mp-card .kit-key').textContent"),'Синк по релизу 1.5');
 assert.equal(await js("document.querySelectorAll('.mp-card')[0].querySelectorAll('.mp-person').length"),4);
 assert.equal(await js("document.querySelectorAll('.mp-card')[0].querySelectorAll('.mp-past').length"),3);
 assert.equal(await js("document.querySelectorAll('.mp-card img').length"),0,'decisions are never HTML');
 assert.equal(await js("document.querySelectorAll('.mp-card')[0].querySelectorAll('.mp-task').length"),3);
 assert.equal(await js("document.querySelectorAll('.mp-card')[0].querySelectorAll('.mp-seg').length"),3,'done / in progress / not found');
 assert.equal(await js("document.querySelectorAll('.mp-card')[0].querySelectorAll('.mp-agenda li').length"),3);
 assert.match(await js("document.querySelector('.mp-ref').title"),/Задача · Синк по релизу 1\.5/,'hovering a source shows the fact');
 assert.equal(await js("document.querySelector('.mp-past .mp-inline')?.textContent"),'Собрать сводку');
 assert.ok(await js("[...document.querySelectorAll('.mp-card')[0].querySelectorAll('.kit-actions button')].some(b=>b.textContent==='Открыть звонок')"));
 assert.ok(!(await js("[...document.querySelectorAll('.mp-card')[1].querySelectorAll('.kit-actions button')].some(b=>b.textContent==='В описание встречи')")),'no agenda, no description update');
 // «В описание встречи» shows the exact text first; nothing is called before «Подтвердить».
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{if(name!=='meetingPrep')throw Error('x');if(!['status','reminders'].includes(method))calls.push(method);if(method==='preview')return {title:'Синк по релизу 1.5',text:'Повестка (подготовил Петя):\n1. SDK 7.2'};if(method==='addAgenda')return {added:{at:'x'}};});
 await js("[...document.querySelectorAll('.mp-card')[0].querySelectorAll('.kit-actions button')].find(b=>b.textContent==='В описание встречи').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.mp-confirm')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls,['preview']);
 assert.match(await js("document.querySelector('.mp-preview').textContent"),/^Повестка \(подготовил Петя\)/);
 await require('./card-shot.cjs')(win,'.mp-card','petya-meeting-prep');
 // The lower half of the tall card, scrolled.
 await js("document.getElementById('card-shot').scrollTop=1e6");await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-meeting-prep-bottom.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.querySelector('.mp-confirm button.primary').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.mp-done')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls,['preview','addAgenda']);
 console.log('Meeting prep card: time and join link, attendees, past meetings timeline, tasks with tracker chips, cited agenda, safe text, confirmed description update passed');
}};
require('../src/main.cjs');
