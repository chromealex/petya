(()=>{
 const reply=document.createElement('article');reply.className='message-assistant chat-running-reply';const author=document.createElement('strong');author.textContent='Петя';const bar=document.createElement('progress');bar.setAttribute('aria-label','Выполнение запроса');progressTime.setAttribute('aria-hidden','true');reply.append(author,progressPanel,bar);
 function sync(){reply.hidden=progressPanel.hidden;if(reply.hidden)reply.remove();bar.hidden=commandProgress.state!=='working';if(!reply.hidden&&reply.parentElement!==dialogueMessages)dialogueMessages.append(reply);}
 new MutationObserver(sync).observe(progressPanel,{attributes:true,attributeFilter:['hidden','data-state']});new MutationObserver(sync).observe(dialogueMessages,{childList:true});sync();
})();
