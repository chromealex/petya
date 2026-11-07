// Exercise the actual private transport without running reserved model scenarios.
const assert=require('node:assert/strict'),http=require('node:http');
const {Socket}=require('node:net');
const {authenticatedJSON}=require('./run.cjs');
const {runtimeFetch}=require('../../../src/model-runtime/http.cjs');
(async()=>{
 const token='T'.repeat(48),seen=[];let redirect=false,qosCalls=0;
 const server=http.createServer(async(req,res)=>{
  seen.push(req.url);assert.equal(req.headers.authorization,'Bearer '+token);
  if(redirect){res.writeHead(302,{Location:'/api/cancel'});res.end('{}');return;}
  if(req.url==='/api/tags'){assert.equal(req.method,'GET');res.end('{"models":[]}');return;}
  assert.equal(req.url,'/api/chat');assert.equal(req.method,'POST');
  let raw='';for await(const chunk of req)raw+=chunk;
  assert.equal(Number(req.headers['content-length']),Buffer.byteLength(raw));
  res.end(JSON.stringify({message:{content:JSON.parse(raw).messages[0].content}}));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const original=Socket.prototype.setTypeOfService;
 Socket.prototype.setTypeOfService=function(){qosCalls++;throw Error('setTypeOfService EINVAL');};
 try{
  const request=authenticatedJSON(origin,token);
  assert.deepEqual(await request('/api/tags'),{models:[]});
  const body={messages:[{role:'user',content:'Проверка транспорта'}]};
  assert.equal((await request('/api/chat',{method:'POST',body:JSON.stringify(body)})).message.content,body.messages[0].content);
  redirect=true;await assert.rejects(request('/api/tags'),/HTTP 302/);
  assert.deepEqual(seen,['/api/tags','/api/chat','/api/tags']);
  for(const [route,options] of [['/api/tags',{method:'POST',body:'{}'}],['/api/chat',{}],['/api/unknown',{}]])
   await assert.rejects(runtimeFetch(origin+route,{...options,redirect:'error'}),/Недопустимый запрос/);
  assert.equal(qosCalls,0);
  console.log('Live harness real HTTP passed: private auth, identity/chat routes, no redirects and no fetch QoS path.');
 }finally{Socket.prototype.setTypeOfService=original;await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
