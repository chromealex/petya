const assert=require('node:assert/strict');const {Dialogue}=require('../src/dialogue.cjs');const {ChatJobs,eligible}=require('../src/chat-jobs.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let releaseA,releaseB;
 const d=new Dialogue({answer:async text=>new Promise(r=>{if(text==='Первый вопрос')releaseA=r;else releaseB=r;})});
 const manager=new ChatJobs({dialogue:d,scope:()=> 'same'});
 const a=manager.start('','general','Первый вопрос');d.select('');const b=manager.start('','general','Второй вопрос');await tick();
 assert.equal(manager.running,2);assert.equal(d.active().id,b.topicId);assert.throws(()=>manager.start(a.topicId,'general','Ещё вопрос'));
 releaseB('Ответ B');await tick();assert.equal(d.active().messages.at(-1).text,'Ответ B');releaseA('Ответ A');await tick();
 assert.equal(d.active().id,b.topicId);assert.equal(d.state.topics.find(t=>t.id===a.topicId).messages.at(-1).text,'Ответ A');assert.equal(d.state.topics.find(t=>t.id===a.topicId).chatJob.state,'done');
 const finished=d.state.topics.find(t=>t.id===a.topicId);assert.equal(manager.acknowledge(finished.id,finished.chatJob.at-1),false);assert.equal(manager.acknowledge(finished.id,finished.chatJob.at),true);assert.equal(finished.chatJob.acknowledged,true);assert.equal(finished.chatJob.state,'done');manager.update(finished,'attention','Уточните');assert.equal(finished.chatJob.acknowledged,false);
 assert.equal(eligible('Создай задачу в Jira'),false);assert.equal(eligible('Работаем над проектом Test'),false);
 d.active().chatJob={state:'running'};new ChatJobs({dialogue:d,scope:()=> 'same'});assert.equal(d.active().chatJob.state,'attention');
 let scope='a';const e=new Dialogue({answer:async()=>{scope='b';return 'Устаревший ответ';}});const changed=new ChatJobs({dialogue:e,scope:()=>scope});changed.start('','general','Объясни тему');await tick();assert.equal(e.active().chatJob.state,'attention');assert(!e.active().messages.some(m=>m.text==='Устаревший ответ'));
 console.log('Concurrent chats: overlap, reverse completion, isolated history, scope change and restart recovery passed');
})().catch(e=>{console.error(e);process.exit(1)});
