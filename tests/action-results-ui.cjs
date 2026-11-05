process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const {SlackRequest}=require('../src/slack-request.cjs');const turn=SlackRequest.prototype.turn;let posts=0;
SlackRequest.prototype.turn=function(...args){this.enabled=()=>true;this.settings=()=>({slackToken:'test'});this.request=async(url,opts)=>{if(url.includes('conversations.list'))return {ok:true,channels:[{id:'C1',name:'exact'}]};if(url.includes('conversations.history'))return {ok:true,messages:[{ts:'1234567890.123456'}]};if(url.endsWith('chat.postMessage')){posts++;return {ok:true,channel:'C1',ts:'1234567890.123456'};}throw Error('Unexpected API');};return turn.apply(this,args);};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<150;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');await js("view('home');$('command').value='попроси #exact проверить билд';window.sendChatNow()");await wait("!!document.querySelector('.clarification-input')");assert.equal(posts,0);
 assert(await js("dialogueMessages.textContent.includes('Отправить в #exact') && dialogueMessages.textContent.includes('проверить билд')"));
 await js("[...document.querySelectorAll('.clarification-input button')].find(b=>b.textContent==='Отправить').click()");
 await wait("!!document.querySelector('.action-result-card')");assert.equal(posts,1);assert(await js("document.querySelector('.action-result-card').textContent.includes('Сервис подтвердил выполнение')"));
 await js("document.querySelector('.action-result-card button').click()");await wait("document.querySelector('.action-result-card')?.textContent.includes('Результат проверен')");assert.equal(posts,1);
 console.log('Action result UI: Slack destination/text preview, confirmed receipt and read-only verification passed');
}};
require('../src/main.cjs');
