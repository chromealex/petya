const assert=require('node:assert/strict');const {VoicePreparation}=require('../src/voice-preparation.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{let calls=[],resolve;const cache=new VoicePreparation(text=>{calls.push(text);return {text,result:new Promise(r=>resolve=r)};});
cache.update('Покажи первый вариант','chat1');cache.update('Нет, второй вариант','chat1');cache.update('Объясни второй вариант','chat1');assert.equal(calls.length,1);resolve();await tick();assert.deepEqual(calls,['Покажи первый вариант','Объясни второй вариант']);resolve();await tick();assert.equal(cache.take('Объясни второй вариант','chat1').text,'Объясни второй вариант');assert.equal(cache.take('Объясни второй вариант','chat1'),undefined);
cache.update('Есть ещё идеи?','chat1');resolve();await tick();assert.equal(cache.take('Есть ещё идеи?','chat2'),undefined);
cache.update('Не отправляй письмо','chat1');cache.clear();resolve();await tick();assert.equal(cache.take('Не отправляй письмо','chat1'),undefined);
console.log('Voice preparation: bounded work, latest transcript, context changes, cancellation and one-shot reuse passed');
})().catch(e=>{console.error(e);process.exitCode=1});
