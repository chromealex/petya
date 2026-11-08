// Settings card «Язык интерфейса»: system language by default, or a fixed choice.
// A change reloads the window so every view is rebuilt in the new language.
(()=>{
 const card=document.createElement('article');card.className='card';card.id='interface-language';
 const title=document.createElement('h2');title.textContent='Язык интерфейса';
 const description=document.createElement('p');description.className='small';description.textContent='По умолчанию Петя берёт язык системы. Язык ответов и озвучки настраивается отдельно ниже.';
 const label=document.createElement('label');label.textContent='Язык';
 const select=document.createElement('select');select.setAttribute('aria-label','Язык интерфейса');label.append(select);
 const status=document.createElement('p');status.className='small';status.setAttribute('role','status');
 card.append(title,description,label,status);
 const anchor=document.getElementById('voice-languages')||document.getElementById('speech-style')?.closest('.card');
 if(anchor)anchor.before(card);else document.getElementById('settings-form')?.prepend(card);
 const names={ru:'Русский',en:'English'};
 async function render(){
  const state=await window.petya.feature('interfaceLanguage','get');
  select.replaceChildren(...state.options.map(option=>{
   // Language names stay in their own language; only «Как в системе» follows the interface.
   const text=option.code==='system'?(window.t||String)('Как в системе')+' ('+names[state.systemLanguage]+')':option.label;
   const item=new Option(text,option.code);if(option.code!=='system')item.setAttribute('translate','no');return item;
  }));
  select.value=state.preference;
 }
 select.onchange=async()=>{
  select.disabled=true;
  try{
   const state=await window.petya.feature('interfaceLanguage','set',select.value);
   if(state.language===window.petyaLanguage){status.textContent=(window.t||String)('Язык интерфейса сохранён.');return;}
   if(window.petyaAutoMeetingActive){status.textContent=(window.t||String)('Язык сменится после перезапуска Пети: сейчас идёт запись встречи.');return;}
   await window.petya.feature('interfaceLanguage','reload');
  }catch(error){status.textContent=error.message;await render().catch(()=>{});}
  finally{select.disabled=false;}
 };
 document.addEventListener('petya-settings-displayed',()=>render().catch(error=>{status.textContent=error.message;}));
 render().catch(error=>{status.textContent=error.message;});
})();
