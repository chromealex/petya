// «Discord», settings: the bot token (kept as a secret, never shown again), the server and the channels to read.
// After the token is saved the servers the bot is in and their channels are loaded from Discord to pick from.
// Changes here are saved by the card's own buttons, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const card=el('article','card');card.dataset.extension='discord';card.dataset.manualSave='true';
 const token=el('input');token.type='password';token.autocomplete='off';token.spellcheck=false;token.placeholder='Вставьте токен бота';
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const save=el('button','primary','Сохранить и загрузить серверы');save.type='button';
 const guilds=el('div','discord-guilds');const list=el('div','discord-channels');list.style.cssText='max-height:240px;overflow-y:auto;margin:6px 0 12px';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const steps=el('ol','small');
 for(const s of ['Discord Developer Portal → New Application. В General Information загрузите иконку Пети (assets/app-icon.png из папки Пети).',
  'Bot → Reset Token → скопируйте токен и вставьте сюда. Там же включите Message Content Intent (Privileged Gateway Intents): без него Discord отдаёт чужие сообщения без текста — и через REST тоже.',
  'OAuth2 → URL Generator: scope «bot», права «View Channels», «Read Message History», а для ответов — «Send Messages» и «Send Messages in Threads». Откройте ссылку и добавьте бота на сервер игры.',
  'Сохраните токен, выберите сервер и отметьте каналы, которые Петя читает (не больше 25). Отправлять Петя может только в отмеченные текстовые каналы и только после вашего «Отправить».'])steps.append(el('li',null,s));
 card.append(el('h2',null,'Discord'),el('p',null,'Что пишут игроки в Discord: темы с цитатами, частые вопросы, баги. Петя читает только отмеченные каналы и ничего не публикует без вашего подтверждения.'),
  field('Токен бота',token),clearLabel,save,el('h3',null,'Сервер'),guilds,el('h3',null,'Каналы'),list,status,el('h3',null,'Как подключить'),steps);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('discordApp',method,...args);
 const TYPE={0:'текстовый',5:'объявления',15:'форум'};
 let state={channels:[]},available=[],busy=false;
 async function persist(data,done){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);status.textContent=done;}
  catch(e){status.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 function renderChannels(){
  list.replaceChildren();
  const rows=[...available];for(const c of state.channels)if(!rows.some(x=>x.id===c.id))rows.push({...c,missing:true});
  if(!rows.length){list.append(el('p','small','Каналы появятся после выбора сервера.'));return;}
  for(const c of rows){
   const label=el('label','check'),box=el('input');box.type='checkbox';box.checked=state.channels.some(x=>x.id===c.id);
   box.onchange=async()=>{
    const next=box.checked?[...state.channels,{id:c.id,name:c.name,type:c.type}]:state.channels.filter(x=>x.id!==c.id);
    if(next.length>25){box.checked=false;status.textContent='Не больше 25 каналов.';return;}
    state.channels=next;await persist({discordChannels:JSON.stringify(next)},'Каналы сохранены: '+next.length+'.').catch(()=>{box.checked=!box.checked;});
   };
   const name=el('span');name.setAttribute('data-no-i18n','');name.textContent='#'+c.name;
   label.append(box,name,el('small','small',' · '+(c.missing?'нет на сервере':TYPE[c.type]||'')));list.append(label);
  }
 }
 async function load(){
  state=await call('status');
  if(!state.hasToken){guilds.replaceChildren();available=[];renderChannels();status.textContent='Вставьте токен бота и сохраните.';return;}
  status.textContent='Загружаю серверы Discord…';
  const items=await call('guilds');guilds.replaceChildren();
  if(!items.length){status.textContent='Бот не добавлен ни на один сервер. Добавьте его по ссылке из OAuth2 → URL Generator.';return;}
  for(const g of items){
   const b=el('button',g.id===state.guild?'primary':null,g.name);b.type='button';b.setAttribute('data-no-i18n','');b.setAttribute('aria-pressed',String(g.id===state.guild));
   b.onclick=async()=>{if(g.id===state.guild)return;await persist({discordGuild:g.id,discordGuildName:g.name,discordChannels:'[]',discordSeen:'{}'},'Сервер: '+g.name+'.');await load().catch(e=>{status.textContent=e.message;});};
   guilds.append(b);
  }
  if(!state.guild){available=[];renderChannels();status.textContent='Выберите сервер игры.';return;}
  available=await call('channels',state.guild);renderChannels();
  status.textContent=state.channels.length?'Discord подключён. Каналов: '+state.channels.length+'.':'Отметьте каналы, которые читать.';
 }
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{await persist({discordToken:token.value,clear_discordToken:clear.checked},'Сохранено.');token.value='';clear.checked=false;await load();}
  catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 // Servers and channels are loaded once, the first time the card is opened (not on every settings refresh).
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='discord')load().catch(err=>{status.textContent=err.message;});});
 renderChannels();
})();
