process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict'),{ipcMain}=require('electron');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code),wait=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,40));}throw Error('Timeout '+code);};
 let calls=0;ipcMain.removeHandler('petya:routeJira');ipcMain.handle('petya:routeJira',(_e,command,id,project,type)=>{calls++;return !project?{projects:[{key:'BW',name:'Bunker Wars'},{key:'MW2',name:'MW2'}]}:!type?{project,issueTypes:[{id:'bug',name:'Ошибка'},{id:'task',name:'Задача'}]}:{ready:true,project,issueType:type};});
 await js('window.chatNavigationReady');await js("view('home');window.selectedRoutes=[];commandSnapshot='Создай задачу';selectJiraRoute({id:'fixture'},async route=>{selectedRoutes.push(route);await showDialogueReply({handled:true,text:'Маршрут выбран'});})");
 await wait("!!document.querySelector('.chat-question.choice-list')");assert(await js("routePanel.hidden && $('notice').hidden"));
 assert(await js("(()=>{const b=[...document.querySelectorAll('.choice-list button')].map(n=>n.getBoundingClientRect());return b[1].top>=b[0].bottom&&b[1].left===b[0].left;})()"));
 await js("window.oldProject=document.querySelector('.choice-list button');oldProject.click();oldProject.click()");await wait("document.querySelector('.choice-list')?.textContent.includes('Какой тип задачи')");
 await js("document.querySelector('.choice-list button').click()");await wait("selectedRoutes.length===1&&!document.querySelector('.chat-question')");assert.equal(calls,3);
 assert(await js("selectedRoutes[0].project==='BW'&&selectedRoutes[0].issueType==='bug'"));
 await js("selectJiraRoute({id:'fixture'},async()=>{throw Error('Cancelled selection resumed')})");await wait("!!document.querySelector('.choice-list')");await js("[...document.querySelectorAll('.choice-list button')].find(b=>b.textContent==='Отмена').click()");await wait("!document.querySelector('.chat-question')&&dialogueMessages.textContent.includes('Выбор проекта Jira отменён')");
 console.log('Jira route UI: vertical choices, project/type continuation once, old banner hidden and cancellation passed');
}};
require('../src/main.cjs');
