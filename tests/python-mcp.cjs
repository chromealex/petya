const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp}=require('../src/mcp.cjs');
const feature=require('../src/features/python.cjs');
module.exports=async function(){
 const topic={id:'python-chat',projectId:'general',messages:[],versionIndex:0};let calls=0,blocked=false;
 const dialogue={active:()=>topic,state:{topics:[topic],projects:[{id:'general'}]},persist(){}};
 const s={companyId:'c',settings:{extension_python:'true'},dialogue,pythonRuntime:{status:async()=>({ready:true}),run:async({code},{check})=>{check();calls++;return {ok:true,stdout:'42\n',stderr:'',exitCode:0};}}};feature.setup(s);
 for(const mode of ['read','drafts','edit']){
  const ctx={companyId:'c',dialogue,access:{mode,projectId:'general'},check(){if(blocked)throw Error('Access revoked');},run:fn=>fn(),chatJobs:{busy:()=>false}};
  const endpoint=await startMcp(ctx,{port:0});const client=new Client({name:'python-test',version:'1'});
  try{
   await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
   const names=(await client.listTools()).tools.map(t=>t.name);assert(names.includes('python_status'));assert.equal(names.includes('run_python'),mode==='edit');assert.equal(names.includes('stop_python'),mode==='edit');
   const args={chatId:topic.id,version:0};
   assert.equal(JSON.parse((await client.callTool({name:'python_status',arguments:args})).content[0].text).ready,true);
   if(mode==='edit'){
    const run=extra=>client.callTool({name:'run_python',arguments:{...args,code:'print(42)',...extra}});
    assert.equal(JSON.parse((await run()).content[0].text).stdout,'42\n');assert.equal(calls,1);assert.equal(topic.messages.at(-1).pythonExecution.code,'print(42)');
    assert((await run({version:3})).isError);assert((await run({chatId:'other'})).isError);
    ctx.access.projectId='other';assert((await run()).isError);ctx.access.projectId='general';
    s.settings.extension_python='false';assert((await run()).isError);s.settings.extension_python='true';
    ctx.access.mode='read';assert((await run()).isError);ctx.access.mode='edit';
    blocked=true;assert((await run()).isError);blocked=false;assert.equal(calls,1);
    assert(!(await client.callTool({name:'stop_python',arguments:args})).isError);
   }
  }finally{await client.close();await endpoint.close();}
 }
 console.log('Python MCP: real HTTP client, shared runtime, saved result, read/drafts denial, version/project/access checks passed');
};
if(require.main===module)module.exports().catch(e=>{console.error(e);process.exitCode=1;});
