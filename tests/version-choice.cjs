// Picking a version from Petya's question: «19.3» finds «1.19.3», and the pick stays in the chat history as the
// user's message instead of the original request repeated.
const assert=require('node:assert/strict');const {Dialogue,selectChoice}=require('../src/dialogue.cjs');
const options=[{id:'v3',label:'1.19.3 · не выпущена'},{id:'v2',label:'1.19.2 · выпущена'},{id:'v20',label:'Bunker 20.1'}];
assert.deepEqual(selectChoice('19.3',options).map(o=>o.id),['v3']);
assert.deepEqual(selectChoice('версия 1.19.2.',options).map(o=>o.id),['v2']);
assert.deepEqual(selectChoice('2',options).map(o=>o.id),['v2'],'a number alone is still the position in the list');
assert.deepEqual(selectChoice('20.1',options).map(o=>o.id),['v20']);
(async()=>{
 const pending={field:'versionId',kind:'bugs',command:'Какие баги в последней версии?',options};
 for(const [input,choice,shown] of [['19.3',undefined,'19.3'],[undefined,'v2','1.19.2']]){
  const state={projects:[{id:'general',name:'Общее'}],activeProjectId:'general',activeId:'c',topics:[{id:'c',projectId:'general',title:'Баги',kind:'bugs',pending:structuredClone(pending),
   messages:[{role:'user',text:'Какие баги в последней версии?',at:Date.now()-2000},{role:'assistant',text:'Какую версию?',at:Date.now()-1000}],at:Date.now()-1000}]};
  let asked;const d=new Dialogue({state,autoTopics:()=>false,answer:async()=>({text:'ok'}),readers:{bugs:async(command,topic)=>{asked=topic.versionId;return {text:'BW-1 — Краш'};}}});
  await d.turn(input,choice);
  const users=state.topics[0].messages.filter(m=>m.role==='user').map(m=>m.text);
  assert.deepEqual(users,['Какие баги в последней версии?',shown]);assert.equal(asked,choice||'v3');
 }
 console.log('version choice: «19.3» recognised, the pick saved in the chat history passed');
})().catch(e=>{console.error(e);process.exit(1);});
