// «Google Диск» settings: how Petya signs in (a Google account from mail with incremental consent for Drive and Docs
// reading, or a service-account key), whether Petya may create documents (drive.file is asked only then), and the
// opt-in to index Google Docs for search by meaning (off by default).
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('googleDrive',method,...args);
 const card=el('article','card');card.dataset.extension='google-drive';card.dataset.manualSave='true';
 card.append(el('h2',null,'Google Диск'),el('p',null,'Файлы Google Диска и Google Документы в чате: поиск, последние файлы, оглавление и ответы по документу с цитатами. Петя просит только чтение; создавать документы — когда вы это включите, и каждый раз после подтверждения.'));
 const row=css=>{const d=el('div');d.style.cssText=css||'display:flex;gap:8px;flex-wrap:wrap;align-items:center';return d;};
 const modes=row('display:flex;gap:16px;flex-wrap:wrap');
 const radio=(value,label)=>{const l=el('label','check'),r=el('input');r.type='radio';r.name='googleDriveAuthChoice';r.value=value;l.append(r,document.createTextNode(label));modes.append(l);return r;};
 const viaAccount=radio('account','Аккаунт Google (как почта)'),viaService=radio('service','Сервисный аккаунт');
 // Account path.
 const accountBox=el('div');accountBox.style.cssText='display:flex;flex-direction:column;gap:6px';
 const list=el('div');list.style.cssText='display:flex;flex-direction:column;gap:6px';
 const another=el('button',null,'Подключить аккаунт Google с Диском');another.type='button';
 const cancel=el('button',null,'Отменить вход');cancel.type='button';cancel.hidden=true;
 const accountButtons=row();accountButtons.append(another,cancel);
 accountBox.append(list,accountButtons);
 // Service account path.
 const serviceBox=el('div');serviceBox.style.cssText='display:flex;flex-direction:column;gap:6px';
 const file=el('input');file.type='file';file.accept='application/json,.json';file.hidden=true;
 const pick=el('button',null,'Выбрать JSON-ключ…');pick.type='button';pick.onclick=()=>file.click();
 const email=el('code');email.setAttribute('data-no-i18n','');email.style.cssText='user-select:text;overflow-wrap:anywhere';
 const copy=el('button',null,'Скопировать адрес');copy.type='button';
 const removeKey=window.deleteButton?window.deleteButton('Удалить сохранённый ключ'):el('button',null,'Удалить сохранённый ключ');
 const keyRow=row();keyRow.append(pick,email,copy,removeKey,file);
 serviceBox.append(keyRow,el('small','small','Поделитесь с адресом сервисного аккаунта нужными файлами или папками (доступ «Читатель»). Документы он создаёт в своём Диске, поэтому сохранять ответы можно только через аккаунт Google.'));
 // Creating documents.
 const writeLabel=el('label','check'),write=el('input');write.type='checkbox';
 writeLabel.append(write,document.createTextNode('Разрешить создавать документы: ответ Пети в новый Google Документ — только после подтверждения в карточке'));
 const save=el('button','primary','Сохранить');save.type='button';
 // Index for search by meaning.
 const indexBox=el('div');indexBox.style.cssText='display:flex;flex-direction:column;gap:4px';
 const indexLabel=el('label','check'),indexOn=el('input');indexOn.type='checkbox';
 indexLabel.append(indexOn,document.createTextNode('Индексировать Google Документы для поиска по смыслу'));
 const indexNote=el('small','small');const indexState=el('small','small');indexState.setAttribute('role','status');
 const wipeIndex=window.deleteButton?window.deleteButton('Стереть индекс Google Документов'):el('button',null,'Стереть индекс Google Документов');
 const indexRow=row();indexRow.append(indexState,wipeIndex);
 indexBox.append(el('h3',null,'Поиск по смыслу'),indexLabel,indexNote,indexRow);
 const help=el('details');help.append(el('summary',null,'Что включить в Google Cloud'));
 for(const line of [
  'Аккаунт Google: в проекте Google Cloud, где создан OAuth-клиент Desktop app для Gmail, включите Google Drive API и Google Docs API (APIs & Services → Library).',
  'На экране согласия OAuth (Data access / Scopes) добавьте https://www.googleapis.com/auth/drive.readonly, https://www.googleapis.com/auth/documents.readonly и, для создания документов, https://www.googleapis.com/auth/drive.file. Пока приложение в режиме Testing, добавьте свой адрес в Test users.',
  'Сервисный аккаунт: в его проекте включите Google Drive API и Google Docs API, создайте ключ JSON (IAM & Admin → Service accounts → Keys) и поделитесь нужными файлами с адресом аккаунта.'
 ])help.append(el('p',null,line));
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h3',null,'Вход'),modes,accountBox,serviceBox,writeLabel,save,indexBox,help,status);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 let state=null,chosen='',timer=null;
 const notify=op=>{if(op)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:op}));};
 function paint(st){
  state=st;chosen=st.chosen||'';
  viaAccount.checked=st.mode!=='service';viaService.checked=st.mode==='service';write.checked=!!st.write;
  accountBox.hidden=st.mode==='service';serviceBox.hidden=st.mode!=='service';
  list.replaceChildren();
  if(!st.accounts.length)list.append(el('p','muted','Аккаунтов Google пока нет. Сначала подключите Gmail (OAuth-клиент Desktop app) в «Подключениях» или используйте сервисный аккаунт.'));
  for(const a of st.accounts){
   const r=row();
   if(a.read){const choice=el('input');choice.type='radio';choice.name='googleDriveAccountChoice';choice.value=a.key;choice.checked=a.key===chosen;choice.setAttribute('aria-label','Использовать этот аккаунт');choice.onchange=()=>{chosen=a.key;};r.append(choice);}
   const name=el('span',null,a.email||a.label||a.key);name.setAttribute('data-no-i18n','');
   r.append(name,el('small',null,a.read&&a.write?'чтение и создание документов':a.read?'только чтение':'нет доступа к Диску'));
   if(!a.read){const b=el('button',null,'Разрешить чтение Диска');b.type='button';b.onclick=()=>connect(a.key,false);r.append(b);}
   else if(st.write&&!a.write){const b=el('button',null,'Разрешить создание документов');b.type='button';b.onclick=()=>connect(a.key,true);r.append(b);}
   list.append(r);
  }
  another.disabled=!st.configured;another.title=st.configured?'':'Сначала импортируйте OAuth-клиент Google в настройках почты.';
  email.textContent=st.serviceEmail||'Ключ не загружен';copy.hidden=!st.serviceEmail;removeKey.hidden=!st.hasKey;
  const ix=st.index||{};
  indexBox.hidden=!ix.available;indexOn.checked=!!ix.enabled;indexOn.disabled=!st.connected;
  indexNote.textContent=ix.collects||'';
  wipeIndex.hidden=!ix.items;
  indexState.textContent=!st.connected?'Сначала подключите Google Диск.':ix.enabled?(ix.items?'В индексе документов: '+ix.items.toLocaleString(window.petyaLocale||'ru-RU')+'.':'Индекс заполняется в фоне.')+(ix.error?' Ошибка: '+ix.error:''):'Выключено.';
  const pending=!!st.operation?.busy;cancel.hidden=!pending;
  if(pending&&!timer)timer=setInterval(refresh,2000);
  if(!pending&&timer){clearInterval(timer);timer=null;}
  notify(st.operation);
 }
 async function refresh(){try{paint(await call('status'));}catch(e){status.textContent=e.message;}}
 async function connect(key,wantWrite){try{status.textContent='Откройте браузер и разрешите доступ к Google Диску.';paint(await call('connect',key,wantWrite));}catch(e){status.textContent=e.message;}}
 another.onclick=()=>connect('',false);
 cancel.onclick=async()=>{try{paint(await call('cancel'));status.textContent='Вход отменён.';}catch(e){status.textContent=e.message;}};
 for(const r of [viaAccount,viaService])r.onchange=()=>{accountBox.hidden=viaService.checked;serviceBox.hidden=!viaService.checked;};
 file.onchange=async()=>{const f=file.files?.[0];file.value='';if(!f)return;try{paint(await call('saveKey',await f.text()));status.textContent='Ключ сохранён. Поделитесь файлами с адресом сервисного аккаунта.';}catch(e){status.textContent=e.message;}};
 removeKey.onclick=async()=>{try{paint(await call('clearKey'));status.textContent='Ключ удалён.';}catch(e){status.textContent=e.message;}};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(state?.serviceEmail||'');status.textContent='Адрес скопирован.';}catch{status.textContent='Не удалось скопировать.';}};
 indexOn.onchange=async()=>{indexOn.disabled=true;try{paint(await call('setIndex',indexOn.checked));status.textContent=indexOn.checked?'Индексирую Google Документы в фоне — ход виден в уведомлениях.':'Индексация Google Документов выключена. Собранный индекс остаётся, пока вы его не сотрёте.';}catch(e){indexOn.checked=!indexOn.checked;status.textContent=e.message;}finally{indexOn.disabled=!state?.connected;}};
 wipeIndex.onclick=async()=>{
  const ask='Стереть индекс Google Документов? Векторы и фрагменты текста удалятся с этого компьютера, индексация выключится. Сами документы не трогаю.';
  if(!confirm(window.t?window.t(ask):ask))return;
  try{paint(await call('wipeIndex'));status.textContent='Индекс Google Документов стёрт.';}catch(e){status.textContent=e.message;}
 };
 save.onclick=async()=>{
  save.disabled=true;
  try{
   const result=await window.petya.saveSettings({googleDriveAuth:viaService.checked?'service':'account',googleDriveWrite:write.checked?'true':'false',googleDriveAccount:chosen});
   if(typeof displaySettings==='function')displaySettings(result);
   const st=await call('status');paint(st);
   const a=st.accounts.find(x=>x.key===st.chosen);
   status.textContent=st.mode==='account'&&st.write&&a&&!a.write?'Сохранено. Нажмите «Разрешить создание документов», чтобы Google выдал это разрешение.':'Настройки Google Диска сохранены.';
  }catch(e){status.textContent=e.message;}finally{save.disabled=false;}
 };
 document.addEventListener('petya-settings-displayed',refresh);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='google-drive')refresh();});
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
