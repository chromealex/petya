// Browser next to the chat: opens in the right panel, each chat keeps its own page, links in chat open there.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict'),http=require('node:http');
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');if(req.url==='/slow'){setTimeout(()=>res.end('<title>Page slow</title>'),1500);return;}res.end('<title>Page '+req.url.slice(1)+'</title><h1>'+req.url+'</h1>');});
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
  // Tabs: «+» opens one, each keeps its page, only the active one is shown; × closes it.
  await js("document.querySelector('.chat-browser-tab-add').click()");await wait("document.querySelectorAll('.chat-browser-tab').length===2",'new tab');
  await js("(()=>{const a=document.querySelector('.chat-browser-address');a.value="+JSON.stringify(base+'/three')+";a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  await wait("document.querySelector('.chat-browser-tab.active')?.textContent.includes('Page three')",'second tab page');
  await js("document.querySelectorAll('.chat-browser-tab-title')[0].click()");
  await wait("document.querySelector('.chat-browser-address').value.endsWith('/two')",'first tab again');
  assert.equal(views().length,1,'only the active tab is shown');
  // A slow page loads even while the panel keeps repainting (it used to restart the load forever: a white page).
  await js("document.querySelector('.chat-browser-tab-add').click()");await wait("document.querySelectorAll('.chat-browser-tab').length===3",'third tab');
  await js("(()=>{const a=document.querySelector('.chat-browser-address');a.value="+JSON.stringify(base+'/slow')+";a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  for(let i=0;i<12;i++){await js("window.dispatchEvent(new Event('resize'))");await new Promise(r=>setTimeout(r,100));}
  await wait("document.querySelector('.chat-browser-tab.active')?.textContent.includes('Page slow')",'slow page loaded');
  for(const n of [2,1])await js("document.querySelectorAll('.chat-browser-tab-close')["+n+"].click()"),await wait("document.querySelectorAll('.chat-browser-tab').length==="+n,'tab closed');
  const saved=await js("window.petya.feature('chatBrowser','state',"+JSON.stringify(first)+")");
  assert.equal(saved.tabs.length,1);assert(saved.url.endsWith('/two'));
  // × closes it for this chat.
  await js("document.querySelector('.kit-panel-close').click()");await wait("!document.querySelector('.kit-panel-browser')");
  assert.equal((await js("window.petya.feature('chatBrowser','state',"+JSON.stringify(first)+")")).open,false);
  // Petya meets a check (sign-in/CAPTCHA) while browsing: the page opens in this chat's browser with a notice,
  // in the session Petya browses with; once the page leaves the check, Petya continues.
  const s=globalThis.petyaTestServices;let acted=0,passedAt='';
  assert.equal(await s.chatBrowser.attend(first,{url:base+'/sorry/check',message:'Google просит проверку',action:'Прочитать страницу',onAction:()=>{acted++;return true;},passed:url=>!url.includes('/sorry/'),onPassed:url=>{passedAt=url;}}),true);
  await wait("document.querySelector('.kit-panel-browser .chat-browser-address')?.value.endsWith('/sorry/check')",'check page opened');
  await wait("!document.querySelector('.chat-browser-attention').hidden&&document.querySelector('.chat-browser-attention-text').textContent==='Google просит проверку'",'notice shown');
  const shared=require('../src/company-browser-session.cjs').companySession(require('electron').session,s.dataRoot,s.chatBrowser.WEB,true);
  assert.equal(s.chatBrowser.contents(first).session,shared,'same session as Petya\'s search');
  await js("document.querySelector('.chat-browser-attention-action').click()");for(let i=0;i<50&&!acted;i++)await new Promise(r=>setTimeout(r,40));assert.equal(acted,1,'notice button runs the action');
  await js("(()=>{const a=document.querySelector('.chat-browser-address');a.value="+JSON.stringify(base+'/results')+";a.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()");
  for(let i=0;i<100&&!passedAt;i++)await new Promise(r=>setTimeout(r,40));assert(passedAt.endsWith('/results'),'leaving the check continues');
  await wait("document.querySelector('.chat-browser-attention').hidden",'notice hidden after the check');
  assert.equal(await s.chatBrowser.attend('missing',{url:base+'/x'}),false,'no chat — the caller falls back to its own window');
  await js("document.querySelector('.kit-panel-close').click()");await wait("!document.querySelector('.kit-panel-browser')");
  console.log('Chat browser: right panel, per-chat page kept across chat switches, address bar, tabs, slow page under repaints, close passed');
 }finally{server.close();}
}};
require('../src/main.cjs');
