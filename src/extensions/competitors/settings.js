// «Конкуренты», settings: the App Store country whose figures are read, and the competitor lists of the projects
// (remove with the red trash, add by searching the App Store). Lists live in the extension's own data, per project.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='competitors';card.dataset.manualSave='true';
 const el=(tag,props={},...children)=>{const n=Object.assign(document.createElement(tag),props);n.append(...children);return n;};
 const countryInput=el('input',{type:'text',maxLength:2,autocomplete:'off',spellcheck:false,placeholder:'us'});countryInput.style.width='5em';
 const save=el('button',{type:'button'},'Сохранить страну');
 const lists=el('div',{className:'competitors-lists'});
 const term=el('input',{type:'search',autocomplete:'off',placeholder:'Название игры в App Store'});
 const find=el('button',{type:'button'},'Найти');
 const found=el('div',{className:'competitors-found'});
 const status=el('p',{className:'small'});status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 card.append(el('h2',{},'Конкуренты'),
  el('p',{},'Игры-конкуренты проекта: «что нового у конкурентов», «у кого вырос рейтинг», «добавь в конкуренты …». Данные App Store открытые — подключать ничего не нужно.'),
  el('label',{},'Страна App Store',countryInput,el('small',{className:'small'},'Двухбуквенный код витрины (us, ru, de…): рейтинг и версия в разных странах отличаются.')),save,
  el('h3',{},'Списки по проектам'),lists,
  el('h3',{},'Добавить в текущий проект'),el('div',{className:'row'},term,find),found,status,
  el('p',{className:'small'},'Google Play: у магазина нет открытого API — данные ищутся через «Поиск в интернете» и помечаются как найденные поиском. Добавить игру Google Play можно ссылкой в чате.'));
 const form=document.getElementById('settings-form');form.insertBefore(card,form.querySelector(':scope > button'));
 const call=(method,...args)=>window.petya.feature('competitors',method,...args);
 async function load(){
  try{
   const st=await call('lists');countryInput.value=st.country;lists.replaceChildren();
   if(!st.projects.some(p=>p.items.length)){lists.append(el('p',{className:'small'},'Пока никого не отслеживаете.'));return;}
   for(const p of st.projects){
    if(!p.items.length)continue;
    const box=el('div',{});const name=el('strong',{},p.name);name.setAttribute('data-no-i18n','');box.append(name);
    for(const item of p.items){
     const row=el('div',{className:'row'});const label=el('span',{},item.name+(item.store==='play'?' · Google Play':' · App Store'));label.setAttribute('data-no-i18n','');
     row.append(label,window.deleteButton('Убрать из конкурентов',async()=>{try{const r=await call('remove',p.id,item.key);status.textContent=r.text;await load();}catch(e){status.textContent=e.message;}}));
     box.append(row);
    }
    lists.append(box);
   }
  }catch(e){status.textContent=e.message;}
 }
 save.onclick=async()=>{save.disabled=true;try{await window.petya.saveSettings({competitorsCountry:countryInput.value.trim().toLowerCase()});status.textContent='Страна сохранена.';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 find.onclick=async()=>{
  if(!term.value.trim())return;find.disabled=true;found.replaceChildren();
  try{
   const rows=await call('search',term.value.trim());
   if(!rows.length)status.textContent='Ничего не нашлось.';
   for(const r of rows){const row=el('div',{className:'row'});const label=el('span',{},r.name+' · '+r.developer);label.setAttribute('data-no-i18n','');
    const add=el('button',{type:'button'},'Следить');add.onclick=async()=>{add.disabled=true;try{const x=await call('add','',r);status.textContent=x.text;await load();}catch(e){status.textContent=e.message;add.disabled=false;}};
    row.append(label,add);found.append(row);}
  }catch(e){status.textContent=e.message;}
  finally{find.disabled=false;}
 };
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='competitors')load();});
 window.petyaEvents?.onWindowShown?.(load);
 load();
})();
