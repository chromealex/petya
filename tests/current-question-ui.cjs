module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  const originalStep=CommandProgress.prototype.step,originalSpeak=speakReply;
  let oldChoiceCalled=false;
  try{
   speakReply=async()=>{};
   CommandProgress.prototype.step=function(key,label,action,retryable){if(key==='files')throw Error('Presence question must bypass attachments');return originalStep.call(this,key,label,action,retryable);};
   voiceReply=async()=>{oldChoiceCalled=true;};
   $('command').value='Ты тут?';await $('command-form').onsubmit({preventDefault(){}});
   if(oldChoiceCalled||!$('notice').textContent.includes('Да, я здесь.')||$('notice').textContent.includes('кгдер'))throw Error('Typed question resumed an old clarification');
   voiceReply=async()=>{oldChoiceCalled=true;};
   await voiceTurn.dispatch('ты тут',Date.now());
   if(oldChoiceCalled||!$('notice').textContent.includes('Да, я здесь.'))throw Error('Spoken presence question resumed an old clarification');
   if($('command').value)throw Error('Sent voice text remained in composer');
   $('command').value='Новый черновик';await voiceTurn.dispatch('ты тут',Date.now());if($('command').value!=='Новый черновик')throw Error('Voice submission erased new typed draft');$('command').value='';
   const result=await window.petya.converse('Петя, ты здесь?');
   if(!result.presence||result.messages[0].text!=='Петя, ты здесь?')throw Error('Backend lost the current question');
  }finally{CommandProgress.prototype.step=originalStep;speakReply=originalSpeak;voiceReply=null;automaticVoiceCommand=false;voiceTurn.reset();commandProgress.update('idle','Готов к команде');}
 })()`);
};
