// «AppMetrica», settings: OAuth token (kept as a secret), the applications to read and the revenue currency.
// After the token is saved the applications are loaded from the Management API to pick from.
// Changes here are saved by the card's own button, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const card=el('article','card');card.dataset.extension='appmetrica';card.dataset.manualSave='true';
 const token=el('input');token.name='appmetricaToken';token.type='password';token.placeholder='Вставьте OAuth-токен AppMetrica';token.autocomplete='off';token.spellcheck=false;
 const apps=el('input');apps.name='appmetricaApps';apps.type='hidden';
 const names=el('input');names.name='appmetricaAppNames';names.type='hidden';
 const currency=el('select');currency.name='appmetricaCurrency';for(const c of ['RUB','USD','EUR']){const o=el('option',null,c);o.value=c;o.setAttribute('data-no-i18n','');currency.append(o);}
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const list=el('div','appmetrica-apps');list.style.cssText='max-height:240px;overflow-y:auto;margin:6px 0 12px';
 const save=el('button','primary','Сохранить и загрузить приложения');save.type='button';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const help=el('p','small','Токен: oauth.yandex.ru → создайте приложение с правом «Получение статистики, чтение параметров своих и доверенных приложений» (appmetrica:read) и получите OAuth-токен. Петя только читает статистику.');
 card.append(el('h2',null,'AppMetrica'),el('p',null,'Источник для «Метрик игры»: DAU, новые игроки, ретеншн и выручка.'),
  field('OAuth-токен',token),clearLabel,el('h3',null,'Приложения'),apps,names,list,field('Валюта выручки',currency,'В этой валюте AppMetrica пересчитает выручку.'),save,status,help);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('appmetrica',method,...args);
 const chosen=()=>apps.value.split(',').map(s=>s.trim()).filter(Boolean);
 const nameMap=()=>{try{return JSON.parse(names.value||'{}')||{};}catch{return {};}};
 let available=[],busy=false;
 function render(){
  list.replaceChildren();
  const rows=[...available];for(const id of chosen())if(!rows.some(a=>a.id===id))rows.push({id,name:nameMap()[id]||id});
  if(!rows.length){list.append(el('p','small','Приложения появятся после сохранения токена.'));return;}
  for(const a of rows){
   const label=el('label','check'),box=el('input');box.type='checkbox';box.checked=chosen().includes(a.id);
   box.onchange=async()=>{const next=new Set(chosen());box.checked?next.add(a.id):next.delete(a.id);apps.value=[...next].join(',');
    const map={...nameMap()};for(const x of available)if(next.has(x.id))map[x.id]=x.name;names.value=JSON.stringify(map);
    await persist({appmetricaApps:apps.value,appmetricaAppNames:names.value},'Приложения сохранены.');};
   const text=el('span',null,a.name===a.id?a.id:a.name+' ('+a.id+')');text.setAttribute('data-no-i18n','');label.append(box,text);list.append(label);
  }
 }
 async function persist(data,done){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);status.textContent=done;}
  catch(e){status.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 async function load(){
  const state=await call('status');
  apps.value=state.apps.join(',');currency.value=state.currency;
  if(!state.hasToken){available=[];render();status.textContent='Вставьте OAuth-токен AppMetrica и сохраните.';return;}
  status.textContent='Загружаю приложения AppMetrica…';
  available=await call('applications');
  // One application: chosen right away.
  if(available.length===1&&!chosen().length){apps.value=available[0].id;names.value=JSON.stringify({[available[0].id]:available[0].name});await persist({appmetricaApps:apps.value,appmetricaAppNames:names.value},'Приложение выбрано.');}
  render();
  status.textContent=available.length?'AppMetrica подключена. Приложений: '+available.length+'. '+(chosen().length?'Выбрано: '+chosen().length+'.':'Отметьте приложения игры.'):'Токен не видит ни одного приложения AppMetrica.';
 }
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{await persist({appmetricaToken:token.value,clear_appmetricaToken:clear.checked,appmetricaApps:apps.value,appmetricaCurrency:currency.value},'Сохранено.');token.value='';clear.checked=false;await load();}
  catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';render();});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='appmetrica')load().catch(err=>{status.textContent=err.message;});});
 render();
})();
