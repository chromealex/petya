process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const {Client}=require('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const mcp=require('../src/mcp.cjs'),start=mcp.startMcp;let endpoint;mcp.startMcp=async(...args)=>endpoint=await start(...args);
const {SlackRequest}=require('../src/extensions/slack/team-request.cjs');const turn=SlackRequest.prototype.turn;let posts=0;
SlackRequest.prototype.turn=function(...args){this.enabled=()=>true;this.settings=()=>({slackToken:'test'});this.request=async(url,opts)=>{if(url.includes('conversations.list'))return {ok:true,channels:[{id:'C1',name:'exact'}]};if(url.includes('conversations.history'))return {ok:true,messages:[{ts:'1234567890.123456'}]};if(url.endsWith('chat.postMessage')){posts++;return {ok:true,channel:'C1',ts:'1234567890.123456'};}throw Error('Unexpected API');};return turn.apply(this,args);};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');await js("view('home');$('command').value='попроси #exact проверить билд';window.sendChatNow()");await wait("!!document.querySelector('.clarification-input')");assert.equal(posts,0);
 assert(await js("dialogueMessages.textContent.includes('Отправить в #exact') && dialogueMessages.textContent.includes('проверить билд')"));
 await js("[...document.querySelectorAll('.clarification-input button')].find(b=>b.textContent==='Отправить').click()");
 await wait("!!document.querySelector('.action-result-card')");assert.equal(posts,1);assert(await js("document.querySelector('.action-result-card').textContent.includes('Сервис подтвердил выполнение')"));
 await js("window.petya.mcpStart({mode:'read',projectId:'general'})");const client=new Client({name:'result-ui',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url),{requestInit:{headers:{Authorization:'Bearer '+endpoint.token}}}));const chatId=await js('topicSelect.value');const listed=await client.callTool({name:'list_chat_action_results',arguments:{chatId}});assert(!listed.isError);const data=JSON.parse(listed.content[0].text);const verified=await client.callTool({name:'verify_chat_action_result',arguments:{chatId,resultId:data.items[0].id,version:data.version}});assert(!verified.isError);await wait("document.querySelector('.action-result-card')?.textContent.includes('Результат проверен')");assert.equal(posts,1);}finally{await client.close();await js('window.petya.mcpStop()');}
 await js("document.querySelector('.action-result-card button').click()");await wait("document.querySelector('.action-result-card')?.textContent.includes('Результат проверен')");assert.equal(posts,1);
 console.log('Action result UI: Slack destination/text preview, confirmed receipt and read-only verification passed');
}};
require('../src/main.cjs');
