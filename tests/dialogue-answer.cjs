const assert=require('node:assert/strict');
const {localAnswer}=require('../src/dialogue-answer.cjs');
(async()=>{
 let fallbacks=0;const options={model:'local',uncertain:()=>false,clarify:()=>{fallbacks++;return 'clarified';}};
 const answer=content=>async()=>({message:{content:JSON.stringify(content)}});
 assert.equal(await localAnswer({...options,request:answer({understood:true,answer:'Привет!'})}),'Привет!');
 for(const error of [new TypeError('offline'),Object.assign(Error('busy'),{status:429}),Object.assign(Error('missing'),{status:404})]){const result=await localAnswer({...options,request:async()=>{throw error;}});assert(result.error);assert.match(result.text,/Ollama/);}
 assert((await localAnswer({...options,model:''})).error);
 assert((await localAnswer({...options,request:async()=>({message:{content:'invalid JSON'}})})).error);
 assert.equal(fallbacks,0,'configuration, transport and malformed output must not call cloud interpreters');
 assert.equal(await localAnswer({...options,request:answer({understood:false,answer:''})}),'clarified');assert.equal(fallbacks,1);
 const {Dialogue}=require('../src/dialogue.cjs');
 for(const routeTopic of [async()=>({unclear:true}),async()=>{throw Error('routing unavailable');}]){
 const dialogue=new Dialogue({routeTopic,answer:()=>localAnswer({...options,request:answer({understood:true,answer:'Привет!'})})});
 assert.equal((await dialogue.turn('Привет')).text,'Привет!');
 }
 assert.equal(fallbacks,1);
 console.log('Local dialogue: routing uncertainty, service errors, malformed replies and semantic clarification passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
