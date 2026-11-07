// A chat opened for this request keeps it: no routing into another or a new chat (it made a second chat in the
// sidebar, removed the first and left the user on a chat that no longer exists).
const assert=require('node:assert/strict');const {Dialogue,freshChat}=require('../src/dialogue.cjs');
(async()=>{
 assert.ok(freshChat({messages:[]}));assert.ok(freshChat({messages:[{role:'user',text:'x',pending:true}]}));assert.ok(!freshChat({messages:[{role:'user',text:'x'},{role:'assistant',text:'y'}]}));
 let routed=0;
 const state={projects:[{id:'general',name:'Общее'}],activeProjectId:'general',activeId:'new',topics:[
  {id:'poems',projectId:'general',title:'Стихи',kind:'chat',messages:[{role:'user',text:'Напиши стих',at:Date.now()},{role:'assistant',text:'…',at:Date.now()}],at:Date.now()},
  {id:'new',projectId:'general',title:'Новый чат',kind:'chat',messages:[{role:'user',text:'Напиши четверостишье в стиле Пушкина',pending:true,at:Date.now()}],at:Date.now()}]};
 const d=new Dialogue({state,answer:async()=>({text:'Стихи'}),routeTopic:async()=>{routed++;return {topicId:'poems'};}});
 assert.equal(d.prepareRoute('Напиши четверостишье в стиле Пушкина'),null,'no speculative routing for a fresh chat either');
 const r=await d.turn('Напиши четверостишье в стиле Пушкина');
 assert.equal(routed,0,'a fresh chat is not routed');assert.equal(r.topicId,'new');assert.equal(state.topics.length,2);
 assert.ok(d.prepareRoute('Ещё одно'),'once the chat has an answer, routing works as before');
 console.log('Fresh chat: the request stays in the chat opened for it passed');
})().catch(e=>{console.error(e);process.exit(1);});
// With automatic chats off (the default in the app): no routing, and tasks or bugs are answered in the open chat.
(async()=>{let routed=0;
 const state={projects:[{id:'general',name:'Общее'}],activeProjectId:'general',activeId:'c',topics:[{id:'c',projectId:'general',title:'Разговор',kind:'chat',messages:[{role:'user',text:'Привет',at:Date.now()},{role:'assistant',text:'Привет!',at:Date.now()}],at:Date.now()}]};
 const d=new Dialogue({state,autoTopics:()=>false,answer:async()=>({text:'ok'}),routeTopic:async()=>{routed++;return {newTopic:true,title:'Осень'};},readers:{bugs:async()=>({text:'BW-1 — Краш (Open)'})}});
 await d.turn('Расскажи про осень в Петербурге');assert.equal(routed,0);assert.equal(state.topics.length,1);
 assert.equal(d.prepareRoute('А зимой?'),null);
 const r=await d.turn('Какие баги открыты?');assert.equal(r.topicId,'c','bugs are answered in the open chat');assert.equal(state.topics.length,1);assert.equal(state.topics[0].kind,'bugs');
 const n=await d.turn('Новая тема: отпуск');assert.equal(state.topics.length,1,'«новая тема» switched chats by itself');assert.deepEqual(n.chatOffer,{newChat:true,command:'отпуск'},'«новая тема» offers a new chat');
 console.log('Chats: made only on request; tasks and bugs answered in the open chat passed');
})().catch(e=>{console.error(e);process.exit(1);});
