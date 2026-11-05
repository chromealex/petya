process.env.PETYA_SMOKE_TEST='1';const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=s=>win.webContents.executeJavaScript(s);await js('window.chatNavigationReady');
 await js("view('home');window.chatOpenedTopic={workReport:{id:'report-fixture',text:'Статус проекта: 3 задачи'}};showDialogueMessages([{role:'assistant',text:'Статус проекта: 3 задачи',at:1},{role:'user',text:'Привет',at:2},{role:'assistant',text:'На связи и готов помочь. Как ты?',at:3}])");
 assert(await js("(()=>{const messages=[...dialogueMessages.querySelectorAll('.message-assistant')];return messages[0].textContent.includes('Подготовить сообщение команде')&&!messages[1].textContent.includes('Подготовить сообщение команде');})()"));
 await js("showDialogueReply({handled:true,text:'Привет!'})");assert(!await js("dialogueChoices.textContent.includes('Подготовить сообщение команде')"));
 await js("showDialogueReply({handled:true,text:'Новый отчёт',reportShareId:'new-report'})");assert(await js("[...dialogueMessages.querySelectorAll('.message-assistant')].at(-1).textContent.includes('Подготовить сообщение команде')"));
 console.log('Report share UI: action belongs to its report, never to a greeting or the composer');
}};require('../src/main.cjs');
