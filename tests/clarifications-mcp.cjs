const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp}=require('../src/mcp.cjs');
const feature=require('../src/features/clarifications.cjs');
const {ask}=require('../src/input-required.cjs');
const {Dialogue}=require('../src/dialogue.cjs');
const {Attachments}=require('../src/attachments.cjs');
(async()=>{
 const dialogue=new Dialogue({save(){}}),events=[];let busy=false,valid=true,writes=0;
 dialogue.state.projects.push({id:'private',name:'Private'});
 const a={id:'a',projectId:'general',kind:'chat',at:Date.now(),title:'A',messages:[]},b={id:'b',projectId:'private',kind:'chat',at:Date.now(),title:'B',messages:[]};dialogue.state.topics.push(a,b);dialogue.state.activeId='a';
 const settings={slackToken:'NEVER-EXPOSE'};
 const services={dialogue,companyId:'default',settings,teamFill:{turn:async answer=>({handled:true,text:'Команда: '+answer})}};
 const {clarifications:c}=feature.setup(services);
 const ctx={companyId:'default',dialogue,attachments:new Attachments({}),chatJobs:{busy:()=>busy},memory:{prune:()=>[]},addContext(){},check(){if(!valid)throw Error('Revoked');},changed:e=>events.push(e),run:fn=>fn()};
 const open=async mode=>{const endpoint=await startMcp({...ctx,access:{mode,projectId:'general'}},{port:0}),client=new Client({name:'clarifications-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));return {client,close:async()=>{await client.close();await endpoint.close();}};};
 const askOne=()=>c.run('Создай задачу',()=>ask({text:'В каком проекте?',options:['BW','MW'],strictChoices:true},project=>ask({text:'Кто исполнитель?'},name=>({handled:true,text:project+' / '+name,write:++writes}))));
 const pending=await askOne();const args={chatId:'a',clarificationId:pending.clarificationId};
 for(const mode of ['read','drafts']){const peer=await open(mode);try{const names=(await peer.client.listTools()).tools.map(t=>t.name);assert(names.includes('list_chat_clarifications'));assert(!names.includes('answer_chat_clarification'));const response=await peer.client.callTool({name:'get_chat_clarification',arguments:args});assert(!response.isError,JSON.stringify({response,rows:c.list(),active:dialogue.state.activeId}));assert(!JSON.stringify(response).includes('NEVER-EXPOSE'));}finally{await peer.close();}}
 const peer=await open('edit');
 const call=async(name,args={},error=false)=>{const r=await peer.client.callTool({name,arguments:args});assert.equal(!!r.isError,error,JSON.stringify(r));return error?r:JSON.parse(r.content[0].text);};
 try{
  assert.equal((await call('list_chat_clarifications')).total,1);
  await call('answer_chat_clarification',{...args,answer:'BW',optionId:'1'},true);
  await call('answer_chat_clarification',{...args,optionId:'404'},true);
  busy=true;await call('answer_chat_clarification',{...args,optionId:'1'},true);busy=false;
  dialogue.state.activeId='b';dialogue.state.activeProjectId='private';const hidden=await c.run('Private request',()=>ask({text:'Private question'},()=>++writes));
  assert.equal((await call('list_chat_clarifications')).items[0].active,false);
  await call('get_chat_clarification',{chatId:'b',clarificationId:hidden.clarificationId},true);
  const next=await call('answer_chat_clarification',{...args,optionId:'1'});assert.equal(next.status,'waiting');assert.equal(writes,0);assert.equal(next.clarification.request,'Создай задачу');
  await call('answer_chat_clarification',{...args,optionId:'1'},true);
  const nextArgs={chatId:'a',clarificationId:next.clarification.id,answer:'Анна'};
  const results=await Promise.all([peer.client.callTool({name:'answer_chat_clarification',arguments:nextArgs}),peer.client.callTool({name:'answer_chat_clarification',arguments:nextArgs})]);assert.equal(results.filter(r=>!r.isError).length,1);assert.equal(writes,1);
  assert(a.messages.some(m=>m.role==='user'&&m.text==='Анна'&&m.by==='MCP'));assert.equal(events.at(-1).result.messages.at(-1).text,'BW / Анна');
  assert.equal(dialogue.state.activeId,'b');assert.equal(dialogue.state.activeProjectId,'private');assert(!b.messages.some(m=>m.text==='Анна'||m.text==='BW / Анна'));
  dialogue.state.activeId='a';dialogue.state.activeProjectId='general';
  let p=await askOne();await call('cancel_chat_clarification',{chatId:'a',clarificationId:p.clarificationId});assert.equal(writes,1);
  p=await askOne();settings.slackToken='changed';assert.equal((await call('list_chat_clarifications')).total,0);await call('answer_chat_clarification',{chatId:'a',clarificationId:p.clarificationId,optionId:'1'},true);
  p=await askOne();a.versionIndex=1;assert.equal((await call('list_chat_clarifications')).total,0);
  p=await askOne();a.archived=true;await call('get_chat_clarification',{chatId:'a',clarificationId:p.clarificationId},true);a.archived=false;
  p=await c.run('Заполни команду',()=>({handled:true,question:true,teamFillReply:true,text:'Какой канал?'}));const team=await call('answer_chat_clarification',{chatId:'a',clarificationId:p.clarificationId,answer:'#dev'});assert.equal(team.text,'Команда: #dev');
  let begin;const ready=new Promise(resolve=>begin=resolve);p=await c.run('Долго',()=>ask({text:'Начать?'},async()=>{begin();await new Promise((resolve,reject)=>require('../src/answer-cancel.cjs').signal().addEventListener('abort',()=>reject(require('../src/answer-cancel.cjs').stopped()),{once:true}));return {text:'Не должно выполниться'};}));
  const ongoing=call('answer_chat_clarification',{chatId:'a',clarificationId:p.clarificationId,answer:'Да',assistant:'Внешний помощник'});await ready;assert((await call('stop_chat_continuation',{chatId:'a'})).stopped);assert.equal((await ongoing).status,'cancelled');const audit=await call('list_chat_continuations',{chatId:'a'});assert.equal(audit.items.at(-1).actor,'MCP · Внешний помощник');assert.equal(audit.items.at(-1).state,'cancelled');await call('list_chat_continuations',{chatId:'b'},true);
  valid=false;await call('list_chat_clarifications',{},true);assert.equal(writes,1);
 }finally{await peer.close();}
 console.log('MCP clarifications: scoped listing, read/drafts denial, inactive chat isolation, choices, multistep continuation, cancellation, replay, stale connection/version and UI events passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
