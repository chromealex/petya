// «Grafana», settings: the Grafana address (with its path prefix, if any), a service account token (a secret), the
// default folder, the optional panel pictures (Image Renderer plugin), «Проверить подключение», and «Сопоставить
// панели с метриками» for «Метрики игры»: Petya proposes a panel per metric, the user checks the choice and saves it.
// Changes here are saved by the card's own buttons, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const input=(name,{type='text',placeholder=''}={})=>{const i=el('input');i.name=name;i.type=type;i.placeholder=placeholder;i.autocomplete='off';i.spellcheck=false;return i;};
 const card=el('article','card');card.dataset.extension='grafana';card.dataset.manualSave='true';
 const url=input('grafanaUrl',{placeholder:'https://grafana.example.com'}),token=input('grafanaToken',{type:'password',placeholder:'Вставьте токен сервисного аккаунта (glsa_…)'});
 const folder=input('grafanaFolder',{placeholder:'Название папки (необязательно)'});const folders=el('datalist');folders.id='grafana-folders';folder.setAttribute('list',folders.id);
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const render=el('input');render.type='checkbox';const renderLabel=el('label','check');renderLabel.append(render,document.createTextNode('Картинки панелей, которые Петя не рисует сам (нужен плагин Grafana Image Renderer)'));
 const save=el('button','primary','Сохранить и проверить');save.type='button';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 // Where the token comes from: a link to this Grafana's service accounts page, in the organization of the pasted link
 // (a token belongs to one organization, so ?orgId= from a dashboard link matters).
 const tokenHelp=el('p','small grafana-token-help');const tokenLink=el('a',null,'Открыть сервисные аккаунты');tokenLink.target='_blank';tokenLink.rel='noopener';
 tokenHelp.append(document.createTextNode('Токен создаёт администратор организации в Grafana: «Add service account» с ролью Viewer, затем «Add service account token» — получится строка glsa_…. Если у вас нет прав администратора, попросите того, кто ведёт Grafana. '),tokenLink);
 const serviceAccounts=()=>{let u;try{u=new URL(url.value.trim());}catch{return '';}if(!/^https?:$/.test(u.protocol))return '';
  const base=u.pathname.split(/\/(?:d|d-solo|dashboards|explore|org|admin|alerting|login)(?:\/|$)/)[0].replace(/\/+$/,'');const org=/^\d{1,6}$/.test(u.searchParams.get('orgId')||'')?'?orgId='+u.searchParams.get('orgId'):'';
  return u.origin+base+'/org/serviceaccounts'+org;};
 const syncTokenLink=()=>{const href=serviceAccounts();tokenLink.hidden=!href;if(href)tokenLink.href=href;};url.addEventListener('input',syncTokenLink);
 const help=el('p','small','Петя только читает дашборды и выполняет запросы их панелей; дайте сервисному аккаунту доступ к нужным папкам.');
 // Mapping panels to game metrics.
 const mapBox=el('div','grafana-mapping');mapBox.style.cssText='display:flex;flex-direction:column;gap:6px;margin:6px 0 10px';
 const propose=el('button',null,'Сопоставить панели с метриками');propose.type='button';
 const saveMap=el('button','primary','Сохранить сопоставление');saveMap.type='button';saveMap.hidden=true;
 const currency=el('select');currency.name='grafanaCurrency';for(const c of ['USD','EUR','RUB']){const o=el('option',null,c);o.value=c;o.setAttribute('data-no-i18n','');currency.append(o);}
 const mapStatus=el('p','small');mapStatus.setAttribute('role','status');mapStatus.setAttribute('aria-live','polite');
 card.append(el('h2',null,'Grafana'),el('p',null,'Дашборды Grafana в чате: графики, плитки и таблицы панелей. Только чтение.'),
  field('Адрес Grafana',url,'Можно вставить ссылку на любой дашборд — Петя возьмёт адрес из неё, вместе с префиксом пути.'),field('Токен сервисного аккаунта',token),tokenHelp,clearLabel,
  field('Папка по умолчанию',folder,'Её дашборды идут первыми в списке и выигрывают при совпадении названий.'),folders,renderLabel,save,status,help,
  el('h3',null,'Метрики игры из Grafana'),el('p','small','Выберите панели с DAU, новыми пользователями, выручкой и ретеншном — «Метрики игры» покажут их рядом с AppMetrica. Петя предложит панели по названиям и запросам, вы проверите и сохраните.'),
  propose,mapBox,field('Валюта выручки, если у панели нет денежной единицы',currency),saveMap,mapStatus);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('grafana',method,...args);
 let metrics=[],saved={},proposal=null,busy=false;
 const label=e=>(e.dt?e.dt+' › ':'')+(e.t||'панель '+e.p)+(e.f?' · '+e.f:'');
 const same=(a,b)=>a&&b&&a.d===b.d&&Number(a.p)===Number(b.p)&&(a.f||'')===(b.f||'');
 function renderMap(){
  mapBox.replaceChildren();
  if(!metrics.length)return;
  const shown=proposal||{candidates:{},proposal:{},why:{}};
  let any=false;
  for(const m of metrics){
   const list=[...(shown.candidates[m.id]||[])];
   if(saved[m.id]&&!list.some(e=>same(e,saved[m.id])))list.unshift(saved[m.id]);
   if(!list.length&&!proposal){if(!saved[m.id])continue;}
   any=true;
   const row=el('label','grafana-map-row');row.dataset.metric=m.id;row.style.cssText='display:grid;grid-template-columns:150px 1fr;gap:8px;align-items:center';
   const select=el('select');select.dataset.metric=m.id;
   const none=el('option',null,'— не сопоставлять —');none.value='';select.append(none);
   list.forEach((e,i)=>{const o=el('option',null,label(e));o.value=String(i);o.setAttribute('data-no-i18n','');select.append(o);});
   const pick=saved[m.id]&&!proposal?saved[m.id]:shown.proposal[m.id]||saved[m.id];
   const index=pick?list.findIndex(e=>same(e,pick)):-1;select.value=index>=0?String(index):'';
   select._list=list;
   const name=el('span',null,m.label);name.style.cssText='display:flex;flex-direction:column;gap:1px';
   if(proposal&&shown.proposal[m.id]&&!same(shown.proposal[m.id],saved[m.id])){name.append(el('small','small',shown.why[m.id]==='model'?'предложила модель':'предложено Петей'));}
   row.append(name,select);mapBox.append(row);
  }
  if(!any)mapBox.append(el('p','small','Сопоставлений пока нет.'));
 }
 const chosen=()=>{const out={};for(const s of mapBox.querySelectorAll('select[data-metric]')){if(s.value==='')continue;const e=s._list[Number(s.value)];if(e)out[s.dataset.metric]=e;}return out;};
 async function persist(data,done,target=status){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);target.textContent=done;}
  catch(e){target.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 async function load(){
  const state=await call('status');
  url.value=state.url||'';folder.value=state.folder||'';render.checked=!!state.render;currency.value=state.currency||'USD';saved=state.map||{};metrics=state.metrics||[];renderMap();syncTokenLink();
  if(!state.url||!state.hasToken){status.textContent='Укажите адрес Grafana и токен сервисного аккаунта.';return;}
  status.textContent='Проверяю подключение…';
  const t=await call('test');
  status.textContent='Grafana подключена'+(t.version?' (версия '+t.version+')':'')+'. Дашбордов: '+t.dashboards+'.';
  call('folders').then(list=>{folders.replaceChildren(...list.map(f=>{const o=el('option');o.value=f.title;return o;}));}).catch(()=>{});
 }
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{await persist({grafanaUrl:url.value,grafanaToken:token.value,clear_grafanaToken:clear.checked,grafanaFolder:folder.value,grafanaRender:render.checked?'true':'false'},'Сохранено.');token.value='';clear.checked=false;await load();}
  catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 propose.onclick=async()=>{
  if(busy)return;busy=true;propose.disabled=true;mapStatus.textContent='Смотрю дашборды и панели…';
  try{proposal=await call('propose');renderMap();saveMap.hidden=false;
   const n=Object.keys(proposal.proposal||{}).length;
   mapStatus.textContent=n?'Предложено метрик: '+n+' (просмотрено дашбордов: '+proposal.dashboards+'). Проверьте и сохраните.':'Подходящих панелей не нашлось — выберите вручную или проверьте доступ к папкам.';}
  catch(e){mapStatus.textContent=e.message;}
  finally{busy=false;propose.disabled=false;}
 };
 saveMap.onclick=async()=>{
  if(busy)return;busy=true;saveMap.disabled=true;
  try{const map=chosen();await persist({grafanaMetricMap:JSON.stringify(map),grafanaCurrency:currency.value},'Сопоставление сохранено: '+Object.keys(map).length+'.',mapStatus);saved=map;proposal=null;renderMap();saveMap.hidden=true;}
  catch(e){mapStatus.textContent=e.message;}
  finally{busy=false;saveMap.disabled=false;}
 };
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='grafana')load().catch(err=>{status.textContent=err.message;});});
})();
