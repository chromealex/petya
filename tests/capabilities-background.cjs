const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs'),{ChatJobs}=require('../src/chat-jobs.cjs'),{localAnswer}=require('../src/dialogue-answer.cjs');
(async()=>{
 let requests=0;
 const d=new Dialogue({answer:(command,topic)=>localAnswer({command,topic,settings:{},skills:[],request:()=>{requests++;throw Error('Capabilities must not call LLM');}})});
 const jobs=new ChatJobs({dialogue:d,scope:()=> 'test'});
 async function turn(text,id=''){
  const result=jobs.start(id,'general',text);assert(!result.foreground);
  while(jobs.any())await new Promise(r=>setTimeout(r,5));
  const topic=d.state.topics.find(t=>t.id===result.topicId);assert.equal(topic.chatJob.state,'done');return topic;
 }
 let topic=await turn('Что ты умеешь?');const first=topic.messages.at(-1).text;assert.match(first,/Jira/);assert.match(first,/навык/);assert(!/по проектам BW и MW2/iu.test(first));
 topic=await turn('А что еще?',topic.id);const second=topic.messages.at(-1).text;assert.match(second,/примеры/);assert.notEqual(second,first);
 topic=await turn('А ещё что?',topic.id);assert.match(topic.messages.at(-1).text,/SKILL.md/);
 topic=await turn('Это все?',topic.id);assert(topic.messages.at(-1).text.length>60);
 topic=await turn('Что нет?',topic.id);assert.match(topic.messages.at(-1).text,/Уточню/);
 topic=await turn('Покажи',topic.id);assert.match(topic.messages.at(-1).text,/примеры/);
 assert.equal(requests,0);
 const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../src/main.cjs'),'utf8');const begin=source.indexOf('answer:async(command,topic,unclear)=>');assert(source.indexOf("capabilities-reply.cjs').answer",begin)<source.indexOf('if(topic.attachments?.length)',begin));
 console.log('Real background ChatJobs -> Dialogue -> localAnswer: capabilities, follow-ups and no model calls passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
