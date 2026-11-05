(()=>{
 const reply=document.createElement('article');reply.className='message-assistant chat-running-reply';const author=document.createElement('strong');author.textContent='Петя';const bar=document.createElement('progress');bar.setAttribute('aria-label','Выполнение запроса');progressTime.setAttribute('aria-hidden','true');const fallback=document.createElement('span');fallback.className='chat-thinking-label';fallback.textContent='Думаю…';fallback.setAttribute('role','status');fallback.hidden=true;reply.append(author,progressPanel,fallback,bar);
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;commandProgress.reset();$('notice').hidden=true;});
 function sync(){
  const background=window.chatJobBusy?.(topicSelect.value),question=!!document.querySelector('.chat-composer .chat-question');
  const working=['working','running'].includes(commandProgress.state);
  const pending=!!window.chatStartPending&&!question;
  fallback.hidden=!!background||!(pending&&!working||working&&(progressPanel.hidden||!progressText.textContent.trim()));
  reply.classList.toggle('thinking-fallback',!fallback.hidden);
  const waiting=commandProgress.state==='waiting'&&question;
  reply.hidden=!!background||waiting||(progressPanel.hidden&&fallback.hidden);
  if(reply.hidden)reply.remove();else window.placeChatProgress(reply);
  bar.hidden=!(pending||working);
 }
 setInterval(sync,150);
 document.addEventListener('petya-chat-job',sync);
 new MutationObserver(sync).observe(progressPanel,{attributes:true,attributeFilter:['hidden','data-state']});new MutationObserver(sync).observe(dialogueMessages,{childList:true});sync();
})();
