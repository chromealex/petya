// Task runner plugin: plan in a separate chat, corrections revise it, approval runs steps through agents in order.
const assert=require('node:assert/strict');
const runner=require('../src/extensions/task-runner/feature.cjs');
const plans=require('../src/extensions/task-runner/plan.cjs');
(async()=>{
 const state={topics:[{id:'src',projectId:'p1',title:'Задачи',messages:[],at:1}],activeId:'src',activeProjectId:'p1'};
 const dialogue={state,active:()=>state.topics.find(t=>t.id===state.activeId),persist(){}};
 let modelReply={summary:'Убрать дубликат и добавить проверку в CI.',steps:[{title:'Воспроизвести падение',details:'Собрать release',check:'Ошибка видна'},{title:'Удалить дубликат ic_logo',details:'',check:'Сборка проходит'}],questions:['Какой CI?']};
 const records=[];let routeTarget='codex',statuses={};
 const agents={records,persist(){},create(target,prompt){const r={id:'r'+(records.length+1),target,prompt,state:'ready'};records.push(r);return r;},
  async route(id,preferred){const r=records.find(x=>x.id===id);r.target=preferred||routeTarget;r.state=r.target==='codex'?'submitted':'send-required';r.url=r.target==='codex'?'codex://threads/t'+id:'';return {record:r,ready:true};},
  delivery:{async status(r){return statuses[r.id]||{status:'inProgress'};}}};
 const s={dialogue,agents,smoke:true,settings:{model:'m',ollamaUrl:'http://127.0.0.1:11434'},core:{localEndpoint:u=>u+'/api/chat'},
  modules:{assertEnabled(settings,id){if(id!=='ai')throw Error('module');}},requestProgress:{report(){}},
  async request(url,options){const body=JSON.parse(options.body);assert.equal(body.format,'json');return {message:{content:JSON.stringify(modelReply)}};}};
 const {taskRunner,ipc}=runner.setup(s);
 const started=await taskRunner.start({app:'jira',key:'MOB-311',title:'Сборка Android падает',type:'Баг',description:'mergeReleaseResources: duplicate ic_logo',url:'https://acme.atlassian.net/browse/MOB-311'});
 const topic=state.topics.find(t=>t.id===started.topicId);
 assert.ok(topic&&topic.id!=='src','a separate chat');assert.equal(state.activeId,topic.id);assert.equal(topic.projectId,'p1');
 assert.match(topic.title,/^Исправить MOB-311/);assert.equal(topic.taskRun.task.kind,'bug');
 assert.equal(topic.messages.at(-1).extensionData.taskRun.version,1);
 // Same task again reopens the open run.
 state.activeId='src';assert.equal((await taskRunner.start({app:'jira',key:'MOB-311',title:'x'})).reopened,true);assert.equal(state.activeId,topic.id);
 // A message while the plan is open revises it.
 modelReply={summary:'Сначала тест.',steps:[{title:'Написать тест на дубликаты'},{title:'Удалить дубликат'},{title:'Проверить сборку'}]};
 const revised=await runner.turn(s,'сначала тест, потом фикс');
 assert.equal(topic.taskRun.version,2);assert.equal(topic.taskRun.plan.steps.length,3);assert.deepEqual(topic.taskRun.feedback,['сначала тест, потом фикс']);
 assert.equal(revised.by,'план работ');
 // «Утверждаю» approves; steps go one by one.
 const approved=await runner.turn(s,'Утверждаю');assert.match(approved.text,/утвержд/);
 let view=ipc.status(topic.taskRun.id);assert.equal(view.state,'running');
 assert.deepEqual(view.plan.steps.map(x=>x.state),['running','waiting','waiting']);
 assert.match(records[0].prompt,/шаг 1: Написать тест/i);assert.match(records[0].prompt,/← сейчас/);
 assert.equal(await runner.turn(s,'ещё правка'),null,'no revisions after approval');
 // Codex reports completion: the next step starts by itself.
 statuses.r1={status:'completed',answer:'Тест добавлен'};await taskRunner.poll();
 view=ipc.status(topic.taskRun.id);
 assert.deepEqual(view.plan.steps.map(x=>x.state),['done','running','waiting']);assert.equal(view.plan.steps[0].result,'Тест добавлен');
 statuses.r2={status:'needsAttention'};await taskRunner.poll();assert.equal(ipc.status(topic.taskRun.id).plan.steps[1].state,'attention');
 // Claude has no status: the step waits for «Шаг готов».
 routeTarget='claude';topic.taskRun.agent='auto';
 view=await ipc.stepDone(topic.taskRun.id,'s2');
 assert.equal(view.plan.steps[2].state,'sent');
 view=await ipc.stepDone(topic.taskRun.id,'s3');
 assert.equal(view.state,'done');assert.match(topic.messages.at(-1).text,/Все шаги/);
 // Without a model the plan has one step for the whole task.
 const fallback=plans.normalize(null,{kind:'feature',title:'Push при победе',description:'Отправлять push'});
 assert.equal(fallback.steps.length,1);assert.match(fallback.steps[0].title,/^Реализовать/);
 // Stop leaves waiting steps skipped.
 modelReply={steps:[{title:'A'},{title:'B'}]};state.activeId='src';routeTarget='codex';
 const second=await taskRunner.start({app:'jira',key:'MOB-325',title:'Push',type:'Задача'});
 const t2=state.topics.find(t=>t.id===second.topicId);await ipc.approve(t2.taskRun.id,'codex');
 view=ipc.stop(t2.taskRun.id);assert.equal(view.state,'stopped');assert.equal(view.plan.steps[1].state,'skipped');
 await assert.rejects(()=>ipc.approve(t2.taskRun.id,'codex'),/утверждён/);
 console.log('Task runner: separate chat, reopen, revisions, approval, sequential steps, Claude manual step, stop passed');
})().catch(e=>{console.error(e);process.exit(1);});
