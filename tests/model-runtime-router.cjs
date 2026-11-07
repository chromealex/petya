const assert=require('node:assert/strict');
const {createRouter}=require('../src/model-runtime/router.cjs');
const cancellation=require('../src/answer-cancel.cjs');
(async()=>{
 const endpoint='http://127.0.0.1:11434/api/chat';let calls=0,fallbacks=0,closed=false,impl;
 const fallback=async(url,options)=>{fallbacks++;return {url,options};};
 const check=()=>{if(closed)throw Error('company closed');};
 const route=createRouter({getEndpoint:()=>endpoint,check,chat:async(body,options)=>{calls++;return impl(body,options);}});
 const body={model:'petya-v1',messages:[{role:'user',content:'Объясни разницу.'}],format:'json',stream:true,options:{temperature:0.6,top_p:0.9,repeat_penalty:1.1}};
 const request={method:'POST',body:JSON.stringify(body)};
 const chunks=[];
 impl=async(actual,options)=>{assert.deepEqual(actual,body);options.onAnswerChunk('Ответ');return {done:true,message:{content:'Ответ'}};};
 assert.equal((await route(endpoint,{...request,onAnswerChunk:v=>chunks.push(v)},fallback)).done,true);
 assert.deepEqual(chunks,['Ответ']);assert.equal(fallbacks,0);
 for(const [url,options] of [[endpoint,{...request,body:JSON.stringify({...body,model:'qwen3:4b'})}],['https://example.com/api/chat',request],['http://127.0.0.1:11435/api/chat',request],[endpoint,{method:'GET'}],[endpoint,{...request,body:'broken'}]]){
  assert.deepEqual(await route(url,options,fallback),{url,options});
 }
 assert.equal(calls,1);assert.equal(fallbacks,5);
 for(const [url,options] of [[endpoint.replace('/chat','/generate'),request],[endpoint+'?extra=1',request],[endpoint,{...request,method:'GET'}],[endpoint.replace('127.0.0.1','user:password@127.0.0.1'),request]])await assert.rejects(route(url,options,fallback),/POST/);
 assert.equal(calls,1);assert.equal(fallbacks,5);
 impl=async()=>{throw Error('runtime unavailable');};
 await assert.rejects(route(endpoint,request,fallback),/runtime unavailable/);assert.equal(fallbacks,5);
 const controller=new AbortController();controller.abort(cancellation.stopped());
 await assert.rejects(route(endpoint,{...request,signal:controller.signal},fallback),{name:'AbortError'});
 let resolve;
 impl=async(actual,options)=>new Promise((ok,reject)=>{resolve=ok;options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
 const active=new AbortController();
 const pending=cancellation.run(active.signal,()=>route(endpoint,request,fallback));
 active.abort(cancellation.stopped());await assert.rejects(pending,{name:'AbortError'});
 impl=async(actual,options)=>{closed=true;options.onAnswerChunk?.('stale');return {done:true};};
 await assert.rejects(route(endpoint,{...request,onAnswerChunk:v=>chunks.push(v)},fallback),/company closed/);assert.deepEqual(chunks,['Ответ']);
 closed=false;impl=async()=>{closed=true;return {done:true};};
 await assert.rejects(route(endpoint,request,fallback),/company closed/);
 assert.equal(fallbacks,5);
 console.log('Runtime router passed: selected model, preserved sampling/history, scoped endpoint, no failure fallback, cancellation and stale-stream rejection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
