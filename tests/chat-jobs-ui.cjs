module.exports=async win=>win.webContents.executeJavaScript(`(async()=>{
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 voiceReply=null;commandProgress.update('idle','');await selectDialogueTopic('');
 $('command').value='Привет';assert(await window.tryBackgroundChat('Привет'),'Read-only chat was not started');
 const first=topicSelect.value;assert(first,'Background conversation has no ID');
 for(let i=0;i<100&&window.chatJobBusy(first);i++)await new Promise(r=>setTimeout(r,20));
 const done=await window.petya.chatJobState(first);assert(done.job.state==='done','Background greeting did not finish');assert(done.messages.filter(m=>m.role==='user').length===1,'Request duplicated in history');
 $('command').value='Сохранённый черновик';window.enqueueChatRequest();chatQueue.paused=true;
 await selectDialogueTopic('');assert(chatQueue.items.length===0,'Queue leaked to another chat');
 await selectDialogueTopic(first);assert(chatQueue.items.length===1&&chatQueue.items[0].text==='Сохранённый черновик','Queue lost on switching chats');chatQueue.remove(chatQueue.items[0].id);chatQueue.paused=false;
 const inactiveQueue=chatQueue;inactiveQueue.paused=true;inactiveQueue.add('Привет');await selectDialogueTopic('');inactiveQueue.paused=false;for(let i=0;i<150;i++){const s=await window.petya.chatJobState(first);if(s.messages.filter(m=>m.role==='user').length===2&&s.job.state==='done')break;await new Promise(r=>setTimeout(r,20));}assert(topicSelect.value==='','Inactive queue switched the selected chat');assert((await window.petya.chatJobState(first)).messages.filter(m=>m.role==='user').length===2,'Inactive chat queue did not continue');await selectDialogueTopic(first);
 const nav=await window.petya.chatNavigation('Привет');assert(nav.topics.some(t=>t.id===first&&t.index>=0),'Search cannot find background messages');
 await window.jumpToChatMessage(0);assert(dialogueMessages.querySelector('[data-message-index="0"]'),'Search result missing in transcript');
})()`);
