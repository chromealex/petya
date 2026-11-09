// «История буфера» settings: the switch (off by default) with what exactly is kept, the apps whose copies are never
// stored, pause / resume and «Стереть всё». The switch goes through the app's IPC (it starts or stops watching).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('clipboard',method,...args);
 const card=el('article','card');card.dataset.extension='clipboard';
 card.append(el('h2',null,'История буфера'));
 const about=el('p',null,'Когда история включена, Петя запоминает скопированный текст и картинки: последние 200 записей, не старше 7 дней. Всё хранится только на этом компьютере, зашифровано ключом системы, и никуда не отправляется. Пароли, токены, ключи и копии из менеджеров паролей не сохраняются.');
 const row=(label,control)=>{const l=el('label');l.style.cssText='display:flex;gap:8px;align-items:center;margin:6px 0';l.append(control,el('span',null,label));return l;};
 // No form name: the shared settings form would send a checkbox as «on».
 const enabled=el('input');enabled.type='checkbox';
 const privateLabel=el('p','small','Не запоминать копии из этих приложений (по одному в строке). Менеджеры паролей пропускаются всегда.');privateLabel.style.color='var(--muted)';
 const privateApps=el('textarea');privateApps.name='clipboardPrivateApps';privateApps.rows=3;privateApps.placeholder='Telegram\nTerminal';privateApps.style.cssText='width:100%;box-sizing:border-box';
 const controls=el('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px';
 const pause=el('button',null,'Пауза на час');pause.type='button';
 const pauseAll=el('button',null,'Пауза до возобновления');pauseAll.type='button';
 const resume=el('button',null,'Продолжить');resume.type='button';
 const state=el('p');state.setAttribute('role','status');
 let message='';const note=text=>{message=text;state.textContent=text;};
 const wipe=(window.deleteButton||((label,fn)=>{const b=el('button',null,label);b.type='button';b.onclick=fn;return b;}))('Стереть всю историю буфера',async()=>{
  if(!confirm('Стереть всю историю буфера? Это нельзя отменить.'))return;
  try{await call('wipe');note('История буфера стёрта.');refresh();}catch(e){note(e.message);}
 });
 controls.append(pause,pauseAll,resume,wipe);
 card.append(about,row('Запоминать, что я копирую',enabled),privateLabel,privateApps,controls,state);
 document.getElementById('settings-form').append(card);
 const describe=st=>{
  const parts=[!st.enabled?'История выключена':st.paused?(st.pausedUntil?'На паузе до '+new Date(st.pausedUntil).toLocaleTimeString(window.petyaLocale||'ru-RU',{hour:'2-digit',minute:'2-digit'}):'На паузе'):'История включена'];
  parts.push('записей: '+st.count);
  if(st.skipped.secret+st.skipped.manager)parts.push('пропущено паролей и токенов: '+(st.skipped.secret+st.skipped.manager));
  parts.push(st.encrypted?'зашифровано':'шифрование системы недоступно — файл доступен только вашей учётной записи');
  return parts.join(' · ')+'.';
 };
 async function refresh(){
  try{
   const st=await call('status');
   enabled.checked=st.enabled;privateApps.disabled=!st.enabled;
   pause.hidden=pauseAll.hidden=!st.enabled||st.paused;resume.hidden=!st.paused;
   state.textContent=(message?message+' ':'')+describe(st);message='';
  }catch(e){state.textContent=e.message;}
 }
 enabled.onchange=async()=>{try{await call('enable',enabled.checked);note(enabled.checked?'История включена: запомню то, что скопируете дальше.':'История выключена. Сохранённое осталось — его можно стереть кнопкой ниже.');}catch(e){note(e.message);enabled.checked=!enabled.checked;}refresh();};
 privateApps.onchange=async()=>{try{await window.petya.saveSettings({clipboardPrivateApps:privateApps.value});note('Список сохранён.');}catch(e){note(e.message);}refresh();};
 pause.onclick=async()=>{await call('pause',60).catch(e=>note(e.message));refresh();};
 pauseAll.onclick=async()=>{await call('pause',0).catch(e=>note(e.message));refresh();};
 resume.onclick=async()=>{await call('resume').catch(e=>note(e.message));refresh();};
 document.addEventListener('petya-settings-displayed',refresh);
 refresh();
})();
