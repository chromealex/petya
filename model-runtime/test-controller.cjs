const assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {RuntimeController}=require('../src/model-runtime/controller.cjs');
const install={python:'/trusted/python',config:{model:'qualified-test',digest:'d'.repeat(64)}};
class Owner extends EventEmitter{
 constructor(){super();this.stops=0;}
 start(){return new Promise((resolve,reject)=>{this.ready=()=>resolve();this.fail=()=>reject(Error('private-token'));this.reject=reject;});}
 stop(){this.stops++;this.reject?.(Error('cancelled'));return Promise.resolve();}
 connection(){return {token:'private-token'};}
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let resolves=0,owner,closed=0,calls=0;const events=[];
 const controller=new RuntimeController({resolveInstallation:async()=>{resolves++;return install;},emit:s=>events.push(s),createOwner:()=>owner=new Owner(),createClient:()=>({stats:()=>({running:0,waiting:0,closed:false}),close:()=>closed++,chat:async body=>{calls++;return body;}})});
 assert.equal(controller.start().phase,'starting');controller.start();await tick();assert.equal(resolves,1);
 owner.emit('state',{phase:'starting',stage:'verifying',verifiedBytes:3,totalBytes:4});assert.equal(controller.snapshot().percent,75);
 const version=controller.snapshot().version;
 owner.emit('state',{phase:'starting',stage:'loading'});assert.equal(controller.snapshot().percent,undefined);assert.equal(controller.snapshot().version,version);
 owner.emit('state',{phase:'starting',stage:'verifying',verifiedBytes:1,totalBytes:4});assert.equal(controller.snapshot().stage,'rechecking');assert.equal(controller.snapshot().version,version);
 owner.ready();await controller.job.pending;assert.equal(controller.snapshot().phase,'ready');
 assert.deepEqual(await controller.chat({messages:['history']}),{messages:['history']});assert.equal(calls,1);
 assert.ok(!JSON.stringify(events).includes('private-token'));assert.ok(events.every(x=>x.id==='petya-model-runtime'));
 await controller.stop();assert.equal(controller.snapshot().phase,'stopped');assert.equal(closed,1);
 await assert.rejects(controller.chat({}),/готова/);
 controller.start();await tick();const cancelled=controller.stop();await cancelled;assert.equal(controller.snapshot().phase,'stopped');
 controller.start();await tick();owner.fail();await controller.job.pending;assert.equal(controller.snapshot().phase,'error');assert.equal(controller.job,null);
 controller.start();await tick();owner.ready();await controller.job.pending;owner.emit('state',{phase:'error'});assert.equal(controller.snapshot().phase,'error');assert.equal(controller.job,null);
 controller.start();await tick();owner.ready();await controller.job.pending;
 const closesBeforeFailure=closed;
 owner.emit('state',{phase:'stopping',error:'private-token'});
 assert.equal(controller.snapshot().phase,'stopping');assert.equal(controller.snapshot().busy,true);
 assert.equal(closed,closesBeforeFailure+1);
 await assert.rejects(controller.chat({}),/готова/);
 assert.throws(()=>controller.start(),/остановки/);
 assert.ok(!JSON.stringify(controller.snapshot()).includes('private-token'));
 owner.emit('state',{phase:'error'});assert.equal(controller.snapshot().phase,'error');assert.equal(controller.job,null);
 controller.start();await tick();owner.ready();await controller.job.pending;
 assert.equal(controller.snapshot().phase,'ready');await controller.stop();
 let release;let starts=0;
 const delayed=new RuntimeController({resolveInstallation:()=>new Promise(resolve=>release=resolve),createOwner:()=>{starts++;return new Owner();}});
 delayed.start();const stopped=delayed.stop();release(install);await stopped;assert.equal(starts,0);assert.equal(delayed.snapshot().phase,'stopped');
 const detached=new RuntimeController({resolveInstallation:async()=>install,emit:()=>{throw Error('window closed');},createOwner:()=>owner=new Owner(),createClient:()=>({stats:()=>({}),close(){}})});
 detached.start();await tick();owner.ready();await detached.job.pending;assert.equal(detached.snapshot().phase,'ready');await detached.dispose();
 await controller.dispose();assert.throws(()=>controller.start(),/завершено/);
 console.log('Controller checks passed: shared snapshots/events, duplicate start, progress stages, cancellation, failure/retry, stale startup and private-state exclusion.');
})().catch(e=>{console.error(e);process.exitCode=1;});
