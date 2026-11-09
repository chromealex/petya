// Agent board: tasks of Petya, the Programmer, Claude and Codex with one set of statuses.
const assert=require('node:assert/strict');
const {board}=require('../src/agent-board.cjs');
const DAY=86400000,now=10*DAY;
const projects=[{id:'p',name:'Bunker Wars'},{id:'z',name:'Автотест Пети 05.11',archived:true}];
const parent={id:'parent',projectId:'p',title:'Сводка',messages:[{role:'assistant',agentPlan:{id:'plan',state:'running',startedAt:now-60000,tasks:[
 {title:'Баги',request:'Какие баги открыты?',state:'running',topicId:'child'},
 {title:'Задача',request:'Создай задачу на релиз',state:'action',label:'Меняет данные — запусти сам, когда проверишь'}]}}],
 chatJob:{state:'running',label:'Агенты: готово 0 из 1',command:'Раздай агентам: баги и задача',startedAt:now-60000,at:now-1000}};
const topics=[parent,
 {id:'child',projectId:'p',title:'Агент · Баги',agentOf:'parent',messages:[],chatJob:{state:'running',label:'Обращаюсь к Jira',command:'Какие баги открыты?',startedAt:now-50000,at:now-2000,steps:[{label:'a'},{label:'b'}]}},
 {id:'bg',projectId:'p',title:'Фон',messages:[],chatJob:{state:'queued',command:'Что нового в Slack?',startedAt:now-5000,at:now-5000}},
 {id:'old',projectId:'p',title:'Старый',messages:[],chatJob:{state:'done',label:'Готово',command:'Давно',at:now-9*DAY}},
 {id:'gone',projectId:'p',title:'Архив',archived:true,messages:[],chatJob:{state:'running',command:'x',at:now}},
 {id:'test',projectId:'z',title:'Автотест',messages:[],chatJob:{state:'attention',label:'Нужно уточнение',command:'Уменьши 2000 на 15%',at:now}},
 {id:'code',projectId:'p',title:'Код',messages:[],codingRuns:[
  {id:'r1',state:'review',title:'Исправить падение',repo:'/Users/a/petya',branch:'petya/fix',files:['a.js','b.js'],at:now-3000},
  {id:'r2',state:'merged',title:'Добавить тест',repo:'/Users/a/petya',branch:'petya/test',at:now-DAY},
  {id:'r3',state:'running',title:'Новый модуль',repo:'C:\\work\\petya',branch:'petya/mod',at:now-100}]}];
const records=[
 {id:'a1',target:'claude',state:'submitted',at:now-3600000,command:'Почини сборку',keys:['BW-1'],url:'https://claude.ai/chat/1',originTopicId:'parent'},
 {id:'a2',target:'claude',state:'submitted',at:now-3*DAY,command:'Старое поручение',keys:[]},
 {id:'a3',target:'codex',state:'submitted',executionState:'inProgress',at:now-600000,command:'Обнови зависимости',keys:[],project:{name:'petya'}},
 {id:'a4',target:'codex',state:'submitted',executionState:'needsAttention',at:now-700000,command:'Перенеси API',keys:[]},
 {id:'a5',target:'codex',state:'failed',error:'Нет приложения',at:now-800000,command:'Сломалось',keys:[]},
 {id:'a6',target:'auto',state:'routing',at:now-900000,keys:['BW-7'],command:''},
 {id:'a7',target:'codex',state:'expired',at:now-DAY,keys:[]},
 {id:'a8',target:'codex',state:'submitted',executionState:'completed',at:now-20*DAY,checkedAt:now-20*DAY,command:'Давнее',keys:[]}];
const b=board({records,topics,projects,now});
const lane=id=>b.lanes.find(l=>l.id===id);
assert.deepEqual(b.lanes.map(l=>l.id),['petya','coder','claude','codex']);

// Petya: the coordinator chat, its agent, a queued background chat and the subtask that waits for the user.
const petya=lane('petya').tasks;
assert.deepEqual(petya.map(t=>t.status),['waiting','running','running','queued']);
assert.equal(petya[0].title,'Создай задачу на релиз');assert.equal(petya[0].parent,'Сводка');
const agent=petya.find(t=>t.open.id==='child');assert.equal(agent.role,'Агент');assert.equal(agent.parent,'Сводка');assert.equal(agent.label,'Обращаюсь к Jira');assert.equal(agent.steps,2);assert.equal(agent.project,'Bunker Wars');
assert(!petya.some(t=>t.open.id==='old'),'finished tasks older than a week are hidden');
assert(!petya.some(t=>t.open.id==='gone'),'archived chats are hidden');
assert(!petya.some(t=>t.open.id==='test'),'chats of archived projects are hidden');
assert.equal(lane('petya').active,4);

// Programmer: waiting for a decision first, then running; the merged run is done.
const coder=lane('coder').tasks;
assert.deepEqual(coder.map(t=>t.status),['waiting','running','done']);
assert.equal(coder[0].files,2);assert.equal(coder[0].repo,'petya');assert.equal(coder[1].repo,'petya');assert.deepEqual(coder[0].open,{kind:'chat',id:'code'});

// Claude: a fresh handoff is «sent» (progress not readable), an old one is no longer active; the unrouted one waits.
const claude=lane('claude').tasks;
assert.deepEqual(claude.map(t=>[t.id,t.status]),[['agent:a6','waiting'],['agent:a1','sent'],['agent:a2','done']]);
assert.equal(claude[0].unassigned,true);assert.equal(claude[0].title,'BW-7');
assert.deepEqual(claude[1].open,{kind:'agent',id:'a1',chat:true,origin:'parent'});
assert.equal(lane('claude').active,2);

// Codex: execution states from the task monitor; expired and long-finished records are left out.
const codex=lane('codex').tasks;
assert.deepEqual(codex.map(t=>[t.id,t.status]),[['agent:a4','waiting'],['agent:a3','running'],['agent:a5','failed']]);
assert.equal(codex[1].project,'petya');assert.equal(codex[2].label,'Нет приложения');

assert.equal(b.totals.waiting,4);assert.equal(b.active,4+2+2+2);
assert.equal(board({now}).active,0);
console.log('agent-board ok');
