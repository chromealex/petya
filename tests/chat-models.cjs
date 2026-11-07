const assert=require('node:assert/strict');
const {create,setup}=require('../src/features/chat-models.cjs');
(async()=>{
 let ready=true,closed=false,persists=0,fetches=0,fetchModels=async()=>{throw Error('offline');};
 const topic={id:'a',projectId:'p'},other={id:'b',projectId:'p'};let active=topic;
 const handlers={};const s={settings:{ollamaUrl:'http://127.0.0.1:11434/api/chat',model:'qwen3:4b'},
 dialogue:{state:{topics:[topic,other],projects:[{id:'p'}]},active:()=>active,persist:()=>persists++},
 modelRuntime:{invoke:()=>{if(closed)throw Error('closed');return {releaseAvailable:ready,phase:ready?'ready':'idle',model:'petya-v1'};}},
 directRequest:async()=>{fetches++;return fetchModels();},handle:(name,fn)=>handlers[name]=fn};
 const {chatModels:api}=setup(s);
 assert.deepEqual((await api.list('a')).models,[{name:'petya-v1',size:0,provider:'petya'}]);
 const before=fetches;await api.set('a','petya-v1','');assert.equal(fetches,before);assert.equal(topic.model,'petya-v1');
 ready=false;await assert.rejects(api.set('b','petya-v1',''),/не готова/);assert.equal(other.model,undefined);
 fetchModels=async()=>({models:[{name:'petya-v1'},{name:'local',size:10},{name:'remote',remote_model:'x'},{name:'cloud-model'},{name:'embedding'}]});
 assert.deepEqual((await api.list('a')).models,[{name:'local',size:10}]);
 await assert.rejects(api.set('a','local',''),/уже изменена/);
 await api.set('a','','petya-v1');assert.equal(topic.model,undefined);
 let release;fetchModels=()=>new Promise(resolve=>release=resolve);
 const pending=handlers.chatModelSet('local','a','');active=other;release({models:[{name:'local'}]});
 await assert.rejects(pending,/другой чат/);assert.equal(topic.model,undefined);assert.equal(other.model,undefined);
 active=topic;const stale=api.set('a','local','');topic.versionIndex=1;release({models:[{name:'local'}]});await assert.rejects(stale,/изменились/);
 const access=api.set('a','local','',()=>{if(closed)throw Error('revoked');});closed=true;release({models:[{name:'local'}]});await assert.rejects(access,/revoked/);
 assert.equal(persists,2);
 console.log('Chat model selection passed: ready qualified runtime, no Ollama dependency for own selection, reserved-name filtering, stale chat/version/model and revoked access rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
