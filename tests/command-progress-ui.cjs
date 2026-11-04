module.exports = async win => {
 await win.webContents.executeJavaScript(`(async () => {
   const originalStep = CommandProgress.prototype.step, originalSpeak = speakReply;
   let fail = true, spoken = '';
   try {
     CommandProgress.prototype.step = function(key, label, action, retryable) {
       if (key === 'files') action = async () => { if(fail) throw Error('Test network failure'); return []; };
       if (key === 'reply') action = async () => ({handled:true,text:'Тестовый ответ'});
       return originalStep.call(this,key,label,action,retryable);
     };
     await processCommand('Сохранённая команда');
     if(progressPanel.hidden||commandProgress.state!=='error'||!commandProgress.failed||retryCommand.hidden||$('command').value!=='Сохранённая команда')throw Error('Failed command is not recoverable');
     view('settings');
     if($('chrome-status').hidden||$('chrome-status').dataset.state!=='error'||getComputedStyle(progressPanel).display!=='none')throw Error('Background command status missing from company bar: '+JSON.stringify({hidden:$('chrome-status').hidden,state:$('chrome-status').dataset.state,display:getComputedStyle(progressPanel).display,view:document.body.dataset.view}));
     $('chrome-status').click();
     if($('home').hidden||!$('chrome-status').hidden||getComputedStyle(progressPanel).display==='none')throw Error('Status did not reopen assistant details');
     commandProgress.busy=true;notice('Обрабатываю запрос');voiceTurn.status('Распознаю последние слова…');if($('notice').textContent!=='Обрабатываю запрос')throw Error('Background audio overwrote active command status');commandProgress.busy=false;
     fail=false;await processCommand('Петя, повтори');
     if(!progressPanel.hidden||commandProgress.state!=='done'||commandProgress.failed||!retryCommand.hidden)throw Error('Retry did not finish');
     speakReply=async text=>{spoken=text;};automaticVoiceCommand=true;
     askVoiceChoices('Кому?', [{label:'Анна',run:async()=>{}},{label:'Борис',run:async()=>{}}]);
     if(!spoken.includes('1 — Анна')||!spoken.includes('2 — Борис')||!voiceReply)throw Error('Choices are not spoken');
     await voiceReply('второй');
     voiceReply=()=>processCommand('Команда после уточнения');
     await voiceTurn.dispatch('да',Date.now());
     if(commandSnapshot!=='Команда после уточнения'||commandProgress.state!=='done')throw Error('Clarification blocked nested command');
   } finally {
     CommandProgress.prototype.step=originalStep;speakReply=originalSpeak;
     automaticVoiceCommand=false;voiceReply=null;voiceTurn.reset();
     commandProgress.update('idle','Готов к команде');
   }
 })()`);
};
