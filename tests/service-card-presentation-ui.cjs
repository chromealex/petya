process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const {ipcMain}=require('electron');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const key=JSON.stringify(['https://example.atlassian.net','BW-1']);
 // Exercise the same snapshot used when a finished response enters the chat.
 const original=ipcMain._invokeHandlers.get('petya:feature');
 assert(original);
 ipcMain.removeHandler('petya:feature');ipcMain.handle('petya:feature',(event,...args)=>{
  if(args[0]==='chatResults'&&args[1]==='snapshot')return {scope:'test',selected:null,items:[{id:'one',objectId:'one',index:0,title:'Jira · BW-1',subtitle:'Вход',presentationKey:key,actions:[{id:'open',label:'Открыть в Jira'},{id:'details',label:'К ответу'},{id:'edit',label:'Изменить'}]}]};
  return original(event,...args);
 });
 await js(`view('home');showDialogueMessages([{role:'assistant',text:'Найдена задача.\\nBW-1 — Вход (To Do)',jiraItems:[{key:'BW-1',site:'https://example.atlassian.net',summary:'Вход',status:'To Do'}]}])`);
 assert.equal(await js("document.querySelectorAll('.answer-paced,.answer-show-all').length"),0,'structured answers must not replay plain text');
 assert.equal(await js("document.querySelectorAll('.jira-issue-card').length"),1,'extension renders synchronously');
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.jira-issue-card .chat-result-inline-actions')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.chat-result-card').length"),0);
 assert.equal(await js("document.querySelector('.jira-issue-card .chat-result-inline-actions').textContent"),'Изменить');
 assert.equal(await js("[...document.querySelectorAll('.message-content>p')].some(p=>p.textContent.startsWith('BW-1'))"),false);
 await js("document.dispatchEvent(new Event('petya-results-changed'))");await new Promise(r=>setTimeout(r,100));
 assert.equal(await js("document.querySelectorAll('.chat-result-inline-actions').length"),1,'refresh must not duplicate actions');
 console.log('Structured presentation: immediate cards, no plain-text pacing, one action set after refresh passed');
}};
require('../src/main.cjs');
