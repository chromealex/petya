(() => {
 const list=$('team-list'),form=$('team-form'),status=$('team-status');let loaded=false,dirty=false;
 // The save strip appears only with unsaved edits.
 const setDirty=value=>{dirty=value;form.classList.toggle('is-dirty',value);};
 const fields=[['name','Имя',120],['aliases','Как вы называете человека',240],['role','Роль',160],['projects','Проекты',400],['responsibilities','За что отвечает',1600],['email','Email',254],['slackId','Slack member ID (необязательно)',80],['jiraId','Jira',160],['jiraName','Имя в Jira',200],['zoomName','Имя в Zoom',240]];
 // Zoom names seen in meetings: the list for «Имя в Zoom» and the automatic match as each card's hint.
 let zoomNames=[];
 window.paintZoomNames=()=>{let list=document.getElementById('team-zoom-names');if(!list){list=document.createElement('datalist');list.id='team-zoom-names';document.body.append(list);}
  list.replaceChildren(...zoomNames.map(z=>Object.assign(document.createElement('option'),{value:z.name,label:z.member?'сейчас: '+z.member:'не сопоставлен'})));
  for(const input of document.querySelectorAll('#team-list [data-field="zoomName"]')){const owner=input.closest('.team-member')?.querySelector('[data-field="name"]')?.value.trim();const auto=zoomNames.filter(z=>z.member&&z.member===owner).map(z=>z.name);input.placeholder=auto.length?'Сам определил: '+auto.slice(0,3).join(', '):'Определю сам по имени';}};
 const loadZoomNames=()=>window.petya.feature('materials','zoomNames').then(v=>{zoomNames=v||[];window.paintZoomNames();}).catch(()=>{});
 document.addEventListener('petya-view',e=>{if(e.detail==='team')loadZoomNames();});loadZoomNames();
 function add(member={}){
  const card=document.createElement('article');card.className='card team-member';
  const details=document.createElement('details');details.open=!member.name;
  const summary=document.createElement('summary');
  const heading=document.createElement('span');heading.className='team-member-heading';
  const title=document.createElement('strong'),subtitle=document.createElement('span');subtitle.className='team-member-subtitle';
  const avatar=document.createElement('span');avatar.className='team-avatar';avatar.setAttribute('aria-hidden','true');heading.append(title,subtitle);summary.append(avatar,heading);
  const editor=document.createElement('div');editor.className='team-member-fields';
  const updateSummary=()=>{const value=key=>editor.querySelector('[data-field="'+key+'"]')?.value.trim()||'';title.textContent=value('name')||'Новый участник';const photo=value('photo');if(/^data:image\/(png|jpeg);base64,/.test(photo)){const img=avatar.querySelector('img')||document.createElement('img');img.src=photo;img.alt='';avatar.replaceChildren(img);avatar.classList.add('has-photo');}else{avatar.classList.remove('has-photo');avatar.textContent=(value('name').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('')||'+').toLocaleUpperCase();}subtitle.textContent=[value('role'),value('projects')].filter(Boolean).join(' · ')||'Роль и проекты не указаны';};
  for(const [key,label,max] of fields){
   const wrap=document.createElement('label');wrap.textContent=label;if(key==='responsibilities')wrap.className='team-member-wide';
   const input=document.createElement(key==='responsibilities'?'textarea':'input');input.dataset.field=key;input.value=member[key]||'';input.maxLength=max;
   if(key==='jiraId'||key==='jiraName'||key==='slackId'){input.type='hidden';wrap.hidden=true;}
   if(key==='name')input.required=true;
   if(['name','role','projects'].includes(key))input.addEventListener('input',updateSummary);
   if(key==='email')input.type='email';
   if(key==='aliases')input.placeholder='Полина, Поля';
   // «Имя в Zoom»: empty means Petya matches the name himself (shown as a hint); a chosen one wins. Names seen
   // in meetings are offered in the list.
   if(key==='zoomName'){input.setAttribute('list','team-zoom-names');input.placeholder='Определю сам по имени';input.dataset.member=member.name||'';wrap.title='Как человек подписан в Zoom. Можно несколько через запятую.';}
   if(key==='projects')input.placeholder='Название проекта, ключ Jira';
   if(key==='responsibilities'){input.rows=2;input.placeholder='Например: QA, проверка релизных сборок Android';}
   input.addEventListener('invalid',()=>{details.open=true;});
   wrap.append(input);editor.append(wrap);
  }
  addAccounts(editor,member);
  window.paintZoomNames?.();
  updateSummary();
  const actions=document.createElement('div');actions.className='actions team-member-wide';
  const remove=document.createElement('button');remove.type='button';remove.className='quiet';remove.textContent='Удалить участника';remove.onclick=()=>{setDirty(true);card.remove();status.textContent='Изменения не сохранены.';};
  actions.append(remove);editor.append(actions);details.append(summary,editor);card.append(details);list.append(card);return card;
 }
 // «В сервисах»: how the person appears in each service — one row per service. Slack and Jira are always shown
 // and can be linked here (Slack member ID, a person found in Jira); other services add their own rows.
 const SERVICES={slack:'Slack',jira:'Jira',telegram:'Telegram',zoom:'Zoom',asana:'Asana',notion:'Notion',confluence:'Confluence',gmail:'Почта',github:'GitHub'};
 const FIELDS={name:'Имя',handle:'Ник',title:'Должность',email:'Email',id:'ID'};
 const node=(tag,className,text)=>{const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;};
 function addAccounts(editor,member){
  const photo=node('input');photo.type='hidden';photo.dataset.field='photo';photo.value=member.photo||'';editor.append(photo);
  const hidden=node('input');hidden.type='hidden';hidden.dataset.field='accounts';hidden.value=member.accounts&&Object.keys(member.accounts).length?JSON.stringify(member.accounts):'';editor.append(hidden);
  const field=key=>editor.querySelector('[data-field="'+key+'"]');
  const read=()=>{try{return JSON.parse(hidden.value||'{}');}catch{return {};}};
  const write=next=>{hidden.value=Object.keys(next).length?JSON.stringify(next):'';};
  const mark=()=>{setDirty(true);status.textContent='Изменения не сохранены.';};
  const box=node('div','team-accounts team-member-wide');box.append(node('div','team-accounts-title','В сервисах'));
  const rows=new Map();
  function paint(service){
   const entry=read()[service]||{},row=rows.get(service);row.list.replaceChildren();
   const shown=Object.entries(FIELDS).filter(([k])=>entry[k]);
   if(!shown.length)row.list.append(node('dd','team-account-empty','Не связан'));
   for(const [key,label] of shown){const dd=node('dd',key==='id'?'mono':'',entry[key]);if(key==='id'){dd.title='Скопировать';dd.tabIndex=0;dd.onclick=()=>navigator.clipboard?.writeText(entry[key]).catch(()=>{});}row.list.append(node('dt',null,label),dd);}
   row.unlink.hidden=!shown.length;row.link.textContent=shown.length?'Изменить':'Связать';
  }
  function unlinkService(service){const next=read();delete next[service];write(next);if(service==='jira'){field('jiraId').value='';field('jiraName').value='';}if(service==='slack')field('slackId').value='';mark();paint(service);}
  function addRow(service){
   const item=node('div','team-account'),label=node('span','team-account-service',SERVICES[service]||service),list=node('dl'),tools=node('div','team-account-tools'),panel=node('div','team-account-link');panel.hidden=true;
   const link=node('button','quiet','Связать');link.type='button';const unlink=node('button','quiet','Отвязать');unlink.type='button';unlink.title='Убрать связь с '+(SERVICES[service]||service);unlink.onclick=()=>{panel.hidden=true;unlinkService(service);};
   tools.append(link,unlink);const main=node('div','team-account-main');main.append(list,panel);item.append(label,main,tools);box.append(item);rows.set(service,{list,link,unlink,panel});
   if(service==='jira')jiraLink(panel,link);else if(service==='slack')slackLink(panel,link);else link.hidden=true;
   paint(service);
  }
  // Jira: search people in the allowed projects and pick one.
  function jiraLink(panel,open){
   const query=node('input');query.type='search';query.placeholder='Имя или фамилия в Jira';query.maxLength=200;query.setAttribute('aria-label','Найти человека в Jira');
   const find=node('button',null,'Найти');find.type='button';const message=node('p','small');message.setAttribute('role','status');const results=node('div','team-jira-results');let revision=0;
   const bar=node('div','team-account-search');bar.append(query,find);panel.append(bar,message,results);
   open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){query.value=field('jiraName').value||field('name').value||member.name||'';query.focus();query.select();}};
   query.addEventListener('input',e=>{e.stopPropagation();revision++;results.replaceChildren();message.textContent='';});
   query.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();find.click();}if(e.key==='Escape'){e.stopPropagation();panel.hidden=true;}});
   find.onclick=async()=>{const current=++revision;results.replaceChildren();if(query.value.trim().length<2){message.textContent='Введите хотя бы две буквы имени.';return;}find.disabled=true;message.textContent='Ищу людей в доступных проектах Jira…';
    try{const found=await window.petya.teamJiraSearch(query.value);if(current!==revision||!panel.isConnected)return;message.textContent=found.length?'Выберите человека:':'Никого не найдено. Попробуйте фамилию или написание имени в Jira.';
     for(const person of found){const choice=node('button',null,person.name+' · '+person.projects.join(', '));choice.type='button';choice.title=person.name+' · '+person.id;
      choice.onclick=()=>{field('jiraId').value=person.id;field('jiraName').value=person.name;const next=read();next.jira={id:person.id,name:person.name};write(next);
       const local=field('name');if(!local.value.trim()){local.value=person.name;local.dispatchEvent(new Event('input',{bubbles:true}));}
       revision++;results.replaceChildren();message.textContent='';panel.hidden=true;mark();paint('jira');};results.append(choice);}
    }catch(e){if(current===revision)message.textContent=e.message;}finally{find.disabled=false;}};
  }
  // Slack: the member ID (Profile → ⋮ → Copy member ID).
  function slackLink(panel,open){
   const input=node('input');input.placeholder='U012ABCDEF';input.maxLength=80;input.setAttribute('aria-label','Slack member ID');
   const save=node('button',null,'Готово');save.type='button';const hint=node('p','small','В Slack: профиль человека → ⋮ → «Copy member ID».');
   const bar=node('div','team-account-search');bar.append(input,save);panel.append(bar,hint);
   open.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){input.value=field('slackId').value;input.focus();}};
   const apply=()=>{const v=input.value.trim().toUpperCase();if(v&&!/^[UW][A-Z0-9]+$/.test(v)){hint.textContent='ID выглядит как U012ABCDEF — это не имя и не ссылка.';return;}
    field('slackId').value=v;const next=read();if(v){next.slack=next.slack?.id===v?next.slack:{id:v};}else delete next.slack;write(next);panel.hidden=true;mark();paint('slack');};
   save.onclick=apply;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();apply();}if(e.key==='Escape'){e.stopPropagation();panel.hidden=true;}});
  }
  // Older cards keep the link only in the Jira/Slack fields: show it in the rows too.
  {const next=read();if(field('jiraId')?.value&&!next.jira)next.jira={id:field('jiraId').value,...(field('jiraName').value?{name:field('jiraName').value}:{})};if(field('slackId')?.value&&!next.slack)next.slack={id:field('slackId').value};write(next);}
  for(const service of ['slack','jira',...Object.keys(read()).filter(k=>k!=='slack'&&k!=='jira')])addRow(service);
  editor.append(box);
 }
 async function load(force=false){const data=await window.petya.teamList();if(dirty&&!force){status.textContent='Команда обновлена. Обновите список перед сохранением ручных правок.';$('team-save').disabled=true;return;}list.replaceChildren();data.members.forEach(add);$('team-notes').value=data.notes;loaded=true;setDirty(false);$('team-save').disabled=false;$('team-add').disabled=false;status.textContent=data.members.length?'Участников: '+data.members.length:'Добавьте коллег, чтобы Петя знал, кто за что отвечает.';}
 document.querySelector('[data-view="team"]').addEventListener('click',run(async()=>{if(!loaded)await load();}));
 $('team-add').onclick=()=>{if(list.children.length>=100){notice('Можно добавить до 100 участников.',true);return;}setDirty(true);add().querySelector('input').focus();status.textContent='Изменения не сохранены.';};
 form.addEventListener('input',()=>{setDirty(true);status.textContent='Изменения не сохранены.';});
 document.addEventListener('petya-team-updated',()=>{if(dirty){status.textContent='Петя обновил команду. У вас есть несохранённые правки — обновите список перед сохранением.';$('team-save').disabled=true;return;}load().catch(e=>notice(e.message,true));});
 const reload=document.createElement('button');reload.type='button';reload.textContent='Обновить список';reload.onclick=run(()=>load(true));$('team-add').after(reload);
 window.saveTeamNow=()=>new Promise(resolve=>{const done=()=>{document.removeEventListener('petya-team-saved',done);resolve();};document.addEventListener('petya-team-saved',done);form.requestSubmit();setTimeout(done,5000);});
 form.onsubmit=run(async()=>{const members=[...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value])));$('team-save').disabled=true;try{await window.petya.teamSave({members,notes:$('team-notes').value});setDirty(false);status.textContent='Команда сохранена. Петя учитывает её в диалоге и при подготовке задач.';}finally{$('team-save').disabled=false;document.dispatchEvent(new Event('petya-team-saved'));}});
})();
