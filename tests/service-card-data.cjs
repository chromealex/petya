const assert=require('node:assert/strict');
(async()=>{
 const capture=require('../src/extensions/jira/result.cjs').capture;
 const items=capture({sources:[{url:'https://work.atlassian.net/issues/'}],data:{issues:[{key:'BW-1',fields:{summary:'Вход',status:{name:'Готово',statusCategory:{key:'done'}},assignee:{displayName:'Анна'},priority:{name:'High'}}}]}});
 assert.equal(items[0].status,'Готово');assert.equal(items[0].assignee,'Анна');assert.equal(items[0].site,'https://work.atlassian.net');
 const rows=[{channel:'C1',url:'https://app.slack.com/archives/C1/p123',messages:[{user:'U1',at:123,text:'Точный текст'}]}];
 const slack=require('../src/extensions/slack/message-result.cjs');
 let calls=0;const result=await slack.capture(rows,{slackToken:'test'},async()=>{calls++;return {ok:true,user:{real_name:'Мария'}}});
 assert.equal(calls,1);assert.equal(result[0].author,'Мария');assert.equal(result[0].text,'Точный текст');assert.equal(result[0].at,123);
 const missing=await slack.capture(rows,{slackToken:'test'},async()=>{throw Error('429');});assert.equal(missing[0].author,'U1');
 console.log('Service card data: source fields, exact Slack body/time, author lookup and unavailable profile passed');
})().catch(e=>{console.error(e);process.exit(1);});
