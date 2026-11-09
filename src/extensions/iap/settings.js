// «Покупки в игре», settings: App Store Connect (Issuer ID, Key ID, .p8 with the Sales or Finance role, vendor number)
// and Google Play (the reports bucket pubsite_rev_…, optional packages, a service-account key with access to financial
// reports). Keys are stored encrypted and never shown again; without own keys the App Store key of «Отзывы в сторах»
// and the service-account key of «Подключения → Google Play» are used. A purchases table of «SQL по словам» needs
// nothing here.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='iap';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'hint'},hint));return l;};
 const feature=(m,...a)=>window.petya.feature('iap',m,...a);
 const issuer=el('input',{type:'text',name:'iapAscIssuer',autocomplete:'off',spellcheck:false,placeholder:'69a6de7e-…-…'});
 const keyId=el('input',{type:'text',name:'iapAscKeyId',autocomplete:'off',spellcheck:false,placeholder:'2X9R4HXF34'});
 const key=el('textarea',{rows:3,name:'iapAscKey',spellcheck:false,placeholder:'-----BEGIN PRIVATE KEY-----'});key.style.fontFamily='ui-monospace,Menlo,monospace';
 const p8=el('input',{type:'file',accept:'.p8,.pem,text/plain'});p8.hidden=true;
 const pickP8=el('button',{type:'button'},'Выбрать файл .p8');
 const vendor=el('input',{type:'text',name:'iapAscVendor',autocomplete:'off',spellcheck:false,inputMode:'numeric',placeholder:'85012345'});
 const bucket=el('input',{type:'text',name:'iapPlayBucket',autocomplete:'off',spellcheck:false,placeholder:'pubsite_rev_01234567890123456789'});
 const packages=el('input',{type:'text',name:'iapPlayPackages',autocomplete:'off',spellcheck:false,placeholder:'com.studio.bunkerwars'});
 const json=el('input',{type:'file',accept:'.json,application/json'});json.hidden=true;
 const pickJson=el('button',{type:'button'},'Выбрать ключ сервисного аккаунта');
 const clearJson=el('button',{type:'button'},'Убрать свой ключ');
 const save=el('button',{type:'button'},'Сохранить подключение');
 const status=el('p',{role:'status'});
 card.append(el('h2',{},'Покупки в игре'),
  el('p',{},'Выручка по продуктам, возвраты, платящие и ARPPU в чате: «покупки в игре за неделю», «какие паки покупают лучше», «рефанды за месяц». Петя только читает отчёты; валюты не смешиваются.'),
  el('h3',{},'App Store Connect'),
  field('Issuer ID',issuer,'App Store Connect → Пользователи и доступ → Интеграции → Ключи API команды. Пусто — возьму ключ из «Отзывы в сторах».'),
  field('Key ID',keyId),
  field('Ключ .p8',key,'Роль ключа: Sales, Finance или Admin (отчёты о продажах). Ключ хранится зашифрованным и больше не показывается.'),
  pickP8,p8,
  field('Номер поставщика (Vendor number)',vendor,'«Платежи и финансовые отчёты» в App Store Connect, вверху слева.'),
  el('h3',{},'Google Play'),
  field('Бакет отчётов',bucket,'Play Console → «Скачать отчёты» → «Финансовые» → «Скопировать URI облака»: gs://pubsite_rev_….'),
  field('Пакеты (через запятую)',packages,'Необязательно: без списка — все игры аккаунта.'),
  el('p',{className:'hint'},'Доступ: сервисный аккаунт, приглашённый в Play Console с правом «Просмотр финансовых данных». Без своего ключа используется ключ из «Подключения → Google Play».'),
  el('div',{className:'actions'},pickJson,clearJson),json,
  save,status);
 document.getElementById('settings-form').append(card);
 const describe=async()=>{
  try{
   const st=await feature('status');
   const parts=['App Store: '+(st.appstore?'подключён'+(st.ascShared?' (ключ из «Отзывы в сторах»)':''):st.hasAscKey||st.ascShared?'ключ есть, укажите номер поставщика':'не подключён'),
    'Google Play: '+(st.googleplay?'подключён'+(st.account?' ('+st.account+')':''):st.bucket?'нужен ключ сервисного аккаунта':'не подключён')];
   if(st.sql)parts.push('база: таблица покупок из «SQL по словам»');
   status.textContent=parts.join('. ')+'.';
   clearJson.hidden=!st.ownPlayKey;
  }catch{status.textContent='';}
 };
 const load=async()=>{try{const s=await window.petya.settings();issuer.value=s.iapAscIssuer||'';keyId.value=s.iapAscKeyId||'';vendor.value=s.iapAscVendor||'';bucket.value=s.iapPlayBucket||'';packages.value=s.iapPlayPackages||'';}catch{}describe();};
 pickP8.onclick=()=>p8.click();
 p8.onchange=async()=>{const f=p8.files?.[0];if(!f)return;if(f.size>10000){status.textContent='Это не похоже на ключ .p8.';return;}key.value=(await f.text()).trim();const id=f.name.match(/AuthKey_([A-Z0-9]{10})\.p8$/);if(id&&!keyId.value)keyId.value=id[1];p8.value='';};
 pickJson.onclick=()=>json.click();
 json.onchange=async()=>{const f=json.files?.[0];if(!f)return;try{if(f.size>20000)throw Error('Это не похоже на ключ сервисного аккаунта.');await feature('saveKey',await f.text());await describe();status.textContent='Ключ сохранён. '+status.textContent;}catch(e){status.textContent=e.message;}json.value='';};
 clearJson.onclick=async()=>{try{await feature('clearKey');await describe();}catch(e){status.textContent=e.message;}};
 save.onclick=async()=>{
  save.disabled=true;
  try{
   await window.petya.saveSettings({iapAscIssuer:issuer.value.trim(),iapAscKeyId:keyId.value.trim(),iapAscKey:key.value.trim(),iapAscVendor:vendor.value.trim(),iapPlayBucket:bucket.value.trim().replace(/^gs:\/\//,'').replace(/\/.*$/,''),iapPlayPackages:packages.value.trim()});
   key.value='';await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='iap')describe();});
 window.petyaEvents?.onWindowShown?.(describe);
 load();
})();
