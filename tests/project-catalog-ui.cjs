module.exports=async win=>{
 await win.webContents.executeJavaScript(`(async()=>{
  const originalStep=CommandProgress.prototype.step,originalSpeak=speakReply;
  let oldChoiceCalled=false;
  try{
   speakReply=async()=>{};
   await window.petya.converse('Работаем над проектом Проверка списка Альфа');
   await window.petya.converse('Работаем над проектом Проверка списка Бета');
   const before=await window.petya.dialogueTopics();
   const result=await window.petya.converse('А какие проекты у тебя есть?');
   if(!result.projectCatalog||!result.text.includes('Проверка списка Альфа')||!result.text.includes('Проверка списка Бета'))throw Error('Project catalogue did not list saved projects');
   if(JSON.stringify(await window.petya.dialogueTopics())!==JSON.stringify(before))throw Error('Listing projects changed the active dialogue');
   CommandProgress.prototype.step=function(key,label,action,retryable){if(key==='files')throw Error('Project listing must bypass attachments');return originalStep.call(this,key,label,action,retryable);};
   voiceReply=async()=>{oldChoiceCalled=true;};
   $('command').value='А какие проекты у тебя есть?';await $('command-form').onsubmit({preventDefault(){}});
   if(oldChoiceCalled||!$('notice').textContent.includes('Проверка списка Альфа')||$('notice').textContent.includes('посмотреть баги'))throw Error('Typed project question resumed old bug choice');
   voiceReply=async()=>{oldChoiceCalled=true;};await voiceTurn.dispatch('А какие проекты у тебя есть',Date.now());
   if(oldChoiceCalled||!$('notice').textContent.includes('Проверка списка Бета'))throw Error('Spoken project question resumed old bug choice');
  }finally{
   await window.petya.converse('Забудь проект Проверка списка Альфа');await window.petya.converse('Забудь проект Проверка списка Бета');
   CommandProgress.prototype.step=originalStep;speakReply=originalSpeak;voiceReply=null;automaticVoiceCommand=false;voiceTurn.reset();commandProgress.update('idle','Готов к команде');
  }
 })()`);
};
