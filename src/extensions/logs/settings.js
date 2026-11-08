// «Логи сервера», settings: where the logs are — Loki (URL, basic or bearer auth, tenant, default selector, the
// service label, Grafana for «Открыть в Grafana») and Elasticsearch/OpenSearch (URL, index pattern, API key or
// user + password, Kibana). Keys are stored as secrets and never shown again; «Проверить» reads 15 minutes.
(()=>{
 if(document.querySelector('#settings-form [data-extension="logs"]'))return;
 const card=document.createElement('article');card.className='card';card.dataset.extension='logs';card.dataset.manualSave='true';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'small'},hint));return l;};
 const input=(placeholder,type='text')=>el('input',{type,autocomplete:'off',spellcheck:false,placeholder});
 const f={
  lokiUrl:input('https://loki.example.com'),lokiUser:input('необязательно'),lokiToken:input('пароль или токен','password'),lokiTenant:input('необязательно'),
  lokiSelector:input('{service_name=~".+"}'),lokiLabel:input('service_name'),grafanaUrl:input('https://grafana.example.com'),grafanaDs:input('uid источника Loki'),
  esUrl:input('https://es.example.com:9200'),esIndex:input('logs-*'),esUser:input('для OpenSearch или basic'),esKey:input('API key или пароль','password'),kibanaUrl:input('https://kibana.example.com')
 };
 const clearLoki=el('input',{type:'checkbox'}),clearEs=el('input',{type:'checkbox'});
 const source=el('select',{});
 const save=el('button',{type:'button',className:'primary'},'Сохранить');
 const check=el('button',{type:'button'},'Проверить подключение');
 const status=el('p',{className:'small'});status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',{},'Логи сервера'),
  el('p',{},'Логи серверов в чате: «логи сервера за последний час», «ошибки оплаты в логах», «логи сервиса payments за 15 минут». Петя только читает: запросы проверяются и ограничиваются по времени и числу строк.'),
  el('h3',{},'Loki'),
  field('Адрес Loki',f.lokiUrl,'Grafana Cloud: адрес вида https://logs-prod-….grafana.net.'),
  el('div',{className:'row'},el('div',{className:'grow'},field('Пользователь',f.lokiUser,'Для basic-входа (в Grafana Cloud — ID инстанса). Пусто — токен уходит как Bearer.')),el('div',{className:'grow'},field('Пароль или токен',f.lokiToken))),
  el('div',{className:'row'},el('div',{className:'grow'},field('Tenant (X-Scope-OrgID)',f.lokiTenant)),el('div',{className:'grow'},field('Метка сервиса',f.lokiLabel,'По умолчанию service_name.'))),
  field('Селектор по умолчанию',f.lokiSelector,'Когда сервис не назван. Например {env="prod"}.'),
  el('div',{className:'row'},el('div',{className:'grow'},field('Grafana',f.grafanaUrl,'Для кнопки «Открыть в Grafana».')),el('div',{className:'grow'},field('UID источника в Grafana',f.grafanaDs))),
  el('label',{className:'check'},clearLoki,'Удалить сохранённый пароль Loki'),
  el('h3',{},'Elasticsearch / OpenSearch'),
  field('Адрес',f.esUrl),
  el('div',{className:'row'},el('div',{className:'grow'},field('Индексы',f.esIndex,'По умолчанию logs-*.')),el('div',{className:'grow'},field('Пользователь',f.esUser,'Пусто — ключ уходит как ApiKey.'))),
  field('API key или пароль',f.esKey,'Создайте ключ только с правом read на индексы логов.'),
  field('Kibana',f.kibanaUrl,'Для кнопки «Открыть в Kibana».'),
  el('label',{className:'check'},clearEs,'Удалить сохранённый ключ Elasticsearch'),
  field('Источник по умолчанию',source,'Если подключено несколько и в вопросе источник не назван.'),
  el('p',{className:'small'},'Логи подов Kubernetes появятся здесь сами, когда добавлено приложение «Kubernetes».'),
  el('div',{className:'row'},save,check),status);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('logsApp',method,...args);
 async function describe(){
  try{
   const st=await call('status');
   const keep=source.value;
   source.replaceChildren(el('option',{value:''},'Спрашивать'),...st.sources.filter(x=>x.added).map(x=>el('option',{value:x.id},x.name)));
   if(keep)source.value=keep;
   const ready=st.sources.filter(x=>x.ready).map(x=>x.name);
   status.textContent=ready.length?'Подключено: '+ready.join(', ')+'.':'Не подключено: укажите адрес Loki или Elasticsearch.';
  }catch{status.textContent='';}
 }
 async function load(){
  try{
   const s=await window.petya.settings();
   f.lokiUrl.value=s.logsLokiUrl||'';f.lokiUser.value=s.logsLokiUser||'';f.lokiTenant.value=s.logsLokiTenant||'';f.lokiSelector.value=s.logsLokiSelector||'';f.lokiLabel.value=s.logsLokiServiceLabel||'';
   f.grafanaUrl.value=s.logsGrafanaUrl||'';f.grafanaDs.value=s.logsGrafanaDatasource||'';f.esUrl.value=s.logsElasticUrl||'';f.esIndex.value=s.logsElasticIndex||'';f.esUser.value=s.logsElasticUser||'';f.kibanaUrl.value=s.logsKibanaUrl||'';
   await describe();source.value=s.logsDefaultSource||'';
  }catch{describe();}
 }
 save.onclick=async()=>{
  save.disabled=true;
  try{
   await window.petya.saveSettings({logsLokiUrl:f.lokiUrl.value.trim(),logsLokiUser:f.lokiUser.value.trim(),logsLokiToken:f.lokiToken.value.trim(),clear_logsLokiToken:clearLoki.checked,
    logsLokiTenant:f.lokiTenant.value.trim(),logsLokiSelector:f.lokiSelector.value.trim(),logsLokiServiceLabel:f.lokiLabel.value.trim(),logsGrafanaUrl:f.grafanaUrl.value.trim(),logsGrafanaDatasource:f.grafanaDs.value.trim(),
    logsElasticUrl:f.esUrl.value.trim(),logsElasticIndex:f.esIndex.value.trim(),logsElasticUser:f.esUser.value.trim(),logsElasticKey:f.esKey.value.trim(),clear_logsElasticKey:clearEs.checked,logsKibanaUrl:f.kibanaUrl.value.trim(),
    logsDefaultSource:source.value});
   f.lokiToken.value=f.esKey.value='';clearLoki.checked=clearEs.checked=false;
   await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 check.onclick=async()=>{
  check.disabled=true;status.textContent='Читаю логи за 15 минут…';
  try{const rows=await call('check');status.textContent=rows.map(r=>r.name+': '+(r.ok?'работает, строк: '+r.total:r.error)).join(' · ');}
  catch(e){status.textContent=e.message;}
  finally{check.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='logs')load();});
 window.petyaEvents?.onWindowShown?.(describe);
 load();
})();
