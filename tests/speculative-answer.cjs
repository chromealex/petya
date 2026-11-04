const assert=require('node:assert/strict');
const {SpeculativeAnswer}=require('../src/speculative-answer.cjs');
const {dialogueRequest}=require('../src/dialogue-request.cjs');
const {localAnswer}=require('../src/dialogue-answer.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
const body=text=>({model:'local',messages:[{role:'user',content:text}],stream:true});
(async()=>{
 const cache=new SpeculativeAnswer();let calls=[],active=0,max=0;
 const work=text=>async(signal,capture)=>capture(body(text),()=>new Promise((resolve,reject)=>{active++;max=Math.max(max,active);const finish=value=>{active--;resolve(value);};signal.addEventListener('abort',()=>{active--;reject(Error('aborted'));},{once:true});calls.push({text,signal,finish});}));
 cache.update('Расскажи про Java','chat1',work('Расскажи про Java'));await tick();assert.equal(calls.length,1);
 assert.equal(await cache.consume(body('Расскажи про Java')),null,'nothing is available before the final turn');
 cache.update('Расскажи про JavaScript','chat1',work('Расскажи про JavaScript'));await tick();assert(calls[0].signal.aborted);assert.equal(calls.length,2);assert.equal(max,1);
 assert(cache.commit('Расскажи про JavaScript','chat1'));const answer={message:{content:'new answer'}};const result=cache.consume(body('Расскажи про JavaScript'));calls[1].finish(answer);assert.deepEqual(await result,answer);assert.equal(await cache.consume(body('Расскажи про JavaScript')),null);
 cache.update('Другая тема','chat1',work('Другая тема'));await tick();assert(!cache.commit('Другая тема','chat2'));assert(calls[2].signal.aborted);
 cache.update('Старые данные','chat1',work('Старые данные'));await tick();cache.commit('Старые данные','chat1');assert.equal(await cache.consume({...body('Старые данные'),model:'changed'}),null);assert(calls[3].signal.aborted);
 cache.update('Отмена','chat1',work('Отмена'));await tick();cache.clear();assert(calls[4].signal.aborted);
 // Use the actual request builder and answer parser: a raw draft still passes normal validation.
 const topic={title:'Разговор',kind:'chat',messages:[{role:'user',text:'Почему небо голубое?',at:1}]};const command='Почему небо голубое?';
 const request=dialogueRequest({model:'local',command,topic,company:''});let generations=0;
 cache.update(command,'scope',async(signal,capture)=>capture(request,async()=>{generations++;return {message:{content:JSON.stringify({understood:true,answer:'Из-за рассеяния солнечного света в атмосфере.'})}};}));await tick();cache.commit(command,'scope');
 const final=await localAnswer({model:'local',command,topic,uncertain:()=>false,clarify:()=>{throw Error('Unexpected clarification');},request:async()=>await cache.consume({...request,stream:true})});assert.match(final,/рассеяния/);assert.equal(generations,1);
 console.log('Speculative answers: silent draft, abort/recompute, bounded work, exact final input, changed scope/model, cancellation and normal parsing passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
