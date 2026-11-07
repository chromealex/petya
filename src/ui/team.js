(() => {
 const list=$('team-list'),form=$('team-form'),status=$('team-status');let loaded=false,dirty=false;
 // The save strip appears only with unsaved edits.
 const setDirty=value=>{dirty=value;form.classList.toggle('is-dirty',value);};
 const fields=[['name','Имя',120],['aliases','Как вы называете человека',240],['role','Роль',160],['projects','Проекты',400],['responsibilities','За что отвечает',1600],['email','Email',254],['slackId','Slack member ID (необязательно)',80],['jiraId','Jira',160],['jiraName','Имя в Jira',200]];
 function add(member={}){
  const card=document.createElement('article');card.className='card team-member';
  const details=document.createElement('details');details.open=!member.name;
  const summary=document.createElement('summary');
  const heading=document.createElement('span');heading.className='team-member-heading';
  const title=document.createElement('strong'),subtitle=document.createElement('span');subtitle.className='team-member-subtitle';
  const avatar=document.createElement('span');avatar.className='team-avatar';avatar.setAttribute('aria-hidden','true');heading.append(title,subtitle);summary.append(avatar,heading);
  const editor=document.createElement('div');editor.className='team-member-fields';
  const updateSummary=()=>{const value=key=>editor.querySelector('[data-field="'+key+'"]')?.value.trim()||'';title.textContent=value('name')||'Новый участник';avatar.textContent=(value('name').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('')||'+').toLocaleUpperCase();subtitle.textContent=[value('role'),value('projects')].filter(Boolean).join(' · ')||'Роль и проекты не указаны';};
  for(const [key,label,max] of fields){
   const wrap=document.createElement('label');wrap.textContent=label;if(key==='responsibilities')wrap.className='team-member-wide';
   const input=document.createElement(key==='responsibilities'?'textarea':'input');input.dataset.field=key;input.value=member[key]||'';input.maxLength=max;
   if(key==='jiraId'||key==='jiraName'){input.type='hidden';wrap.hidden=true;}
   if(key==='name')input.required=true;
   if(['name','role','projects'].includes(key))input.addEventListener('input',updateSummary);
   if(key==='email')input.type='email';
   if(key==='aliases')input.placeholder='Полина, Поля';
   if(key==='projects')input.placeholder='Название проекта, ключ Jira';
   if(key==='responsibilities'){input.rows=2;input.placeholder='Например: QA, проверка релизных сборок Android';}
   input.addEventListener('invalid',()=>{details.open=true;});
   wrap.append(input);editor.append(wrap);
  }
  addJiraPicker(editor,member);
  updateSummary();
  const actions=document.createElement('div');actions.className='actions team-member-wide';
  const remove=document.createElement('button');remove.type='button';remove.className='quiet';remove.textContent='Удалить участника';remove.onclick=()=>{setDirty(true);card.remove();status.textContent='Изменения не сохранены.';};
  actions.append(remove);editor.append(actions);details.append(summary,editor);card.append(details);list.append(card);return card;
 }
 function addJiraPicker(editor,member){
  const box=document.createElement('div');box.className='team-jira-picker team-member-wide';const heading=document.createElement('label');heading.textContent='Человек в Jira';
  const query=document.createElement('input');query.type='search';query.placeholder='Имя или фамилия в Jira';query.value=member.jiraName||member.name||'';query.maxLength=200;heading.append(query);
  const selected=document.createElement('p');selected.className='small';const results=document.createElement('div');results.className='team-jira-results';const message=document.createElement('p');message.className='small';message.setAttribute('role','status');
  const find=document.createElement('button');find.type='button';find.textContent='Найти в Jira';const unlink=document.createElement('button');unlink.type='button';unlink.textContent='Убрать связь';
  const id=editor.querySelector('[data-field="jiraId"]'),name=editor.querySelector('[data-field="jiraName"]');let revision=0;
  const mark=()=>{setDirty(true);status.textContent='Изменения не сохранены.';};const sync=()=>{selected.textContent=id.value?'Выбран: '+(name.value||member.name||'участник Jira'):'Не связан с Jira';unlink.hidden=!id.value;};sync();
  query.addEventListener('input',event=>{event.stopPropagation();revision++;results.replaceChildren();message.textContent='';});
  find.onclick=async()=>{const current=++revision;results.replaceChildren();if(query.value.trim().length<2){message.textContent='Введите хотя бы две буквы имени.';return;}find.disabled=true;message.textContent='Ищу людей в доступных проектах Jira…';
   try{const rows=await window.petya.teamJiraSearch(query.value);if(current!==revision||!box.isConnected)return;message.textContent=rows.length?'Выберите человека. Связь сохранится по кнопке «Сохранить команду».':'Никого не найдено. Попробуйте фамилию или написание имени в Jira.';
    for(const person of rows){const choice=document.createElement('button');choice.type='button';choice.textContent=person.name+' · '+person.projects.join(', ');choice.title=person.name+' · '+person.id;choice.onclick=()=>{id.value=person.id;name.value=person.name;query.value=person.name;const localName=editor.querySelector('[data-field="name"]');if(!localName.value.trim()){localName.value=person.name;localName.dispatchEvent(new Event('input',{bubbles:true}));}revision++;results.replaceChildren();message.textContent='Связь выбрана. Сохраните команду.';mark();sync();};results.append(choice);}
   }catch(e){if(current===revision)message.textContent=e.message;}finally{find.disabled=false;}
  };
  query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();find.click();}});
  unlink.onclick=()=>{revision++;id.value='';name.value='';results.replaceChildren();mark();sync();};const actions=document.createElement('div');actions.className='actions';actions.append(find,unlink);box.append(heading,actions,selected,message,results);editor.append(box);
 }
 async function load(force=false){const data=await window.petya.teamList();if(dirty&&!force){status.textContent='Команда обновлена. Обновите список перед сохранением ручных правок.';$('team-save').disabled=true;return;}list.replaceChildren();data.members.forEach(add);$('team-notes').value=data.notes;loaded=true;setDirty(false);$('team-save').disabled=false;$('team-add').disabled=false;status.textContent=data.members.length?'Участников: '+data.members.length:'Добавьте коллег, чтобы Петя знал, кто за что отвечает.';}
 document.querySelector('[data-view="team"]').addEventListener('click',run(async()=>{if(!loaded)await load();}));
 $('team-add').onclick=()=>{if(list.children.length>=100){notice('Можно добавить до 100 участников.',true);return;}setDirty(true);add().querySelector('input').focus();status.textContent='Изменения не сохранены.';};
 form.addEventListener('input',()=>{setDirty(true);status.textContent='Изменения не сохранены.';});
 document.addEventListener('petya-team-updated',()=>{if(dirty){status.textContent='Петя обновил команду. У вас есть несохранённые правки — обновите список перед сохранением.';$('team-save').disabled=true;return;}load().catch(e=>notice(e.message,true));});
 const reload=document.createElement('button');reload.type='button';reload.textContent='Обновить список';reload.onclick=run(()=>load(true));$('team-add').after(reload);
 form.onsubmit=run(async()=>{const members=[...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value])));$('team-save').disabled=true;try{await window.petya.teamSave({members,notes:$('team-notes').value});setDirty(false);status.textContent='Команда сохранена. Петя учитывает её в диалоге и при подготовке задач.';}finally{$('team-save').disabled=false;}});
})();
