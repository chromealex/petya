(()=>{
 let cancelCurrent=null,current=null;
 window.showComputerApproval=(id,message,spoken)=>{
  if(current?.id===id){message.append(current.box);return;}
  cancelCurrent?.();const box=document.createElement('div');box.className='computer-approval clarification-input choices-only';box.setAttribute('role','group');box.setAttribute('aria-label','Доступ к управлению компьютером');const status=document.createElement('p');status.className='small';status.setAttribute('role','status');const allow=document.createElement('button'),deny=document.createElement('button');allow.type=deny.type='button';allow.textContent='Разрешить';allow.className='primary';deny.textContent='Запретить';box.append(allow,deny,status);message.append(box);current={id,box};
  let busy=false,waiting=false,closed=false;
  const cleanup=()=>{closed=true;window.removeEventListener('focus',resume);if(cancelCurrent===cancel){cancelCurrent=null;current=null;}};
  const cancel=()=>{if(closed)return;cleanup();window.petya.computerApprove(id,false).catch(()=>{});allow.remove();deny.remove();status.textContent='Запрос отменён.';};cancelCurrent=cancel;deny.onclick=cancel;
  async function proceed(){if(busy||closed)return;busy=true;window.chatStartPending=true;allow.disabled=deny.disabled=true;status.textContent='Проверяю доступ…';try{const result=await window.petya.computerApprove(id,true);if(closed)return;if(result.needsSystemPermission){waiting=true;await window.petya.computerPermission();status.textContent='Разрешите Пете универсальный доступ в настройках macOS. После возвращения запрос продолжится автоматически.';return;}cleanup();allow.remove();deny.remove();status.textContent='Доступ разрешён.';await showDialogueReply(result,spoken);}catch(e){waiting=false;status.textContent=e.message;}finally{busy=false;window.chatStartPending=false;if(!closed)allow.disabled=deny.disabled=false;}}
  async function resume(){if(waiting&&!closed&&!busy){const state=await window.petya.computerStatus().catch(()=>null);if(state?.accessGranted)proceed();}}
  allow.onclick=proceed;window.addEventListener('focus',resume);
 };
 document.addEventListener('petya-topic-changed',e=>{if(!e.detail?.preserveScroll)cancelCurrent?.();});
})();
