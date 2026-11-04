const assert=require('node:assert/strict');
const {Dialogue}=require('../src/dialogue.cjs');
const {ChatJobs}=require('../src/chat-jobs.cjs');
const cancel=require('../src/answer-cancel.cjs');
const {CommandProgress}=require('../src/ui/command-progress.js');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
 let release;const d=new Dialogue({answer:()=>new Promise(r=>release=r)}),jobs=new ChatJobs({dialogue:d,scope:()=>1});
 const first=jobs.start('','general','Объясни тему');await tick();assert(jobs.cancel(first.topicId));release('Поздний ответ');await tick();assert.equal(d.active().chatJob.state,'cancelled');assert(!d.active().messages.some(m=>m.role==='assistant'));assert(!jobs.busy(first.topicId));
 const resumed=await jobs.resume(first.topicId);await tick();release('Продолженный ответ');await tick();assert.equal(d.active().messages.filter(m=>m.role==='user').length,1);assert.equal(d.active().messages.at(-1).text,'Продолженный ответ');await assert.rejects(()=>jobs.resume(first.topicId));
 const queued=jobs.start('','general','Вопрос в очереди');assert(jobs.cancel(queued.topicId));await tick();assert(!jobs.busy(queued.topicId));
 let resolveSlow;const fullD=new Dialogue({answer:()=>new Promise(r=>resolveSlow=r)});const full=new ChatJobs({dialogue:fullD,scope:()=>1,converse:text=>fullD.turn(text)});const job=full.start('','general','Расскажи подробнее');await tick();full.cancel(job.topicId);resolveSlow('Не должен появиться');await tick();assert.equal(fullD.active().chatJob.state,'cancelled');assert(!fullD.active().messages.some(m=>m.role==='assistant'));
 await full.resume(job.topicId);await tick();await assert.rejects(()=>full.resume(job.topicId));resolveSlow('Ответ после продолжения');await tick();assert.equal(fullD.active().messages.filter(m=>m.role==='user').length,1);assert.equal(fullD.active().messages.at(-1).text,'Ответ после продолжения');
 let aborted=false;const controller=new AbortController();await cancel.run(controller.signal,async()=>{controller.abort(cancel.stopped());assert.throws(cancel.check,/остановлен/);aborted=cancel.signal().aborted;});assert(aborted);assert.equal(cancel.signal(),undefined);
 const progress=new CommandProgress();let finish,continued=false;const running=progress.start('Вопрос',async()=>{await progress.step('reply','Ответ',()=>new Promise(r=>finish=r));continued=true;});progress.cancel();finish('Поздний ответ');await running;assert(!continued);assert.equal(progress.state,'idle');assert(!progress.busy);assert.equal(progress.failed,null);
 const resumedWork=progress.resume();finish('Ответ');await resumedWork;assert(continued);assert.equal(progress.state,'done');
 console.log('Stop and resume: queued/running/full-pipeline cancellation, late-response suppression and foreground cancellation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
