(()=>{
 const card=document.createElement('article');card.className='card';card.id='voice-languages';
 const title=document.createElement('h2');title.textContent='Языки общения';
 const description=document.createElement('p');description.className='small';description.textContent='Русский и английский уже доступны. Остальные языки можно добавить по необходимости — они используют общую голосовую модель.';
 const rows=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select'),status=document.createElement('p');
 rows.className='voice-language-list';label.className='voice-language-selection';label.textContent='Язык ответов';select.setAttribute('aria-label','Язык ответов');label.append(select);status.className='small';status.setAttribute('role','status');
 // «Язык речи»: the recognition hint. Automatic detection is offered but may hear Russian as Czech.
 const speechLabel=document.createElement('label'),speech=document.createElement('select');speechLabel.className='voice-language-selection';speechLabel.textContent='Язык речи';speech.setAttribute('aria-label','Язык речи');speechLabel.append(speech);
 const speechNote=document.createElement('p');speechNote.className='small';speechNote.textContent='На каком языке ты говоришь с Петей. Автоопределение иногда путает русский с чешским.';
 card.append(title,description,rows,label,speechLabel,speechNote,status);
 document.getElementById('speech-style')?.closest('.card')?.after(card);
 async function render(){
  const state=await window.petya.voiceLanguages();rows.replaceChildren();select.replaceChildren(new Option('На языке вопроса','auto'));speech.replaceChildren(new Option('Как язык интерфейса',''),new Option('Определять автоматически','auto'));
  for(const language of state.languages){
   const row=document.createElement('div');row.className='voice-language-row';
   const identity=document.createElement('div');identity.className='voice-language-identity';
   const code=document.createElement('span');code.className='voice-language-code';code.textContent=language.code.toUpperCase();code.setAttribute('aria-hidden','true');
   const name=document.createElement('span');name.className='voice-language-name';name.textContent=language.label;identity.append(code,name);row.append(identity);
   if(language.installed){
    select.add(new Option(language.label,language.code));speech.add(new Option(language.label,language.code));const installed=document.createElement('span');installed.className='voice-language-installed';installed.innerHTML='<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';installed.append(document.createTextNode('Установлен'));row.append(installed);
   }else{
    const install=document.createElement('button');install.className='voice-language-download';install.type='button';install.dataset.language=language.code;install.setAttribute('aria-label','Скачать язык: '+language.label);
    const paint=()=>{install.innerHTML='<svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v9m-4-4 4 4 4-4M4 14v3h12v-3"/></svg>';install.append(document.createTextNode('Скачать'));};paint();if(language.downloading){install.disabled=true;install.textContent='Загрузка…';install.setAttribute('aria-busy','true');}
    install.onclick=async()=>{install.disabled=true;install.textContent='Загрузка…';install.setAttribute('aria-busy','true');status.textContent='Загружаю '+language.label.toLowerCase()+'…';try{await window.petya.voiceLanguageInstall(language.code);status.textContent='Язык установлен.';await render();}catch(e){status.textContent=e.message;install.disabled=false;install.removeAttribute('aria-busy');paint();}};row.append(install);
   }
   rows.append(row);
  }
  select.value=state.selected;speech.value=state.speech||'';
 }
 speech.onchange=async()=>{speech.disabled=true;try{await window.petya.saveSettings({speechLanguage:speech.value});status.textContent='Язык речи сохранён.';}catch(e){status.textContent=e.message;await render();}finally{speech.disabled=false;}};
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
 window.petyaEvents.onVoiceLanguageProgress(state=>{if(!state.busy)render().catch(()=>{});});
 document.addEventListener('petya-settings-displayed',()=>render().catch(e=>{status.textContent=e.message;}));render().catch(e=>{status.textContent=e.message;});
})();
