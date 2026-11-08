// «Календарь» settings: which mail account's calendar to use, calendar access per account (incremental consent
// through the same Google / Microsoft sign-in as mail), working hours and the default meeting length.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const card=el('article','card');card.dataset.extension='calendar';
 card.append(el('h2',null,'Календарь'),el('p',null,'Встречи, свободное время и общий слот с коллегами из Google Календаря или Outlook. Используются аккаунты почты; для календаря Петя попросит отдельное разрешение.'));
 const list=el('div','calendar-accounts');list.style.cssText='display:flex;flex-direction:column;gap:6px';
 const buttons=el('div');buttons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
 const google=el('button',null,'Подключить Google с календарём');google.type='button';
 const microsoft=el('button',null,'Подключить Microsoft с календарём');microsoft.type='button';
 const cancel=el('button',null,'Отменить вход');cancel.type='button';cancel.hidden=true;
 buttons.append(google,microsoft,cancel);
 const hoursRow=el('div');hoursRow.style.cssText='display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end';
 const field=(label,input)=>{const l=el('label',null,label);l.append(input);return l;};
 const start=el('input');start.type='time';start.name='calendarWorkStart';
 const end=el('input');end.type='time';end.name='calendarWorkEnd';
 const duration=el('select');duration.name='calendarDuration';for(const m of [15,30,45,60,90,120]){const o=el('option',null,m+' мин');o.value=String(m);duration.append(o);}
 const save=el('button',null,'Сохранить');save.type='button';
 hoursRow.append(field('Начало рабочего дня',start),field('Конец рабочего дня',end),field('Длительность встречи',duration),save);
 const help=el('details');help.append(el('summary',null,'Что включить в Google Cloud и Azure'));
 for(const line of [
  'Google: в проекте Google Cloud, где создан OAuth-клиент Desktop app для Gmail, включите Google Calendar API (APIs & Services → Library).',
  'Google: на экране согласия OAuth (Data access / Scopes) добавьте https://www.googleapis.com/auth/calendar.events и https://www.googleapis.com/auth/calendar.freebusy. Пока приложение в режиме Testing, добавьте свой адрес в Test users.',
  'Microsoft: в регистрации приложения Azure (Entra ID) → API permissions → Microsoft Graph → Delegated добавьте Calendars.ReadWrite. В организации может понадобиться согласие администратора.',
  'Занятость коллег Microsoft показывает только для рабочих и учебных аккаунтов; для личного аккаунта видна только ваша занятость.'
 ])help.append(el('p',null,line));
 const status=el('p');status.setAttribute('role','status');
 // Known rooms: links Petya learned from the calendar or that were typed for a meeting; rename or forget them.
 const roomsBox=el('details','calendar-rooms');roomsBox.append(el('summary',null,'Комнаты для звонков'));
 const roomsList=el('div');roomsList.style.cssText='display:flex;flex-direction:column;gap:6px;margin-top:6px';
 roomsBox.append(el('p','small','Ссылки на встречи, которые повторяются в вашем календаре в разные дни, и ссылки, вставленные при создании встречи. Хранятся только на этом компьютере.'),roomsList);
 card.append(list,buttons,hoursRow,roomsBox,help,status);
 document.getElementById('settings-form').append(card);
 const call=(method,...args)=>window.petya.feature('calendarApp',method,...args);
 let chosen='',timer=null;
 const notify=op=>{if(op)document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail:op}));};
 function paint(st){
  chosen=st.chosen||'';
  start.value=st.workStart;end.value=st.workEnd;duration.value=String(st.duration);
  list.replaceChildren();
  if(!st.accounts.length)list.append(el('p','muted','Аккаунтов пока нет. Подключите Google или Microsoft — с доступом к календарю.'));
  const ready=st.accounts.filter(a=>a.calendar);
  for(const a of st.accounts){
   const row=el('div');row.style.cssText='display:flex;gap:10px;align-items:center;flex-wrap:wrap';
   if(a.calendar){const r=el('input');r.type='radio';r.name='calendarAccountChoice';r.value=a.key;r.checked=a.key===chosen||ready.length===1&&!chosen;r.setAttribute('aria-label','Использовать этот календарь');r.onchange=()=>{chosen=a.key;};row.append(r);}
   const name=el('span',null,a.email||a.label||a.key);name.setAttribute('data-no-i18n','');
   row.append(name,el('small',null,a.provider==='microsoft'?'Outlook':'Google'),el('small',null,a.calendar?'есть доступ к календарю':'только почта'));
   if(!a.calendar){const b=el('button',null,'Разрешить доступ к календарю');b.type='button';b.onclick=()=>connect(a.provider,a.key);row.append(b);}
   list.append(row);
  }
  google.disabled=!st.configured.google;microsoft.disabled=!st.configured.microsoft;
  google.title=st.configured.google?'':'Сначала импортируйте OAuth-клиент Google в настройках почты.';
  microsoft.title=st.configured.microsoft?'':'Сначала укажите Application ID Microsoft в настройках почты.';
  const pending=!!st.operation?.busy;cancel.hidden=!pending;
  if(pending&&!timer)timer=setInterval(refresh,2000);
  if(!pending&&timer){clearInterval(timer);timer=null;}
  notify(st.operation);
 }
 function paintRooms(rooms){
  roomsList.replaceChildren();
  if(!rooms.length){roomsList.append(el('p','muted','Пока нет: Петя запомнит ссылку, которая встретится в календаре в разные дни.'));return;}
  for(const r of rooms){
   const row=el('div');row.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   const name=el('input');name.type='text';name.value=r.name;name.maxLength=80;name.setAttribute('aria-label','Название комнаты');name.style.minWidth='180px';
   const url=el('small',null,r.url);url.setAttribute('data-no-i18n','');url.style.cssText='color:var(--muted);overflow-wrap:anywhere';
   const rename=el('button',null,'Переименовать');rename.type='button';rename.onclick=async()=>{try{paintRooms(await call('renameRoom',r.key,name.value));status.textContent='Комната переименована.';}catch(e){status.textContent=e.message;}};
   const forget=el('button',null,'Забыть');forget.type='button';forget.onclick=async()=>{try{paintRooms(await call('forgetRoom',r.key));status.textContent='Комната забыта.';}catch(e){status.textContent=e.message;}};
   row.append(name,rename,forget,url);roomsList.append(row);
  }
 }
 async function refresh(){try{paint(await call('status'));paintRooms(await call('rooms'));}catch(e){status.textContent=e.message;}}
 async function connect(provider,key){
  try{status.textContent='Откройте браузер и разрешите доступ к календарю.';paint(await call('connect',provider,key));}
  catch(e){status.textContent=e.message;}
 }
 google.onclick=()=>connect('google');microsoft.onclick=()=>connect('microsoft');
 cancel.onclick=async()=>{try{paint(await call('cancel'));status.textContent='Вход отменён.';}catch(e){status.textContent=e.message;}};
 save.onclick=async()=>{
  save.disabled=true;
  try{await window.petya.saveSettings({calendarWorkStart:start.value,calendarWorkEnd:end.value,calendarDuration:duration.value,calendarAccount:chosen});status.textContent='Настройки календаря сохранены.';await refresh();}
  catch(e){status.textContent=e.message;}finally{save.disabled=false;}
 };
 window.petyaEvents?.onWindowShown?.(refresh);refresh();
})();
