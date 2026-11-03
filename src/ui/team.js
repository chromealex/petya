(() => {
 const list=$('team-list'),form=$('team-form'),status=$('team-status');let loaded=false;
 const fields=[['name','Имя',120],['aliases','Как вы называете человека',240],['role','Роль',160],['projects','Проекты',400],['responsibilities','За что отвечает',1600],['email','Email',254],['slackId','Slack member ID (необязательно)',80],['jiraId','Jira accountId (необязательно)',160]];
 function add(member={}){
  const card=document.createElement('article');card.className='card';
  const title=document.createElement('h2');title.textContent=member.name||'Новый участник';card.append(title);
  for(const [key,label,max] of fields){const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement(key==='responsibilities'?'textarea':'input');input.dataset.field=key;input.value=member[key]||'';input.maxLength=max;if(key==='name'){input.required=true;input.oninput=()=>title.textContent=input.value||'Новый участник';}if(key==='email')input.type='email';if(key==='aliases')input.placeholder='Полина, Поля';if(key==='projects')input.placeholder='Название проекта, ключ Jira';if(key==='responsibilities')input.placeholder='Например: QA, проверка релизных сборок Android';wrap.append(input);card.append(wrap);}
  const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить участника';remove.onclick=()=>{card.remove();status.textContent='Изменения не сохранены.';};card.append(remove);list.append(card);return card;
 }
 async function load(){const data=await window.petya.teamList();list.replaceChildren();data.members.forEach(add);$('team-notes').value=data.notes;loaded=true;$('team-save').disabled=false;$('team-add').disabled=false;status.textContent=data.members.length?'Участников: '+data.members.length:'Добавьте коллег, чтобы Петя знал, кто за что отвечает.';}
 document.querySelector('[data-view="team"]').addEventListener('click',run(async()=>{if(!loaded)await load();}));
 $('team-add').onclick=()=>{if(list.children.length>=100){notice('Можно добавить до 100 участников.',true);return;}add().querySelector('input').focus();status.textContent='Изменения не сохранены.';};
 form.addEventListener('input',()=>status.textContent='Изменения не сохранены.');
 form.onsubmit=run(async()=>{const members=[...list.children].map(card=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(e=>[e.dataset.field,e.value])));$('team-save').disabled=true;try{await window.petya.teamSave({members,notes:$('team-notes').value});status.textContent='Команда сохранена. Петя учитывает её в диалоге и при подготовке задач.';}finally{$('team-save').disabled=false;}});
})();
