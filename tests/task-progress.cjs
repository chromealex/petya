const assert=require('node:assert/strict');const {candidates,isProgress,summarize}=require('../src/task-progress.cjs');const {CodexClient}=require('../src/codex-client.cjs');
(async()=>{
 const rows=[{id:'a',at:1,keys:['A-1'],state:'submitted',command:'Первая'},{id:'b',at:2,keys:['B-2'],state:'submitted',command:'Вторая'}];
 assert(isProgress('Чем закончилась та задача?'));assert(isProgress('что с задачей A-1'));assert(!isProgress('создай задачу'));
 assert.equal(candidates('чем закончилась задача',rows).length,2);assert.equal(candidates('последняя задача',rows,'A')[0].id,'a');assert.equal(candidates('статус A-1',rows)[0].id,'a');
 assert(summarize(rows[0]).text.includes('завершение пока не подтверждено'));assert(summarize(rows[0],{status:'completed',answer:'Сделано'}).text.includes('Проверено сейчас'));assert(summarize(rows[0],null,'нет доступа').text.includes('Свежий статус недоступен'));
 const c=new CodexClient();c.ready=async()=>{};c.rpc=async(method,params)=>{assert.equal(method,'thread/read');assert.equal(params.includeTurns,true);return {thread:{turns:[{id:'first',status:'completed',items:[{type:'agentMessage',text:'Правильный результат'}]},{id:'later',status:'failed',items:[]}]}};};
 assert.equal((await c.status({threadId:'chat',turnId:'first'})).answer,'Правильный результат');await assert.rejects(c.status({threadId:'chat',turnId:'missing'}),/не найден/);
 console.log('Task progress: ambiguity, project scope, live vs cached, exact turn, missing history passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
