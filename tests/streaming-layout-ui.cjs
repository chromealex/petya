process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=s=>win.webContents.executeJavaScript(s),wait=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout '+s);};
 await js('window.chatNavigationReady');await js("view('home');showDialogueMessages([{role:'user',text:'Расскажи',at:1}]);commandProgress.update('working','Читаю материалы');window.streamSpeechEnabled=false");
 win.webContents.send('answer-chunk',{id:'stream-test',start:true});win.webContents.send('answer-chunk',{id:'stream-test',text:'Первая часть'});
 await wait("document.querySelector('.answer-stream-preview')?.textContent.includes('Первая часть')");
 assert(await js("dialogueMessages.querySelector('.chat-running-reply').compareDocumentPosition(document.querySelector('.answer-stream-preview')) & Node.DOCUMENT_POSITION_FOLLOWING"));
 win.webContents.send('answer-chunk',{id:'stream-test',text:'Первая часть. Вторая часть.'});await wait("document.querySelector('.answer-stream-preview')?.textContent.includes('Вторая часть')");
 win.webContents.send('answer-chunk',{id:'stream-test',end:true});await new Promise(r=>setTimeout(r,80));assert(await js("!!document.querySelector('.answer-stream-preview')"));
 await js("showDialogueReply({handled:true,answerStreamId:'stream-test',text:'Первая часть. Вторая часть.',steps:[{label:'Читаю материалы',ms:100}]})");
 await wait("!document.querySelector('.answer-stream-preview') && !!dialogueMessages.querySelector('.message-assistant>.message-steps')");
 assert(await js("(()=>{const n=[...dialogueMessages.querySelectorAll('.message-assistant')].find(n=>n.querySelector(':scope>.message-steps'));return n.querySelector('.message-steps').compareDocumentPosition(n.querySelector('.message-content')) & Node.DOCUMENT_POSITION_FOLLOWING;})()"));
 assert.equal(await js("document.querySelectorAll('.answer-paced').length"),0);
 assert(await js("dialogueMessages.textContent.includes('Читаю материалы')"));
 console.log('Streaming UI: chunks appear before completion, preview survives end, completed steps stay above the answer and no replay pacing');
}};require('../src/main.cjs');
