(()=>{
 const jobs=new Map();let applying=false,starting=false;
 const panel=document.createElement('article');panel.className='message-assistant chat-running-reply chat-job-status';panel.hidden=true;panel.setAttribute('role','status');
 const text=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.textContent='Повторить';retry.hidden=true;const author=document.createElement('strong');author.textContent='Петя';const bar=document.createElement('progress');bar.setAttribute('aria-label','Петя выполняет запрос');const elapsed=document.createElement('span');elapsed.className='chat-running-time';elapsed.setAttribute('aria-hidden','true');panel.append(author,text,bar,elapsed,retry);
 window.chatJobBusy=id=>['queued','running'].includes(jobs.get(id)?.state);
 function paint(){const job=jobs.get(topicSelect.value);panel.hidden=!job||job.state==='done';if(panel.hidden)panel.remove();bar.hidden=job?.state==='attention';text.textContent=job?.label||'';if(!panel.hidden&&panel.parentElement!==dialogueMessages)dialogueMessages.append(panel);retry.hidden=job?.state!=='attention';retry.onclick=()=>{if(job?.command&&!$('command').value){$('command').value=job.command;$('command').focus();}};panel.dataset.state=job?.state||'';}
 window.tryBackgroundChat=async command=>{
  if(starting||voiceReply||currentDraft||workspaceBusy||planning||commandProgress.busy)return false;
  starting=true;window.chatStartPending=true;
  try{if((await window.petya.attachmentList()).length)return false;const state=await window.petya.dialogueTopics(),result=await window.petya.chatJobStart(state.activeId,state.activeProjectId,command);if(result.foreground)return false;
   if($('command').value.trim()===command.trim())$('command').value='';window.adoptChatQueue?.(result.topicId);await refreshTopics();const latest=await window.petya.chatJobState(result.topicId);jobs.set(result.topicId,latest?.job||result.job);showDialogueMessages(latest?.messages||result.messages);if(['done','attention'].includes(latest?.job?.state)){const answer=latest.messages.at(-1);if(answer?.role==='assistant')window.revealAnswer?.([...dialogueMessages.querySelectorAll('.message-assistant')].filter(n=>n.querySelector('.message-content')).at(-1),answer.text);}window.chatScrollToLatest?.();paint();await window.restoreChatJob(result.topicId);return true;
  }finally{starting=false;window.chatStartPending=false;}
 };
 window.runQueuedChat=async(id,command)=>{const state=await window.petya.chatJobState(id);if(!state)throw Error('Чат больше недоступен.');const result=await window.petya.chatJobStart(id,state.projectId,command);return !result.foreground;};
 window.restoreChatJob=async id=>{if(!id){paint();return;}const state=await window.petya.chatJobState(id);if(!state||topicSelect.value!==id)return;if(state.job)jobs.set(id,state.job);paint();if(state.job?.state==='attention'&&state.result?.question&&!applying){applying=true;try{await showDialogueReply({...state.result,messages:state.messages});window.backgroundClarification=true;}finally{applying=false;}}};
 window.petyaEvents.onChatJob(async event=>{
  jobs.set(event.topicId,event.job);document.dispatchEvent(new CustomEvent('petya-chat-job',{detail:event}));paint();
  if(['done','attention'].includes(event.job.state)&&topicSelect.value===event.topicId){try{const state=await window.petya.chatJobState(event.topicId);if(topicSelect.value!==event.topicId)return;showDialogueMessages(state.messages);const answer=state.messages.at(-1);if(answer?.role==='assistant')window.revealAnswer?.([...dialogueMessages.querySelectorAll('.message-assistant')].filter(n=>n.querySelector('.message-content')).at(-1),answer.text);await refreshTopics();await window.restoreChatJob(event.topicId);}catch(e){notice(e.message,true);}}
 });
 window.leaveBackgroundChat=()=>{if(window.backgroundClarification){window.backgroundClarification=false;voiceReply=null;commandProgress.update('idle','');}};
 window.finishForegroundChat=result=>{if(!applying&&topicSelect.value&&!window.chatJobBusy(topicSelect.value)&&jobs.has(topicSelect.value))window.petya.chatJobFinish(topicSelect.value,result.error||result.question||voiceReply?'attention':'done').catch(()=>{});};
 new MutationObserver(()=>{if(!panel.hidden&&panel.parentElement!==dialogueMessages)dialogueMessages.append(panel);}).observe(dialogueMessages,{childList:true});setInterval(()=>{const job=jobs.get(topicSelect.value);elapsed.textContent=job?.startedAt?'Время: '+Math.max(0,Math.floor((Date.now()-job.startedAt)/1000))+' с':'';},1000);
 document.addEventListener('petya-dialogue-state',()=>{paint();});
 window.restoreChatJob(topicSelect.value).catch(()=>{});
})();
