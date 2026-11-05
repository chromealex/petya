(()=>{
 let cancelCurrent=null,current=null;
 window.showComputerApproval=(id,message,spoken,question)=>{
  if(current?.id===id){if(!current.executing&&!current.waiting)message.append(current.box);return;}
  cancelCurrent?.();const {box,buttons}=window.createChatQuestion(question||'Разрешить управление компьютером на время запроса?',message);box.classList.add('computer-approval','choices-only');const status=document.createElement('p');status.className='small';status.setAttribute('role','status');const allow=document.createElement('button'),deny=document.createElement('button');allow.type=deny.type='button';allow.textContent='Разрешить';allow.className='primary';deny.textContent='Запретить';buttons.append(allow,deny);box.append(status);current={id,box};
  let busy=false,waiting=false,closed=false;
  const cleanup=()=>{closed=true;window.removeEventListener('focus',resume);if(cancelCurrent===cleanup){cancelCurrent=null;current=null;}};
  const owner=topicSelect.value;
  const cancel=async()=>{if(busy||closed)return;cleanup();box.remove();try{const result=await window.petya.computerApprove(id,false);if(owner===topicSelect.value)await showDialogueReply(result,spoken);}catch(e){if(owner===topicSelect.value)await showDialogueReply({handled:true,error:true,text:e.message});}};cancelCurrent=cleanup;deny.onclick=cancel;
  async function proceed(){if(busy||closed)return;busy=true;if(current?.id===id)current.executing=true;window.chatStartPending=true;allow.disabled=deny.disabled=true;box.remove();commandProgress.update('running','Продолжаю запрос…');try{const result=await window.petya.computerApprove(id,true);if(closed)return;if(result.needsSystemPermission){waiting=true;if(current?.id===id)current.waiting=true;commandProgress.update('waiting','Ожидаю разрешения в macOS');if(result.messages)showDialogueMessages(result.messages);else{const note={role:'assistant',text:result.text||'Разрешите доступ в настройках macOS. После возвращения запрос продолжится автоматически.',at:Date.now()};chatHistory.push(note);dialogueMessages.append(renderDialogueMessage(note));}await window.petya.computerPermission();return;}cleanup();box.remove();if(owner===topicSelect.value)await showDialogueReply(result,spoken);}catch(e){waiting=false;cleanup();box.remove();if(owner===topicSelect.value)await showDialogueReply({handled:true,error:true,text:e.message});}finally{busy=false;if(current?.id===id)current.executing=false;window.chatStartPending=false;if(!closed)allow.disabled=deny.disabled=false;}}
  async function resume(){if(waiting&&!closed&&!busy){const state=await window.petya.computerStatus().catch(()=>null);if(state?.accessGranted)proceed();}}
  allow.onclick=proceed;window.addEventListener('focus',resume);
 };
 document.addEventListener('petya-topic-changed',e=>{if(!e.detail?.preserveScroll)cancelCurrent?.();});
})();
