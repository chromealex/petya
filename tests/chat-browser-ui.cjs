// Browser next to the chat: opens in the right panel, each chat keeps its own page, links in chat open there.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict'),http=require('node:http');
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<title>Page '+req.url.slice(1)+'</title><h1>'+req.url+'</h1>');});
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const js=code=>win.webContents.executeJavaScript(code),wait=async(code,label)=>{for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout: '+(label||code)+' DBG '+await js("JSON.stringify({panel:!!document.querySelector('.kit-panel'),cls:document.querySelector('.kit-panel')?.className,addr:document.querySelector('.chat-browser-address')?.value,topic:topicSelect.value,kit:!!window.resultKit,ob:typeof window.openChatBrowser})"));};
 const views=()=>win.contentView.children.filter(v=>v.webContents&&v.webContents!==win.webContents);
 try{
  await js('window.chatNavigationReady');await js("view('home')");
  const send=require('./chat-send.cjs')(win);await js("selectDialogueTopic('')");await send('Привет');const first=await js('topicSelect.value');assert(first,'a chat is open');
  await js("window.openChatBrowser("+JSON.stringify(base+'/one')+")");
  await wait("document.querySelector('.kit-panel-browser .chat-browser-address')?.value.endsWith('/one')",'first page');
  for(let i=0;i<50&&!views().length;i++)await new Promise(r=>setTimeout(r,60));
  assert.equal(views().length,1,'the page is shown next to the chat '+JSON.stringify(win.contentView.children.map(v=>v.constructor.name))+' '+await js("JSON.stringify({home:document.getElementById('home').hidden,dlg:!!document.querySelector('dialog[open]'),rect:JSON.stringify(document.querySelector('.chat-browser-surface').getBoundingClientRect())})"));
  const bounds=views()[0].getBounds(),surface=await js("(()=>{const r=document.querySelector('.chat-browser-surface').getBoundingClientRect();return {x:r.left,width:r.width}})()");
  assert(Math.abs(bounds.x-surface.x)<=2&&bounds.width>100,'the page covers the panel surface');
  // Another chat: its own (no) browser; the first page is hidden, then comes back with its chat.
  await js("selectDialogueTopic('')");await send('Второй чат');const second=await js('topicSelect.value');
  assert.notEqual(first,second);await wait("!document.querySelector('.kit-panel-browser')",'panel hidden in the other chat');
  assert.equal(views().length,0);
  await js("selectDialogueTopic("+JSON.stringify(first)+")");
  await wait("document.querySelector('.kit-panel-browser .chat-browser-address')?.value.endsWith('/one')",'restored with its chat');
  for(let i=0;i<50&&!views().length;i++)await new Promise(r=>setTimeout(r,60));assert.equal(views().length,1,'the page is back');
  // Address bar: a new page in the same chat.
  await js("(()=>{const a=document.querySelector('.chat-browser-address');a.value="+JSON.stringify(base+'/two')+";a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await wait("document.querySelector('.chat-browser-address').value.endsWith('/two')",'navigate');
  // × closes it for this chat.
  await js("document.querySelector('.kit-panel-close').click()");await wait("!document.querySelector('.kit-panel-browser')");
  assert.equal((await js("window.petya.feature('chatBrowser','state',"+JSON.stringify(first)+")")).open,false);
  console.log('Chat browser: right panel, per-chat page kept across chat switches, address bar, close passed');
 }finally{server.close();}
}};
require('../src/main.cjs');
