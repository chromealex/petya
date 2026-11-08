// «Мониторинг» settings: the sources (Prometheus, Alertmanager, Grafana: address + optional token kept as a
// secret), Petya's own uptime checks (GET/HEAD only), service name aliases, the background notifications switch
// (off by default) and wiping the local history. Also gives the state-change notifications in the notification
// center their «Что с серверами» action and restores them after a window reload.
(()=>{
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const call=(method,...args)=>window.petya.feature('monitoring',method,...args);
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const input=(name,{type='text',placeholder=''}={})=>{const i=el('input');if(name)i.name=name;i.type=type;i.placeholder=placeholder;i.autocomplete='off';i.spellcheck=false;return i;};
 const card=el('article','card');card.dataset.extension='monitoring';card.dataset.manualSave='true';
 card.append(el('h2',null,'Мониторинг'),el('p',null,'Откуда брать состояние серверов: Prometheus (сервисы и метрики), Alertmanager (алерты и тишина), Grafana (алерты, только чтение) и свои проверки доступности. Всё читается с этого компьютера; история проверок хранится здесь же 30 дней.'));
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');

 // --- Sources ---
 const sources=[['Prometheus','monitoringPrometheusUrl','monitoringPrometheusToken','https://prometheus.example.com','Токен необязателен: Bearer-токен или «логин:пароль» для Prometheus за прокси.'],
  ['Alertmanager','monitoringAlertmanagerUrl','monitoringAlertmanagerToken','https://alertmanager.example.com','Алерты и заглушки. Тишина создаётся только после вашего подтверждения в карточке.'],
  ['Grafana','monitoringGrafanaUrl','monitoringGrafanaToken','https://grafana.example.com','Сервисный аккаунт с ролью Viewer: Administration → Service accounts → Add token.']];
 const fields={};
 for(const [name,urlKey,tokenKey,placeholder,hint] of sources){
  const box=el('fieldset','monitor-source');box.append(el('legend',null,name));
  const url=input(urlKey,{placeholder}),token=input(tokenKey,{type:'password',placeholder:'Токен (необязательно)'});
  const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
  const state=el('small','small monitor-source-state');
  box.append(field('Адрес',url),field('Токен',token,hint),clearLabel,state);
  fields[name]={url,token,clear,urlKey,tokenKey,state};
  card.append(box);
 }
 const save=el('button','primary','Сохранить источники');save.type='button';
 card.append(save);

 // --- Uptime checks ---
 card.append(el('h3',null,'Проверки доступности'),el('p','small','Петя сам делает GET (или HEAD) на эти адреса по расписанию: код ответа, время, срок сертификата и, если задано, слово в ответе. Ничего не отправляет. Адреса можно найти в коде: «найди адреса серверов в проекте».'));
 const list=el('ul','monitor-checks');list.style.cssText='list-style:none;padding:0;margin:0 0 8px;display:flex;flex-direction:column;gap:6px';
 card.append(list);
 const form=el('div','monitor-check-form');form.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 10px';
 const cUrl=input('',{placeholder:'https://api.example.com/health'}),cName=input('',{placeholder:'Название (необязательно)'}),cService=input('',{placeholder:'Сервис, например api'});
 const cExpect=input('',{placeholder:'200-399'}),cKeyword=input('',{placeholder:'Слово в ответе (необязательно)'}),cInterval=input('',{type:'number',placeholder:'5'});cInterval.min='1';cInterval.max='60';
 const cMethod=el('select');for(const m of ['GET','HEAD']){const o=el('option',null,m);o.value=m;cMethod.append(o);}
 form.append(field('Адрес',cUrl),field('Название',cName),field('Сервис',cService,'Это имя увидят карточка и «Логи сервера».'),field('Метод',cMethod),field('Ожидаемый код',cExpect),field('Слово в ответе',cKeyword),field('Интервал, мин',cInterval));
 const add=el('button',null,'Добавить проверку');add.type='button';
 card.append(form,add);

 // --- Background, aliases, wipe ---
 card.append(el('h3',null,'Уведомления'));
 const watchLabel=el('label');watchLabel.style.cssText='display:flex;gap:8px;align-items:center';
 const watch=el('input');watch.type='checkbox';watch.name='monitoringWatch';
 watchLabel.append(watch,el('span',null,'Сообщать, когда сервис падает и когда поднимается'));
 const poll=input('monitoringPollMin',{type:'number',placeholder:'2'});poll.min='1';poll.max='30';
 card.append(watchLabel,el('p','small','Выключено по умолчанию. Одно уведомление на смену состояния; если сервис «мигает», Петя скажет об этом один раз и подождёт, пока всё устоится.'),field('Опрашивать источники раз в, мин',poll));
 const aliases=el('textarea');aliases.name='monitoringAliases';aliases.rows=3;aliases.placeholder='api-prod = api\npayments-svc = payments';aliases.spellcheck=false;
 card.append(field('Псевдонимы сервисов',aliases,'Одно имя для сервиса во всех источниках: метки job, app, service и т. п. сводятся к нему.'));
 const saveMore=el('button',null,'Сохранить');saveMore.type='button';
 const wipe=el('button',null,'Очистить историю проверок и алертов');wipe.type='button';
 const row=el('div','kit-actions');row.append(saveMore,wipe);card.append(row,status);
 const formRoot=document.getElementById('settings-form');formRoot.insertBefore(card,formRoot.querySelector(':scope > button'));

 async function persist(data,done){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);status.textContent=done;}
  catch(e){status.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 function drawChecks(checks){
  list.replaceChildren();
  if(!checks.length){list.append(el('li','small','Проверок пока нет.'));return;}
  for(const c of checks){
   const li=el('li');li.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   const name=el('span',null,c.name);name.setAttribute('data-no-i18n','');name.style.fontWeight='600';
   const url=el('code',null,c.method+' '+c.url);url.setAttribute('data-no-i18n','');url.style.cssText='font-size:12px;overflow-wrap:anywhere';
   const meta=el('small','small',c.service+' · раз в '+c.intervalMin+' мин');meta.setAttribute('data-no-i18n','');
   const result=el('small','small');
   const test=el('button',null,'Проверить');test.type='button';
   test.onclick=async()=>{test.disabled=true;try{const r=await call('testCheck',c.id);result.textContent=r?(r.ok?'OK · '+r.status+' · '+r.ms+' мс'+(r.tlsDays!=null?' · TLS '+r.tlsDays+' дн.':''):(r.error||'не отвечает')):'';}catch(e){result.textContent=e.message;}finally{test.disabled=false;}};
   const del=window.deleteButton?window.deleteButton('Удалить проверку',async()=>{try{await call('removeCheck',c.id);await refresh();}catch(e){status.textContent=e.message;}}):null;
   li.append(name,url,meta,test,result);if(del)li.append(del);
   list.append(li);
  }
 }
 async function refresh(){
  try{
   const st=await call('status');
   watch.checked=st.watch;
   for(const x of st.sources){const f=fields[x.name];if(f)f.state.textContent=x.ready?'Подключено.':x.connected?'Подключено, но расширение не добавлено.':'Не подключено.';}
   for(const f of Object.values(fields)){const key=f.tokenKey.replace('monitoring','').replace('Token','').toLowerCase();f.token.placeholder=st.hasToken?.[key]?'Токен сохранён — оставьте пустым':'Токен (необязательно)';}
   drawChecks(st.checks);
  }catch(e){status.textContent=e.message;}
 }
 save.onclick=async()=>{
  save.disabled=true;
  try{
   const data={};for(const f of Object.values(fields)){data[f.urlKey]=f.url.value;if(f.token.value)data[f.tokenKey]=f.token.value;data['clear_'+f.tokenKey]=f.clear.checked;}
   await persist(data,'Источники сохранены.');
   for(const f of Object.values(fields)){f.token.value='';f.clear.checked=false;}
   await refresh();
  }catch{/* shown in status */}finally{save.disabled=false;}
 };
 add.onclick=async()=>{
  add.disabled=true;
  try{await call('saveCheck',{url:cUrl.value,name:cName.value,service:cService.value,method:cMethod.value,expect:cExpect.value||undefined,keyword:cKeyword.value,intervalMin:cInterval.value||5});
   for(const i of [cUrl,cName,cService,cExpect,cKeyword,cInterval])i.value='';status.textContent='Проверка добавлена.';await refresh();}
  catch(e){status.textContent=e.message;}finally{add.disabled=false;}
 };
 watch.onchange=async()=>{try{await persist({monitoringWatch:String(watch.checked)},watch.checked?'Буду сообщать о падениях и восстановлении.':'Уведомления мониторинга выключены.');}catch{watch.checked=!watch.checked;}};
 saveMore.onclick=async()=>{try{await persist({monitoringPollMin:poll.value||'2',monitoringAliases:aliases.value},'Сохранено.');}catch{/* shown */}};
 wipe.onclick=async()=>{if(!confirm(window.t?window.t('Удалить историю проверок, алертов и уведомлений мониторинга? Проверки и источники останутся.'):'Удалить историю проверок, алертов и уведомлений мониторинга? Проверки и источники останутся.'))return;try{await call('wipe');status.textContent='История очищена.';}catch(e){status.textContent=e.message;}};
 document.addEventListener('petya-settings-displayed',()=>{for(const f of Object.values(fields))f.token.value='';});
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='monitoring')refresh();});
 window.petyaEvents?.onWindowShown?.(refresh);refresh();

 // Notification center: state changes with «Что с серверами».
 const put=detail=>document.dispatchEvent(new CustomEvent('petya-ui-notification',{detail}));
 function notice(item){
  if(!item||!String(item.id||'').startsWith('monitoring:')||item.id==='monitoring:discover')return;
  const {service,...rest}=item;
  put({...rest,actions:[['Что с сервисом',async()=>{
   if(typeof view==='function')view('home');
   document.querySelector('.notification-center')?.setAttribute('hidden','');
   await (window.resultKit?.ask||(()=>{}))(service?'Почему лежит '+service:'Что с серверами',{send:true});
  }]]});
 }
 window.petyaEvents?.onExtensionInstall?.(notice);
 call('notices').then(list=>list.forEach(notice)).catch(()=>{});
})();
