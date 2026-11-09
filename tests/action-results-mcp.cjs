const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {Dialogue}=require('../src/dialogue.cjs'),{Attachments}=require('../src/attachments.cjs'),{SlackRequest}=require('../src/extensions/slack/team-request.cjs'),{startMcp}=require('../src/mcp.cjs');
(async()=>{
 const directory=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'petya-result-mcp-'))),file=path.join(directory,'result.txt');await fs.writeFile(file,'expected');
 const d=new Dialogue({save(){}}),a={id:'a',projectId:'general',jiraProject:'TEST',messages:[],at:Date.now()},b={id:'b',projectId:'private',messages:[],at:Date.now()};d.state.projects.push({id:'private'});d.state.topics.push(a,b);d.state.activeId='a';
 let valid=true,busy=false,reads=0,slackFound=true,jiraTitle='Expected',hook;const events=[];
 const settings={slackToken:'SECRET',jiraUrl:'https://test.atlassian.net',jiraEmail:'fixture',jiraToken:'SECRET',jiraProject:'TEST'};
 const slack=new SlackRequest({state:{},save(){},settings:()=>settings,enabled:()=>true,context:()=>({id:d.active().id,projectId:d.active().projectId,versionIndex:d.active().versionIndex||0}),reply:(text,extra)=>{if(extra?.actionReceipt)require('../src/action-evidence.cjs').recordReceipt(d.active(),extra.actionReceipt);return {text,...extra};},request:async(url,options)=>{assert(url.includes('conversations.history'));assert(!options.method||options.method==='GET');reads++;await hook?.();return {ok:true,messages:slackFound?[{ts:'1234567890.123456',client_msg_id:'send'}]:[]};}});
 const receipt={id:'send',topicId:'a',projectId:'general',version:0,account:slack.account(),channel:'C1',name:'test',status:'unknown',text:'Test',at:Date.now()};slack.state.slackRequests.push(receipt);slack.receipt(receipt);
 const services={dialogue:d,companyId:'company',settings,slackRequest:slack,modules:require('../src/modules.cjs'),chatJobs:{busy:()=>busy},workspace:{settings:()=>settings,api:async(url,opts)=>{assert(!opts.method);reads++;await hook?.();return url.includes('/agile/')?{fields:{}}:{fields:{summary:jiraTitle,updated:'1',project:{key:'TEST'}}};}}};
 const feature=require('../src/features/action-results.cjs');feature.setup(services);Object.assign(services,require('../src/features/chat-changes.cjs').setup(services));
 const scope=require('../src/features/chat-results.cjs').scope(services,a);
 a.chatChanges=[{id:'file',adapter:'files',scope,title:'result.txt',state:'uncertain',target:{file},plan:{after:'expected'}},{id:'jira',adapter:'jira',scope,title:'TEST-1',state:'uncertain',target:{key:'TEST-1',site:settings.jiraUrl,signature:createHash('sha256').update(JSON.stringify([settings.jiraUrl,settings.jiraEmail,settings.jiraToken,settings.atlassianCredential,settings.module_jira])).digest('hex')},plan:{staged:{rows:[{key:'TEST-1',patch:{summary:'Expected'}}]}}}];
 d.select('b');
 const ctx={companyId:'company',dialogue:d,attachments:new Attachments({}),memory:{prune:()=>[]},addContext(){},check(){if(!valid)throw Error('Revoked');},changed:e=>events.push(e),run:fn=>fn()};
 try{for(const mode of ['read','drafts','edit']){
  const endpoint=await startMcp({...ctx,access:{mode,projectId:'general'}},{port:0}),client=new Client({name:'verify-test',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
  const call=async(name,args,error=false)=>{const r=await client.callTool({name,arguments:args});assert.equal(!!r.isError,error,JSON.stringify(r));return error?r:JSON.parse(r.content[0].text);};
  try{
   const listed=await call('list_chat_action_results',{chatId:'a'});assert.equal(listed.total,3);assert(!JSON.stringify(listed).includes('SECRET'));assert(!JSON.stringify(listed).includes(directory));
   await call('list_chat_action_results',{chatId:'b'},true);await call('verify_chat_action_result',{chatId:'a',resultId:'change:unknown',version:0},true);await call('verify_chat_action_result',{chatId:'a',resultId:'change:file',version:1},true);
   busy=true;await call('verify_chat_action_result',{chatId:'a',resultId:'change:file',version:0},true);busy=false;
   const before=await fs.stat(file);
   for(const resultId of ['receipt:send','change:file','change:jira']){const result=await call('verify_chat_action_result',{chatId:'a',resultId,version:0});assert.equal(result.status,'confirmed');assert.equal(result.replayed,false);}
   assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);assert.equal(d.active().id,'b');assert.equal(b.messages.length,0);
   jiraTitle='Different';assert.equal((await call('verify_chat_action_result',{chatId:'a',resultId:'change:jira',version:0})).status,'inconclusive');jiraTitle='Expected';
   slackFound=false;assert.equal((await call('verify_chat_action_result',{chatId:'a',resultId:'receipt:send',version:0})).status,'inconclusive');slackFound=true;
   hook=()=>{valid=false;};await call('verify_chat_action_result',{chatId:'a',resultId:'change:jira',version:0},true);hook=null;valid=true;
   a.archived=true;await call('list_chat_action_results',{chatId:'a'},true);a.archived=false;
  }finally{await client.close();await endpoint.close();}
 }
 assert(reads>0);assert(events.some(e=>e.name==='verify_chat_action_result'));
 console.log('MCP result verification: Slack/Jira/files, read/drafts/edit, inactive scope, no writes, inconclusive outcomes, redaction, revocation and stale IDs passed');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
