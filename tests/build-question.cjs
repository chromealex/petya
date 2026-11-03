const assert=require('node:assert/strict');
const {BuildQuestion,isBuildQuestion,owners}=require('../src/build-question.cjs');
(async()=>{
 let now=1700000000000;assert(isBuildQuestion('Петя, что с билдом'));assert(isBuildQuestion('что с билдом 123?'));assert(!isBuildQuestion('почему падает билд'));assert(!isBuildQuestion('не спрашивай что с билдом'));
 const message={user:'UQA',ts:'1699999999.000000',text:'Собираю билд 123'};assert.equal(owners([message],'123','UME',now)[0].id,'UQA');assert.equal(owners([{...message,text:'Не собираю билд 123'}],'123','UME',now).length,0);assert.equal(owners([{...message,text:'QA обсуждают билд 123'}],'123','UME',now).length,0);assert.equal(owners([message],'124','UME',now).length,0);
 let posted=[],methodCalls=[],failSend=false,reply=false;let messages=[message];const state={buildQuestions:[]},topic={id:'t',at:now,messages:[],slackSource:{url:'https://app.slack.com/archives/C123/p1699999999000000'}};
 const dialogue={state:{topics:[topic]},active:()=>topic,prune(){},persist(){}};const settings=()=>({slackToken:'secret'});const notify=[];
 const request=async(url,options)=>{const u=new URL(url),method=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):Object.fromEntries(u.searchParams);methodCalls.push(method);
 if(method==='auth.test')return {ok:true,user_id:'UME'};
 if(method==='conversations.replies')return {ok:true,messages:reply?[{user:'UQA',ts:'1700000001.000000',text:'Будет готов через 5 минут'}]:messages};
 if(method==='users.info')return {ok:true,user:{id:body.user,profile:{display_name:'Полина'}}};
 if(method==='conversations.open')return {ok:true,channel:{id:'D123'}};
 if(method==='chat.postMessage'){posted.push(body);if(failSend)throw Error('timeout');return {ok:true,channel:body.channel,ts:'1700000000.000000'};}
 throw Error('Unexpected '+method);
 };
 const create=()=>new BuildQuestion({state,save:()=>{},request,settings,enabled:()=>true,dialogue,store:{items:[],prune(){}},notify:t=>notify.push(t),now:()=>now});let service=create();
 let result=await service.turn('что с билдом, не пиши пока');assert.equal(posted.length,0);result=await service.turn('Петя, что с билдом');assert.match(result.text,/Спросил Полина/);assert.equal(posted.length,1);assert.equal(posted[0].channel,'D123');assert(!posted[0].text.includes('secret'));assert.equal(posted[0].unfurl_links,false);
 await service.turn('что с билдом');assert.equal(posted.length,1);
 reply=true;now+=61000;await service.tick();assert.equal(state.buildQuestions[0].status,'answered');assert.equal(notify.length,1);service=create();await service.tick();assert.equal(notify.length,1);
 // No guessed QA recipient: use the actual source channel.
 now+=16*60000;reply=false;messages=[{...message,ts:String(now/1000)+'.000000',text:'Обсуждаем билд 123'}];await service.turn('что с билдом');assert.equal(posted.at(-1).channel,'C123');
 // Multiple context-backed owners require selection, never random recipient.
 now+=16*60000;messages=[{...message,ts:String(now/1000)+'.000000'},{user:'UOTHER',ts:String(now/1000)+'.000001',text:'Собираю билд 123'}];result=await service.turn('что с билдом');assert.equal(result.buildQuestionChoices.length,3);const count=posted.length;await service.turn('', 'channel');assert.equal(posted.length,count+1);assert.equal(posted.at(-1).channel,'C123');
 // Ambiguous transport failure survives restart and must not resend.
 now+=16*60000;messages=[{...message,ts:String(now/1000)+'.000000'}];failSend=true;await service.turn('что с билдом');const sent=posted.length;assert.equal(state.buildQuestions.at(-1).status,'unknown');service=create();await service.turn('что с билдом');assert.equal(posted.length,sent);
 // Revocation mid-lookup prevents writes.
 let resolve;const delayed=new Promise(r=>resolve=r);const revoked=new BuildQuestion({state:{},save:()=>{},settings,enabled:()=>true,dialogue,store:{items:[],prune(){}},notify(){},now:()=>now,request:()=>delayed});const pending=revoked.turn('что с билдом');revoked.reset();resolve({ok:true,user_id:'UME'});result=await pending;assert.match(result.text,/изменились/);
 console.log('Build questions: contextual recipient, channel fallback, ambiguity, send dedupe, restart, replies and revocation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
