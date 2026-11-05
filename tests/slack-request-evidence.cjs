const assert=require('node:assert/strict'),{SlackRequest}=require('../src/slack-request.cjs'),{Clarifications}=require('../src/features/clarifications.cjs');
(async()=>{
 let posts=0,reads=0,token='token',topic={id:'a'},outcome='timeout',messages=[];const state={};
 const c=new Clarifications({scope:()=>token+topic.id});
 const slack=new SlackRequest({preview:true,state,save(){},settings:()=>({slackToken:token}),enabled:()=>true,context:()=>topic,reply:(text,extra)=>({text,...extra}),request:async(url,opts)=>{
  if(url.includes('conversations.list'))return {ok:true,channels:[{id:'C1',name:'exact'}]};
  if(url.includes('conversations.history')){reads++;return {ok:true,messages,has_more:true};}
  assert(url.endsWith('chat.postMessage'));posts++;if(outcome==='timeout')throw Error('Timeout');return {ok:true,channel:'C1',ts:'1234567890.123456'};
 }});
 let pending=await c.run('попроси #exact проверить билд',()=>slack.turn('попроси #exact проверить билд'));assert(pending.question);assert(pending.text.includes('#exact'));assert(pending.text.includes('проверить билд'));assert.equal(posts,0);
 await c.answer(pending.clarificationId,'Отмена');assert.equal(posts,0);
 pending=await c.run('попроси #exact проверить билд',()=>slack.turn('попроси #exact проверить билд'));let result=await c.answer(pending.clarificationId,'Отправить');assert.equal(result.actionReceipt.status,'unknown');assert.equal(posts,1);
 result=await slack.verify(state.slackRequests[0].id);assert(result.error);assert.equal(posts,1);assert.equal(reads,1);
 messages=[{client_msg_id:state.slackRequests[0].id,ts:'1234567890.123456'}];result=await slack.verify(state.slackRequests[0].id);assert.equal(result.actionReceipt.status,'confirmed');assert(result.actionReceipt.verifiedAt);assert.equal(posts,1);
 await slack.turn('попроси #exact проверить билд');assert.equal(posts,1);
 topic={id:'a',versionIndex:1};await assert.rejects(slack.verify(state.slackRequests[0].id),/изменились/);topic={id:'b'};await assert.rejects(slack.verify(state.slackRequests[0].id),/изменились/);topic={id:'a'};token='different';await assert.rejects(slack.verify(state.slackRequests[0].id),/изменились/);
 console.log('Slack evidence: explicit preview, cancel, uncertain write, read-only recovery, unmatched history, duplicate guard and scoped verification passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
