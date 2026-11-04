const assert=require('node:assert/strict');const {standaloneKnowledge,selectKnowledgeModel}=require('../src/knowledge-model.cjs');
assert(standaloneKnowledge('Переведи слово tree на русский.',{messages:[]}));
assert(!standaloneKnowledge('Кто назначен на мою задачу?',{messages:[]}));
assert(!standaloneKnowledge('Какой бюджет?',{messages:[{role:'user',text:'Бюджет 500'}]}));
assert(!standaloneKnowledge('Какая роль у Льва?',{messages:[]}));
(async()=>{
 let calls=0;const settings={model:'qwen3:4b',ollamaUrl:'http://127.0.0.1:11434/api/chat'};const request=async url=>{calls++;return url.endsWith('/api/tags')?{models:[{name:'gemma3:4b'}]}:{capabilities:['completion']};};
 assert.equal(await selectKnowledgeModel(settings,request),'gemma3:4b');assert.equal(await selectKnowledgeModel(settings,request),'gemma3:4b');assert.equal(calls,2,'Local discovery is cached');
 assert.equal(await selectKnowledgeModel({...settings,model:'other'},()=>assert.fail('Respect other selected models')),null);
 assert.equal(await selectKnowledgeModel({...settings,ollamaUrl:'http://127.0.0.1:11435/api/chat'},async()=>({models:[{name:'gemma3:4b',remote_host:'cloud'}]})),null);
 assert.equal(await selectKnowledgeModel({...settings,ollamaUrl:'http://127.0.0.1:11436/api/chat'},async()=>{throw Error('offline')}),null);
 console.log('Knowledge routing: standalone questions, context retention, installed local models only, caching and unavailable-model fallback passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
