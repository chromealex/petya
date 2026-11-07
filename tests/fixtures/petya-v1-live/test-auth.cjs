const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const {readToken,authenticatedJSON}=require('./run.cjs');
(async()=>{
 const token='A'.repeat(48),origin='http://127.0.0.1:12345/';
 assert.equal(await readToken(Readable.from([token.slice(0,8),token.slice(8)+'\r\n'])),token);
 for(const value of ['', 'short', token+'\nextra', 'X'.repeat(259)])
  await assert.rejects(()=>readToken(Readable.from([value])),/Invalid private token input/);
 const seen=[];
 const request=authenticatedJSON(origin,token,async(url,options)=>{
  seen.push({url:String(url),options});return {ok:true,json:async()=>({ok:true})};
 });
 for(const route of ['/api/tags','/api/chat'])assert.deepEqual(await request(route,{headers:{'Content-Type':'application/json'}}),{ok:true});
 for(const {url,options} of seen){
  assert.ok(url.startsWith(origin));assert.equal(options.headers.get('Authorization'),'Bearer '+token);
  assert.equal(options.headers.get('Content-Type'),'application/json');assert.equal(options.redirect,'error');
 }
 for(const route of ['http://example.com/api/chat','//example.com/api/chat','/api/cancel'])await assert.rejects(()=>request(route),/Unsupported inference route/);
 assert.throws(()=>authenticatedJSON('https://example.com',token),/loopback/);
 const failing=authenticatedJSON(origin,token,async()=>{throw Error(token);});
 await assert.rejects(()=>failing('/api/chat'),e=>e.message==='Local inference connection failed'&&!e.message.includes(token));
 const malformed=authenticatedJSON(origin,token,async()=>({ok:true,json:async()=>{throw Error(token);}}));
 await assert.rejects(()=>malformed('/api/tags'),/Invalid inference JSON response/);
 const denied=authenticatedJSON(origin,token,async()=>({ok:false,status:401,json:async()=>{throw Error('must not read body');}}));
 await assert.rejects(()=>denied('/api/tags'),/Inference HTTP 401/);
 console.log('Authenticated live harness checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
