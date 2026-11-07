const assert=require('node:assert/strict');
(async()=>{
 const capture=require('../src/extensions/jira/result.cjs').capture;
 const items=capture({sources:[{url:'https://work.atlassian.net/issues/'}],data:{issues:[{key:'BW-1',fields:{summary:'Вход',status:{name:'Готово',statusCategory:{key:'done'}},assignee:{displayName:'Анна'},priority:{name:'High'}}}]}});
 assert.equal(items[0].status,'Готово');assert.equal(items[0].assignee,'Анна');assert.equal(items[0].site,'https://work.atlassian.net');
 const rows=[{channel:'C1',url:'https://app.slack.com/archives/C1/p123',messages:[{user:'U1',at:123,text:'Точный текст'}]}];
 const slack=require('../src/extensions/slack/message-result.cjs');
 let calls=0;const result=await slack.capture(rows,{slackToken:'test'},async url=>{if(url.includes('auth.test'))return {ok:true,team_id:'T9'};calls++;return {ok:true,user:{real_name:'Мария'}}});
 assert.equal(calls,1);assert.equal(result[0].appUrl,'','no app link without a message permalink');assert.equal(result[0].author,'Мария');assert.equal(result[0].text,'Точный текст');assert.equal(result[0].at,123);
 slack.clear();const missing=await slack.capture(rows,{slackToken:'test'},async()=>{throw Error('429');});assert.equal(missing[0].author,'U1');
 slack.clear();
 const marked=[{id:'slack:C1:1700000000.000100',channel:'C1',url:'https://app.slack.com/archives/C1/p1700000000000100',messages:[{user:'U2',ts:'1700000000.000100',at:1,text:'<@U3> глянь <https://jira.example.com/browse/BW-1|BW-1> в <#C7|dev> <!here>',files:[{id:'F1',name:'crash.png',size:2048}]}]}];
 const card=(await slack.capture(marked,{slackToken:'t',teamMembers:JSON.stringify([{name:'Сергей',slackId:'U3'},{name:'Аня',slackId:'U2'}])},async url=>url.includes('auth.test')?{ok:true,team_id:'T1'}:{ok:false}))[0];
 assert.equal(card.author,'Аня');assert.equal(card.text,'@Сергей глянь BW-1 в #dev @here');
 assert.deepEqual(card.parts.find(p=>p.link),{link:'https://jira.example.com/browse/BW-1',text:'BW-1'});
 assert.equal(card.appUrl,'slack://channel?team=T1&id=C1&message=1700000000.000100');
 assert.equal(card.files[0].name,'crash.png');assert.deepEqual(JSON.parse(Buffer.from(card.files[0].id,'base64url')),['slack','slack:C1:1700000000.000100','1700000000.000100','F1']);
 console.log('Service card data: source fields, exact Slack body/time, author lookup and unavailable profile passed');
})().catch(e=>{console.error(e);process.exit(1);});
