// «VK Teams», settings: the Bot API address (VK Teams cloud by default, your own for an on-premises server), the bot's
// token (kept as a secret, never shown again) and what the bot has received: its name, the chats it is in, when the
// messages were last taken. Says plainly that the bot sees only the chats it was added to, from that moment on.
// Changes here are saved by the card's own buttons, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const card=el('article','card');card.dataset.extension='vk-teams';card.dataset.manualSave='true';
 const api=el('input');api.type='url';api.autocomplete='off';api.spellcheck=false;
 const token=el('input');token.type='password';token.autocomplete='off';token.spellcheck=false;token.placeholder='Вставьте токен бота';
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const save=el('button','primary','Сохранить и получить сообщения');save.type='button';
 const who=el('p','small');
 const list=el('div','vk-teams-chats');list.style.cssText='max-height:240px;overflow-y:auto;margin:6px 0 12px';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const notice=el('p','small','Бот видит только чаты, в которые его добавили, и только сообщения, пришедшие после этого: истории переписки у Bot API нет. Петя хранит полученное на этом компьютере 31 день.');
 notice.style.cssText='padding:8px 10px;border-radius:8px;background:#e5ce8c14';
 const steps=el('ol','small');
 for(const s of ['В VK Teams откройте @metabot → /newbot, задайте имя и логин бота и скопируйте токен. Там же (/setuserpic) поставьте боту иконку Пети (assets/app-icon.png из папки Пети).',
  'Вставьте токен сюда. Для своего сервера VK Teams укажите адрес его Bot API (https://<ваш сервер>/bot/v1); для облака оставьте поле пустым.',
  'Добавьте бота в рабочие чаты, которые Петя должен читать. В личку бот получает только то, что написали ему.',
  'Не подключайте этого бота к другой программе: сообщения бота забирает тот, кто спросил первым.'])steps.append(el('li',null,s));
 card.append(el('h2',null,'VK Teams'),el('p',null,'Что пишут в рабочих чатах VK Teams: сводка с цитатами, пересказ треда, поиск. Петя ничего не отправляет без вашего «Отправить» в карточке.'),notice,
  field('Адрес Bot API',api,'Пусто — облако VK Teams.'),field('Токен бота',token),clearLabel,save,who,el('h3',null,'Чаты бота'),list,status,el('h3',null,'Как подключить'),steps);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('vkTeamsApp',method,...args);
 const KIND={group:'группа',channel:'канал',direct:'личный чат'};
 let busy=false;
 function render(state){
  api.placeholder=state.defaultApi||'';
  if(state.api&&state.api!==state.defaultApi)api.value=state.api;
  who.replaceChildren();
  if(state.bot){who.append('Бот: ');const b=el('b',null,state.bot);b.setAttribute('data-no-i18n','');who.append(b);}
  if(state.syncedAt){who.append(' · обновлено ');const t=typeof window.timeElement==='function'?window.timeElement(new Date(state.syncedAt)):el('span',null,new Date(state.syncedAt).toLocaleString(window.petyaLocale||'ru-RU'));who.append(t);}
  list.replaceChildren();
  if(!state.chats.length)list.append(el('p','small',state.hasToken?'Бот пока не видел ни одного чата. Добавьте его в рабочий чат и нажмите «Сохранить и получить сообщения».':'Чаты появятся после сохранения токена.'));
  for(const c of state.chats){
   const row=el('div','small');const name=el('span',null,c.title);name.setAttribute('data-no-i18n','');
   row.append(name,' · '+(KIND[c.kind]||'')+' · ','сообщений: '+c.count);list.append(row);
  }
  if(state.chats.length){
   const forget=el('button',null,'Забыть полученные сообщения');forget.type='button';
   const go=async()=>{if(!confirm((window.t||String)('Удалить полученные ботом сообщения с этого компьютера? В VK Teams они останутся.')))return;render(await call('forget'));status.textContent='Полученные сообщения удалены.';};
   if(typeof window.asDeleteButton==='function')window.asDeleteButton(forget,'Забыть полученные сообщения');
   forget.onclick=()=>go().catch(e=>{status.textContent=e.message;});list.append(forget);
  }
  status.textContent=state.error?'Ошибка: '+state.error:!state.hasToken?'Вставьте токен бота и сохраните.':state.chats.length?'VK Teams подключён. Чатов: '+state.chats.length+'.':'';
 }
 async function load(){render(await call('status'));}
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{
   await window.petya.saveSettings({vkTeamsApi:api.value.trim(),vkTeamsToken:token.value,clear_vkTeamsToken:clear.checked}).then(r=>{if(typeof displaySettings==='function')displaySettings(r);});
   token.value='';clear.checked=false;status.textContent='Получаю сообщения бота…';
   const state=await call('status');
   render(state.hasToken?await call('sync'):state);
  }catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='vk-teams')load().catch(err=>{status.textContent=err.message;});});
 render({chats:[],hasToken:false,defaultApi:'https://api.internal.myteam.mail.ru/bot/v1'});
})();
