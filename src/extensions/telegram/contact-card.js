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
  const info=document.createElement('div'),name=document.createElement('strong'),source=document.createElement('small');
  name.textContent=contact.name;source.textContent='Совпадение в поиске Telegram';info.append(name,source);
  if(contact.observed&&contact.observed!==contact.name){const detail=document.createElement('p');detail.textContent=contact.observed.startsWith(contact.name+' · ')?contact.observed.slice(contact.name.length+3):contact.observed;info.append(detail);}
  const copy=document.createElement('button');copy.type='button';copy.textContent='Копировать имя';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(contact.name);copy.textContent='Скопировано';}catch{copy.textContent='Не удалось скопировать';}};
  card.append(icon,info,copy);list.append(card);
 }
 message.append(list);
};
