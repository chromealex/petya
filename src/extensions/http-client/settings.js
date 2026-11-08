// Settings of «API-клиент»: environments (name, other names, base URL, health-check path, headers). A header marked
// secret is stored encrypted as a feature secret and never comes back here: its field stays empty with «сохранён»,
// and an empty field keeps the stored value.
(()=>{
 // The extension host may run this script twice when several cards mount it at once.
 if(document.querySelector('#settings-form>[data-extension="http-client"],#settings-form [data-extension="http-client"]'))return;
 const card=document.createElement('article');card.className='card';card.dataset.extension='http-client';
 card.innerHTML='<h2>API-клиент</h2><p>HTTP-запросы из чата. Окружения — это базовые адреса с заголовками: «дерни GET /users на staging». GET и HEAD к сохранённым адресам выполняются сразу; остальные методы и новые адреса — после подтверждения в карточке. Токены Пети и cookies браузера не отправляются.</p>'+
  '<div class="hc-envs"></div><button type="button" class="hc-add quiet">Добавить окружение</button> <button type="button" class="hc-save-envs">Сохранить</button><p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),list=q('.hc-envs');
 const call=(method,...args)=>window.petya.feature('httpClient',method,...args);
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 const el=(tag,props={},...kids)=>{const n=Object.assign(document.createElement(tag),props);n.append(...kids);return n;};
 const field=(label,input)=>{const l=el('label',{},label);l.append(input);return l;};
 function headerRow(h={}){
  const row=el('div',{className:'hc-header-row'});row.style.cssText='display:grid;grid-template-columns:1fr 1.6fr auto auto;gap:6px;align-items:center;margin-bottom:6px';
  const name=el('input',{type:'text',value:h.name||'',placeholder:'Заголовок',className:'h-name',spellcheck:false});name.setAttribute('aria-label','Имя заголовка');
  const value=el('input',{type:h.secret?'password':'text',value:h.secret?'':h.value||'',placeholder:h.secret&&h.stored?'сохранён — оставьте пустым':'Значение',className:'h-value',autocomplete:'off',spellcheck:false});value.setAttribute('aria-label','Значение заголовка');value.dataset.noI18n='';
  const secret=el('input',{type:'checkbox',checked:!!h.secret,className:'h-secret'});secret.style.width='auto';
  secret.onchange=()=>{value.type=secret.checked?'password':'text';};
  const sl=el('label',{className:'check'},secret,'секрет');sl.style.margin='0';
  row.append(name,value,sl,window.deleteButton('Удалить заголовок',()=>row.remove()));
  return row;
 }
 function envBox(e={headers:[]}){
  const box=el('fieldset',{className:'hc-env-box'});box.style.cssText='border:1px solid var(--line);border-radius:10px;padding:12px;margin:0 0 12px';box.dataset.id=e.id||'';
  const name=el('input',{type:'text',value:e.name||'',placeholder:'staging',className:'e-name'});
  const aliases=el('input',{type:'text',value:(e.aliases||[]).join(', '),placeholder:'стейдж, stage',className:'e-aliases'});
  const base=el('input',{type:'url',value:e.baseUrl||'',placeholder:'https://staging.example.com/api',className:'e-base',spellcheck:false});
  const health=el('input',{type:'text',value:e.health||'',placeholder:'/health',className:'e-health',spellcheck:false});
  const head=el('div',{});head.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:8px';
  head.append(el('strong',{},e.name||'Новое окружение'),window.deleteButton('Удалить окружение',()=>{box.remove();say('Окружение убрано из списка. Нажмите «Сохранить».');}));
  const headers=el('div',{className:'e-headers'});for(const h of e.headers||[])headers.append(headerRow(h));
  const add=el('button',{type:'button',className:'quiet',textContent:'Добавить заголовок'});add.onclick=()=>headers.append(headerRow());
  box.append(head,field('Название',name),field('Другие названия (через запятую)',aliases),field('Базовый адрес',base),field('Путь health-check',health),el('p',{className:'small',textContent:'Заголовки'}),headers,add);
  return box;
 }
 function read(){
  return [...list.querySelectorAll('.hc-env-box')].map(box=>({id:box.dataset.id||undefined,name:box.querySelector('.e-name').value,aliases:box.querySelector('.e-aliases').value,baseUrl:box.querySelector('.e-base').value,health:box.querySelector('.e-health').value,
   headers:[...box.querySelectorAll('.hc-header-row')].map(r=>({name:r.querySelector('.h-name').value,value:r.querySelector('.h-value').value,secret:r.querySelector('.h-secret').checked}))}));
 }
 function paint(envs){list.replaceChildren(...envs.map(envBox));if(!envs.length)list.append(el('p',{className:'small',textContent:'Окружений пока нет.'}));}
 async function load(){try{paint(await call('environments'));}catch(e){say(e.message,'error');}}
 q('.hc-add').onclick=()=>{list.querySelector(':scope>p')?.remove();const box=envBox();list.append(box);box.querySelector('.e-name').focus();};
 q('.hc-save-envs').onclick=async()=>{
  const b=q('.hc-save-envs');b.disabled=true;
  try{paint(await call('saveEnvironments',read()));say('Сохранено.','connected');}
  catch(e){say(e.message,'error');}finally{b.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='http-client')load();});
 document.addEventListener('petya-settings-displayed',load);
 load();
})();
