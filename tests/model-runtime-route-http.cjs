// Exercise the shared feature/router/controller/client with an authenticated HTTP fixture.
// The owner and model replies are fixtures; this is transport integration, not model quality.
const assert=require('node:assert/strict');
const http=require('node:http');
const {EventEmitter,once}=require('node:events');
const {create}=require('../src/features/model-runtime.cjs');
const {RuntimeController}=require('../src/model-runtime/controller.cjs');
const {RuntimeClient}=require('../src/model-runtime/client.cjs');
const token='t'.repeat(48),digest='a'.repeat(64);
(async()=>{
 const requests=[],cancels=[],held=new Map();let heldStarted;
 const started=new Promise(resolve=>{heldStarted=resolve;});
 const server=http.createServer(async(req,res)=>{
  try{
   assert.equal(req.headers.authorization,'Bearer '+token);
   let bytes='';for await(const part of req)bytes+=part;
   const body=JSON.parse(bytes);
   if(req.url==='/api/cancel'){
    cancels.push(body.request_id);held.get(body.request_id)?.end();held.delete(body.request_id);
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
   }
   assert.equal(req.url,'/api/chat');assert.equal(req.method,'POST');
   requests.push(body);
   if(body.messages.at(-1).content==='Долгий ответ'){
    held.set(req.headers['x-petya-request-id'],res);heldStarted();return;
   }
   const content=JSON.stringify({understood:true,answer:'Сохранены все условия.'});
   if(body.stream===false){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({done:true,message:{role:'assistant',content}}));return;}
   res.writeHead(200,{'Content-Type':'application/x-ndjson'});
   for(const text of [content.slice(0,30),content.slice(30)])res.write(JSON.stringify({done:false,message:{content:text}})+'\n');
   res.end(JSON.stringify({done:true,message:{content:''}})+'\n');
  }catch(error){res.writeHead(500);res.end();server.emit('fixture-error',error);}
 });
 const failures=[];server.on('fixture-error',error=>failures.push(error));
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const endpoint='http://127.0.0.1:'+server.address().port;
 const app=new EventEmitter();app.getPath=()=>'/trusted';let controller,ownerStops=0,fallbacks=0;
 class Owner extends EventEmitter{
  async start(){} async stop(){ownerStops++;}
  connection(){return {endpoint,token,digest,model:'petya-v1'};}
 }
 const s={companyId:'a',settings:{ollamaUrl:'http://127.0.0.1:11434/api/chat'}};
 const feature=create(s,{app,releaseAvailable:true,resolveInstallation:async()=>({python:'/fixture/python',config:{model:'petya-v1',digest}}),
  createController:options=>controller=new RuntimeController({...options,createOwner:()=>new Owner(),createClient:options=>new RuntimeClient({...options,timeout:5000})})});
 const route=(body,onAnswerChunk)=>feature.modelRuntime.routeRequest(s.settings.ollamaUrl,{method:'POST',body:JSON.stringify(body),onAnswerChunk},()=>{fallbacks++;throw Error('Unexpected Ollama fallback');});
 try{
  feature.ipc.start();await controller.job.pending;assert.equal(feature.ipc.status().phase,'ready');
  const body={model:'petya-v1',messages:[{role:'user',content:'Сохрани название.'},{role:'assistant',content:'Какое?'},{role:'user',content:'Метка_004. Отправку отменяю.'}],stream:true,format:'json',options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1}};
  const chunks=[];const result=await route(body,chunk=>chunks.push(chunk));
  assert.equal(result.done,true);assert.equal(JSON.parse(result.message.content).answer,'Сохранены все условия.');
  assert.equal(chunks.at(-1),'Сохранены все условия.');assert.deepEqual(requests[0],body);
  const plain=await route({...body,stream:false});assert.equal(plain.message.content,result.message.content);
  const slow={...body,messages:[{role:'user',content:'Долгий ответ'}]};
  const first=route(slow);const second=route(body);
  const settled=Promise.allSettled([first,second]);await started;
  assert.equal(controller.snapshot().queue.waiting,1);
  await feature.ipc.stop();
  const stopped=await settled;assert.ok(stopped.every(item=>item.status==='rejected'&&item.reason.name==='AbortError'));
  assert.equal(requests.length,3,'Queued inference must not reach HTTP after stop');assert.equal(cancels.length,1);
  assert.equal(ownerStops,1);assert.equal(feature.ipc.status().phase,'stopped');
  await assert.rejects(route(body),/не готова/);assert.equal(fallbacks,0);
  feature.ipc.start();await controller.job.pending;
  assert.equal((await route(body)).done,true);
  await feature.modelRuntime.dispose();await assert.rejects(route(body),/Компания закрыта/);
  assert.equal(fallbacks,0);assert.deepEqual(failures,[]);
  console.log('HTTP route integration passed: authenticated streaming/plain replies, exact request payload, active/queued cancellation, no fallback, restart and disposal.');
 }finally{
  await feature.modelRuntime.dispose();for(const res of held.values())res.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
