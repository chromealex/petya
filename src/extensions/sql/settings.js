// «SQL по словам», settings: database connections (ClickHouse over HTTP, PostgreSQL, BigQuery), the BigQuery service-
// account key, and auto-run of cheap queries. Passwords and the key stay in the main process (feature secrets): an
// empty password field keeps the stored one. «Проверить» reads the schema and says how many tables it found.
(()=>{
 if(document.querySelector('#settings-form [data-extension="sql"]'))return;
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label);l.append(input);if(hint)l.append(el('small',{className:'small',textContent:hint}));return l;};
 const input=(value,placeholder,cls,type='text')=>{const i=el('input',{type,value:value??'',placeholder,className:cls,autocomplete:'off',spellcheck:false});return i;};
 const call=(method,...args)=>window.petya.feature('sqlWords',method,...args);
 const card=el('article',{className:'card'});card.dataset.extension='sql';card.dataset.manualSave='true';
 const status=el('p',{className:'connection-status'});status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 const list=el('div',{className:'sql-connections'});
 const add=el('button',{type:'button',className:'quiet',textContent:'Добавить подключение'});
 const save=el('button',{type:'button',className:'primary',textContent:'Сохранить'});
 // BigQuery key.
 const file=el('input',{type:'file',accept:'application/json,.json',hidden:true});
 const pick=el('button',{type:'button',textContent:'Выбрать JSON-ключ…'});pick.onclick=()=>file.click();
 const keyState=el('span',{className:'small'});keyState.setAttribute('data-no-i18n','');
 const removeKey=window.deleteButton?window.deleteButton('Удалить сохранённый ключ'):el('button',{type:'button',textContent:'Удалить сохранённый ключ'});
 const keyRow=el('div',{});keyRow.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 12px';keyRow.append(pick,keyState,removeKey,file);
 // Auto-run.
 const auto=el('input',{type:'checkbox'});const autoLabel=el('label',{className:'check'},auto,'Сразу выполнять дешёвые запросы, не дожидаясь «Выполнить»');
 const autoGb=input('1','1','',  'number');autoGb.min='0.001';autoGb.step='0.1';
 const autoRows=input('1000000','1000000','','number');autoRows.min='1';
 const maxRows=input('500','500','','number');maxRows.min='10';maxRows.max='5000';
 const saveOptions=el('button',{type:'button',textContent:'Сохранить правила'});
 card.append(el('h2',{},'SQL по словам'),
  el('p',{},'Вопрос словами — запрос SQL по схеме вашей базы. Петя выполняет только чтение (один SELECT с LIMIT) и показывает стоимость до запуска. Подключайтесь пользователем, у которого есть права только на чтение.'),
  el('h3',{},'Подключения'),list,add,document.createTextNode(' '),save,
  el('h3',{},'Ключ BigQuery'),el('p',{className:'small',textContent:'Сервисный аккаунт Google Cloud с ролями BigQuery Job User на проект и BigQuery Data Viewer на набор данных. Если ключ уже загружен в «Firebase Crashlytics», можно не загружать его ещё раз.'}),keyRow,
  el('h3',{},'Запуск'),autoLabel,field('Порог для BigQuery, ГБ',autoGb,'Запрос, который прочитает не больше, выполнится сразу.'),field('Порог для ClickHouse и PostgreSQL, строк',autoRows,'По оценке EXPLAIN.'),field('Строк в ответе (LIMIT)',maxRows),saveOptions,status);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));

 const KINDS=[['clickhouse','ClickHouse'],['postgres','PostgreSQL'],['bigquery','BigQuery']];
 function box(c={kind:'clickhouse'}){
  const fs=el('fieldset',{className:'sql-conn'});fs.style.cssText='border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 12px';fs.dataset.id=c.id||'';
  const kind=el('select',{className:'c-kind'});for(const [v,l] of KINDS)kind.append(el('option',{value:v,textContent:l,selected:c.kind===v}));
  const name=input(c.name,'Аналитика','c-name');
  const url=input(c.url,'https://host:8443 или http://localhost:8123','c-url','url');
  const host=input(c.host,'db.example.com','c-host'),port=input(c.port||5432,'5432','c-port','number');
  const database=input(c.database,c.kind==='postgres'?'analytics':'default','c-database'),user=input(c.user,'readonly','c-user');
  const password=input('',c.hasPassword?'сохранён — оставьте пустым':'Пароль','c-password','password');
  const ssl=el('select',{className:'c-ssl'});for(const [v,l] of [['verify','TLS с проверкой сертификата'],['require','TLS без проверки сертификата'],['disable','Без шифрования (только localhost)']])ssl.append(el('option',{value:v,textContent:l,selected:(c.ssl||'verify')===v}));
  const project=input(c.project,'my-game-12345','c-project'),dataset=input(c.dataset,'analytics_123456','c-dataset'),location=input(c.location,'US, EU или europe-west1','c-location'),limit=input(c.limitGb||5,'5','c-limit','number');
  const head=el('div',{});head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px';
  const title=el('strong',{textContent:c.name||'Новое подключение'});title.setAttribute('data-no-i18n','');
  const test=el('button',{type:'button',className:'quiet',textContent:'Проверить'});test.hidden=!c.id;
  test.onclick=async()=>{test.disabled=true;say('Читаю схему «'+(c.name||'')+'»…');try{const r=await call('test',c.id);say('Подключено: '+(r.database?r.database+', ':'')+'таблиц: '+r.tables+', столбцов: '+r.columns+'.','connected');}catch(e){say(e.message,'error');}finally{test.disabled=false;}};
  const tools=el('span',{});tools.style.cssText='display:flex;gap:6px;align-items:center';
  tools.append(test,window.deleteButton('Удалить подключение',()=>{fs.remove();say('Подключение убрано из списка. Нажмите «Сохранить».');}));
  head.append(title,tools);
  const groups={clickhouse:[field('Адрес HTTP-интерфейса',url),field('База',database),field('Пользователь',user),field('Пароль',password)],
   postgres:[field('Хост',host),field('Порт',port),field('База',database),field('Пользователь',user),field('Пароль',password),field('Шифрование',ssl)],
   bigquery:[field('Проект Google Cloud (ID)',project),field('Набор данных',dataset),field('Регион',location,'Пусто — определит BigQuery.'),field('Лимит чтения за запрос, ГБ',limit,'BigQuery откажется выполнять запрос, который прочитал бы больше.')]};
  const fields=el('div',{});
  const paint=()=>{fields.replaceChildren(...groups[kind.value]);};
  kind.onchange=paint;paint();
  fs.append(head,field('Вид базы',kind),field('Название',name),fields);
  fs.read=()=>({id:c.id||undefined,kind:kind.value,name:name.value,url:url.value,host:host.value,port:port.value,database:database.value,user:user.value,password:password.value,ssl:ssl.value,project:project.value,dataset:dataset.value,location:location.value,limitGb:limit.value});
  return fs;
 }
 function show(state){
  list.replaceChildren(...state.connections.map(box));
  if(!state.connections.length)list.append(el('p',{className:'small',textContent:'Подключений пока нет.'}));
  keyState.textContent=state.hasKey?(state.account||'Ключ сохранён'):state.sharedKey?'Используется ключ «Firebase Crashlytics»'+(state.account?': '+state.account:''):'Ключ не загружен';
  removeKey.hidden=!state.hasKey;
  auto.checked=!!state.autoRun;autoGb.value=String(state.autoRunGb);autoRows.value=String(state.autoRunRows);maxRows.value=String(state.maxRows);
 }
 add.onclick=()=>{list.querySelector(':scope>p')?.remove();const b=box();list.append(b);b.querySelector('.c-name').focus();};
 save.onclick=async()=>{save.disabled=true;try{show(await call('saveConnections',[...list.querySelectorAll('.sql-conn')].map(b=>b.read())));say('Сохранено. Нажмите «Проверить», чтобы прочитать схему.','connected');}catch(e){say(e.message,'error');}finally{save.disabled=false;}};
 saveOptions.onclick=async()=>{saveOptions.disabled=true;try{show(await call('saveOptions',{autoRun:auto.checked,autoRunGb:autoGb.value,autoRunRows:autoRows.value,maxRows:Number(maxRows.value)}));say('Правила запуска сохранены.','connected');}catch(e){say(e.message,'error');}finally{saveOptions.disabled=false;}};
 file.onchange=async()=>{const f=file.files?.[0];file.value='';if(!f)return;try{show(await call('saveKey',await f.text()));say('Ключ сохранён.','connected');}catch(e){say(e.message,'error');}};
 removeKey.onclick=async()=>{try{show(await call('clearKey'));say('Ключ удалён.');}catch(e){say(e.message,'error');}};
 const load=()=>call('status').then(show).catch(e=>say(e.message,'error'));
 document.addEventListener('petya-settings-displayed',load);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='sql')load();});
 load();
})();
