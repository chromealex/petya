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
  const ctx={companyId:'default',dialogue,attachments:new Attachments({}),chatJobs:{busy:()=>busy},memory:{prune:()=>notes},addContext:note=>{const item={...note,id:'note'};notes.push(item);return item;},check(){},changed(){},run:fn=>fn()};
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
  for(const mode of ['read','drafts']){
    const limited=await startMcp({...ctx,access:{mode,projectId:'general'}},{port:0});
    const peer=new Client({name:'limited',version:'1'});
    try{
      await peer.connect(new StreamableHTTPClientTransport(new URL(limited.url),{requestInit:{headers:{Authorization:'Bearer '+limited.token}}}));
      const tools=(await peer.listTools()).tools.map(t=>t.name);
      assert.equal(tools.includes('set_chat_draft'),mode==='drafts');
      assert.ok(!tools.includes('add_chat_note'));
      assert.ok((await peer.callTool({name:'get_chat_draft',arguments:{owner:'private-chat'}})).isError);
      assert.ok((await peer.callTool({name:'get_chat_draft',arguments:{owner:'draft:private'}})).isError);
      assert.ok((await peer.callTool({name:'read_chat_material',arguments:{chatId:'one',type:'material',key:'note'}})).isError);
    }finally{await peer.close();await limited.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
