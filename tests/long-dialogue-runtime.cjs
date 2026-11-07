const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Readable}=require('node:stream');
const {prepareRuntime,cases}=require('./long-dialogue-live.cjs');
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-long-harness-'));const output=path.join(temp,'result.json');
 const token='p'.repeat(48),digest='b'.repeat(64);let calls=[];
 const input=()=>Readable.from([token+'\n']);
 const args=['--runtime','http://127.0.0.1:18999','petya-v1',digest,output];
 const fetch=async(url,options)=>{
  assert.equal(options.headers.get('Authorization'),'Bearer '+token);assert.equal(options.redirect,'error');calls.push(url.pathname);
  return new Response(JSON.stringify(url.pathname==='/api/tags'?{models:[{name:'petya-v1',digest}]}:{done:true,message:{content:'{"understood":true,"answer":"Тестовый ответ"}'}}));
 };
 try{
  assert.equal(cases.length,5);assert.equal(cases.reduce((n,c)=>n+c.steps.length,0),25);
  const prepared=await prepareRuntime(args,input(),fetch);
  const body={model:'petya-v1',messages:[{role:'user',content:'Проверка транспорта'}],options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1},format:'json'};
  assert.equal((await prepared.request(body)).done,true);assert.deepEqual(calls,['/api/tags','/api/chat']);
  assert.deepEqual(prepared.evidence.calls[0].body,{...body,stream:false});assert(prepared.evidence.calls[0].response);
  assert(!JSON.stringify(prepared.evidence).includes(token));assert(prepared.evidence.sourceHashes['src/dialogue-answer.cjs']);
  await assert.rejects(prepareRuntime(['--runtime','http://example.com','petya-v1',digest,output],input(),fetch),/loopback/);
  await assert.rejects(prepareRuntime(['--runtime',args[1],'petya-v1','c'.repeat(64),output],input(),fetch),/identity mismatch/);
  fs.writeFileSync(output,'existing');const count=calls.length;
  await assert.rejects(prepareRuntime(args,input(),fetch),/already exists/);assert.equal(calls.length,count);assert.equal(fs.readFileSync(output,'utf8'),'existing');fs.unlinkSync(output);
  const broken=await prepareRuntime(args,input(),async(url,options)=>{if(url.pathname==='/api/tags')return fetch(url,options);throw Error('private '+token);});
  await assert.rejects(broken.request(body),/Local inference connection failed/);
  assert(!JSON.stringify(broken.evidence).includes(token));assert.equal(broken.evidence.calls[0].error,'Local inference connection failed');
  console.log('Long-dialogue runtime harness passed: private auth, identity mismatch, preserved request/response evidence, source hashes, no overwrite and sanitized failure. No model inference ran.');
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
