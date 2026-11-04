window.showConnectionRecovery=function(card,status,result){
  card.querySelector('.connection-recovery')?.remove();
  delete status.dataset.reason;
  if(!result.reason)return;
  status.dataset.reason=result.reason;
  if(result.reason==='unavailable' && !navigator.onLine){status.textContent='Нет сети.';status.dataset.reason='offline';}
  const action=document.createElement('button');
  action.type='button';action.className='connection-recovery';
  action.textContent=result.action==='login'?'Войти снова':'Проверить снова';
  action.onclick=async()=>{
    if(result.action==='login'){
      const login=card.querySelector('[data-connection-login]');
      if(login){login.click();return;}
      if(card.dataset.service==='confluence'){document.querySelector('[data-service="jira"] [data-connection-login]')?.click();return;}
    }
    action.disabled=true;
    try{
      const next=await window.petya.checkSavedConnection(card.dataset.service);
      status.textContent=next.message;
      status.className='connection-status '+next.state;
      window.showConnectionRecovery(card,status,next);
    }catch(e){status.textContent=e.message;}
    finally{action.disabled=false;}
  };
  status.after(action);
};
