const assert=require('node:assert/strict');const {Dialogue}=require('../src/dialogue.cjs');const {ChatJobs,eligible}=require('../src/chat-jobs.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let releaseA,releaseB;
 const d=new Dialogue({answer:async text=>new Promise(r=>{if(text==='Первый вопрос')releaseA=r;else releaseB=r;})});
 const manager=new ChatJobs({dialogue:d,scope:()=> 'same'});
 const a=manager.start('','general','Первый вопрос');d.select('');const b=manager.start('','general','Второй вопрос');await tick();
 const activeTopic=d.state.topics.find(t=>t.id===a.topicId);
 manager.update(activeTopic,'running','Читаю контекст');manager.update(activeTopic,'running','Читаю контекст');manager.update(activeTopic,'running','Готовлю ответ');
 assert.equal(activeTopic.chatJob.steps.filter(s=>s.label==='Читаю контекст').length,1);assert(activeTopic.chatJob.steps.at(-2).done);assert.equal(activeTopic.chatJob.steps.at(-1).label,'Готовлю ответ');
 assert(!d.active().chatJob.steps.some(s=>s.label==='Читаю контекст'));
 assert.equal(manager.running,2);assert.equal(d.active().id,b.topicId);assert.throws(()=>manager.start(a.topicId,'general','Ещё вопрос'));
 releaseB('Ответ B');await tick();assert.equal(d.active().messages.at(-1).text,'Ответ B');releaseA('Ответ A');await tick();
 assert.equal(d.active().id,b.topicId);assert.equal(d.state.topics.find(t=>t.id===a.topicId).messages.at(-1).text,'Ответ A');assert.equal(d.state.topics.find(t=>t.id===a.topicId).chatJob.state,'done');
 const finished=d.state.topics.find(t=>t.id===a.topicId);assert.equal(manager.acknowledge(finished.id,finished.chatJob.at-1),false);assert.equal(manager.acknowledge(finished.id,finished.chatJob.at),true);assert.equal(finished.chatJob.acknowledged,true);assert.equal(finished.chatJob.state,'done');manager.update(finished,'attention','Уточните');assert.equal(finished.chatJob.acknowledged,false);
 finished.lastChatResult={question:true,text:'Выбери проект',options:[{id:'a',label:'A'}]};
 const final={handled:true,text:'Последний тег: release-1.18.11'};
 assert(manager.finishForeground(finished.id,'done',final));assert.equal(finished.lastChatResult.question,undefined);assert.equal(finished.lastChatResult.options,undefined);assert.equal(finished.lastChatResult.text,final.text);assert(finished.chatJob.finishedAt>=finished.chatJob.startedAt);
 const question={handled:true,question:true,text:'Какой проект?',options:[{id:'b',label:'B'}]};manager.finishForeground(finished.id,'attention',question);assert.deepEqual(finished.lastChatResult.options,question.options);assert.equal(finished.chatJob.label,'Нужно уточнение');
 manager.finishForeground(finished.id,'done');assert.equal(finished.lastChatResult,undefined);
 assert.equal(eligible('Создай задачу в Jira'),false);assert.equal(eligible('Работаем над проектом Test'),false);
 d.active().chatJob={state:'running'};new ChatJobs({dialogue:d,scope:()=> 'same'});assert.equal(d.active().chatJob.state,'attention');
 let scope='a';const e=new Dialogue({answer:async()=>{scope='b';return 'Устаревший ответ';}});const changed=new ChatJobs({dialogue:e,scope:()=>scope});changed.start('','general','Объясни тему');await tick();assert.equal(e.active().chatJob.state,'attention');assert(!e.active().messages.some(m=>m.text==='Устаревший ответ'));
 // An answer the pipeline also wrote into another chat (an existing «Задачи в Jira») stays in the asking chat; the
 // viewer is never moved, the other chat is only offered.
 for(const fresh of [false,true]){const f=new Dialogue({answer:async()=>''});const now=Date.now();const tasks={id:'tasks-topic',projectId:'general',title:'Задачи в Jira',kind:'tasks',messages:[{role:'assistant',text:'старый',at:now}],at:now};f.state.topics.push(tasks);
  let asking=null;if(!fresh){asking={id:'asking',projectId:'general',title:'Разговор',kind:'chat',messages:[{role:'user',text:'Привет',at:now},{role:'assistant',text:'Привет!',at:now}],at:now};f.state.topics.push(asking);f.state.activeId=asking.id;}
  const events=[];const m=new ChatJobs({dialogue:f,scope:()=> 'same',emit:e=>events.push(e),converse:async()=>({handled:true,text:'Задачи в статусе New: 2',topicId:'tasks-topic'})});
  const started=m.start(asking?.id||'','general','какие таски на мне в new');for(let i=0;i<5;i++)await tick();
  const here=f.state.topics.find(t=>t.id===started.topicId);assert(here,'asking chat removed');assert(!events.some(e=>e.movedTo),'viewer moved to another chat');
  assert.equal(here.messages.at(-1).text,'Задачи в статусе New: 2');assert.equal(here.messages.at(-2).text,'какие таски на мне в new');assert.deepEqual(here.messages.at(-1).chatOffer,{topicId:'tasks-topic',title:'Задачи в Jira'});assert.equal(here.chatJob.state,'done');}
 console.log('Concurrent chats: overlap, reverse completion, isolated history, scope change and restart recovery passed');
})().catch(e=>{console.error(e);process.exit(1)});
