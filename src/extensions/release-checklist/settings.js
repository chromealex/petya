// Settings of «Релизный чек-лист»: the release branch pattern and each project's checklist template — items with a
// group and either an automatic check (any app that provides a `release-check`) or «Вручную».
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='release-checklist';
 card.innerHTML='<h2>Релизный чек-лист</h2><p>«Готов ли релиз 1.5?», «что мешает выпустить версию». Автоматические пункты проверяют другие приложения, ручные отмечаются в карточке — отдельно для каждого релиза.</p>'+
  '<label>Ветка релиза<input name="releaseChecklistBranch" type="text" autocomplete="off" spellcheck="false" placeholder="release/{version}"></label>'+
  '<p class="small">{version} заменяется номером версии из запроса.</p>'+
  '<button type="button" class="rc-save-branch">Сохранить ветку</button>'+
  '<h3>Чек-лист проекта</h3><label>Проект<select class="rc-project"></select></label>'+
  '<div class="rc-template"></div>'+
  '<div class="rc-settings-actions"><button type="button" class="rc-add quiet">Добавить пункт</button><button type="button" class="rc-reset quiet">Вернуть стандартный</button><button type="button" class="rc-save">Сохранить чек-лист</button></div>'+
  '<p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const style=document.createElement('style');
 style.textContent='.rc-template{display:flex;flex-direction:column;gap:6px;margin:8px 0}.rc-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1.4fr) auto;gap:6px;align-items:center}.rc-row input,.rc-row select{min-width:0;margin:0}.rc-settings-actions{display:flex;flex-wrap:wrap;gap:8px}@media (max-width:640px){.rc-row{grid-template-columns:1fr 1fr}}';
 document.head.append(style);
 const q=s=>card.querySelector(s),status=q('[role=status]'),call=(method,...args)=>window.petya.feature('releaseChecklist',method,...args);
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 let checks=[],projectId='';
 function row(item={}){
  const r=document.createElement('div');r.className='rc-row';r.dataset.id=item.id||'';
  const title=document.createElement('input');title.type='text';title.className='rc-item-title';title.value=item.title||'';title.placeholder='Название пункта';title.setAttribute('aria-label','Название пункта');
  const group=document.createElement('input');group.type='text';group.className='rc-item-group';group.value=item.group||'';group.placeholder='Группа';group.setAttribute('aria-label','Группа');
  const kind=document.createElement('select');kind.className='rc-item-check';kind.setAttribute('aria-label','Как проверять');
  const manual=document.createElement('option');manual.value='';manual.textContent='Вручную';kind.append(manual);
  for(const c of checks){const o=document.createElement('option');o.value=c.id;o.textContent=c.title+' · '+c.name;kind.append(o);}
  if(item.check&&!checks.some(c=>c.id===item.check)){const o=document.createElement('option');o.value=item.check;o.textContent=item.check;kind.append(o);}
  kind.value=item.check||'';
  // Template items are user text: the interface translator leaves inputs alone.
  const remove=document.createElement('button');remove.type='button';
  if(window.asDeleteButton)window.asDeleteButton(remove,'Удалить пункт');else{remove.textContent='×';remove.setAttribute('aria-label','Удалить пункт');}
  remove.onclick=()=>r.remove();
  r.append(title,group,kind,remove);return r;
 }
 function paint(items){q('.rc-template').replaceChildren(...items.map(row));}
 async function refresh(id=projectId){
  try{
   const st=await call('template',id);checks=st.checks;projectId=st.project;
   const select=q('.rc-project');select.replaceChildren();
   for(const p of st.projects){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;o.setAttribute('data-no-i18n','');select.append(o);}
   select.value=projectId;q('[name=releaseChecklistBranch]').value=st.branch;paint(st.items);say('');
  }catch(e){say(e.message,'error');}
 }
 const items=()=>[...q('.rc-template').children].map(r=>({id:r.dataset.id,title:r.querySelector('.rc-item-title').value,group:r.querySelector('.rc-item-group').value,check:r.querySelector('.rc-item-check').value}));
 q('.rc-project').onchange=()=>refresh(q('.rc-project').value);
 q('.rc-add').onclick=()=>{const r=row({});q('.rc-template').append(r);r.querySelector('input').focus();};
 q('.rc-reset').onclick=async()=>{try{const r=await call('resetTemplate',projectId);paint(r.items);say('Вернул стандартный чек-лист.','connected');}catch(e){say(e.message,'error');}};
 q('.rc-save').onclick=async()=>{try{const r=await call('saveTemplate',projectId,items());paint(r.items);say('Чек-лист сохранён.','connected');}catch(e){say(e.message,'error');}};
 q('.rc-save-branch').onclick=async()=>{try{await window.petya.saveSettings({releaseChecklistBranch:q('[name=releaseChecklistBranch]').value});say('Сохранено.','connected');}catch(e){say(e.message,'error');}};
 for(const ev of ['petya-extensions-changed','petya-settings-displayed'])document.addEventListener(ev,()=>refresh());
 refresh();
})();
