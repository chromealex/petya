// «Планирование спринта» card in the real chat: velocity bars with the average line, the capacity gauge, people
// lanes, absences with a trash button for chat notes, the proposal with include/exclude switches that recompute
// totals, lanes and the status live, the prepared «Перенести в Jira…» request and safe text.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const SITE='https://studio.atlassian.net';
const url=k=>SITE+'/browse/'+k;
const card={project:'GAME',site:SITE,board:{id:'7',name:'GAME board',url:SITE+'/secure/RapidBoard.jspa?rapidView=7'},estimation:{mode:'points',field:'customfield_10016',label:'Story point estimate'},
 velocity:{average:30,sprints:[['GAME Sprint 10',28,33],['GAME Sprint 11',32,37],['GAME Sprint 12',30,35],['GAME Sprint 13',26,36],['GAME Sprint 14',34,39]].map(([name,completed,committed],i)=>({id:String(10+i),name,completed,committed,unestimated:0,days:10}))},
 active:{id:'15',name:'GAME Sprint 15',end:'2026-11-20T18:00:00Z'},
 next:{id:'16',name:'GAME Sprint 16',start:'2026-11-23T09:00:00Z',end:'2026-12-04T18:00:00Z',workdays:10,exists:true,goal:''},
 capacity:{team:24,full:30,committed:10,proposed:10,left:4},
 people:[{key:'u-masha',name:'Маша Петрова',role:'Клиент',jiraId:'u-masha',days:10,absent:5,full:12,capacity:6,history:true,carry:0,planned:0,proposed:5,load:5,over:false},
  {key:'u-oleg',name:'Олег Смирнов',role:'Сервер',jiraId:'u-oleg',days:10,absent:0,full:10,capacity:10,history:true,carry:5,planned:0,proposed:2,load:7,over:false},
  {key:'u-ivan',name:'Иван Козлов',role:'Геймплей',jiraId:'u-ivan',days:10,absent:0,full:8,capacity:8,history:true,carry:0,planned:3,proposed:3,load:6,over:false}],
 absences:[{id:'n1',member:'u-masha',name:'Маша Петрова',from:'2026-11-23',to:'2026-11-27',kind:'vacation',source:'note',title:''},{id:'',member:'u-oleg',name:'Олег Смирнов',from:'2026-12-03',to:'2026-12-03',kind:'vacation',source:'calendar',title:'Отпуск Олег'}],
 carryOver:[{key:'GAME-50',summary:'Матчмейкинг',estimate:5,status:'In Progress',category:'indeterminate',assigneeId:'u-oleg',assignee:'Олег Смирнов',priority:'High',type:'Story',url:url('GAME-50')},
  {key:'GAME-52',summary:'Логи сервера',estimate:2,status:'To Do',category:'new',assigneeId:'',assignee:'',priority:'Medium',type:'Task',url:url('GAME-52')}],
 planned:[{key:'GAME-60',summary:'Новый босс',estimate:3,status:'To Do',category:'new',assigneeId:'u-ivan',assignee:'Иван Козлов',priority:'Medium',type:'Story',url:url('GAME-60')}],
 proposal:[
  {key:'GAME-71',summary:'Ежедневные награды',estimate:5,status:'To Do',assigneeId:'',assignee:'',proposedId:'u-masha',proposed:'Маша Петрова',priority:'High',url:url('GAME-71'),include:true},
  {key:'GAME-74',summary:'Push-уведомления о событиях клана',estimate:3,status:'To Do',assigneeId:'',assignee:'',proposedId:'u-ivan',proposed:'Иван Козлов',priority:'Medium',url:url('GAME-74'),include:true},
  {key:'GAME-77',summary:'<img src=x onerror=alert(1)> Фикс локализации',estimate:2,status:'To Do',assigneeId:'',assignee:'',proposedId:'u-oleg',proposed:'Олег Смирнов',priority:'Low',url:url('GAME-77'),include:true},
  {key:'GAME-70',summary:'Кланы: список и поиск',estimate:8,status:'To Do',assigneeId:'u-masha',assignee:'Маша Петрова',priority:'High',url:url('GAME-70'),reason:'person-full',person:'Маша Петрова',include:false},
  {key:'GAME-72',summary:'Реплеи боёв',estimate:null,status:'To Do',assigneeId:'',assignee:'',priority:'Medium',url:url('GAME-72'),reason:'unestimated',include:false},
  {key:'GAME-73',summary:'Турниры',estimate:13,status:'To Do',assigneeId:'u-oleg',assignee:'Олег Смирнов',priority:'Medium',url:url('GAME-73'),reason:'no-room',include:false}],
 rationale:['Берём меньше обычного: Маша половину спринта в отпуске.','Риск — перенос матчмейкинга займёт Олега дольше плана.','До старта оцените реплеи — сейчас их нельзя запланировать.'],
 warnings:['Без оценки в бэклоге: 1 — они не планируются, пока их не оценят.'],fromTeam:true,at:'2026-11-12T09:00:00Z',focus:'plan'};

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js(`view('home');showDialogueMessages([{role:'user',text:'спланируй спринт'},{role:'assistant',text:'Скорость за 5 спринтов — в среднем 30 SP.',by:'Планирование спринта',extensionData:{sprintPlan:${JSON.stringify(card)}}}],'Спринт')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.sprint-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.sprint-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.sprint-velocity-chart .sprint-bar').length"),5);
 assert.equal(await js("document.querySelectorAll('.sprint-velocity-chart line.average').length"),1);
 assert.equal(await js("document.querySelectorAll('.sprint-lane').length"),3);
 assert.equal(await js("document.querySelectorAll('.sprint-proposal .sprint-issue').length"),6);
 assert.equal(await js("document.querySelectorAll('.sprint-card img:not(.kit-person img)').length"),0,'issue titles are never HTML');
 assert.equal(await js("document.querySelector('.sprint-gauge-value').textContent.replace(/\\s/g,'')"),'20/24');
 assert.equal(await js("document.querySelector('.kit-head [data-state]')?.dataset.state||document.querySelector('.sprint-card [data-state]').dataset.state"),'fits');
 assert.equal(await js("document.querySelectorAll('.sprint-absence .delete-button').length"),1,'only chat notes can be removed');
 assert.equal(await js("document.querySelector('.sprint-issue[data-key=\"GAME-72\"] input').disabled"),true,'an issue without estimate cannot be planned');
 // Include «Турниры» (13 SP for Олег): over capacity, Олег overloaded, totals recomputed.
 await js("(()=>{const b=document.querySelector('.sprint-issue[data-key=\"GAME-73\"] input');b.checked=true;b.dispatchEvent(new Event('change'));})()");
 assert.equal(await js("document.querySelector('.sprint-gauge-value').textContent.replace(/\\s/g,'')"),'33/24');
 assert.equal(await js("document.querySelector('.sprint-card [data-state]').dataset.state"),'over');
 assert.equal(await js("document.querySelector('.sprint-lane[data-person=\"u-oleg\"]').classList.contains('over')"),true);
 assert.match(await js("document.querySelector('.sprint-lane[data-person=\"u-oleg\"] .sprint-figure').textContent"),/20\s*\/\s*10/);
 // Back to the proposal; then exclude GAME-77: the request carries the chosen keys and proposed assignees only.
 await js("(()=>{for(const k of ['GAME-73','GAME-77']){const b=document.querySelector('.sprint-issue[data-key=\"'+k+'\"] input');b.checked=false;b.dispatchEvent(new Event('change'));}})()");
 assert.equal(await js("document.querySelector('.sprint-gauge-value').textContent.replace(/\\s/g,'')"),'18/24');
 const sent=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};const b=[...document.querySelectorAll('.sprint-card .kit-actions button')].find(x=>x.classList.contains('primary'));b.click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.equal(sent,'Перенеси в спринт «GAME Sprint 16» (доска 7, GAME): GAME-71 → Маша Петрова; GAME-74 → Иван Козлов');
 // Put GAME-77 back for the screenshot.
 await js("(()=>{const b=document.querySelector('.sprint-issue[data-key=\"GAME-77\"] input');b.checked=true;b.dispatchEvent(new Event('change'));})()");
 const file=await require('./card-shot.cjs')(win,'.sprint-card','petya-sprint-planning');
 // The lower half (lists, rationale, warnings, actions): open the lists and scroll the overlay down.
 await js("document.querySelectorAll('.sprint-list').forEach(d=>d.open=true);document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-sprint-planning-2.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Sprint planning card: velocity chart, gauge, lanes, absences, live include/exclude totals, overload and the prepared Jira request passed ('+file+')');
}};
require('../src/main.cjs');
