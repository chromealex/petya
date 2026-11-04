// Ten chats served at once by the full request pipeline: each answer lands in its own chat,
// in any completion order, without moving the user's selection and without cross-talk.
const assert=require('node:assert/strict');
const {Dialogue,RAW}=require('../src/dialogue.cjs');const {ChatJobs,eligible}=require('../src/chat-jobs.cjs');
const tick=()=>new Promise(r=>setImmediate(r));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const seen=[];let concurrent=0,peak=0;
 const d=new Dialogue({answer:async(text,topic)=>{concurrent++;peak=Math.max(peak,concurrent);
  // Every await point is a chance for another chat to run; the active chat must stay this one.
  const mine=d.active().id;assert.equal(topic.id,mine);await sleep(5+Math.random()*30);
  assert.equal(d.active().id,mine,'scope survives async work');seen.push(mine);concurrent--;return 'Ответ на «'+text+'»';}});
 // The pipeline stand-in uses only dialogue.active(), like the real one.
 const converse=async text=>{const before=d.active()?.id;const result=await d.turn(text,undefined,'chat');assert.equal(d.active().id,result.topicId);if(before)assert.equal(result.topicId,before);return result;};
 const jobs=new ChatJobs({dialogue:d,scope:()=>'same',converse});
 const started=[];for(let i=1;i<=12;i++){d.select('');started.push(jobs.start('','general','Вопрос '+i));}
 const userChat=d.state[RAW].activeId;
 await tick();assert.equal(jobs.running,10,'ten chats run at once, the rest wait');
 for(let i=0;i<200&&jobs.jobs.size;i++)await sleep(10);
 assert.equal(jobs.jobs.size,0);assert(peak>=10,'answers overlapped');
 for(const [i,s] of started.entries()){const t=d.state.topics.find(t=>t.id===s.topicId);
  assert.deepEqual(t.messages.map(m=>[m.role,m.text]),[['user','Вопрос '+(i+1)],['assistant','Ответ на «Вопрос '+(i+1)+'»']],'chat '+(i+1)+' got only its own question and answer');
  assert.equal(t.chatJob.state,'done');assert(!t.messages.some(m=>m.pending));}
 assert.equal(d.state[RAW].activeId,userChat,'background answers never move the user');
 // Navigation works while chats are answering; a running chat cannot be moved.
 let release;const slow=new Dialogue({answer:()=>new Promise(r=>release=r)});const slowJobs=new ChatJobs({dialogue:slow,scope:()=>'same',converse:text=>slow.turn(text,undefined,'chat')});
 const s=slowJobs.start('','general','Долгий вопрос');await tick();
 const shown=slow.state.topics.find(t=>t.id===s.topicId).messages;assert.deepEqual(shown.map(m=>[m.role,m.text]),[['user','Долгий вопрос']],'the question is visible while the answer is prepared');
 slow.projectCreate('Второй');slow.projectSelect('general');slow.select(s.topicId);assert.throws(()=>slowJobs.start(s.topicId,'general','Ещё'),/уже выполняется/);
 release('Готово');for(let i=0;i<50&&slowJobs.jobs.size;i++)await sleep(5);assert.equal(slow.active().messages.at(-1).text,'Готово');assert.deepEqual(slow.active().messages.map(m=>m.role),['user','assistant'],'no duplicated question');
 // A request that waits for the user is marked for attention with its choices kept.
 const ask=new Dialogue({answer:async()=>({text:'Какой проект?',question:true,clarificationOptions:['Альфа','Бета']})});const askJobs=new ChatJobs({dialogue:ask,scope:()=>'same',converse:text=>ask.turn(text,undefined,'chat')});
 const q=askJobs.start('','general','Покажи статус');for(let i=0;i<50&&askJobs.jobs.size;i++)await sleep(5);const qt=ask.state.topics.find(t=>t.id===q.topicId);
 assert.equal(qt.chatJob.state,'attention');assert.deepEqual(qt.lastChatResult.clarificationOptions,['Альфа','Бета']);
 // Only UI-driven action flows stay in the foreground.
 assert.equal(eligible('Создай задачу в Jira',null,true),false);for(const text of ['Найди в телеграме Машку','Покажи статус гита','Что в Slack нового?','Посмотри почту'])assert.equal(eligible(text,null,true),true,text);
 console.log('Parallel chats: 10 at once with a queue, isolated answers, any completion order, free navigation, clarifications and foreground actions passed');
})().catch(e=>{console.error(e);process.exit(1);});
