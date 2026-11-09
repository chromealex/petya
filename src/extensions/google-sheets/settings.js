// «Google Таблицы» settings: how Petya signs in (a Google account from mail with incremental consent, or a service
// account key), whether writing is allowed (the read-write scope is asked only then), and the known spreadsheets
// that can be called by name in the chat.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('googleSheets',method,...args);
 const card=el('article','card');card.dataset.extension='google-sheets';card.dataset.manualSave='true';
 card.append(el('h2',null,'Google Таблицы'),el('p',null,'Таблицы Google в чате: листы, поиск, новая строка и выгрузка из других карточек. Петя сначала просит только чтение; запись — когда вы её включите, и каждый раз после подтверждения.'));
 const row=css=>{const d=el('div');d.style.cssText=css||'display:flex;gap:8px;flex-wrap:wrap;align-items:center';return d;};
 // How to sign in.
 const modes=row('display:flex;gap:16px;flex-wrap:wrap');
 const radio=(value,label)=>{const l=el('label','check'),r=el('input');r.type='radio';r.name='googleSheetsAuthChoice';r.value=value;l.append(r,document.createTextNode(label));modes.append(l);return r;};
 const viaAccount=radio('account','Аккаунт Google (как почта)'),viaService=radio('service','Сервисный аккаунт');
 // Account path.
 const accountBox=el('div');accountBox.style.cssText='display:flex;flex-direction:column;gap:6px';
 const list=el('div');list.style.cssText='display:flex;flex-direction:column;gap:6px';
 const another=el('button',null,'Подключить аккаунт Google с таблицами');another.type='button';
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
 serviceBox.append(keyRow,el('small','small','Поделитесь таблицей с адресом сервисного аккаунта: «Читатель» — чтобы смотреть, «Редактор» — чтобы записывать. Новые таблицы сервисный аккаунт создаёт в своём Диске, поэтому выгрузка идёт в ваши таблицы.'));
 // Writing.
 const writeLabel=el('label','check'),write=el('input');write.type='checkbox';
 writeLabel.append(write,document.createTextNode('Разрешить запись: новая строка, выгрузка и правка ячеек — только после подтверждения в карточке'));
 const save=el('button','primary','Сохранить');save.type='button';
 // Known spreadsheets.
 const knownBox=el('details');knownBox.append(el('summary',null,'Известные таблицы'));
 const knownList=el('div');knownList.style.cssText='display:flex;flex-direction:column;gap:6px;margin:6px 0';
 const addLink=el('input');addLink.type='url';addLink.placeholder='https://docs.google.com/spreadsheets/d/…';addLink.style.minWidth='280px';addLink.setAttribute('aria-label','Ссылка на таблицу');
 const add=el('button',null,'Добавить');add.type='button';
 const addRow=row();addRow.append(addLink,add);
 knownBox.append(el('p','small','Таблицы, которые можно звать по названию: «что в таблице баланса», «покажи лист Юниты». Петя запоминает таблицу, когда вы присылаете на неё ссылку.'),knownList,addRow);
 const help=el('details');help.append(el('summary',null,'Что включить в Google Cloud'));
 for(const line of [
  'Аккаунт Google: в проекте Google Cloud, где создан OAuth-клиент Desktop app для Gmail, включите Google Sheets API (APIs & Services → Library).',
  'На экране согласия OAuth (Data access / Scopes) добавьте https://www.googleapis.com/auth/spreadsheets.readonly и, для записи, https://www.googleapis.com/auth/spreadsheets. Пока приложение в режиме Testing, добавьте свой адрес в Test users.',
  'Сервисный аккаунт: в его проекте включите Google Sheets API, создайте ключ JSON (IAM & Admin → Service accounts → Keys) и поделитесь нужными таблицами с адресом аккаунта.'
 ])help.append(el('p',null,line));
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h3',null,'Вход'),modes,accountBox,serviceBox,writeLabel,save,knownBox,help,status);
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
   if(a.read){const choice=el('input');choice.type='radio';choice.name='googleSheetsAccountChoice';choice.value=a.key;choice.checked=a.key===chosen;choice.setAttribute('aria-label','Использовать этот аккаунт');choice.onchange=()=>{chosen=a.key;};r.append(choice);}
   const name=el('span',null,a.email||a.label||a.key);name.setAttribute('data-no-i18n','');
   r.append(name,el('small',null,a.write?'чтение и запись':a.read?'только чтение':'нет доступа к таблицам'));
   if(!a.read){const b=el('button',null,'Разрешить чтение таблиц');b.type='button';b.onclick=()=>connect(a.key,false);r.append(b);}
   else if(st.write&&!a.write){const b=el('button',null,'Разрешить запись');b.type='button';b.onclick=()=>connect(a.key,true);r.append(b);}
   list.append(r);
  }
  another.disabled=!st.configured;another.title=st.configured?'':'Сначала импортируйте OAuth-клиент Google в настройках почты.';
  email.textContent=st.serviceEmail||'Ключ не загружен';copy.hidden=!st.serviceEmail;removeKey.hidden=!st.hasKey;
  knownList.replaceChildren();
  if(!st.known.length)knownList.append(el('p','muted','Пока нет.'));
  for(const x of st.known){
   const r=row();const a=el('a',null,x.title);a.href=x.url;a.target='_blank';a.rel='noopener';a.setAttribute('data-no-i18n','');
   const forget=el('button',null,'Забыть');forget.type='button';forget.onclick=async()=>{try{paint(await call('forget',x.id));status.textContent='Таблица забыта.';}catch(e){status.textContent=e.message;}};
   r.append(a,el('small',null,x.tabs+' '+(x.tabs===1?'лист':'листов')),forget);knownList.append(r);
  }
  const pending=!!st.operation?.busy;cancel.hidden=!pending;
  if(pending&&!timer)timer=setInterval(refresh,2000);
  if(!pending&&timer){clearInterval(timer);timer=null;}
  notify(st.operation);
 }
 async function refresh(){try{paint(await call('status'));}catch(e){status.textContent=e.message;}}
 async function connect(key,wantWrite){try{status.textContent='Откройте браузер и разрешите доступ к Google Таблицам.';paint(await call('connect',key,wantWrite));}catch(e){status.textContent=e.message;}}
 another.onclick=()=>connect('',!!state?.write);
 cancel.onclick=async()=>{try{paint(await call('cancel'));status.textContent='Вход отменён.';}catch(e){status.textContent=e.message;}};
 for(const r of [viaAccount,viaService])r.onchange=()=>{accountBox.hidden=viaService.checked;serviceBox.hidden=!viaService.checked;};
 file.onchange=async()=>{const f=file.files?.[0];file.value='';if(!f)return;try{paint(await call('saveKey',await f.text()));status.textContent='Ключ сохранён. Поделитесь таблицами с адресом сервисного аккаунта.';}catch(e){status.textContent=e.message;}};
 removeKey.onclick=async()=>{try{paint(await call('clearKey'));status.textContent='Ключ удалён.';}catch(e){status.textContent=e.message;}};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(state?.serviceEmail||'');status.textContent='Адрес скопирован.';}catch{status.textContent='Не удалось скопировать.';}};
 add.onclick=async()=>{add.disabled=true;try{paint(await call('remember',addLink.value.trim()));addLink.value='';status.textContent='Таблица добавлена.';}catch(e){status.textContent=e.message;}finally{add.disabled=false;}};
 save.onclick=async()=>{
  save.disabled=true;
  try{
   const result=await window.petya.saveSettings({googleSheetsAuth:viaService.checked?'service':'account',googleSheetsWrite:write.checked?'true':'false',googleSheetsAccount:chosen});
   if(typeof displaySettings==='function')displaySettings(result);
   const st=await call('status');paint(st);
   const a=st.accounts.find(x=>x.key===st.chosen);
   status.textContent=st.mode==='account'&&st.write&&a&&!a.write?'Сохранено. Нажмите «Разрешить запись», чтобы Google выдал доступ на запись.':'Настройки Google Таблиц сохранены.';
  }catch(e){status.textContent=e.message;}finally{save.disabled=false;}
 };
 document.addEventListener('petya-settings-displayed',refresh);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='google-sheets')refresh();});
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
