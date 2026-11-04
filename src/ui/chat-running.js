(()=>{
 const reply=document.createElement('article');reply.className='message-assistant chat-running-reply';const author=document.createElement('strong');author.textContent='Петя';const bar=document.createElement('progress');bar.setAttribute('aria-label','Выполнение запроса');progressTime.setAttribute('aria-hidden','true');reply.append(author,progressPanel,bar);
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;commandProgress.reset();$('notice').hidden=true;});
 function sync(){reply.hidden=progressPanel.hidden||(commandProgress.state==='waiting'&&dialogueChoices.isConnected&&dialogueChoices.classList.contains('clarification-list'));if(reply.hidden)reply.remove();bar.hidden=commandProgress.state!=='working';if(!reply.hidden&&reply.parentElement!==dialogueMessages)dialogueMessages.append(reply);}
 new MutationObserver(sync).observe(progressPanel,{attributes:true,attributeFilter:['hidden','data-state']});new MutationObserver(sync).observe(dialogueMessages,{childList:true});sync();
})();
