const assert=require('node:assert/strict');const {agentRequest,AgentTeam}=require('../src/agent-team.cjs');
(async()=>{
 for(const t of ['Раздай агентам: проверь баги в BW, собери статус MW2 и посмотри, что нового в Slack','Сделай параллельно: мои задачи и сводку по слаку','Петя, запусти агентов на это','1. Проверь баги BW\n2. Что нового в Slack'])assert(agentRequest(t),t);
 for(const t of ['Покажи мои задачи','Передай Codex задачу BW-1','Что такое агенты?','Не раздавай агентам'])assert(!agentRequest(t),t);
 const state={topics:[],projects:[{id:'p'}]},topic={id:'parent',projectId:'p',messages:[],title:'T'};state.topics.push(topic);
 const dialogue={state,persist(){}};const started=[],cancelled=[],events=[];let n=0;
 const jobs={start(id,projectId,text){if(/создай/i.test(text))return {foreground:true};const t={id:'c'+(++n),projectId,messages:[{role:'user',text}],chatJob:{state:'queued',label:'В очереди'}};state.topics.push(t);started.push(t);return {topicId:t.id};},cancel(id){cancelled.push(id);return true;},update(t,s,l){t.chatJob={state:s,label:l};}};
 let summarized;
 const team=new AgentTeam({dialogue,jobs,interval:5,emit:e=>events.push(e),plan:async()=>({tasks:[{title:'Баги BW',request:'Какие баги открыты в BW?',action:false},{title:'Slack',request:'Что нового в Slack?',action:false},{title:'Задача',request:'Создай задачу в BW',action:true},{title:'Задача 2',request:'Создай задачу в MW2',action:false}]}),summarize:async(c,r)=>{summarized=r;return 'Итог: всё проверено.';}});
 const r=await team.turn('Раздай агентам: баги BW, Slack и создай задачу',topic);
 assert(r.handled&&r.agentPlan.tasks.length===4);assert.equal(started.length,2);
 assert.equal(r.agentPlan.tasks[2].state,'action');assert.equal(r.agentPlan.tasks[3].state,'action');
 assert.equal(state.topics.find(t=>t.id==='c1').agentOf,'parent');assert.match(state.topics.find(t=>t.id==='c1').title,/^Агент · /);
 assert.equal(topic.chatJob.state,'running');
 // children finish
 for(const c of started){c.chatJob={state:'running',label:'Обращаюсь к Jira'};}
 await new Promise(r=>setTimeout(r,20));assert.equal(r.agentPlan.tasks[0].label,'Обращаюсь к Jira');
 started[0].messages.push({role:'assistant',text:'В BW 3 бага.'});started[0].chatJob={state:'done',label:'Готово'};
 started[1].messages.push({role:'assistant',text:'Нужно уточнение'});started[1].chatJob={state:'attention',label:'Нужно уточнение'};
 await new Promise(r=>setTimeout(r,60));
 assert.equal(r.agentPlan.state,'done');assert.equal(topic.messages.at(-1).text,'Итог: всё проверено.');assert.equal(summarized[0].answer,'В BW 3 бага.');assert.equal(summarized[1].state,'attention');
 assert.equal(topic.chatJob.state,'done');assert(events.some(e=>e.agentPlan));
 // the answer may land in another chat
 {const team3=new AgentTeam({dialogue,jobs,interval:5,plan:async()=>({tasks:[{title:'a',request:'Мои задачи?',action:false},{title:'b',request:'B?',action:false}]}),summarize:async(c,r)=>r.map(x=>x.state+':'+x.answer).join('|')});
  const r3=await team3.turn('Сделай параллельно: мои задачи и B',topic);const [a,b]=r3.agentPlan.tasks;
  state.topics.splice(state.topics.findIndex(t=>t.id===a.topicId),1);state.topics.push({id:'tasks',messages:[{role:'assistant',text:'28 задач'}],chatJob:{command:'Мои задачи?',startedAt:Date.now(),state:'done'}});
  const bt=state.topics.find(t=>t.id===b.topicId);bt.messages.push({role:'assistant',text:'ok'});bt.chatJob={state:'done'};
  await new Promise(r=>setTimeout(r,60));assert.equal(a.topicId,'tasks');assert.equal(topic.messages.at(-1).text,'done:28 задач|done:ok');}
 // offer: ask, run, single answer, remember
 {const {complexRequest,OFFER}=require('../src/agent-team.cjs');assert(complexRequest('Подготовь отчёт по релизу: что закрыто в Jira, что обсуждали в Slack и что изменилось в гите'));assert(complexRequest('Покажи мои задачи и что нового в слаке'));assert(!complexRequest('Покажи мои задачи в работе'));assert(!complexRequest('Какие баги открыты в BW и MW2?'));
  let mode='ask';const t4={id:'p4',projectId:'p',messages:[],title:'T4'};state.topics.push(t4);
  const team4=new AgentTeam({dialogue,jobs,interval:5,preference:()=>mode,remember:v=>{mode=v;},plan:async()=>({tasks:[{title:'Задачи',request:'Покажи мои задачи',action:false},{title:'Slack',request:'Что нового в Slack?',action:false}]}),summarize:async()=>'итог'});
  const ask=await team4.offer('Покажи мои задачи и что нового в слаке',t4);assert(ask.question);assert.deepEqual(ask.clarificationOptions,Object.values(OFFER));assert.match(ask.text,/1\. Задачи/);assert.equal(t4.messages.length,2);
  const single=await team4.offer('Ответить одним сообщением',t4);assert.equal(single.continueWith,'Покажи мои задачи и что нового в слаке');assert.equal(t4.messages.length,0);assert.equal(await team4.offer(single.continueWith,t4),null);
  await team4.offer('Покажи мои задачи и что нового в слаке',t4);const run=await team4.offer('Всегда раздавать',t4);assert(run.agentPlan);assert.equal(mode,'always');assert.match(run.text,/Запомнил/);
  const auto=await team4.offer('Покажи мои задачи и что нового в слаке',t4);assert(auto.agentPlan);
  assert.match((await team4.offer('Спрашивай про агентов',t4)).text,/снова буду спрашивать/);assert.equal(mode,'ask');
  await team4.offer('Покажи мои задачи и что нового в слаке',t4);assert.equal((await team4.offer('Нет, одним',t4)).continueWith,'Покажи мои задачи и что нового в слаке');await team4.offer('Покажи мои задачи и что нового в слаке',t4);
  await team4.offer('Покажи мои задачи и что нового в слаке',t4);assert((await team4.offer('Петя, раздай',t4)).agentPlan);
  await team4.offer('Покажи мои задачи и что нового в слаке',t4);await team4.offer('никогда не раздавай',t4);assert.equal(mode,'never');
  mode='never';assert.equal(await team4.offer('Покажи мои задачи и что нового в слаке',t4),null);
  for(const e of team4.active.values())clearTimeout(e.timer);team4.active.clear();}
 // single task → normal pipeline; agent chats never spawn agents
 const one=new AgentTeam({dialogue,jobs,plan:async()=>({tasks:[{title:'x',request:'Мои задачи',action:false}]}),summarize:async()=>''});assert.equal(await one.turn('Раздай агентам мои задачи',topic),null);
 assert.equal(await team.turn('Раздай агентам: a и b',state.topics.find(t=>t.id==='c1')),null);
 // stop
 const team2=new AgentTeam({dialogue,jobs,interval:1000,plan:async()=>({tasks:[{title:'a',request:'A?',action:false},{title:'b',request:'B?',action:false}]}),summarize:async()=>''});
 const r2=await team2.turn('Сделай параллельно: A и B',topic);assert.equal(team2.stop(r2.agentPlan.id).stopped,2);for(const e of team2.active.values())clearTimeout(e.timer);team2.active.clear();
 {const {enumerated}=require('../src/agent-team.cjs');const e=enumerated('Раздай агентам: 1) какие задачи на мне в работе, 2) что нового в Slack, 3) какая версия проекта');assert.deepEqual(e.tasks.map(t=>t.request),['Какие задачи на мне в работе','Что нового в Slack','Какая версия проекта']);
  assert.equal(enumerated('1. Проверь баги BW\n2. Создай задачу на ANR').tasks[1].action,true);assert.equal(enumerated('Раздай агентам проверку багов и статус'),null);}
 console.log('Agent team: detection, plan to parallel chats, actions held for the user, live states, combined answer, no nesting and stop passed');
})().catch(e=>{console.error(e);process.exit(1);});
