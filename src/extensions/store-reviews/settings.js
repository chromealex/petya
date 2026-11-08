// «Отзывы в сторах», settings: App Store Connect API key (issuer, key id, .p8 — the key is stored encrypted and never
// shown again), app ids and Google Play packages. Google Play itself uses the service-account key from
// «Подключения → Google Play»; this card only tells whether that key can read reviews.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='store-reviews';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const field=(label,input,hint)=>{const l=el('label',{},label,input);if(hint)l.append(el('small',{className:'hint'},hint));return l;};
 const issuer=el('input',{type:'text',autocomplete:'off',spellcheck:false,placeholder:'69a6de7e-…-…'});
 const keyId=el('input',{type:'text',autocomplete:'off',spellcheck:false,placeholder:'2X9R4HXF34'});
 const key=el('textarea',{rows:3,spellcheck:false,placeholder:'-----BEGIN PRIVATE KEY-----'});key.style.fontFamily='ui-monospace,Menlo,monospace';
 const file=el('input',{type:'file',accept:'.p8,.pem,text/plain'});file.hidden=true;
 const pick=el('button',{type:'button'},'Выбрать файл .p8');
 const clear=el('input',{type:'checkbox'});
 const apps=el('textarea',{rows:2,spellcheck:false,placeholder:'Bunker Wars = 1234567890'});
 const packages=el('textarea',{rows:2,spellcheck:false,placeholder:'Bunker Wars = com.studio.bunkerwars'});
 const save=el('button',{type:'button'},'Сохранить подключение');
 const status=el('p',{role:'status'});
 card.append(el('h2',{},'Отзывы в сторах'),
  el('p',{},'Отзывы App Store и Google Play в чате: «что пишут в отзывах», «плохие отзывы после обновления», «ответь на отзыв». Ответ игроку уходит только после кнопки «Отправить ответ» в карточке.'),
  el('h3',{},'App Store Connect'),
  field('Issuer ID',issuer,'App Store Connect → Пользователи и доступ → Интеграции → Ключи API команды.'),
  field('Key ID',keyId),
  field('Ключ .p8',key,'Роль ключа: Customer Support (или выше). Ключ хранится зашифрованным и больше не показывается.'),
  pick,file,el('label',{},clear,'Удалить сохранённый ключ .p8'),
  field('Приложения App Store (id, по одному в строке)',apps,'Необязательно: без списка Петя возьмёт все приложения, доступные ключу.'),
  el('h3',{},'Google Play'),
  field('Пакеты Google Play (по одному в строке)',packages,'Необязательно. Доступ — ключ сервисного аккаунта из «Подключения → Google Play» с правами на отзывы.'),
  save,status);
 document.getElementById('settings-form').append(card);
 const describe=async()=>{
  try{
   const st=await window.petya.feature('storeReviews','status');
   status.textContent='App Store: '+(st.appstore?'подключён':st.hasAscKey?'ключ сохранён, проверьте Issuer ID и Key ID':'не подключён')+'. Google Play: '+(st.play?'ключ сервисного аккаунта подходит':(st.playProblem||'не подключён'))+'.';
  }catch{status.textContent='';}
 };
 const load=async()=>{try{const s=await window.petya.settings();issuer.value=s.storeReviewsAscIssuer||'';keyId.value=s.storeReviewsAscKeyId||'';apps.value=s.storeReviewsAscApps||'';packages.value=s.storeReviewsPlayPackages||'';}catch{}describe();};
 pick.onclick=()=>file.click();
 file.onchange=async()=>{const f=file.files?.[0];if(!f)return;if(f.size>10000){status.textContent='Это не похоже на ключ .p8.';return;}key.value=(await f.text()).trim();const id=f.name.match(/AuthKey_([A-Z0-9]{10})\.p8$/);if(id&&!keyId.value)keyId.value=id[1];file.value='';};
 save.onclick=async()=>{
  save.disabled=true;
  try{
   await window.petya.saveSettings({storeReviewsAscIssuer:issuer.value.trim(),storeReviewsAscKeyId:keyId.value.trim(),storeReviewsAscKey:key.value.trim(),clear_storeReviewsAscKey:clear.checked,storeReviewsAscApps:apps.value.trim(),storeReviewsPlayPackages:packages.value.trim()});
   key.value='';clear.checked=false;await describe();status.textContent='Сохранено. '+status.textContent;
  }catch(e){status.textContent=e.message;}
  finally{save.disabled=false;}
 };
 window.petyaEvents?.onWindowShown?.(describe);
 load();
})();
