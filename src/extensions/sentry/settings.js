// «Sentry», settings: Sentry address, auth token (kept as a secret), organization and the projects to watch.
// After the token is saved the organizations and projects are loaded from Sentry to pick from.
// Changes here are saved by the card's own button, not by the form's autosave.
(()=>{
 const el=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 const field=(label,input,hint)=>{const l=el('label',null,label);l.append(input);if(hint)l.append(el('small','small',hint));return l;};
 const input=(name,{type='text',placeholder=''}={})=>{const i=el('input');i.name=name;i.type=type;i.placeholder=placeholder;i.autocomplete='off';i.spellcheck=false;return i;};
 const card=el('article','card');card.dataset.extension='sentry';card.dataset.manualSave='true';
 const url=input('sentryUrl',{placeholder:'https://sentry.io'}),org=input('sentryOrg',{placeholder:'my-studio'}),token=input('sentryToken',{type:'password',placeholder:'Вставьте токен Sentry'});
 const env=input('sentryEnvironment',{placeholder:'production (необязательно)'}),extra=input('sentryQuery',{placeholder:'например error.unhandled:true'});
 const projects=input('sentryProjects',{type:'hidden'});
 const clear=el('input');clear.type='checkbox';const clearLabel=el('label','check');clearLabel.append(clear,document.createTextNode('Удалить сохранённый токен'));
 const orgs=el('div','sentry-orgs');const list=el('div','sentry-projects');list.style.cssText='max-height:240px;overflow-y:auto;margin:6px 0 12px';
 const save=el('button','primary','Сохранить и загрузить проекты');save.type='button';
 const status=el('p','small');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const help=el('p','small','Токен: Sentry → Settings → Developer Settings → Personal Tokens (или Internal Integration) с правами org:read, project:read, event:read; для кнопки «Решено» нужен ещё event:write. Для своего сервера Sentry укажите его адрес.');
 card.append(el('h2',null,'Sentry'),el('p',null,'Источник крэшей для приложения «Крэши»: топ за период, новые после релиза, crash-free релиза и кнопка «Решено».'),
  field('Адрес Sentry',url),field('Токен Sentry',token),clearLabel,field('Организация (slug)',org),orgs,el('h3',null,'Проекты'),projects,list,
  field('Окружение',env,'Пусто — все окружения.'),field('Дополнительный фильтр поиска Sentry',extra,'Добавляется к is:unresolved в каждом запросе.'),save,status,help);
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('sentry',method,...args);
 const chosen=()=>projects.value.split(',').map(s=>s.trim()).filter(Boolean);
 let available=[],busy=false;
 function renderProjects(){
  list.replaceChildren();
  const rows=[...available];for(const slug of chosen())if(!rows.some(p=>p.slug===slug))rows.push({slug,name:slug+' · нет в загруженном списке'});
  if(!rows.length){list.append(el('p','small','Проекты появятся после сохранения токена и организации. Если ничего не отметить, Петя смотрит все проекты организации.'));return;}
  for(const p of rows){
   const label=el('label','check'),box=el('input');box.type='checkbox';box.checked=chosen().includes(p.slug);
   box.onchange=async()=>{const next=new Set(chosen());box.checked?next.add(p.slug):next.delete(p.slug);projects.value=[...next].join(',');await persist({sentryProjects:projects.value},'Проекты сохранены.');};
   const name=document.createElement('span');name.setAttribute('data-no-i18n','');name.textContent=(p.name===p.slug?p.slug:p.name+' ('+p.slug+')'+(p.platform?' · '+p.platform:''));label.append(box,name);list.append(label);
  }
 }
 async function persist(data,done){
  try{const result=await window.petya.saveSettings(data);if(typeof displaySettings==='function')displaySettings(result);status.textContent=done;}
  catch(e){status.textContent='Не удалось сохранить: '+e.message;throw e;}
 }
 async function load(){
  const state=await call('status');
  // Saved values are the truth: the form may not have been refreshed since they changed.
  projects.value=state.projects.join(',');if(state.org)org.value=state.org;if(state.url)url.value=state.url;
  if(!state.hasToken){available=[];renderProjects();status.textContent='Вставьте токен Sentry и сохраните.';return;}
  if(!state.org){
   const items=await call('organizations');orgs.replaceChildren();
   if(items.length===1){org.value=items[0].slug;await persist({sentryOrg:org.value},'Организация: '+items[0].name+'.');}
   else{status.textContent=items.length?'Выберите организацию.':'Токен не видит ни одной организации (нужно право org:read).';
    for(const o of items){const b=el('button',null,o.name+' ('+o.slug+')');b.setAttribute('data-no-i18n','');b.type='button';b.onclick=async()=>{org.value=o.slug;orgs.replaceChildren();await persist({sentryOrg:o.slug},'Организация сохранена.');await load().catch(e=>{status.textContent=e.message;});};orgs.append(b);}
    return;}
  }
  status.textContent='Загружаю проекты Sentry…';
  available=await call('projects');renderProjects();
  status.textContent='Sentry подключён. Проектов: '+available.length+'. '+(chosen().length?'Отмечено: '+chosen().length+'.':'Отметьте проекты или оставьте все.');
 }
 save.onclick=async()=>{
  if(busy)return;busy=true;save.disabled=true;
  try{
   await persist({sentryUrl:url.value,sentryOrg:org.value,sentryToken:token.value,clear_sentryToken:clear.checked,sentryProjects:projects.value,sentryEnvironment:env.value,sentryQuery:extra.value},'Сохранено.');
   token.value='';clear.checked=false;await load();
  }catch(e){status.textContent=e.message;}
  finally{busy=false;save.disabled=false;}
 };
 // The project list is loaded once, the first time the card is opened (not on every settings refresh).
 let loaded=false;
 document.addEventListener('petya-settings-displayed',()=>{token.value='';renderProjects();});
 card.addEventListener('toggle',()=>{if(loaded||card.hidden)return;loaded=true;load().catch(err=>{status.textContent=err.message;});},true);
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='sentry')load().catch(err=>{status.textContent=err.message;});});
 renderProjects();
})();
