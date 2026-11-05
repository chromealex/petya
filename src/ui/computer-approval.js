(()=>{
 let cancelCurrent=null,current=null;
 window.showComputerApproval=(id,message,spoken,question)=>{
  if(current?.id===id){if(!current.executing)message.append(current.box);return;}
  cancelCurrent?.();const box=document.createElement('div');box.className='computer-approval clarification-input choices-only';box.setAttribute('role','group');box.setAttribute('aria-label','Доступ к управлению компьютером');const status=document.createElement('p');status.className='small';status.setAttribute('role','status');const allow=document.createElement('button'),deny=document.createElement('button');allow.type=deny.type='button';allow.textContent='Разрешить';allow.className='primary';deny.textContent='Запретить';const prompt=document.createElement('p');prompt.className='approval-question';prompt.textContent=question||'Разрешить управление компьютером на время запроса?';const buttons=document.createElement('div');buttons.className='approval-buttons';buttons.append(allow,deny);box.append(prompt,buttons,status);message.append(box);current={id,box};
  let busy=false,waiting=false,closed=false;
  const cleanup=()=>{closed=true;window.removeEventListener('focus',resume);if(cancelCurrent===cleanup){cancelCurrent=null;current=null;}};
  const owner=topicSelect.value;
  const cancel=async()=>{if(busy||closed)return;cleanup();box.remove();try{const result=await window.petya.computerApprove(id,false);if(owner===topicSelect.value)await showDialogueReply(result,spoken);}catch(e){if(owner===topicSelect.value)await showDialogueReply({handled:true,error:true,text:e.message});}};cancelCurrent=cleanup;deny.onclick=cancel;
  async function proceed(){if(busy||closed)return;busy=true;if(current?.id===id)current.executing=true;window.chatStartPending=true;allow.disabled=deny.disabled=true;box.remove();commandProgress.update('running','Продолжаю запрос…');try{const result=await window.petya.computerApprove(id,true);if(closed)return;if(result.needsSystemPermission){waiting=true;commandProgress.update('waiting','Ожидаю разрешения в macOS');message.append(box);await window.petya.computerPermission();status.textContent='Разрешите Пете универсальный доступ в настройках macOS. После возвращения запрос продолжится автоматически.';return;}cleanup();box.remove();if(owner===topicSelect.value)await showDialogueReply(result,spoken);}catch(e){waiting=false;cleanup();box.remove();if(owner===topicSelect.value)await showDialogueReply({handled:true,error:true,text:e.message});}finally{busy=false;if(current?.id===id)current.executing=false;window.chatStartPending=false;if(!closed)allow.disabled=deny.disabled=false;}}
  async function resume(){if(waiting&&!closed&&!busy){const state=await window.petya.computerStatus().catch(()=>null);if(state?.accessGranted)proceed();}}
  allow.onclick=proceed;window.addEventListener('focus',resume);
 };
 document.addEventListener('petya-topic-changed',e=>{if(!e.detail?.preserveScroll)cancelCurrent?.();});
})();
