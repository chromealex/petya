// «Стендап» card in the real chat: tiles, the answers bar, people rows with avatar, source and «нет ответа» chips,
// three columns with issue links, blockers in alert tone, an unstructured answer as a quote, safe text, and the
// actions (Slack and task tracker appear only through connected apps; «Обновить» sends «Собери стендап»).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const SITE='https://studio.atlassian.net',u=k=>SITE+'/browse/'+k;
const THREAD='https://studio.slack.com/archives/C0ABCDEF1/p1794479400000100';
const card={project:{id:'p1',name:'Game'},jira:'GAME',site:SITE,since:'2026-11-11T10:30:00.000Z',at:'2026-11-12T10:35:00.000Z',thread:{url:THREAD},sources:{jira:true,git:true,slack:true},focus:'collect',schedule:{time:'10:30',days:'по будням'},
 totals:{people:5,answered:3,drafted:1,blocked:2,blockers:4,silent:2},warnings:[],
 people:[
  {name:'Маша Петрова',role:'Клиент',source:'slack',answeredAt:'2026-11-12T10:31:00.000Z',noAnswer:false,commits:1,
   yesterday:[{text:'доделала экран магазина GAME-51',key:'GAME-51',url:u('GAME-51')}],today:[{text:'кланы GAME-70',key:'GAME-70',url:u('GAME-70')}],
   blockers:[{text:'жду макеты от дизайна'},{text:'Фикс локализации — статус Blocked',key:'GAME-77',url:u('GAME-77')}]},
  {name:'Олег Смирнов',role:'Сервер',source:'slack',answeredAt:'2026-11-12T10:32:00.000Z',noAnswer:false,commits:0,yesterday:[],today:[],
   blockers:[{text:'Античит — флаг',key:'GAME-75',url:u('GAME-75')},{text:'Сервер чата — ждёт OPS-3',key:'GAME-80',url:u('GAME-80')}],note:'чинил матчмейкинг, сегодня продолжу <script>alert(1)</script>'},
  {name:'Гость Подрядчик',role:'не в «Команде»',source:'slack',noAnswer:false,commits:0,yesterday:[{text:'ревью.'}],today:[{text:'релиз'}],blockers:[]},
  {name:'Иван Козлов',role:'Геймплей',source:'draft',noAnswer:true,commits:1,
   yesterday:[{text:'Новый босс — To Do → In Progress, 1 комментарий, списано 2 ч',key:'GAME-60',url:u('GAME-60')},{text:'коммит: GAME-60 boss AI states',key:'GAME-60',url:u('GAME-60')}],
   today:[{text:'Новый босс (In Progress)',key:'GAME-60',url:u('GAME-60')}],blockers:[]},
  {name:'Аня Белова',role:'QA',source:'none',noAnswer:true,commits:0,yesterday:[],today:[],blockers:[]}]};

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 // Connected apps for the cross-app buttons (Slack for share-message, Jira for task-tracker), as the registry would list them.
 await js("window.resultKit.availableLinks=async kind=>kind==='share-message'?[{id:'slack',name:'Slack',label:'Отправить в Slack'}]:kind==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:[];0");
 await js(`view('home');showDialogueMessages([{role:'user',text:'собери стендап'},{role:'assistant',text:'Стендап: ответили в треде 3 из 5.',by:'Стендап',extensionData:{standupCard:${JSON.stringify(card)}}}],'Стендап')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.standup-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.standup-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.standup-person').length"),5);
 assert.equal(await js("document.querySelectorAll('.standup-person.blocked').length"),2);
 assert.equal(await js("document.querySelectorAll('.standup-blocker').length"),4);
 assert.equal(await js("document.querySelectorAll('.standup-silent').length"),2);
 assert.equal(await js("document.querySelectorAll('.standup-person .kit-person').length"),5,'an avatar per person');
 assert.equal(await js("document.querySelectorAll('.standup-track .seg').length"),3);
 assert.equal(await js("document.querySelector('.standup-blocker a.standup-key[href]')?.getAttribute('href')"),u('GAME-77'));
 assert.equal(await js("document.querySelectorAll('.standup-card script').length"),0,'answers are never HTML');
 assert.match(await js("document.querySelector('.standup-note').textContent"),/<script>/);
 assert.equal(await js("document.querySelector('.standup-note').hasAttribute('data-no-i18n')"),true);
 const sent=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};const b=[...document.querySelectorAll('.standup-card .kit-actions button')].find(x=>!x.closest('.kit-links'));b.click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.equal(sent,'Собери стендап');
 const file=await require('./card-shot.cjs')(win,'.standup-card','petya-standup');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-standup-2.png'),(await win.webContents.capturePage()).toPNG());
 // A messenger thread (messenger-source) instead of Slack: answers marked as in the thread, the messenger named.
 const chat={...card,thread:{url:'https://chat.example.com/studio/pl/p100',source:'Mattermost',channel:'standup'},sources:{jira:true,git:true,slack:false,chat:'Mattermost'},
  people:card.people.map(p=>p.source==='slack'?{...p,source:'chat'}:p)};
 await js(`document.getElementById('card-shot')?.remove();showDialogueMessages([{role:'assistant',text:'Стендап: ответили в треде 3 из 5.',by:'Стендап',extensionData:{standupCard:${JSON.stringify(chat)}}}],'Стендап · чат')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.standup-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('.standup-card .kit-sub, .standup-card .kit-subtitle')?.textContent||document.querySelector('.standup-card').textContent"),/Mattermost/);
 assert.equal(await js("[...document.querySelectorAll('.standup-person[data-source=chat] .kit-chip')].filter(c=>c.textContent==='ответ в треде').length"),3);
 assert.match(await js("[...document.querySelectorAll('.standup-person[data-source=chat] .kit-chip')].find(c=>c.textContent==='ответ в треде').title"),/^Ответ в Mattermost/);
 console.log('Standup with a messenger thread: '+await require('./card-shot.cjs')(win,'.standup-card','petya-standup-chat'));
 console.log('Standup card ('+file+'): tiles, answers bar, people rows, blockers, no answer, safe text and actions, messenger thread passed');
}};
require('../src/main.cjs');
