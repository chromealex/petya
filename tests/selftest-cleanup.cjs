const assert=require('node:assert/strict');const feature=require('../src/features/selftest.cjs');
const since=1000;
const state={activeId:'t1',activeProjectId:'p1',projects:[{id:'general',name:'Общее'},{id:'p1',name:'BW'},{id:'pt',name:'Автотест Пети 05.11 03:00:00'},{id:'old',name:'Автотест Пети 04.11 23:00:00',archived:true}],
 topics:[{id:'t1',projectId:'pt',messages:[{role:'user',text:'Привет',at:2000}]},{id:'t2',projectId:'old',messages:[{role:'user',text:'x',at:10}]},
  {id:'git',projectId:'p1',archived:true,title:'Посмотри гит',messages:[{role:'user',text:'Посмотри гит',at:1500}]},
  {id:'agent',projectId:'p1',archived:true,title:'Агент · Slack',messages:[{role:'user',text:'Что нового в Slack',at:1600}]},
  {id:'mine',projectId:'p1',title:'Мои задачи',messages:[{role:'user',text:'Мои задачи',at:500},{role:'assistant',text:'28',at:1700}]},
  {id:'oldgit',projectId:'p1',archived:true,title:'Посмотри гит',messages:[{role:'user',text:'Посмотри гит',at:100},{role:'user',text:'Что нового в Slack',at:101}]},{id:'userSame',projectId:'p1',archived:true,title:'Посмотри гит',messages:[{role:'user',text:'Посмотри гит',at:100}]},
  {id:'userArchived',projectId:'p1',archived:true,title:'Обсуждение релиза',messages:[{role:'user',text:'Обсудим релиз',at:100}]},
  {id:'running',projectId:'pt',messages:[{role:'user',text:'Посмотри гит',at:2000}]}]};
const s={dialogue:{state,persist(){},running:new Set()},chatJobs:{busy:id=>id==='running'}};
const r=feature.setup(s).ipc.cleanup({since,turns:['Посмотри гит','Что нового в Slack'],legacy:true});
assert.deepEqual(state.topics.map(t=>t.id).sort(),['mine','running','userArchived','userSame']);
assert.deepEqual(state.projects.map(p=>p.id),['general','p1','pt']);// pt kept while its job runs
assert.equal(state.activeId,'');assert.equal(state.activeProjectId,'p1');assert.equal(r.chats,5);
console.log('Self-check cleanup: test projects and run chats removed, user chats and running jobs kept passed');
