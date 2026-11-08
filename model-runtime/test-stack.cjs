// Real controller/supervisor/client/worker/HTTP stack; only model loading/token generation are fake.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {CompanyLifecycle}=require('../src/company-lifecycle.cjs');
const {RuntimeController}=require('../src/model-runtime/controller.cjs'),{RuntimeSupervisor}=require('../src/model-runtime/supervisor.cjs');
const worker=String.raw`
import runtime_test_path
import bootstrap,engine,time
from types import SimpleNamespace
from test_engine import Backend
class SlowBackend(Backend):
    def generate(self,prompt,settings,grammar,seed):
        pieces=['{"understood":true,"answer":"При','вет"}']
        for i,text in enumerate(pieces):
            time.sleep(0.15)
            yield SimpleNamespace(text=text,finish_reason='stop' if i==len(pieces)-1 else None,prompt_tokens=3,generation_tokens=i+1)
def load(manifest,base,adapter,digest,progress):
    progress({'phase':'verifying','verified_bytes':3,'total_bytes':4})
    progress({'phase':'loading'})
    progress({'phase':'verifying','verified_bytes':4,'total_bytes':4})
    identity=SimpleNamespace(name='stack-test',digest=digest,size=123,qualification='development')
    return engine.GenerationEngine(identity,SlowBackend())
engine.load_engine=load
raise SystemExit(bootstrap.main())
`;
(async()=>{
 const python=process.argv[2];assert.ok(python&&path.isAbsolute(python),'Pass an absolute isolated Python path');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'petya-stack-')),manifest=path.join(directory,'manifest.json');
 const manifestText='{"qualification":"development"}';fs.writeFileSync(manifest,manifestText);
 const digest=crypto.createHash('sha256').update(manifestText).digest('hex');
 let owner,child,starts=0;const states=[],terminal=[];
 const app=new EventEmitter(),powerMonitor=new EventEmitter(),removed=[];
 const scope=new CompanyLifecycle({app,powerMonitor,ipcMain:{removeHandler:name=>removed.push(name)}});
 scope.names.add('runtime-test');
 const controller=new RuntimeController({
  resolveInstallation:async()=>({python,config:{manifest,base:directory,adapter:directory,model:'stack-test',digest,allow_development:true}}),
  createOwner:options=>owner=new RuntimeSupervisor({...options,startTimeout:10000,stopTimeout:500,killTimeout:500,spawnProcess:(exe,args,opts)=>{
   starts++;assert.ok(args[0].endsWith('bootstrap.py'));
   child=spawn(exe,['-c',worker],{...opts,cwd:__dirname});child.once('close',(code,signal)=>terminal.push({code,signal}));return child;
  }}),emit:state=>states.push(state)
 });
 app.once('before-quit',()=>controller.dispose());scope.capture();
 const body=()=>({model:'stack-test',stream:true,format:{type:'object',properties:{understood:{type:'boolean'},answer:{type:'string'}},required:['understood','answer'],additionalProperties:false},messages:[{role:'user',content:'Привет'}],options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1}});
 try{
  controller.start();controller.start();await controller.job.pending;assert.equal(starts,1);assert.equal(controller.snapshot().phase,'ready');
  const firstToken=owner.connection().token;
  const result=await Promise.all([controller.chat(body()),controller.chat(body()),controller.chat(body())]);
  assert.ok(result.every(row=>JSON.parse(row.message.content).answer==='Привет'));
  const abort=new AbortController();let previewed=false;
  await assert.rejects(controller.chat(body(),{signal:abort.signal,onAnswerChunk:text=>{if(text){previewed=true;abort.abort();}}}),error=>error.name==='AbortError');
  assert.ok(previewed);assert.equal(JSON.parse((await controller.chat(body())).message.content).answer,'Привет');
  await controller.stop();assert.equal(controller.snapshot().phase,'stopped');assert.equal(terminal[0].code,0);
  assert.ok(states.some(x=>x.stage==='rechecking'));assert.ok(states.some(x=>x.percent===75));
  assert.ok(!JSON.stringify(states).includes(firstToken));
  controller.start();await controller.job.pending;assert.notEqual(owner.connection().token,firstToken);
  const stopped=new Promise(resolve=>child.once('close',resolve));child.kill('SIGTERM');await stopped;
  assert.equal(controller.snapshot().phase,'error');assert.equal(controller.job,null);
  controller.start();await controller.job.pending;assert.equal(starts,3);
  let scopeClosing,previewStarted;
  const preview=new Promise(resolve=>previewStarted=resolve);
  const interrupted=controller.chat(body(),{onAnswerChunk:text=>{if(text&&!scopeClosing){scopeClosing=scope.close();previewStarted();}}});
  // Attach rejection observers before shutdown can reject active and queued calls.
  const activeRejected=assert.rejects(interrupted,error=>error.name==='AbortError');
  const queuedRejected=assert.rejects(controller.chat(body()),error=>error.name==='AbortError');
  await Promise.race([preview,require('node:timers/promises').setTimeout(5000,undefined,{ref:false}).then(()=>{throw Error('No preview before company shutdown');})]);await scopeClosing;await Promise.all([activeRejected,queuedRejected]);
  assert.equal(controller.snapshot().phase,'stopped');assert.equal(controller.job,null);
  assert.equal(terminal.length,3);assert.equal(terminal[2].code,0);
  assert.throws(()=>scope.check(),/переключена/);assert.throws(()=>controller.start(),/завершено/);
  assert.deepEqual(removed,['petya:runtime-test']);assert.equal(app.listenerCount('before-quit'),0);
  await scope.close();assert.equal(starts,3);

  console.log('Full stack passed: real child/HTTP, parallel callers, streaming preview, active cancellation, subsequent inference, restart, unexpected process exit and awaited company shutdown with active/queued cancellation.');
 }finally{await scope.close();await controller.dispose();if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');fs.rmSync(directory,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
