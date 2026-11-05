process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js');
const {StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const mcp=require('../src/mcp.cjs'),start=mcp.startMcp;let endpoint,runs=0;
mcp.startMcp=async(...args)=>{endpoint=await start(...args);return endpoint;};
require('../src/git-workspace.cjs').GitWorkspace.prototype.execute=async input=>{runs++;return {text:'Создана ветка '+input.branch};};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');await js("view('home');$('command').value='создай ветку';window.sendChatNow()");await wait("!!document.querySelector('.clarification-input')");
 await js("window.petya.mcpStart({mode:'edit',projectId:'general'})");
 const client=new Client({name:'petya-ui-fixture',version:'1'});
 try{
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));
  const listed=await client.callTool({name:'list_chat_clarifications',arguments:{}});assert(!listed.isError);const row=JSON.parse(listed.content[0].text).items[0];assert.equal(row.request,'создай ветку');
  const response=await client.callTool({name:'answer_chat_clarification',arguments:{chatId:row.chatId,clarificationId:row.id,answer:'feature/mcp-question'}});assert(!response.isError,JSON.stringify(response));
  await wait("!document.querySelector('.clarification-input') && dialogueMessages.textContent.includes('Создана ветка feature/mcp-question')");
  assert.equal(runs,1);assert(await js("dialogueMessages.textContent.includes('feature/mcp-question')"));
  console.log('MCP UI: external answer resumes saved Git request, updates visible chat and dismisses question');
 }finally{await client.close();await js('window.petya.mcpStop()');}
}};
require('../src/main.cjs');
