(()=>{
 const jobs=new Map(),finishing=new Set();let applying=false,starting=false;
 const panel=document.createElement('article');panel.className='message-assistant chat-running-reply chat-job-status';panel.hidden=true;panel.setAttribute('role','status');
 const text=document.createElement('span'),retry=document.createElement('button');retry.type='button';retry.textContent='Повторить';retry.hidden=true;const author=document.createElement('strong');author.textContent='Петя';const bar=document.createElement('progress');bar.setAttribute('aria-label','Петя выполняет запрос');const elapsed=document.createElement('span');elapsed.className='chat-running-time';elapsed.setAttribute('aria-hidden','true');panel.append(author,text,bar,elapsed,retry);
 const expanded=new Map();let stepBox=null,stepOwner=null;
 function paintSteps(job){
  if(stepBox){expanded.set(stepOwner,stepBox.open);stepBox.remove();stepBox=null;}
  stepOwner=topicSelect.value;
  if(panel.hidden||!job?.steps?.length)return;
  const now=Date.now();stepBox=window.renderSteps(job.steps.map(s=>({label:s.label,ms:Math.max(0,(s.done||now)-s.at)})),{live:['queued','running'].includes(job.state),open:expanded.get(stepOwner)||false});
  const box=stepBox,owner=stepOwner;box.addEventListener('toggle',()=>{if(box.isConnected)expanded.set(owner,box.open);});panel.append(box);
 }
 window.chatJobInfo=id=>jobs.get(id);
 window.chatJobBusy=id=>['queued','running'].includes(jobs.get(id)?.state);
 function paint(){const job=jobs.get(topicSelect.value);panel.hidden=!job||!['queued','running'].includes(job.state);if(panel.hidden)panel.remove();bar.hidden=job?.state==='attention';elapsed.hidden=!['queued','running'].includes(job?.state);text.textContent=String(job?.label||'').trim()||(['queued','running'].includes(job?.state)?'Думаю…':'Нужно внимание');if(!panel.hidden)window.placeChatProgress(panel);retry.hidden=job?.state!=='attention';retry.onclick=()=>{if(job?.command&&!$('command').value){$('command').value=job.command;$('command').focus();}};panel.dataset.state=job?.state||'';paintSteps(job);}
 window.tryBackgroundChat=async command=>{
  if(starting||voiceReply||currentDraft||workspaceBusy||planning||commandProgress.busy)return false;
  starting=true;window.chatStartPending=true;
  try{if((await window.petya.attachmentList()).length)return false;const state=await window.petya.dialogueTopics(),result=await window.petya.chatJobStart(state.activeId,state.activeProjectId,command);if(result.foreground)return false;commandProgress.reset();$('notice').hidden=true;
   if($('command').value.trim()===command.trim())$('command').value='';window.adoptChatQueue?.(result.topicId);await refreshTopics();const latest=await window.petya.chatJobState(result.topicId);jobs.set(result.topicId,latest?.job||result.job);showDialogueMessages(latest?.messages||result.messages);if(['done','attention'].includes(latest?.job?.state)){const answer=latest.messages.at(-1);if(answer?.role==='assistant'&&!answer.error&&latest.job.state==='done')window.speakBackgroundAnswer?.(result.topicId,answer);if(answer?.role==='assistant'&&!answer.error)window.revealAnswer?.([...dialogueMessages.querySelectorAll('.message-assistant')].filter(n=>n.querySelector('.message-content')).at(-1),answer.text);}window.chatScrollToLatest?.();paint();await window.restoreChatJob(result.topicId);return true;
  }finally{starting=false;window.chatStartPending=false;}
 };
 window.resumeBackgroundChat=async id=>{const result=await window.petya.chatAnswerResume(id);jobs.set(id,result.job);if(topicSelect.value===id){showDialogueMessages(result.messages);paint();await window.restoreChatJob(id);}};
 window.runQueuedChat=async(id,command)=>{const state=await window.petya.chatJobState(id);if(!state)throw Error('Чат больше недоступен.');const result=await window.petya.chatJobStart(id,state.projectId,command);return !result.foreground;};
 window.restoreChatJob=async id=>{if(!id){paint();return;}const state=await window.petya.chatJobState(id);if(!state||topicSelect.value!==id)return;if(state.job)jobs.set(id,state.job);paint();if(state.job?.state==='attention'&&state.result?.question&&!applying){applying=true;try{await showDialogueReply({...state.result,messages:state.messages});window.backgroundClarification=true;}finally{applying=false;}}};
 window.petyaEvents.onChatJob(async event=>{
  jobs.set(event.topicId,event.job);document.dispatchEvent(new CustomEvent('petya-chat-job',{detail:event}));paint();
  if(!finishing.has(event.topicId)&&!applying&&['done','attention'].includes(event.job.state)&&topicSelect.value===event.topicId){try{const state=await window.petya.chatJobState(event.topicId);if(topicSelect.value!==event.topicId)return;showDialogueMessages(state.messages);if(Number.isInteger(state.result?.resultJump)||state.result?.attachment)await window.showResultChoices?.(state.result);const answer=state.messages.at(-1);if(answer?.role==='assistant'&&!answer.error){if(event.job.state==='done')window.speakBackgroundAnswer?.(event.topicId,answer);const streamed=window.lastStreamShown?.topicId===event.topicId?window.lastStreamShown.length:0;window.lastStreamShown=null;window.revealAnswer?.([...dialogueMessages.querySelectorAll('.message-assistant')].filter(n=>n.querySelector('.message-content')).at(-1),answer.text,{initial:streamed});}await refreshTopics();await window.restoreChatJob(event.topicId);}catch(e){notice(e.message,true);}}
 });
 window.leaveBackgroundChat=()=>{if(window.backgroundClarification){window.backgroundClarification=false;voiceReply=null;commandProgress.update('idle','');}};
 window.finishForegroundChat=async result=>{const id=topicSelect.value;if(applying||!id||window.chatJobBusy(id)||!jobs.has(id))return;finishing.add(id);try{await window.petya.chatJobFinish(id,result.error||result.question||voiceReply?'attention':'done',result);const state=await window.petya.chatJobState(id);if(state?.job)jobs.set(id,state.job);paint();}finally{finishing.delete(id);}};
 new MutationObserver(()=>{if(!panel.hidden)window.placeChatProgress(panel);}).observe(dialogueMessages,{childList:true});setInterval(()=>{const job=jobs.get(topicSelect.value);elapsed.textContent=job?.startedAt?''+Math.max(0,Math.floor(((['queued','running'].includes(job.state)?Date.now():job.finishedAt||job.at)-job.startedAt)/1000))+' с':'';},1000);
 document.addEventListener('petya-dialogue-state',()=>{paint();});
 window.restoreChatJob(topicSelect.value).catch(()=>{});
})();
