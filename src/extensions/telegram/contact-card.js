(()=>{const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('contact-card.css',document.currentScript.src).href;document.head.append(style);})();
window.renderTelegramContacts=(message,data)=>{
 if(!message)return;
 if(data.telegramConnect&&!message.querySelector('.telegram-connect-offer')){
  const offer=document.createElement('div');offer.className='telegram-connect-offer';const button=document.createElement('button');button.type='button';button.textContent='Подключить Telegram';button.onclick=()=>{if(!moduleEnabled('telegram'))window.openAppCatalog('Telegram');else{view('settings');window.revealSettings?.(document.querySelector('[data-service=telegram]'));}};offer.append(button);message.append(offer);
 }
 if(!Array.isArray(data.telegramContacts)||message.querySelector('.telegram-contact-list'))return;
 const list=document.createElement('div');list.className='telegram-contact-list';
 for(const contact of data.telegramContacts.slice(0,12)){
  if(typeof contact.name!=='string'||!contact.name.trim())continue;
  const card=document.createElement('section');card.className='telegram-contact-card';
  const icon=document.createElement('span');icon.className='telegram-contact-avatar';icon.textContent=Array.from(contact.name.trim())[0];icon.setAttribute('aria-hidden','true');
  // The team photo replaces the letter when the contact is in «Команда».
  window.resultKit?.loadTeam?.().then(()=>{const m=window.resultKit.person(contact.name);if(m?.photo&&/^data:image\/(png|jpeg);base64,/.test(m.photo)){const img=document.createElement('img');img.src=m.photo;img.alt='';icon.replaceChildren(img);icon.classList.add('has-photo');}}).catch(()=>{});
  const info=document.createElement('div'),name=document.createElement('strong'),source=document.createElement('small');
  name.textContent=contact.name;source.textContent='Совпадение в поиске Telegram';info.append(name,source);
  if(contact.observed&&contact.observed!==contact.name){const detail=document.createElement('p');detail.textContent=contact.observed.startsWith(contact.name+' · ')?contact.observed.slice(contact.name.length+3):contact.observed;info.append(detail);}
  const copy=document.createElement('button');copy.type='button';copy.textContent='Копировать имя';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(contact.name);copy.textContent='Скопировано';}catch{copy.textContent='Не удалось скопировать';}};
  // Quick follow-ups: write to the person or open the conversation; the role comes from «Команда» when known.
  const say=text=>()=>{const c=document.getElementById('command');if(!c)return;c.value=text;c.focus();};
  const write=document.createElement('button');write.type='button';write.textContent='Написать';write.onclick=say('Напиши в Telegram '+contact.name+': ');
  const thread=document.createElement('button');thread.type='button';thread.textContent='Переписка';thread.onclick=()=>window.processCommand?.('Покажи последнюю переписку с '+contact.name+' в Telegram');
  const actions=document.createElement('div');actions.className='telegram-contact-actions';actions.append(write,thread,copy);
  window.petya.teamList?.().then(team=>{const person=window.resultKit?.person?.(contact.name)||(team?.members||[]).find(m=>m.name&&(m.name===contact.name||String(m.aliases||'').split(/[,;]/).map(a=>a.trim()).includes(contact.name)));if(person?.role){source.textContent=person.role+' · из команды';}}).catch(()=>{});
  card.append(icon,info,actions);list.append(card);
 }
 message.append(list);
};
