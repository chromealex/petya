// «Firebase Crashlytics», settings: the service-account key (kept as a secret in the main process), the Google Cloud
// project and BigQuery dataset of the Crashlytics export, which apps to read, realtime tables and the read limit.
// «Проверить» lists the export tables and dry-runs a week's query to show how much it would read (nothing is billed).
// Changes are saved by the card's own button, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const input=(name,{type='text',placeholder=''}={})=>{const i=el('input');i.name=name;i.type=type;i.placeholder=placeholder;i.autocomplete='off';i.spellcheck=false;return i;};
 const call=(method,...args)=>window.petya.feature('crashlytics',method,...args);
 const card=el('article','card');card.dataset.extension='crashlytics';card.dataset.manualSave='true';
 const intro=el('p',null,'Источник крэшей для приложения «Крэши». У Crashlytics нет API для списка крэшей, поэтому Петя читает выгрузку Crashlytics в BigQuery.');
 const setup=el('p','small','Сначала включите выгрузку: консоль Firebase → Настройки проекта → Интеграции → BigQuery → Crashlytics (можно и потоковую выгрузку). Затем создайте в Google Cloud сервисный аккаунт с ролями BigQuery Job User на проект и BigQuery Data Viewer на набор данных firebase_crashlytics и скачайте его JSON-ключ.');
 const file=el('input');file.type='file';file.accept='application/json,.json';file.hidden=true;
 const pick=el('button',null,'Выбрать JSON-ключ…');pick.type='button';pick.onclick=()=>file.click();
 const keyState=el('span','small');keyState.setAttribute('data-no-i18n','');
 const removeKey=window.deleteButton?window.deleteButton('Удалить сохранённый ключ'):el('button',null,'Удалить сохранённый ключ');
 const keyRow=el('div','crashlytics-key');keyRow.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 12px';keyRow.append(pick,keyState,removeKey,file);
 const project=input('crashlyticsProject',{placeholder:'my-game-12345'}),dataset=input('crashlyticsDataset',{placeholder:'firebase_crashlytics'});
 const tables=input('crashlyticsTables',{type:'hidden'}),list=el('div','crashlytics-tables');list.style.cssText='max-height:200px;overflow-y:auto;margin:6px 0 12px';
 const realtime=el('input');realtime.type='checkbox';const realtimeLabel=el('label','check');realtimeLabel.append(realtime,document.createTextNode('Читать и потоковые таблицы (_REALTIME) — свежие крэши за последние часы'));
 const limit=input('crashlyticsLimitGb',{type:'number',placeholder:'5'});limit.min='0.1';limit.step='0.1';
 const location=input('crashlyticsLocation',{placeholder:'US, EU или europe-west1 (необязательно)'});
 const save=el('button','primary','Сохранить и проверить');save.type='button';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',null,'Firebase Crashlytics'),intro,setup,el('h3',null,'Ключ сервисного аккаунта'),keyRow,
  field('Проект Google Cloud (ID)',project),field('Набор данных BigQuery',dataset,'По умолчанию firebase_crashlytics.'),el('h3',null,'Приложения'),tables,list,realtimeLabel,
  field('Лимит чтения за один запрос, ГБ',limit,'BigQuery откажется выполнять запрос, который прочитал бы больше, — так ничего лишнего не спишется.'),field('Регион набора данных',location,'Пусто — определит BigQuery.'),save,status);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const chosen=()=>tables.value.split(',').map(t=>t.trim()).filter(Boolean);
 const gb=bytes=>(bytes/1024**3).toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:bytes<1024**3?3:1})+' ГБ';
 let available=[],busy=false;
 function renderTables(){
  list.replaceChildren();
  const rows=[...new Set([...available,...chosen()])];
  if(!rows.length){list.append(el('p','small','Таблицы появятся после проверки. Если ничего не отметить, Петя читает все приложения набора данных.'));return;}
  for(const name of rows){
   const label=el('label','check'),box=el('input');box.type='checkbox';box.checked=chosen().includes(name);
   box.onchange=()=>{const next=new Set(chosen());box.checked?next.add(name):next.delete(name);tables.value=[...next].join(',');};
   const text=el('span',null,name+(available.includes(name)?'':' · нет в наборе данных'));text.setAttribute('data-no-i18n','');label.append(box,text);list.append(label);
  }
 }
 function show(state){
  keyState.textContent=state.hasKey?(state.account||'Ключ сохранён'):'Ключ не загружен';removeKey.hidden=!state.hasKey;
  project.value=state.project||'';dataset.value=state.dataset||'firebase_crashlytics';tables.value=(state.tables||[]).join(',');realtime.checked=!!state.realtime;limit.value=String(state.limitGb||5);location.value=state.location||'';
  renderTables();
 }
 async function check(){
  status.textContent='Проверяю BigQuery…';
  const found=await call('tables');available=found.batch;renderTables();
  if(!found.batch.length){status.textContent='В наборе данных нет таблиц Crashlytics. Включите выгрузку в BigQuery в консоли Firebase и подождите первые данные (до суток).';return;}
  const r=await call('check');
  status.textContent='Подключено. Приложений: '+found.batch.length+(found.realtime.length?', потоковых таблиц: '+found.realtime.length:'')+'. Запрос за неделю прочитает ≈ '+gb(r.bytes)+' (лимит '+gb(r.limit)+').'+(r.bytes>r.limit?' Это больше лимита — увеличьте его или выберите меньше приложений.':'');
 }
 file.onchange=async()=>{
  const f=file.files?.[0];file.value='';if(!f)return;
  try{show(await call('saveKey',await f.text()));status.textContent='Ключ сохранён.';if(project.value)await check();}
  catch(e){status.textContent=e.message;}
 };
 removeKey.onclick=async()=>{try{show(await call('clearKey'));status.textContent='Ключ удалён.';}catch(e){status.textContent=e.message;}};
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{
   const result=await window.petya.saveSettings({crashlyticsProject:project.value,crashlyticsDataset:dataset.value,crashlyticsTables:tables.value,crashlyticsRealtime:realtime.checked?'true':'false',crashlyticsLimitGb:limit.value,crashlyticsLocation:location.value});
   if(typeof displaySettings==='function')displaySettings(result);
   const state=await call('status');show(state);
   if(state.hasKey&&state.project)await check();else status.textContent='Сохранено. Загрузите ключ и укажите проект, чтобы проверить подключение.';
  }catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 const load=()=>call('status').then(show).catch(e=>{status.textContent=e.message;});
 document.addEventListener('petya-settings-displayed',load);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='crashlytics')load();});
 load();
})();
