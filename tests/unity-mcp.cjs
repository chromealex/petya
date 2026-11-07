const assert=require('node:assert/strict');
const http=require('node:http');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp}=require('../src/mcp.cjs');
const unity=require('../src/extensions/unity/desktop.cjs');

module.exports=async function(ctx) {
  const calls=[],prompts=[];
  let multiple=false;
  const guid='0123456789abcdef0123456789abcdef';
  const tools=['read_console','manage_asset','manage_scene','manage_components'].map(name=>({name,inputSchema:{type:'object'}}));
  const editor=http.createServer(async(req,res)=>{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    if (!chunks.length){res.writeHead(405).end();return;}
    const {id,method,params}=JSON.parse(Buffer.concat(chunks));
    if(id==null){res.writeHead(202).end();return;}
    let result;
    if(method==='initialize')result={protocolVersion:params.protocolVersion,capabilities:{tools:{},resources:{}},serverInfo:{name:'fixture',version:'1'}};
    if(method==='tools/list')result=params?.cursor?{tools:tools.slice(1)}:{tools:tools.slice(0,1),nextCursor:'second'};
    if(method==='resources/list')result={resources:[{uri:'unity://editor/state',name:'state'},...(multiple?[{uri:'mcpforunity://instances',name:'instances'}]:[])]};
    if(method==='resources/templates/list')result={resourceTemplates:[{uriTemplate:'unity://scene/{id}',name:'scene'}]};
    if(method==='resources/read')result={contents:[{uri:params.uri,text:params.uri==='mcpforunity://instances'?JSON.stringify({success:true,instances:[{id:'A',name:'First'},{id:'B',name:'Second'}]}):'scene data'}]};
    if(method==='tools/call'){
      calls.push(params);
      const data=params.name==='set_active_instance'?{instance:params.arguments.instance}:params.name==='manage_asset'?{totalAssets:1,pageNumber:1,assets:[{guid,path:'Assets/Tank.prefab'}]}:{entries:['console entry']};
      result={content:[{type:'text',text:JSON.stringify({success:true,data})}]};
    }
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({jsonrpc:'2.0',id,result}));
  });
  await new Promise(resolve=>editor.listen(0,'127.0.0.1',resolve));
  let decision=0;
  const topic=ctx.dialogue.active();
  const s={...ctx,win:{isDestroyed:()=>false,webContents:{send(){}}},settings:{module_unity:'true',unityUrl:'http://127.0.0.1:'+editor.address().port+'/mcp'}};
  const {unity:feature}=unity.setup(s,()=>({showMessageBox:async(_,options)=>{prompts.push(options.detail);return {response:decision};}}));
  const endpoint=await startMcp({...ctx,invokeUnity:feature.invoke,access:{mode:'edit',projectId:topic.projectId}},{port:0});
  const peer=new Client({name:'unity-test',version:'1'});
  const call=(name,args={})=>peer.callTool({name:'unity_'+name,arguments:{chatId:topic.id,...args}});
  try{
    await peer.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
    const catalog=(await call('discover')).structuredContent;
    assert.deepEqual(catalog.tools.map(t=>t.name),tools.map(t=>t.name));
    assert.equal(feature.turn('Покажи ошибки Unity').messages.at(-1).unityRequest.name,'read_console');
    const args={name:'read_console',arguments:{action:'get',types:['error']}};
    assert.ok(!(await call('call_tool',args)).isError);
    assert.deepEqual(calls[0],args);
    assert.match(prompts.at(-1),/read_console[\s\S]*get/);
    assert.equal((await call('read_resource',{uri:'unity://scene/42'})).content[0].resource.text,'scene data');
    assert.ok((await call('read_resource',{uri:'file:///private/file'})).isError);
    assert.ok((await call('call_tool',{name:'missing',arguments:{}})).isError);
    assert.equal((await call('find_prefabs',{query:'Tank'})).structuredContent.matches[0].guid,guid);
    assert.equal(calls.at(-1).name,'manage_asset');
    decision=1;
    assert.ok((await call('call_tool',args)).isError);
    assert.equal(calls.length,2);
    const count=prompts.length;
    assert.ok((await call('discover',{chatId:'private-chat'})).isError);
    s.settings.module_unity='false';
    assert.ok((await call('discover')).isError);
    assert.equal(prompts.length,count);
    decision=0;s.settings.module_unity='true';multiple=true;
    const editors=await call('find_prefabs',{query:'Tank'});
    assert.equal(editors.structuredContent.editors.length,2);
    const selected=await call('call_tool',{...args,instance:'B'});
    assert.ok(!selected.isError);
    assert.equal(calls.at(-2).name,'set_active_instance');
    assert.equal(calls.at(-2).arguments.instance,'B');
    assert.equal(calls.at(-1).name,'read_console');
    const denied=await call('call_tool',{name:'set_active_instance',arguments:{instance:'A'},instance:'B'});
    assert.ok(denied.isError);
    const reader=await startMcp({...ctx,invokeUnity:feature.invoke,access:{mode:'read',projectId:topic.projectId}},{port:0});
    const readPeer=new Client({name:'read-test',version:'1'});
    try{
      await readPeer.connect(new StreamableHTTPClientTransport(new URL(reader.url),{requestInit:{headers:{Authorization:'Bearer '+reader.token}}}));
      assert.ok(!(await readPeer.listTools()).tools.some(t=>t.name.startsWith('unity_')));
    }finally{await readPeer.close();await reader.close();}
    s.settings.model='test';s.settings.ollamaUrl='http://127.0.0.1:11434/api/chat';
    const decisions=[
      {action:'call',name:'read_console',arguments:'{"action":"get"}',text:'Читаю ошибки',evidence:[]},
      {action:'call',name:'manage_components',arguments:'{"action":"set_property","target":42,"component_type":"BoxCollider","property":"enabled","value":true}',text:'Предлагаю включить коллайдер.',evidence:[1]}
    ];
    s.request=async(url,options)=>{
      const item=decisions.shift();
      if(JSON.parse(options.body).format)return {message:{content:JSON.stringify(item)}};
      return {message:{content:item.text,tool_calls:[{id:'test',function:{name:item.name,arguments:JSON.parse(item.arguments)}}]}};
    };
    const before=calls.filter(c=>c.name==='manage_components').length;
    const diagnosis=await call('assist',{command:'Проверь персонажа',instance:'B'});
    assert.ok(!diagnosis.isError,diagnosis.content[0].text);
    assert.equal(calls.filter(c=>c.name==='manage_components').length,before);
    const proposalId=diagnosis.structuredContent.proposalId;
    assert.ok(proposalId);
    decision=1;
    assert.ok((await call('apply_agent_proposal',{proposalId})).isError);
    decision=0;
    assert.ok(!(await call('apply_agent_proposal',{proposalId})).isError);
    assert.equal(calls.filter(c=>c.name==='manage_components').length,before+1);
    assert.ok((await call('apply_agent_proposal',{proposalId})).isError);
    multiple=false;
    decisions.push({id:'unity',confidence:.98},
      {action:'call',name:'read_console',arguments:'{"action":"get"}',text:'Читаю ошибки',evidence:[]},
      {action:'call',name:'manage_components',arguments:'{"action":"set_property","target":42,"component_type":"BoxCollider","property":"enabled","value":true}',text:'Предлагаю включить коллайдер.',evidence:[1]});
    s.settings.semanticTools='true';
    const app={...s,unity:feature,saveSettings:patch=>Object.assign(s.settings,patch),requestProgress:{report(){}}};
    const extension=require('../src/features/extension-replies.cjs').setup(app).extensionReplies;
    const beforeChatApproval=calls.length;
    let approval;
    await assert.rejects(extension.turn('Разберись почему персонаж проваливается сквозь пол'),error=>{
      assert.equal(error.name,'InputRequired');assert.deepEqual(error.spec.options,['Разрешить','Отмена']);
      approval=error;return true;
    });
    assert.equal(calls.length,beforeChatApproval,'Chat must not contact Unity before consent');
    const chatReply=await approval.resume('Разрешить');
    assert.throws(()=>approval.resume('Разрешить'),/уже ответили/);
    assert.match(chatReply.text,/Предлагаю включить коллайдер/);
    const proposed=topic.messages.at(-1).unityAgent;
    assert.ok(proposed.proposalId);
    topic.messages.push({role:'user',text:'Теперь другая задача'});
    assert.ok((await call('apply_agent_proposal',{proposalId:proposed.proposalId})).isError);
    console.log('Unity discovery, native calls, resources, prefabs and access checks verified through two MCP endpoints');
  }finally{await peer.close();await endpoint.close();editor.closeAllConnections();await new Promise(r=>editor.close(r));}
};
