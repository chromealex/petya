// «Закупка трафика», settings: the networks' report access — AppLovin Report Key (reused from «Реклама и
// монетизация» when it is there), a Unity Ads service account (organization core ID, Key ID, Secret key) and a Meta
// token with the ad account IDs. Secrets are never shown again; «Проверить» reads yesterday's report.
(()=>{
 if(document.querySelector('#settings-form [data-extension="ua-campaigns"]'))return;
 const card=document.createElement('article');card.className='card';card.dataset.extension='ua-campaigns';card.dataset.manualSave='true';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'small'},hint));return l;};
 const input=(placeholder,type='text')=>el('input',{type,autocomplete:'off',spellcheck:false,placeholder});
 const f={applovin:input('Report Key','password'),org:input('Organization core ID'),keyId:input('Key ID'),secret:input('Secret key','password'),accounts:input('1234567890, act_987…'),token:input('токен с ads_read','password')};
 const clear=el('input',{type:'checkbox'});
 const save=el('button',{type:'button',className:'primary'},'Сохранить'),check=el('button',{type:'button'},'Проверить подключение');
 const status=el('p',{className:'small'});status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',{},'Закупка трафика'),
  el('p',{},'Траты на привлечение игроков в чате: «сколько потратили на закупку за неделю», «CPI по сетям», «какая кампания дороже всех». Петя только читает отчёты сетей.'),
  el('h3',{},'AppLovin'),field('Report Key',f.applovin,'Account → Keys. Если ключ уже указан в «Реклама и монетизация», он используется и здесь. Отчёты — за последние 45 дней.'),
  el('h3',{},'Unity Ads'),
  field('Organization core ID',f.org,'Unity Ads User Acquisition → Settings → Organization core ID.'),
  el('div',{className:'row'},el('div',{className:'grow'},field('Key ID',f.keyId)),el('div',{className:'grow'},field('Secret key',f.secret))),
  el('p',{className:'small'},'Сервисный аккаунт с ролью «Advertise Stats API Viewer».'),
  el('h3',{},'Meta'),
  field('Рекламные аккаунты',f.accounts,'ID через запятую, до пяти.'),
  field('Токен доступа',f.token,'Лучше токен системного пользователя Business Manager с правом ads_read.'),
  el('label',{className:'check'},clear,'Удалить сохранённые ключи'),
  el('p',{className:'small'},'Google Ads подключается отдельно: нужен developer token и OAuth — появится позже.'),
  el('div',{className:'row'},save,check),status);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('uaCampaigns',method,...args);
 async function describe(){
  try{const st=await call('status');const ready=st.sources.filter(x=>x.ready).map(x=>x.name);
   status.textContent=(ready.length?'Подключено: '+ready.join(', ')+'.':'Не подключено: укажите ключ хотя бы одной сети.')+(st.reusesApplovinKey?' Ключ AppLovin взят из «Реклама и монетизация».':'');}
  catch{status.textContent='';}
 }
 async function load(){try{const s=await window.petya.settings();f.org.value=s.uaUnityOrg||'';f.keyId.value=s.uaUnityKeyId||'';f.accounts.value=s.uaMetaAccounts||'';}catch{}describe();}
 save.onclick=async()=>{
  save.disabled=true;
  try{
   await window.petya.saveSettings({uaApplovinKey:f.applovin.value.trim(),uaUnityOrg:f.org.value.trim(),uaUnityKeyId:f.keyId.value.trim(),uaUnitySecret:f.secret.value.trim(),uaMetaAccounts:f.accounts.value.trim(),uaMetaToken:f.token.value.trim(),
    clear_uaApplovinKey:clear.checked,clear_uaUnitySecret:clear.checked,clear_uaMetaToken:clear.checked});
   f.applovin.value=f.secret.value=f.token.value='';clear.checked=false;
   await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 check.onclick=async()=>{
  check.disabled=true;status.textContent='Читаю отчёты за вчера…';
  try{const rows=await call('check');status.textContent=rows.map(r=>r.name+': '+(r.ok?'отчёт получен, строк: '+r.rows:r.error)).join(' · ');}
  catch(e){status.textContent=e.message;}
  finally{check.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='ua-campaigns')load();});
 window.petyaEvents?.onWindowShown?.(describe);
 load();
})();
