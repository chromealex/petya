const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const {startMcp}=require('../src/mcp.cjs');
const {Attachments}=require('../src/attachments.cjs');
const {Dialogue}=require('../src/dialogue.cjs');

(async()=>{
  let busy=false;
  const dialogue=new Dialogue({save:()=>{}});
  const topic={id:'one',projectId:'general',title:'Вопрос',at:Date.now(),messages:[{role:'user',text:'Как дела?',at:1},{role:'assistant',text:'Ответ',at:2}],attachments:[{id:'f',name:'a.txt',text:'Файл'}]};
  dialogue.state.topics.push(topic,{...topic,id:'hidden',archived:true});
  const notes=[];
  let zoomMode='auto';
  const ctx={companyContext:()=>({id:'default',name:'Компания 1',switching:false,switchInAppOnly:true}),zoomBot:(method)=>method==='status'?{mode:zoomMode,id:'detected',phase:'detected'}:{phase:method==='dismiss'?'dismissed':'joining'},meetingRecording:(method,id)=>method==='status'?[]:method==='captureStatus'?{mode:zoomMode,phase:'detected'}:{id,phase:method==='startCapture'?'recording':'processing'},companyId:'default',dialogue,attachments:new Attachments({}),chatJobs:{busy:()=>busy},memory:{prune:()=>notes},addContext:note=>{const item={...note,id:'note'};notes.push(item);return item;},check(){},changed(){},run:fn=>fn()};
  const endpoint=await startMcp(ctx,{port:0});
  const client=new Client({name:'petya-test',version:'1'});
  try{
    assert.equal((await fetch(endpoint.url,{method:'POST'})).status,401);
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
    const {tools}=await client.listTools();
    const used=new Set();
    async function call(name,args={},fail=false){
      used.add(name);
      const r=await client.callTool({name,arguments:args});
      if(fail){assert.ok(r.isError,name);return;}
      assert.ok(!r.isError,r.content[0].text);
      return JSON.parse(r.content[0].text);
    }
    assert.equal((await call('check_model_disk_space')).status,'space_only');
    assert.deepEqual(await call('get_company_context'),{id:'default',name:'Компания 1',switching:false,switchInAppOnly:true});
    notes.push({id:'meeting-context-test',source:'Zoom',title:'Встреча',text:'После обновления не работает вход',at:Date.now(),sessionId:'test-call'});
    assert.equal((await call('resolve_work_context',{chatId:'one'})).rows[0].id,'meeting-context-test');
    await call('resolve_work_context',{chatId:'hidden'},true);
    topic.excludedMaterials=['meeting-context-test'];
    assert.equal((await call('resolve_work_context',{chatId:'one'})).kind,'empty');
    delete topic.excludedMaterials;
    assert.equal((await call('read_meeting_memory',{sessionId:'test-call'})).items[0].id,'meeting-context-test');
    assert.equal((await call('read_meeting_memory',{offset:1})).items.length,0);
    assert.deepEqual(await call('meeting_recording_status'),[]);
    assert.equal((await call('retry_meeting_processing',{sessionId:'failed'})).phase,'processing');
    assert.equal((await call('zoom_bot_status')).mode,'auto');
    ctx.access={mode:'edit'};
    assert.equal((await call('local_meeting_status')).phase,'detected');
    assert.equal((await call('start_local_meeting')).phase,'recording');
    assert.equal((await call('stop_local_meeting')).phase,'processing');
    zoomMode='ask';await call('start_local_meeting',{},true);zoomMode='auto';
    ctx.access={mode:'read'};await call('start_local_meeting',{},true);await call('stop_local_meeting',{},true);
    ctx.access={mode:'edit',projectId:'general'};await call('local_meeting_status',{},true);ctx.access={mode:'edit'};
    assert.ok(await call('zoom_bot_request_access'));
    for(const method of ['join','dismiss','retry'])assert.ok(await call('zoom_bot_'+method,{id:'detected'}));
    zoomMode='ask';await call('zoom_bot_join',{id:'detected'},true);zoomMode='auto';
    const previousZoom=ctx.zoomBot;
    const reauthBot=new (require('../src/extensions/zoom-bot/controller.cjs').ZoomBot)({settings:()=>({zoomBotMode:'auto'}),inspect:async()=>({meetingActive:true,windows:[],meetingInfo:'Meeting ID: 123456789'}),load:()=>({id:'legacy',jobId:'lost',phase:'error'}),remote:async(method)=>{if(method==='GET')throw Object.assign(Error('missing'),{code:'ZOOM_JOB_UNAVAILABLE'});return {id:'fresh'};}});
    ctx.zoomBot=(method,id)=>method==='status'?{...reauthBot.snapshot(),mode:'auto'}:reauthBot.action(method,id);
    assert.equal((await call('zoom_bot_retry',{id:'legacy'})).phase,'joining');assert.equal(reauthBot.state.jobId,'fresh');ctx.zoomBot=previousZoom;delete ctx.access;
    notes.length=0;
    const stamp=async owner=>(await call('get_chat_draft',{owner})).revision;
    assert.equal((await call('list_chat_projects')).items[0].draftOwner,'draft:general');
    assert.equal((await call('list_chats')).total,1);
    await call('set_chat_draft',{owner:'hidden',text:'x',previous:''},true);
    for(const owner of ['one','draft:general']){
      await call('set_chat_draft',{owner,revision:await stamp(owner),text:'Черновик',previous:''});
      assert.equal((await call('get_chat_draft',{owner})).text,'Черновик');
      await call('set_chat_draft',{owner,revision:await stamp(owner),text:'x',previous:''},true);
      await call('set_chat_draft',{owner,revision:await stamp(owner),text:'',previous:'Черновик'});
    }
    const stale=await stamp('one');
    const file=await call('add_draft_attachment',{owner:'one',revision:await stamp('one'),name:'note.txt',base64:Buffer.from('Текст').toString('base64')});
    assert.equal((await call('get_chat_draft',{owner:'one'})).files[0].id,file.id);
    await call('remove_draft_attachment',{owner:'one',revision:stale,fileId:file.id},true);
    assert.equal((await call('read_draft_attachment',{owner:'one',fileId:file.id})).text,'Текст');
    await call('remove_draft_attachment',{owner:'draft:general',fileId:file.id},true);
    await call('remove_draft_attachment',{owner:'one',revision:await stamp('one'),fileId:file.id});
    const chat={chatId:'one'};
    const found=await call('search_chat_files',{...chat,query:'Файл'});
    assert.equal(found.items[0].line,1);
    const savedLink=require('../src/chat-location.cjs').link('default',topic,0,1);
    assert.ok(await call('summarize_chat',chat));
    const fork=await call('branch_chat_at_message',{...chat,url:savedLink});
    assert.equal((await call('read_chat_version',{chatId:fork.id})).total,2);
    await call('bookmark_chat_answer',{...chat,url:savedLink,saved:true});
    assert.equal((await call('list_saved_answers',chat)).items[0].url,savedLink);
    await call('bookmark_chat_answer',{...chat,url:savedLink,saved:false});
    const image = {type:'image', mimeType:'image/svg+xml', data:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')};
    topic.messages[1].extensionImages = [image];
    assert.deepEqual((await call('read_chat_version',{...chat,includeImages:true})).items[1].extensionImages,[image]);
    const hits=await call('read_chat_version',{...chat,query:'ответ'});
    assert.equal(hits.items[0].extensionImages,undefined);assert.equal(hits.total,1);assert.equal(hits.items[0].index,1);
    assert.equal(require('../src/chat-location.cjs').parse(hits.items[0].link).company,'default');
    assert.equal((await call('list_chat_versions',chat)).count,1);
    busy=true;
    const edit={...chat,revision:await stamp('one'),version:0,messageIndex:0,original:'Как дела?',text:'Что нового?'};
    await call('prepare_chat_version',edit,true);
    busy=false;
    await call('prepare_chat_version',edit);
    assert.equal((await call('get_chat_draft',{owner:'one'})).text,edit.text);
    assert.equal((await call('read_chat_version',{...chat,version:0})).items[1].text,'Ответ');
    assert.equal((await call('list_chat_versions',chat)).index,1);
    await call('select_chat_version',{...chat,revision:edit.revision,version:0},true);
    await call('select_chat_version',{...chat,revision:await stamp('one'),version:0});
    await call('add_chat_note',{...chat,title:'Заметка',text:'Контекст'});
    assert.equal((await call('list_chat_materials',chat)).total,2);
    for(const [type,key] of [['material','note'],['file','f']]){
      const item={...chat,type,key};
      assert.ok((await call('read_chat_material',item)).text);
      await call('set_chat_material_enabled',{...item,enabled:false});
      assert.equal((await call('list_chat_materials',chat)).items.find(m=>m.id===key).enabled,false);
      await call('set_chat_material_enabled',{...item,enabled:true});
    }
    await call('read_chat_material',{...chat,type:'file',key:'other'},true);
    assert.deepEqual([...used].sort(),tools.map(t=>t.name).sort());
    console.log('MCP: '+tools.length+' tools verified via authenticated HTTP client');
  }finally{await client.close();await endpoint.close();}
  dialogue.state.projects.push({id:'private',name:'Другой проект'});
  dialogue.state.topics.push({...topic,id:'private-chat',projectId:'private'});
  const paintings = [];
  ctx.generatePainting = async (args, check) => {
    check();
    paintings.push(args);
    return { image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1kAAAAASUVORK5CYII=' };
  };
  const extensions = require('../src/features/extension-replies.cjs');
  const settings = {...extensions.defaults};
  extensions.setup({...ctx,settings,saveSettings:patch=>Object.assign(settings,patch),requestProgress:{report(){} }});
  dialogue.state.activeId = topic.id;
  assert.equal(extensions.needsApproval(104857600,settings),false);
  assert.equal(extensions.needsApproval(104857601,settings),true);
  assert.equal(extensions.needsApproval(null,settings),true);
  for(const mode of ['read','drafts','edit']){
    const limited=await startMcp({...ctx,access:{mode,projectId:'general'}},{port:0});
    const peer=new Client({name:'limited',version:'1'});
    try{
      await peer.connect(new StreamableHTTPClientTransport(new URL(limited.url),{requestInit:{headers:{Authorization:'Bearer '+limited.token}}}));
      const tools=(await peer.listTools()).tools.map(t=>t.name);
      notes.push({id:'private-meeting-test',source:'Zoom',title:'Private',text:'private-project-secret',at:Date.now()});
      const contextResult=await peer.callTool({name:'resolve_work_context',arguments:{chatId:'one'}});
      assert.ok(!contextResult.isError);
      assert.ok(!JSON.stringify(contextResult).includes('private-project-secret'));
      assert.ok((await peer.callTool({name:'resolve_work_context',arguments:{chatId:'private-chat'}})).isError);
      assert.ok((await peer.callTool({name:'read_meeting_memory',arguments:{}})).isError);
      assert.ok((await peer.callTool({name:'retry_meeting_processing',arguments:{sessionId:'failed'}})).isError);
      assert.ok((await peer.callTool({name:'zoom_bot_status',arguments:{}})).isError);
      assert.ok((await peer.callTool({name:'zoom_bot_join',arguments:{id:'detected'}})).isError);
      notes.pop();
      const catalog = await peer.callTool({name:'list_chat_extensions',arguments:{}});
      assert.ok(JSON.parse(catalog.content[0].text).some(row=>row.id==='chat-stats'));
      assert.equal(tools.includes('use_chat_extension'),mode==='edit');
      if (mode==='edit') {
        const invoke = chatId=>peer.callTool({name:'use_chat_extension',arguments:{chatId,command:'Сколько сообщений в этом чате?'}});
        assert.ok((await invoke('private-chat')).isError);
        const report = await invoke(topic.id);
        assert.match(report.content[0].text,/Использую расширение «Статистика чата»/);
        assert.equal(report.content[1].mimeType,'image/svg+xml');
        assert.equal(settings['extension_chat-stats'],'true');
      }
      assert.equal(tools.includes('generate_painting'),mode==='edit');
      if (mode === 'edit') {
        const result = await peer.callTool({name:'generate_painting',arguments:{prompt:'Маяк',format:'portrait'}});
        assert.equal(result.content[0].type, 'image');
        assert.deepEqual(paintings, [{prompt:'Маяк',quality:'standard',format:'portrait'}]);
        continue;
      }
      assert.equal(tools.includes('set_chat_draft'),mode==='drafts');
      assert.ok(!tools.includes('add_chat_note'));
      assert.ok((await peer.callTool({name:'get_chat_draft',arguments:{owner:'private-chat'}})).isError);
      assert.ok((await peer.callTool({name:'get_chat_draft',arguments:{owner:'draft:private'}})).isError);
      assert.ok((await peer.callTool({name:'read_chat_material',arguments:{chatId:'one',type:'material',key:'note'}})).isError);
    }finally{await peer.close();await limited.close();}
  }
  await require('./python-mcp.cjs')();
  await require('./extension-agent.cjs')();
  await require('./layout-mcp.cjs')(ctx);
  await require('./unity-mcp.cjs')(ctx);
  await require('./blender-motion.cjs')(ctx);
})().catch(e=>{console.error(e);process.exitCode=1;});
