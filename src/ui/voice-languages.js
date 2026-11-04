(()=>{
 const card=document.createElement('article');card.className='card';card.id='voice-languages';
 const title=document.createElement('h2');title.textContent='Языки общения';
 const description=document.createElement('p');description.className='small';description.textContent='Русский и английский доступны по умолчанию. Остальные языки загружаются только по твоему выбору. Многоязычная голосовая модель общая — повторно скачивать её не нужно.';
 const rows=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('p');
 label.textContent='Язык ответов';select.setAttribute('aria-label','Язык ответов');label.append(select);status.className='small';status.setAttribute('role','status');card.append(title,description,rows,label,status);
 document.getElementById('speech-style')?.closest('.card')?.after(card);
 async function render(){const state=await window.petya.voiceLanguages();rows.replaceChildren();select.replaceChildren();for(const language of state.languages){const row=document.createElement('div');row.className='row';const name=document.createElement('span');name.textContent=language.label+' — '+(language.installed?'установлен':'не установлен');row.append(name);if(language.installed)select.add(new Option(language.label,language.code));else{const install=document.createElement('button');install.type='button';install.textContent='Скачать';install.dataset.language=language.code;install.onclick=async()=>{install.disabled=true;status.textContent='Загружаю '+language.label.toLowerCase()+'…';try{await window.petya.voiceLanguageInstall(language.code);status.textContent='Язык установлен.';await render();}catch(e){status.textContent=e.message;install.disabled=false;}};row.append(install);}rows.append(row);}select.value=state.selected;}
 select.onchange=async()=>{select.disabled=true;try{await window.petya.saveSettings({communicationLanguage:select.value});status.textContent='Язык ответов сохранён.';}catch(e){status.textContent=e.message;await render();}finally{select.disabled=false;}};
 const dismissed=new Set();
 window.offerVoiceLanguage=(text,missing,target)=>{
  if(!missing?.length||dismissed.has(text))return;
  if(target&&!target.isConnected)return;
  const message=target||[...dialogueMessages.querySelectorAll('.message-assistant')].at(-1)||dialogueMessages;
  if(message.querySelector('[data-voice-language-offer]'))return;
  const box=document.createElement('div');box.dataset.voiceLanguageOffer='true';box.className='card';const note=document.createElement('p');note.textContent='Для озвучки нужен язык: '+missing.map(item=>item.label).join(', ')+'.';box.append(note);
  for(const item of missing){if(!item.available){const unavailable=document.createElement('p');unavailable.textContent='Этот язык пока недоступен для загрузки.';box.append(unavailable);continue;}const install=document.createElement('button');install.type='button';install.textContent='Установить: '+item.label;install.onclick=async()=>{install.disabled=true;note.textContent='Загружаю язык…';try{await window.petya.voiceLanguageInstall(item.code);install.textContent='Установлен';await render();const check=await window.petya.voiceLanguageCheck(text);note.textContent=check.missing.length?'Осталось установить: '+check.missing.map(i=>i.label).join(', '):'Готово. Можно озвучить ответ.';if(!check.missing.length){const play=document.createElement('button');play.type='button';play.textContent='Озвучить ответ';play.onclick=()=>{box.remove();speakReply(text);};box.append(play);}}catch(e){note.textContent=e.message;install.disabled=false;}};box.append(install);}
  const skip=document.createElement('button');skip.type='button';skip.textContent='Пропустить озвучку';skip.onclick=()=>{dismissed.add(text);box.remove();};box.append(skip);message.append(box);
 };
 window.checkVoiceLanguages=async (text,target)=>{try{const check=await window.petya.voiceLanguageCheck(text);window.offerVoiceLanguage(text,check.missing,target);}catch{/* Explicit speech requests surface detector errors through the normal error path. */}};
 document.addEventListener('petya-settings-displayed',()=>render().catch(e=>{status.textContent=e.message;}));render().catch(e=>{status.textContent=e.message;});
})();
