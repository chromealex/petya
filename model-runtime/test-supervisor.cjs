const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {RuntimeSupervisor}=require('../src/model-runtime/supervisor.cjs');
const config={manifest:'/unused/manifest',base:'/unused/base',adapter:'/unused/adapter',digest:'a'.repeat(64),model:'test-model',allow_development:true};
const worker=`
let pending='';const mode=process.argv[1];
process.on('SIGTERM',()=>{if(mode!=='ignore')process.exit(0);});
process.stdin.on('data',chunk=>{
 pending+=chunk;let end;
 while((end=pending.indexOf('\\n'))>=0){
  const line=pending.slice(0,end);pending=pending.slice(end+1);const data=JSON.parse(line);
  if(data.command==='stop'){if(mode!=='ignore')process.exit(0);continue;}
  if(mode==='timeout')continue;
  if(mode==='invalid'){console.log('not JSON');continue;}
  if(mode==='oversize'){console.log('x'.repeat(70000));continue;}
  console.log(JSON.stringify({phase:'verifying',verified_bytes:2,total_bytes:4}));
  console.log(JSON.stringify({phase:'ready',host:'127.0.0.1',port:12345,model:'test-model',digest:mode==='wrong'?'b'.repeat(64):data.digest,qualification:'development'}));
 }
});
process.stdin.on('end',()=>{if(mode!=='ignore')process.exit(0);});
setInterval(()=>{},1000);
`;
function manager(mode,options={}){
 let calls=0,child;
 const supervisor=new RuntimeSupervisor({python:process.execPath,startTimeout:3000,stopTimeout:40,killTimeout:40,...options,
  spawnProcess:(python,args,opts)=>{calls++;assert.equal(opts.shell,false);assert.ok(args[0].endsWith('bootstrap.py'));child=spawn(process.execPath,['-e',worker,mode],opts);return child;}});
 return {supervisor,calls:()=>calls,child:()=>child};
}
(async()=>{
 const normal=manager('normal'),states=[];normal.supervisor.on('state',s=>states.push(s));
 const first=normal.supervisor.start(config);assert.equal(normal.supervisor.start(config),first);
 await assert.rejects(normal.supervisor.start({...config,model:'other'}),/останови/);
 await first;assert.equal(normal.calls(),1);
 const privateConnection=normal.supervisor.connection();assert.match(privateConnection.token,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(privateConnection.digest,config.digest);assert.equal(privateConnection.endpoint,'http://127.0.0.1:12345');
 assert.ok(states.some(x=>x.verifiedBytes===2&&x.totalBytes===4));assert.ok(!JSON.stringify(states).includes(privateConnection.token));
 assert.equal((await normal.supervisor.stop()).phase,'stopped');assert.throws(()=>normal.supervisor.connection(),/готов/);
 await normal.supervisor.start(config);assert.notEqual(normal.supervisor.connection().token,privateConnection.token);await normal.supervisor.stop();
 for(const mode of ['wrong','invalid','oversize','timeout']){
  const item=manager(mode,mode==='timeout'?{startTimeout:100}:{});
  await assert.rejects(item.supervisor.start(config));await item.supervisor.stop();assert.equal(item.supervisor.snapshot().phase,'error');
  assert.ok(item.child().exitCode!==null||item.child().signalCode!==null);
 }
 const stubborn=manager('ignore');await stubborn.supervisor.start(config);await stubborn.supervisor.stop();
 assert.equal(stubborn.child().signalCode,'SIGKILL');assert.equal(stubborn.supervisor.snapshot().phase,'stopped');
 const early=manager('timeout');const beginning=early.supervisor.start(config);const rejected=assert.rejects(beginning,/отменён/);
 await early.supervisor.stop();await rejected;assert.equal(early.supervisor.snapshot().phase,'stopped');
 const dead=manager('normal');await dead.supervisor.start(config);const exited=dead.supervisor.active.exited;
 dead.child().kill('SIGKILL');await exited;assert.equal(dead.supervisor.snapshot().phase,'error');
 const missing=new RuntimeSupervisor({python:'/definitely/missing/python',stopTimeout:40,killTimeout:40});
 await assert.rejects(missing.start(config));await missing.stop();assert.equal(missing.snapshot().phase,'error');
 console.log('Supervisor checks passed: private credentials, duplicate start, identity, progress, restart, stop, cancellation, deadlines and process failures.');
})().catch(error=>{console.error(error);process.exitCode=1;});
