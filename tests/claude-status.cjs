// Progress of tasks handed to Claude: the task monitor polls Claude chats gently, skipped checks change nothing.
const assert=require('node:assert/strict');
const {TaskMonitor}=require('../src/task-monitor.cjs');
const {handoffStatus}=require('../src/agent-board.cjs');
const {delivery}=require('../src/agent-delivery.cjs');
const {summarize}=require('../src/task-progress.cjs');
(async()=>{
 const DAY=86400000;let now=10*DAY;
 const rows=[
  {id:'c1',target:'claude',state:'submitted',url:'https://claude.ai/chat/1',at:now-3600000},
  {id:'c2',target:'claude',state:'submitted',url:'https://claude.ai/chat/2',at:now-7200000},
  {id:'c3',target:'claude',state:'submitted',at:now-3600000},
  {id:'c4',target:'claude',state:'submitted',url:'https://claude.ai/chat/4',at:now-4*DAY},
  {id:'c5',target:'claude',state:'submitted',url:'https://claude.ai/chat/5',at:now-60000,executionState:'completed'},
  {id:'x1',target:'codex',state:'submitted',threadId:'t',turnId:'u',at:now-60000}];
 const calls=[],notices=[];let answer={status:'inProgress',answer:''},claude=true;
 const monitor=new TaskMonitor({records:()=>rows,save:()=>{},notify:s=>notices.push(s),now:()=>now,claude:()=>claude,
  status:async(row,options)=>{calls.push([row.id,options.background]);return row.target==='codex'?{status:'inProgress'}:answer;}});
 assert.deepEqual(monitor.due().map(r=>r.id),['x1','c1'],'one Claude chat per tick, with a link, in the last 3 days');
 claude=false;assert.deepEqual(monitor.due().map(r=>r.id),['x1'],'off on other platforms or when disabled');claude=true;

 // A skipped check (Claude in front, a draft, not running) changes nothing and is retried later.
 answer={status:'skipped',reason:'Claude на переднем плане'};
 await monitor.tick();
 assert.deepEqual(calls,[['x1',true],['c1',true]]);
 assert.equal(rows[0].executionState,undefined);assert.equal(rows[0].pollError,undefined);assert.equal(notices.length,0);
 assert.deepEqual(monitor.due().map(r=>r.id),['c2'],'the other chat is next; each chat waits 10 minutes');

 // A real status updates the record, keeps the answer and notifies once.
 now+=600000;answer={status:'needsAttention',answer:'Какую ветку взять?'};
 await monitor.tick();
 const asked=rows.find(r=>r.executionState==='needsAttention');assert.equal(asked.resultText,'Какую ветку взять?');
 assert.equal(notices.length,1);assert.match(notices[0],/нужно ваше решение/);
 assert.deepEqual(handoffStatus(asked,now),['waiting','Нужно твоё решение']);
 assert.match(summarize(asked).text,/ждёт твоего решения/);

 // A failing helper is reported once, naming Claude.
 now+=600000;answer=null;const failing=new TaskMonitor({records:()=>rows,save:()=>{},notify:s=>notices.push(s),now:()=>now,claude:()=>true,status:async row=>{if(row.target==='claude')throw Error('helper');return {status:'inProgress'};}});
 await failing.tick();assert.match(notices.at(-1),/доступ к Claude/);

 // The board: a Claude chat with a link waits for Petya's check for 3 days.
 assert.deepEqual(handoffStatus({target:'claude',state:'submitted',url:'u',at:now-2*DAY},now),['sent','Отправлена в чат · Петя проверит ход работы']);
 assert.equal(handoffStatus({target:'claude',state:'submitted',at:now-2*DAY},now)[0],'done');
 assert.deepEqual(handoffStatus({target:'claude',state:'submitted',url:'u',at:now,executionState:'completed'},now),['done','Работа завершена']);

 // Delivery: a Claude status needs the chat link; nothing is spawned without it.
 const d=delivery({semantic:async()=>null,onEvent:()=>{}});
 await assert.rejects(d.status({id:'r',target:'claude'}),/Ссылка на чат Claude/);
 if(process.platform!=='darwin')await assert.rejects(d.status({id:'r',target:'claude',url:'https://claude.ai/chat/1'}),/macOS/);
 console.log('Claude status: gentle polling, skipped checks, statuses, answer, notices and board passed');
})().catch(e=>{console.error(e);process.exit(1);});
