const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough}=require('node:stream');
const {QwenSpeech}=require('../src/qwen-speech.cjs');
(async()=>{
 let launches=0,child;const voice=new QwenSpeech({roots:['/fixture'],platform:'darwin',exists:()=>true,spawnProcess:()=>{launches++;child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>child.emit('exit');return child;}});
 const starting=voice.ensure();assert.equal(voice.ensure(),starting);child.stdout.write('{"ready":true}\n');assert.equal((await starting).engine,'Qwen3-ASR 1.7B');
 const messages=[];child.stdin.on('data',data=>messages.push(JSON.parse(String(data))));
 const first=voice.transcribe(Buffer.from('one')),second=voice.transcribe(Buffer.from('two'));await new Promise(r=>setImmediate(r));assert.equal(launches,1);assert.equal(messages.length,2);
 child.stdout.write(JSON.stringify({id:messages[1].id,text:'вторая'})+'\n');child.stdout.write(JSON.stringify({id:messages[0].id,text:'первая'})+'\n');assert.equal(await first,'первая');assert.equal(await second,'вторая');
 const cancelled=voice.transcribe(Buffer.from('three'));await new Promise(r=>setImmediate(r));voice.stop();await assert.rejects(cancelled,/остановлено/);assert.equal(voice.requests.size,0);
 const restarting=voice.ensure();child.emit('exit');await assert.rejects(restarting,/завершился/);
 const unavailable=new QwenSpeech({roots:[],platform:'darwin'});assert.equal(unavailable.available,false);await assert.rejects(unavailable.ensure(),/не установлен/);
 console.log('Qwen speech: one persistent worker, response IDs, cancellation, restart and missing installation passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
