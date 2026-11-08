// «Реклама и монетизация», settings: the keys of the ad sources — AppLovin MAX Report Key, Unity LevelPlay Secret
// Key and Refresh Token. They are stored as secrets and never shown again; «Проверить» reads one day of reports.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='ad-revenue';card.dataset.manualSave='true';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'small'},hint));return l;};
 const secret=placeholder=>el('input',{type:'password',autocomplete:'off',spellcheck:false,placeholder});
 const applovin=secret('Вставьте Report Key'),lpSecret=secret('Secret Key'),lpRefresh=secret('Refresh Token');
 const clearApplovin=el('input',{type:'checkbox'}),clearLevelplay=el('input',{type:'checkbox'});
 const save=el('button',{type:'button',className:'primary'},'Сохранить');
 const check=el('button',{type:'button'},'Проверить подключение');
 const status=el('p',{className:'small'});status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',{},'Реклама и монетизация'),
  el('p',{},'Выручка с рекламы в чате: «сколько заработали на рекламе вчера», «eCPM по сетям», «какой формат приносит больше». Петя только читает отчёты.'),
  el('h3',{},'AppLovin MAX'),
  field('Report Key',applovin,'MAX → Account → Keys → Report Key. Отчёты доступны за последние 45 дней, выручка — оценка в USD.'),
  el('label',{className:'check'},clearApplovin,'Удалить сохранённый Report Key'),
  el('h3',{},'Unity LevelPlay (ironSource)'),
  field('Secret Key',lpSecret,'LevelPlay → My Account → API: Secret Key и Refresh Token.'),
  field('Refresh Token',lpRefresh),
  el('label',{className:'check'},clearLevelplay,'Удалить сохранённые ключи LevelPlay'),
  el('div',{className:'row'},save,check),status,
  el('p',{className:'small'},'Другие источники (AdMob, собственная аналитика с DAU) можно добавить отдельными приложениями — они подключаются к этой карточке сами.'));
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('adRevenue',method,...args);
 async function describe(){
  try{
   const st=await call('status');
   const ready=st.sources.filter(x=>x.ready).map(x=>x.name);
   status.textContent=ready.length?'Подключено: '+ready.join(', ')+'.':'Не подключено: сохраните ключ AppLovin MAX или LevelPlay.';
  }catch{status.textContent='';}
 }
 save.onclick=async()=>{
  save.disabled=true;
  try{
   await window.petya.saveSettings({adRevenueApplovinKey:applovin.value.trim(),clear_adRevenueApplovinKey:clearApplovin.checked,
    adRevenueLevelplaySecret:lpSecret.value.trim(),clear_adRevenueLevelplaySecret:clearLevelplay.checked,adRevenueLevelplayRefresh:lpRefresh.value.trim(),clear_adRevenueLevelplayRefresh:clearLevelplay.checked});
   applovin.value=lpSecret.value=lpRefresh.value='';clearApplovin.checked=clearLevelplay.checked=false;
   await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 check.onclick=async()=>{
  check.disabled=true;status.textContent='Проверяю отчёты за вчера…';
  try{const rows=await call('check');status.textContent=rows.map(r=>r.name+': '+(r.ok?'отчёт получен, строк: '+r.rows:r.error)).join(' · ');}
  catch(e){status.textContent=e.message;}
  finally{check.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='ad-revenue')describe();});
 window.petyaEvents?.onWindowShown?.(describe);
 describe();
})();
