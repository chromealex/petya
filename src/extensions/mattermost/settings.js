// «Mattermost», settings: the server address, the personal access token (kept as a secret, never shown again) and the
// channels Petya reads. After saving, the user's teams and their channels are loaded from the server to pick from.
// Changes here are saved by the card's own buttons, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const card=el('article','card');card.dataset.extension='mattermost';card.dataset.manualSave='true';
 const url=el('input');url.type='url';url.autocomplete='off';url.spellcheck=false;url.placeholder='https://chat.example.com';
 const token=el('input');token.type='password';token.autocomplete='off';token.spellcheck=false;token.placeholder='Вставьте личный токен доступа';
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const save=el('button','primary','Сохранить и загрузить каналы');save.type='button';
 const who=el('p','small');who.setAttribute('data-no-i18n','');
 const list=el('div','mattermost-channels');list.style.cssText='max-height:260px;overflow-y:auto;margin:6px 0 12px';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const steps=el('ol','small');
 for(const s of ['Mattermost → аватар → «Профиль» → «Безопасность» → «Personal Access Tokens» → «Create Token». Если пункта нет, администратор включает личные токены (System Console → Integrations → Integration Management) и разрешает их вашей учётной записи.',
  'Вставьте адрес сервера (как в браузере, https://…) и токен, сохраните.',
  'Отметьте каналы, которые Петя читает (не больше 25). Отправлять Петя может только в отмеченные каналы и только после вашего «Отправить» в карточке.',
  'Токен действует от вашего имени: Петя видит только то, что видите вы, и пишет от вашего имени.'])steps.append(el('li',null,s));
 card.append(el('h2',null,'Mattermost'),el('p',null,'Что обсуждали в каналах Mattermost: сводка с цитатами, пересказ треда, поиск. Петя читает только отмеченные каналы и ничего не публикует без вашего подтверждения.'),
  field('Адрес сервера',url),field('Личный токен доступа',token),clearLabel,save,who,el('h3',null,'Каналы'),list,status,el('h3',null,'Как подключить'),steps);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('mattermostApp',method,...args);
 const TYPE={O:'открытый',P:'закрытый'};
 let state={channels:[]},available=[],busy=false;
 async function persist(data,done){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);status.textContent=done;}
  catch(e){status.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 function render(){
  list.replaceChildren();
  const rows=[...available];for(const c of state.channels)if(!rows.some(x=>x.id===c.id))rows.push({...c,missing:true});
  if(!rows.length){list.append(el('p','small','Каналы появятся после сохранения адреса и токена.'));return;}
  let team='';
  for(const c of rows){
   if(c.teamDisplay&&c.teamDisplay!==team){team=c.teamDisplay;const h=el('div','small',team);h.setAttribute('data-no-i18n','');h.style.cssText='margin:8px 0 2px;font-weight:600';list.append(h);}
   const label=el('label','check'),box=el('input');box.type='checkbox';box.checked=state.channels.some(x=>x.id===c.id);
   box.onchange=async()=>{
    // Names are cut so 25 channels fit the 2000-character limit of a saved setting.
    const next=box.checked?[...state.channels,{id:c.id,name:String(c.name).slice(0,30),display:String(c.display).slice(0,30),team:c.team,teamName:String(c.teamName).slice(0,30),type:c.type}]:state.channels.filter(x=>x.id!==c.id);
    if(next.length>25){box.checked=false;status.textContent='Не больше 25 каналов.';return;}
    state.channels=next;await persist({mattermostChannels:JSON.stringify(next)},'Каналы сохранены: '+next.length+'.').catch(()=>{box.checked=!box.checked;});
   };
   const name=el('span');name.setAttribute('data-no-i18n','');name.textContent='~'+c.display;
   label.append(box,name,el('small','small',' · '+(c.missing?'нет доступа':TYPE[c.type]||'')));list.append(label);
  }
 }
 async function load(){
  state=await call('status');url.value=state.url||url.value;
  if(!state.url||!state.hasToken){who.textContent='';available=[];render();status.textContent='Укажите адрес сервера и токен, затем сохраните.';return;}
  status.textContent='Загружаю каналы Mattermost…';
  const me=await call('me');who.textContent=me.name+(me.username?' (@'+me.username+')':'');
  const groups=await call('teamList');available=[];
  for(const t of groups)for(const c of await call('channels',t.id))available.push({...c,teamName:t.name,teamDisplay:t.display});
  render();
  status.textContent=state.channels.length?'Mattermost подключён. Каналов: '+state.channels.length+'.':'Отметьте каналы, которые читать.';
 }
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{await persist({mattermostUrl:url.value.trim(),mattermostToken:token.value,clear_mattermostToken:clear.checked},'Сохранено.');token.value='';clear.checked=false;await load();}
  catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 // The user's teams and channels are loaded once, the first time the card is opened (not on every settings refresh).
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='mattermost')load().catch(err=>{status.textContent=err.message;});});
 render();
})();
