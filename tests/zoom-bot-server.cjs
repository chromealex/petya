const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {Store}=require('../zoom-bot/server/store.cjs'),{createService}=require('../zoom-bot/server/server.cjs'),{Frames,failureMessage}=require('../zoom-bot/server/worker.cjs');
(async()=>{
 assert.match(failureMessage(Error('ZOOM_OBF_403')), /HTTP 403/);
 assert.match(failureMessage(Error('PETYA:failure:meeting:63')), /код 63/);
 assert(!failureMessage(Error('secret-token')).includes('secret-token'));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-zoom-api-')),key=crypto.randomBytes(32).toString('hex'),token=crypto.randomBytes(32).toString('base64url'),other=crypto.randomBytes(32).toString('base64url');
 const store=new Store(dir,key);let release,runs=0,ready=true;
 const service=createService({store,tenants:Object.fromEntries([[token,'one'],[other,'two']].map(([t,id])=>[crypto.createHash('sha256').update(t).digest('hex'),id])),ready:()=>ready,run:async(job,meeting,publish)=>{runs++;if(runs===2){publish({phase:'error',message:'Safe specific failure'});throw Error('worker failed');}await new Promise(r=>release=r);store.write(job.id+'-0',{wav:'aGVsbG8=',at:1});publish({phase:'recorded',segments:1});}});
 await new Promise(r=>service.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+service.server.address().port;
 const call=(route,method='GET',data,auth=token)=>fetch(origin+route,{method,headers:{Authorization:'Bearer '+auth},...(data?{body:JSON.stringify(data)}:{})});
 try{
  assert.equal((await fetch(origin+'/health')).status,403);
  const data={url:'https://zoom.us/j/123456789?pwd=abc',meetingId:'123456789',password:'',requestId:crypto.randomUUID(),oauthCredential:'x'.repeat(43)};
  const created=await (await call('/v1/bots','POST',data)).json();assert.equal(created.phase,'joining');
  assert.equal((await (await call('/v1/bots','POST',data)).json()).id,created.id);assert.equal(runs,1);
  assert.equal((await call('/v1/bots/'+created.id,'GET',undefined,other)).status,404);
  assert.equal((await call('/v1/bots/'+created.id+'/audio/0')).status,409);
  assert.equal((await call('/v1/bots','POST',{...data,requestId:crypto.randomUUID()})).status,409);
  release();while(service.active.size)await new Promise(r=>setImmediate(r));
  assert.equal((await (await call('/v1/bots/'+created.id+'/audio/0')).json()).wav,'aGVsbG8=');
  assert(!fs.readFileSync(store.file(created.id+'-0')).includes(Buffer.from('aGVsbG8=')));
  await call('/v1/bots/'+created.id+'/ack','POST',{});assert.equal(fs.existsSync(store.file(created.id+'-0')),false);
  const failed=await (await call('/v1/bots','POST',{...data,requestId:crypto.randomUUID()})).json();while(service.active.size)await new Promise(r=>setImmediate(r));
  assert.equal((await (await call('/v1/bots/'+failed.id)).json()).message,'Safe specific failure');
  ready=false;assert.equal((await call('/v1/bots','POST',{...data,requestId:crypto.randomUUID()})).status,503);
  let lookups=0,clock=0,allowed=true;const tenant=require('../zoom-bot/server/tenant.cjs').brokerTenant({now:()=>clock,fetcher:async()=>{lookups++;return {ok:allowed,json:async()=>({site:{provider:'zoom',id:'user'}})};}});const first=await tenant(token);assert.equal(await tenant(token),first);assert.equal(lookups,1);assert.notEqual(await tenant(other),first);clock=61000;allowed=false;assert.equal(await tenant(token),null);
  let saved=[];const frames=new Frames((i,data)=>saved.push(data)),pcm=Buffer.alloc(32000);pcm.writeInt16LE(1234,0);const frame=Buffer.alloc(8+pcm.length);frame.writeUInt32LE(16000,0);frame.writeUInt32LE(pcm.length,4);pcm.copy(frame,8);
  frames.push(frame.subarray(0,5));frames.push(frame.subarray(5));frames.end();const wav=Buffer.from(saved[0].wav,'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readInt16LE(44),1234);
  console.log('Zoom service: auth/tenant isolation, idempotency, capacity, not-ready, completed-only audio, encrypted storage, acknowledgment cleanup and split PCM frames passed');
 }finally{await new Promise(r=>service.server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
