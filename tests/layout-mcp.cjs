const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp}=require('../src/mcp.cjs');
module.exports=async ctx=>{
 const feature=require('../src/features/layout.cjs'),source=require('../src/extensions/layout/source.cjs'),markup=require('../src/extensions/layout/markup.cjs');
 const url='https://www.figma.com/design/ABC/Test?node-id=1-2';
 assert.throws(()=>source.source({url:'https://evil.example/file/ABC?node-id=1-2'}));
 assert.throws(()=>source.source({url:'https://www.figma.com/design/ABC/Test'}));
 const topic=ctx.dialogue.active(),events=[],calls=[];let pause,release;
 const settings={module_unity:'true',layoutFigmaToken:'private',layoutZeplinToken:'zeplin'};
 const s={...ctx,settings,win:{isDestroyed:()=>false,webContents:{send:(...a)=>events.push(a)}},unity:{invoke:async(...a)=>{a[3]();calls.push(a);return {content:[{type:'text',text:'{"success":true,"data":{"result":"Assets/PetyaLayouts/Layout.uxml"}}'}]};}}};
 const node={name:'Screen',absoluteBoundingBox:{x:100,y:200,width:300,height:400},children:[{type:'TEXT',characters:'<Hello & "you">',absoluteBoundingBox:{x:110,y:220,width:80,height:40},style:{fontSize:18}}]};
 const {ipc}=feature.setup(s,async(endpoint,options)=>{
  assert.equal(options.redirect,'error');
  if(pause)await new Promise(resolve=>{release=resolve;});
  if(endpoint.includes('figma')){assert.equal(options.headers['X-Figma-Token'],'private');return new Response(JSON.stringify({nodes:{'1:2':{document:node}}}));}
  assert.equal(options.headers.Authorization,'Bearer zeplin');return new Response(JSON.stringify({width:300,height:400,layers:[{type:'text',content:'Zeplin',rect:{x:10,y:20,width:30,height:40}}]}));
 });
 for(const mode of ['read','edit']){
  const endpoint=await startMcp({...ctx,access:{mode,projectId:topic.projectId}},{port:0});const client=new Client({name:'layout-test',version:'1'});
  try{
   await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
   const names=(await client.listTools()).tools.map(t=>t.name);assert.equal(names.includes('prepare_unity_layout'),mode==='edit');if(mode==='read')continue;
   const call=(name,args)=>client.callTool({name,arguments:{chatId:topic.id,...args}});
   assert.ok((await call('prepare_unity_layout',{url,chatId:'foreign'})).isError);
   settings.module_unity='false';assert.ok((await call('prepare_unity_layout',{url})).isError);settings.module_unity='true';
   settings.layoutFigmaToken='';assert.ok((await call('prepare_unity_layout',{url})).isError);settings.layoutFigmaToken='private';
   const result=await call('prepare_unity_layout',{url});assert.ok(!result.isError,JSON.stringify(result));const prepared=JSON.parse(result.content[0].text);
   assert.match(prepared.uxml,/left: 10px; top: 20px/);assert.match(prepared.uxml,/&lt;Hello &amp; &quot;you&quot;&gt;/);assert.ok(!JSON.stringify(prepared).includes('private'));
   assert.ok(!(await call('apply_unity_layout',{proposalId:prepared.id,instance:'EditorA'})).isError);assert.equal(calls.length,1);assert.equal(calls[0][4],'EditorA');assert.match(calls[0][2].arguments.code,/GenerateUniqueAssetPath/);
   assert.ok((await call('apply_unity_layout',{proposalId:prepared.id})).isError);
   const zeplin=await call('prepare_unity_layout',{url:'https://app.zeplin.io/project/abc/screen/def'});assert.ok(!zeplin.isError);assert.match(JSON.parse(zeplin.content[0].text).uxml,/Zeplin/);
   const stale=JSON.parse(zeplin.content[0].text);s.companyId='another';assert.ok((await call('apply_unity_layout',{proposalId:stale.id})).isError);s.companyId=ctx.companyId;
   pause=true;const pending=ipc.prepare({url});await new Promise(resolve=>setImmediate(resolve));await assert.rejects(ipc.prepare({url}),/Дождитесь/);settings.layoutFigmaToken='changed';release();await assert.rejects(pending,/изменились/);settings.layoutFigmaToken='private';pause=false;
   assert.equal(ipc.status().busy,false);assert.equal(ipc.status().kind,'error');assert.ok(events.some(([,e])=>e.busy));
  }finally{await client.close();await endpoint.close();}
 }
 assert.throws(()=>markup.generate({absoluteBoundingBox:{x:0,y:0,width:NaN,height:1}},'figma'));
 console.log('Layout MCP: passed');
};
