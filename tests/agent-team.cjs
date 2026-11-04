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
 // single task → normal pipeline; agent chats never spawn agents
 const one=new AgentTeam({dialogue,jobs,plan:async()=>({tasks:[{title:'x',request:'Мои задачи',action:false}]}),summarize:async()=>''});assert.equal(await one.turn('Раздай агентам мои задачи',topic),null);
 assert.equal(await team.turn('Раздай агентам: a и b',state.topics.find(t=>t.id==='c1')),null);
 // stop
 const team2=new AgentTeam({dialogue,jobs,interval:1000,plan:async()=>({tasks:[{title:'a',request:'A?',action:false},{title:'b',request:'B?',action:false}]}),summarize:async()=>''});
 const r2=await team2.turn('Сделай параллельно: A и B',topic);assert.equal(team2.stop(r2.agentPlan.id).stopped,2);for(const e of team2.active.values())clearTimeout(e.timer);team2.active.clear();
 console.log('Agent team: detection, plan to parallel chats, actions held for the user, live states, combined answer, no nesting and stop passed');
})().catch(e=>{console.error(e);process.exit(1);});
