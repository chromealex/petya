const assert=require('node:assert/strict');
const {isContextReference,referenceTarget}=require('../src/context-reference.cjs');
const {SlackLogs}=require('../src/extensions/slack/logs.cjs');
const {ContextStore}=require('../src/context-store.cjs');
(async()=>{
 for(const text of ['Петя, посмотри эту фигню','глянь вот это','Петя посмотри-ка на эту штуку','можешь посмотреть эту ерунду?','разбери этот тред'])assert(isContextReference(text),text);
 for(const text of ['не посмотри эту фигню','создай задачу','почему билд падает','посмотри почту','посмотри этого человека'])assert(!isContextReference(text),text);
 const now=Date.now(),topic={at:now,messages:[{text:'context'}]};assert.equal(referenceTarget({pending:1,topic,service:true,now}),'attachments');assert.equal(referenceTarget({topic,service:true,now}),'topic');assert.equal(referenceTarget({service:true,now}),'service');assert.equal(referenceTarget({topic:{...topic,at:now-700000},service:false,now}),'clarify');
 const store=new ContextStore({now:()=>now,save:()=>{}});store.put([{id:'view',source:'Slack',opened:true,at:now-1000,title:'Design',text:'Thread\nA discussion about button colours'}]);
 const reader=new SlackLogs({store,now:()=>now,read:async()=>({}),settings:()=>({}),request:async()=>{throw Error('Unexpected request') }});
 const result=await reader.collect({contextual:true});assert.match(result.attachments[0].text,/button colours/);
 store.items[0].at=now-700000;await assert.rejects(()=>reader.collect({contextual:true}),/Что именно посмотреть/);
 console.log('Context references: phrases, priority, generic Slack discussion and stale context passed');
})().catch(e=>{console.error(e);process.exitCode=1});
