const assert=require('node:assert/strict'),http=require('node:http');
const {Socket}=require('node:net');
const {RuntimeClient}=require('../src/model-runtime/client.cjs');
(async()=>{
 const token='C'.repeat(48),seen=[],active=new Map();let running=0,peak=0,cancelled=0,entered;
 const server=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+token);
  let text='';for await(const chunk of req)text+=chunk;
  const body=JSON.parse(text);
  assert.equal(Number(req.headers['content-length']),Buffer.byteLength(text));assert.equal(req.headers['transfer-encoding'],undefined);
  if(req.url==='/api/cancel'){
   cancelled++;const stop=active.get(body.request_id);stop?.();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({cancelled:!!stop}));return;
  }
  seen.push(body);
  if(body.messages[0].content==='redirect'){res.writeHead(302,{Location:'/api/cancel'});res.end('{}');return;}
  if(body.messages[0].content==='broken-stream'){res.writeHead(200);res.write('{');setImmediate(()=>res.destroy());return;}
  if(body.messages[0].content==='busy-once'&&seen.filter(x=>x.messages[0].content==='busy-once').length===1){res.writeHead(503);res.end(token);return;}
  running++;peak=Math.max(peak,running);entered?.();
  const id=req.headers['x-petya-request-id'];let ended=false;
  const finish=()=>{if(ended)return;ended=true;running--;active.delete(id);};
  const delay=body.messages[0].content==='wait'?1000:30;
  const timer=setTimeout(()=>{
   finish();const message={role:'assistant',content:'{"understood":true,"answer":"Привет"}'};
   res.setHeader('Content-Type','application/json');
   if(body.messages[0].content==='truncated'){res.end(JSON.stringify({message,done:false})+'\n');return;}
   if(body.stream)res.end(JSON.stringify({message,done:false})+'\n'+JSON.stringify({message:{role:'assistant',content:''},done:true})+'\n');
   else res.end(JSON.stringify({message,done:true}));
  },delay);
  active.set(id,()=>{clearTimeout(timer);finish();res.writeHead(409);res.end('{}');});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const target={endpoint:'http://127.0.0.1:'+server.address().port,token,model:'test',digest:'a'.repeat(64)};
 const originalQoS=Socket.prototype.setTypeOfService;let qosCalls=0;
 Socket.prototype.setTypeOfService=function(){qosCalls++;throw Object.assign(Error('setTypeOfService EINVAL'),{code:'EINVAL'});};
 const client=new RuntimeClient({getConnection:()=>target,timeout:3000});
 const body=text=>({model:'test',stream:false,messages:[{role:'user',content:text}],options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1}});
 try{
  const original=body('первый'),second=body('второй');
  const a=client.chat(original),b=client.chat(second);second.messages[0].content='изменён';
  await Promise.all([a,b]);assert.equal(peak,1);assert.equal(seen[1].messages[0].content,'второй');assert.deepEqual(seen[0].options,original.options);
  const previews=[];await client.chat({...body('поток'),stream:true},{onAnswerChunk:x=>previews.push(x)});assert.ok(previews.includes('Привет'));
  const activeAbort=new AbortController(),queuedAbort=new AbortController();
  const arrival=new Promise(resolve=>{entered=resolve;});
  const waiting=client.chat(body('wait'),{signal:activeAbort.signal});const waitRejected=assert.rejects(waiting,e=>e.name==='AbortError');
  const queued=client.chat(body('never'),{signal:queuedAbort.signal});const queueRejected=assert.rejects(queued,e=>e.name==='AbortError');
  queuedAbort.abort();await queueRejected;await arrival;entered=null;activeAbort.abort();await waitRejected;
  assert.ok(cancelled>0);assert.ok(!seen.some(x=>x.messages[0].content==='never'));
  await client.chat(body('после отмены'));
  const cancelledBeforeRedirect=cancelled;await assert.rejects(client.chat(body('redirect')),/HTTP 302/);assert.equal(cancelled,cancelledBeforeRedirect);
  await assert.rejects(client.chat({...body('broken-stream'),stream:true}),/корректный ответ/);
  await client.chat(body('busy-once'));assert.equal(seen.filter(x=>x.messages[0].content==='busy-once').length,2);
  const cleared=[];await assert.rejects(client.chat({...body('truncated'),stream:true},{onAnswerChunk:x=>cleared.push(x)}),/корректный ответ/);assert.equal(cleared.at(-1),'');
  await assert.rejects(client.chat({...body('x'),model:'other'}),/другая модель/);
  const invalid=new RuntimeClient({getConnection:()=>({...target,endpoint:'https://example.com'})});await assert.rejects(invalid.chat(body('x')),/идентичность/);invalid.close();
  const slow=new RuntimeClient({getConnection:()=>target,timeout:100});await assert.rejects(slow.chat(body('wait')),/время/);slow.close();
  client.close();await assert.rejects(client.chat(body('x')),e=>e.name==='AbortError');
  assert.ok(!JSON.stringify(client.stats()).includes(token));
  assert.equal(qosCalls,0);
  console.log('Client checks passed: real HTTP auth, serialized queue, preserved requests, streaming, queued/active cancellation, timeout and identity restriction.');
 }finally{Socket.prototype.setTypeOfService=originalQoS;client.close();for(const stop of active.values())stop();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
