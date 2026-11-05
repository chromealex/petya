process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
let runs=[];
const {GitWorkspace}=require('../src/git-workspace.cjs');
GitWorkspace.prototype.execute=async function(input){runs.push(input);return {text:'Ветка создана: '+input.branch};};
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');
 await js("view('home');$('command').value='создай ветку';window.sendChatNow()");
 await wait("!!document.querySelector('.clarification-input input')");assert.equal(runs.length,0);
 await js("document.querySelector('.clarification-input input').value='feature/test';document.querySelector('.clarification-input').requestSubmit()");
 await wait("dialogueMessages.textContent.includes('Ветка создана: feature/test')");assert.equal(runs.length,1);assert.equal(runs[0].branch,'feature/test');
 await js("$('command').value='Нарисуй';window.sendChatNow()");await wait("document.querySelector('.clarification-input label')?.textContent==='Описание картинки'");
 await js("const f=document.querySelector('.clarification-input');[...f.querySelectorAll('button')].find(b=>b.textContent==='Отмена').click()");await wait("dialogueMessages.textContent.includes('Запрос отменён')");assert.equal(runs.length,1);
 console.log('Clarification UI: retained Git action, inline answer, image description and cancellation passed');
}};
require('../src/main.cjs');
