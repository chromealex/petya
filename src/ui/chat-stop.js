(()=>{
 const send=document.querySelector('.chat-send'),stop=document.createElement('button');
 stop.id='chat-stop';stop.type='button';stop.className='chat-send chat-stop';stop.title='Остановить ответ';stop.setAttribute('aria-label','Остановить ответ');stop.hidden=true;
 stop.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor"/></svg>';send.after(stop);
 let stopping=false;
 function sync(){const busy=!!(window.chatJobBusy?.(topicSelect.value)||commandProgress.busy||window.answerPaceBusy?.()||window.petyaSpeaking);stop.hidden=!busy;send.hidden=busy;stop.disabled=stopping;}
 stop.onclick=async()=>{if(stopping)return;stopping=true;sync();const id=topicSelect.value;
  if(window.chatQueue)window.chatQueue.paused=true;
  window.stopAnswerPace?.();stopSpeech.onclick();window.streamSpeechEnabled=false;answerStreamHidden=true;answerPace?.stop();answerPace=null;
  if(commandProgress.busy)commandProgress.cancel();
  try{await window.petya.chatAnswerStop(id);}catch(error){notice('Не удалось остановить ответ: '+error.message,true);}finally{stopping=false;sync();}
 };
 document.addEventListener('petya-chat-job',sync);document.addEventListener('petya-speaking',sync);document.addEventListener('petya-dialogue-state',sync);setInterval(sync,100);sync();
})();
