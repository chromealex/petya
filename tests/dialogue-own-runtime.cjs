const assert=require('node:assert/strict');
const {localAnswer}=require('../src/dialogue-answer.cjs');
const reply=answer=>({message:{content:JSON.stringify({understood:true,answer})}});
(async()=>{
 let recoveries=0,discoveries=0,clarifications=0;
 const common={model:'petya-v1',command:'Что такое диффузия?',topic:{messages:[]},uncertain:()=>false,
  chooseKnowledgeModel:async()=>{discoveries++;return 'another-model';},
  recover:async()=>{recoveries++;},clarify:()=>{clarifications++;return 'clarified';}};
 const calls=[];
 assert.equal(await localAnswer({...common,request:async options=>{calls.push(options);return reply('Диффузия — перемешивание частиц.');}}),'Диффузия — перемешивание частиц.');
 assert.deepEqual(calls,[{}]);assert.equal(discoveries,0);
 assert.equal(common.topic.answeredBy,'модель petya-v1');
 for(const error of [new TypeError('offline'),Object.assign(Error('runner failure'),{status:500,detail:'runner terminated Metal panic'}),Object.assign(Error('missing'),{status:404}),Object.assign(Error('busy'),{status:429}),Object.assign(Error('timeout'),{name:'TimeoutError'}),Object.assign(Error('cancelled'),{name:'AbortError'})]){
  let attempts=0;
  const result=await localAnswer({...common,request:async()=>{attempts++;throw error;}});
  assert.equal(attempts,1);assert.equal(result.error,true);assert.doesNotMatch(result.text,/Ollama/);
  assert.match(result.text,/модел[ьи] Пети/);
  if(error.name==='AbortError'){assert.match(result.text,/отменён/);assert.doesNotMatch(result.text,/повтори/);}
 }
 let malformed=0;
 const invalid=await localAnswer({...common,request:async()=>{malformed++;return {message:{content:'not JSON'}};}});
 assert.equal(malformed,2);assert.equal(invalid.error,true);assert.doesNotMatch(invalid.text,/Ollama/);
 const prior='Для этого нужно сначала уточнить расположение исходных файлов проекта.';
 const topic={messages:[{role:'assistant',text:prior}]};const repeatCalls=[];
 const repeated=await localAnswer({...common,topic,request:async overrides=>{repeatCalls.push(overrides);return reply(prior);}});
 assert.equal(repeatCalls.length,2);assert.notEqual(repeated,prior);assert.equal(topic.answeredBy,'защита от повторов');
 assert.equal(repeatCalls[1].options.temperature,1);assert.equal(repeatCalls[1].options.repeat_penalty,1.3);
 assert.equal(discoveries,0);assert.equal(recoveries,0);assert.equal(clarifications,0);
 console.log('Own runtime dialogue: pinned model, isolated errors, cancellation, format retry and repeat guard passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
