const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../src/features/model-runtime.cjs'),{RuntimeController}=require('../src/model-runtime/controller.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
class Owner extends EventEmitter{
 start(){return new Promise((resolve,reject)=>{this.ready=resolve;this.reject=reject;});}
 async stop(){this.reject?.(Error('stopped'));this.stopped=true;}
 connection(){return {};}
}
(async()=>{
 let owner,controller,closedWindow=true,eventHandler,starts=0;const sent=[],cards=[],calls=[];
 const app=new EventEmitter();app.getPath=()=>'/trusted';
 const s={companyId:'company-a',settings:{ollamaUrl:'http://127.0.0.1:11434/api/chat'},win:{isDestroyed:()=>closedWindow,webContents:{isDestroyed:()=>closedWindow,send:(name,state)=>{sent.push({name,state});eventHandler?.(state);}}}};
 const feature=create(s,{app,releaseAvailable:true,resolveInstallation:async()=>({python:'/trusted/python',config:{model:'petya-v1',digest:'a'.repeat(64)}}),createController:options=>controller=new RuntimeController({...options,createOwner:()=>{starts++;return owner=new Owner();},createClient:()=>({stats:()=>({running:0,waiting:0}),close(){},chat:async()=>({done:true})})})});
 feature.ipc.start();feature.modelRuntime.invoke('start');await tick();assert.equal(starts,1);
 owner.emit('state',{phase:'starting',stage:'verifying',verifiedBytes:3,totalBytes:4});assert.equal(sent.length,0);
 assert.equal(feature.ipc.status().percent,75);
 // Reopening the UI restores owner state without opening any settings panel.
 closedWindow=false;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/ui/model-runtime.js'),'utf8'),{
  window:{petya:{feature:async(name,method)=>{assert.equal(name,'modelRuntime');calls.push(method);return feature.modelRuntime.invoke(method);}},petyaEvents:{onModelRuntime:fn=>eventHandler=fn}},
  document:{dispatchEvent:event=>cards.push(event.detail)},CustomEvent:class{constructor(name,{detail}){assert.equal(name,'petya-ui-notification');this.detail=detail;}}
 });
 await tick();assert.equal(cards.at(-1).percent,75);const version=cards.at(-1).version;
 owner.emit('state',{phase:'starting',stage:'loading'});assert.equal(cards.at(-1).percent,undefined);assert.equal(cards.at(-1).version,version);
 owner.ready();await controller.job.pending;assert.equal(cards.at(-1).kind,'success');assert.equal(cards.at(-1).actions[0][0],'Остановить');
 const routed=await feature.modelRuntime.routeRequest(s.settings.ollamaUrl,{method:'POST',body:JSON.stringify({model:'petya-v1',messages:[]})},()=>{throw Error('Unexpected Ollama fallback');});assert.equal(routed.done,true);
 await cards.at(-1).actions[0][1]();assert.equal(feature.ipc.status().phase,'stopped');assert.equal(owner.stopped,true);
 await cards.at(-1).actions[0][1]();await tick();owner.reject(Error('private-secret'));await controller.job.pending;
 assert.equal(cards.at(-1).kind,'error');assert.equal(cards.at(-1).actions[0][0],'Повторить запуск');
 await cards.at(-1).actions[0][1]();await tick();assert.equal(starts,3);
 assert.equal(cards.at(-1).actions[0][0],'Отменить');await cards.at(-1).actions[0][1]();assert.equal(feature.ipc.status().phase,'stopped');
 assert.ok(cards.every(card=>card.id==='petya-model-runtime'));assert.ok(!JSON.stringify(cards).includes('private-secret'));
 assert.throws(()=>feature.modelRuntime.invoke('connection'),/Неизвестная/);
 assert.throws(()=>feature.modelRuntime.invoke('routeRequest'),/Неизвестная/);
 const dispose=app.listeners('before-quit')[0];await dispose();assert.throws(()=>feature.ipc.start(),/Компания закрыта/);
 const missingApp=new EventEmitter();missingApp.getPath=()=>'/trusted';
 const missing=create(s,{app:missingApp});assert.equal(missing.ipc.status().releaseAvailable,false);assert.throws(()=>missing.ipc.start(),/пока недоступен/);await missing.modelRuntime.dispose();
 console.log('Runtime feature passed: shared IPC/controller, duplicate start, settings-independent events, reopened snapshot, cancellation, retry, private-state exclusion and disposal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
