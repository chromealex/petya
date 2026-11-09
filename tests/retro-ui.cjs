// «Ретро» card in the real chat: velocity bars with this sprint highlighted, tiles, the timeline with dated facts,
// three columns whose items cite facts (a click highlights the fact), team votes through the app's IPC (restored on
// draw), the facts with links to their sources, safe text, and the actions (task tracker and share-message only
// through connected apps; «Обновить» sends «Подготовь ретро …»).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const SITE='https://studio.atlassian.net',jql=q=>SITE+'/issues/?jql='+encodeURIComponent(q);
const jira={kind:'jira',name:'Jira',label:'Jira · GAME Sprint 14'};
const facts=[
 {id:'F1',kind:'velocity',tone:'bad',text:'Закрыто пока 14 SP из 33 SP взятых (в среднем за прошлые 4 — 23 SP)',value:{completed:14,committed:33,average:23},source:{...jira,url:jql('sprint = 14')}},
 {id:'F2',kind:'carry',tone:'bad',text:'Не закрыто 3 из 6 на 19 SP: GAME-50, GAME-53, GAME-55',value:{count:3,total:6},source:{...jira,url:jql('sprint = 14 AND statusCategory != Done')},
  issues:[{key:'GAME-50',summary:'Матчмейкинг',url:SITE+'/browse/GAME-50'},{key:'GAME-53',summary:'Краш при входе',url:SITE+'/browse/GAME-53'},{key:'GAME-55',summary:'Кланы: список',url:SITE+'/browse/GAME-55'}]},
 {id:'F3',kind:'bugs',tone:'bad',text:'Баги в спринте: 2, закрыто 1, открыто: GAME-53',value:{total:2,open:1},source:{...jira,url:jql('key in (GAME-53,GAME-54)')},
  issues:[{key:'GAME-53',summary:'Краш при входе',url:SITE+'/browse/GAME-53'},{key:'GAME-54',summary:'Опечатка',url:SITE+'/browse/GAME-54',done:true}]},
 {id:'F4',kind:'ci',tone:'bad',at:'2026-11-06T10:00:00Z',text:'CI: «Build Android» (studio/game) падал 2 из 3 запусков',value:{failed:2,total:3},source:{kind:'ci',name:'GitHub Actions',label:'Build Android #302',url:'https://github.com/studio/game/actions/runs/2'}},
 {id:'F5',kind:'incident',tone:'bad',at:'2026-11-08T21:10:00Z',text:'Инцидент: api — api недоступен (40 мин)',source:{kind:'monitoring',name:'Prometheus',label:'Prometheus · api',url:''}},
 {id:'F6',kind:'decision',tone:'good',at:'2026-11-05T12:30:00Z',text:'Решили: Переходим на Addressables в следующем спринте',quote:'Переходим на Addressables в следующем спринте',source:{kind:'meeting',name:'Встреча',label:'Встреча · 5 нояб., 12:00',url:''}},
 {id:'F7',kind:'decision',tone:'good',at:'2026-11-07T09:00:00Z',text:'В чате решили: Договорились: релизные заметки пишет Аня',author:'Олег',source:{kind:'messenger',name:'Mattermost',label:'Mattermost · #dev',url:'https://chat.studio.example/dev/pl/m2'}},
 {id:'F8',kind:'complaint',tone:'bad',at:'2026-11-06T09:00:00Z',text:'Жалоба в чате: Сборка опять упала, никто не ревьюит мои PR третий день <script>alert(1)</script>',author:'Маша',source:{kind:'messenger',name:'Mattermost',label:'Mattermost · #dev',url:'https://chat.studio.example/dev/pl/m1'}},
 {id:'F9',kind:'open',tone:'bad',at:'2026-11-05T12:30:00Z',text:'Осталось без решения: Кто отвечает за релизные заметки',source:{kind:'meeting',name:'Встреча',label:'Встреча · 5 нояб., 12:00',url:''}}
];
const card={retroId:'r-ui-1',project:'GAME',site:SITE,board:{id:'7',name:'GAME board',url:SITE+'/secure/RapidBoard.jspa?rapidView=7'},
 sprint:{id:'14',name:'GAME Sprint 14',state:'active',start:'2026-11-02T09:00:00Z',end:'2026-11-13T18:00:00Z',goal:'Кланы'},estimation:{mode:'points',label:'Story Points'},
 velocity:{sprints:[{id:'10',name:'GAME Sprint 10',completed:20,committed:24},{id:'11',name:'GAME Sprint 11',completed:22,committed:22},{id:'12',name:'GAME Sprint 12',completed:24,committed:30},{id:'13',name:'GAME Sprint 13',completed:26,committed:28},{id:'14',name:'GAME Sprint 14',completed:14,committed:33}],average:23},
 facts,team:[{key:'u-masha',name:'Маша Петрова'},{key:'u-oleg',name:'Олег Смирнов'},{key:'u-anya',name:'Аня Белова'}],
 drafts:{by:'rules',
  good:[{id:'good-1',text:'Решили: Переходим на Addressables в следующем спринте',facts:['F6']},{id:'good-2',text:'Договорились, кто пишет релизные заметки',facts:['F7']}],
  bad:[{id:'bad-1',text:'Закрыто 14 SP из 33 — сильно меньше средней скорости',facts:['F1','F2']},{id:'bad-2',text:'CI «Build Android» падал 2 раза',facts:['F4']},{id:'bad-3',text:'Инцидент: api недоступен 40 минут',facts:['F5']}],
  try:[{id:'try-1',text:'Брать в спринт меньше и резать крупные задачи до старта',facts:['F2']},{id:'try-2',text:'Назначать дежурного по сборке и чинить красный CI в тот же день',facts:['F4','F8']},{id:'try-3',text:'Разобрать инциденты на пост-мортеме',facts:['F5']}]},
 sources:{jira:true,ci:true,monitoring:true,meetings:1,messengers:['Mattermost']},notes:['Сводок встреч за спринт: 1.'],at:'2026-11-12T09:00:00.000Z'};

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js("window.resultKit.availableLinks=async kind=>kind==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:kind==='share-message'?[{id:'mattermost',name:'Mattermost',label:'Отправить в Mattermost'}]:[];0");
 // The app's IPC, as the main process would answer it (votes are stored per retro).
 const {ipcMain}=require('electron'),calls=[];
 let votes={'try-1':['u-masha','u-oleg']};
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name!=='retro')return null;
  calls.push([method,...args]);
  if(method==='votes')return votes;
  if(method==='vote'){const [,item,voter,on]=args;const list=new Set(votes[item]||[]);on?list.add(voter):list.delete(voter);votes={...votes,[item]:[...list]};return votes;}
  return null;
 });
 await js(`view('home');showDialogueMessages([{role:'user',text:'подготовь ретро'},{role:'assistant',text:'Ретро «GAME Sprint 14»: 9 фактов.',by:'Ретро',extensionData:{retroCard:${JSON.stringify(card)}}}],'Ретро')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.retro-card .retro-vote')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.retro-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.retro-velocity-chart .bar').length"),5);
 assert.equal(await js("document.querySelectorAll('.retro-velocity-chart .bar.mine').length"),1);
 assert.equal(await js("document.querySelectorAll('.retro-tile').length"),5);
 assert.equal(await js("document.querySelectorAll('.retro-timeline-chart .dot').length"),6,'a mark per dated fact');
 assert.equal(await js("document.querySelectorAll('.retro-col').length"),3);
 assert.equal(await js("document.querySelectorAll('.retro-item').length"),8);
 assert.equal(await js("document.querySelectorAll('.retro-fact').length"),9);
 assert.equal(await js("document.querySelectorAll('.retro-card script').length"),0,'facts are never HTML');
 assert.match(await js("document.querySelector('[data-fact=\"F8\"] .retro-fact-text').textContent"),/<script>/);
 assert.equal(await js("document.querySelector('.retro-text').closest('[data-no-i18n]')!==null"),true);
 assert.equal(await js("document.querySelector('[data-fact=\"F7\"] a.retro-source').getAttribute('href')"),'https://chat.studio.example/dev/pl/m2');
 assert.equal(await js("document.querySelector('[data-fact=\"F2\"] a.retro-key').getAttribute('href')"),SITE+'/browse/GAME-50');
 // Votes restored from the app and toggled through its IPC.
 for(let i=0;i<100;i++){if(await js("document.querySelector('[data-item=\"try-1\"] .retro-vote')?.textContent.includes('2')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('[data-item=\"try-1\"] .retro-vote').textContent"),/2/);
 assert.equal(await js("document.querySelectorAll('[data-item=\"try-1\"] .retro-voters .kit-person').length"),2);
 await js("document.querySelector('[data-item=\"bad-1\"] .retro-vote').click()");
 for(let i=0;i<50;i++){if(await js("!!document.querySelector('.kit-menu-item')"))break;await new Promise(r=>setTimeout(r,30));}
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.includes('Аня')).click()");
 for(let i=0;i<50;i++){if(await js("document.querySelector('[data-item=\"bad-1\"] .retro-vote').textContent.includes('1')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual(calls.filter(c=>c[0]==='vote'),[['vote','r-ui-1','bad-1','u-anya',true]]);
 // A fact reference highlights the fact.
 await js("document.querySelector('[data-item=\"try-2\"] .retro-ref').click()");
 assert.equal(await js("document.querySelector('[data-fact=\"F4\"]').classList.contains('flash')"),true);
 // Links: per action item and for all of them; nothing is created from the card itself.
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.retro-card .kit-link').length>=5"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.retro-task .kit-link').length"),3);
 const sent=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};const b=[...document.querySelectorAll('.retro-card .kit-actions > button')].find(x=>!x.closest('.kit-links'));b.click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.equal(sent,'Подготовь ретро по спринту «GAME Sprint 14»');
 await js("document.querySelectorAll('.kit-toast').forEach(t=>t.remove())");
 const file=await require('./card-shot.cjs')(win,'.retro-card','petya-retro');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-retro-2.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Retro card ('+file+'): velocity, tiles, timeline, grounded columns, votes, facts with sources, safe text and actions passed');
}};
require('../src/main.cjs');
