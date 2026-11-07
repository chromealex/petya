(()=>{
 const send=document.querySelector('.chat-send'),stop=document.createElement('button'),resume=document.createElement('button');
 stop.id='chat-stop';stop.type='button';stop.className='chat-send chat-stop';stop.title='Остановить ответ';stop.setAttribute('aria-label',stop.title);stop.hidden=true;
 stop.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor"/></svg>';send.after(stop);
 resume.id='chat-resume';resume.type='button';resume.className='chat-send chat-resume';resume.title='Продолжить ответ';resume.setAttribute('aria-label',resume.title);resume.hidden=true;
 resume.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M6 4.5v11l9-5.5z" fill="currentColor"/></svg>';stop.after(resume);
 let stopping=false,resuming=false,paused=null;
 function sync(){const busy=!!(window.chatJobBusy?.(topicSelect.value)||commandProgress.busy||window.petyaSpeaking);const canResume=paused&&paused.id===topicSelect.value&&!$('command').value&&!window.pendingChatFiles?.length&&!busy;stop.hidden=!busy;resume.hidden=!canResume;send.hidden=busy||!!canResume;stop.disabled=stopping||resuming;resume.disabled=resuming;}
 function discard(){paused=null;if(window.replyVoicePaused)stopSpeech.onclick();sync();}
 $('command').addEventListener('input',discard);
 document.addEventListener('petya-topic-changed',event=>{if(!event.detail?.preserveScroll)discard();});
 stop.onclick=async()=>{if(stopping)return;stopping=true;const id=topicSelect.value,background=window.chatJobBusy?.(id),request=commandProgress.busy?commandProgress.request:null;
  if(window.chatQueue)window.chatQueue.paused=true;
  const voice=!background&&!request?window.pauseReplyVoice?.():null;
  paused={id,voice,background,request};if(!voice&&!background&&!request)paused=null;
  if(!voice)stopSpeech.onclick();window.streamSpeechEnabled=false;answerStreamHidden=true;
  if(request)commandProgress.cancel();sync();
  try{await window.petya.chatAnswerStop(id);}catch(error){paused=null;notice('Не удалось остановить ответ: '+error.message,true);}finally{stopping=false;sync();}
 };
 resume.onclick=async()=>{if(resuming||!paused||$('command').value)return;const saved=paused;resuming=true;sync();
  try{if(saved.background)await window.resumeBackgroundChat(saved.id);else if(saved.request){if(!await commandProgress.resume(saved.request)&&commandProgress.state==='error')throw Error(commandProgress.label);}else{await saved.voice?.();}if(paused===saved)paused=null;}
  catch(error){notice('Не удалось продолжить ответ: '+error.message,true);}finally{resuming=false;sync();}
 };
 // Esc stops the running answer when nothing else (menu, dialog, search) is open to receive it.
 document.addEventListener('keydown',event=>{if(event.key!=='Escape'||event.defaultPrevented||stop.hidden||stop.disabled)return;if(document.querySelector('dialog[open],details[open].chat-tools,details[open].message-actions-menu,.project-context-menu:not([hidden]),#notification-center:not([hidden]),.chat-result-picker:not([hidden]),#chrome-status-details'))return;if(event.target.closest?.('dialog,details[open],.chat-find'))return;event.preventDefault();stop.click();});
 document.addEventListener('petya-chat-job',sync);document.addEventListener('petya-speaking',sync);document.addEventListener('petya-dialogue-state',sync);setInterval(sync,100);sync();
})();
