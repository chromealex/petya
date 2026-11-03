(() => {
 const node=connectionNode,button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=run(fn);return b;};
 const form=$('settings-form'),card=node('article','','card');card.dataset.service='asana';
 const status=node('p','Не подключено','connection-status');status.setAttribute('role','status');
 const connect=button('Подключить Asana',()=>connectCloudService('asana',status,connect,form));connect.className='primary';
 const disconnect=button('Отключить Asana',async()=>{await window.petya.serviceOAuthDisconnect('asana');status.textContent='Не подключено';status.className='connection-status disconnected';reset();});
 const check=button('Проверить подключение',async()=>{const r=await window.petya.checkSavedConnection('asana');status.textContent=r.message;status.className='connection-status '+r.state;});
 card.append(node('h2','Asana'),node('p','Проекты и задачи · чтение, создание и изменение'),status,connect,check,disconnect,node('p','Вход через браузер. Ключи создавать не нужно. Каждая запись в Asana требует подтверждения предпросмотра.','small'));
 form.insertBefore(card,form.querySelector(':scope > button'));
 window.petya.settings().then(s=>{if(s.hasAsanaOAuth)status.textContent='Настроено · проверка не выполнена';}).catch(e=>notice(e.message,true));
 const page=node('section','','view');page.id='asana';page.hidden=true;
 card.append(button('Открыть задачи Asana',()=>view('asana')));
 const project=document.createElement('select');project.setAttribute('aria-label','Проект Asana');
 const tasks=document.createElement('select');tasks.setAttribute('aria-label','Задача Asana');tasks.add(new Option('Новая задача',''));
 const title=document.createElement('input'),notes=document.createElement('textarea'),due=document.createElement('input'),done=document.createElement('input');
 title.maxLength=1000;notes.maxLength=50000;notes.rows=8;due.type='date';done.type='checkbox';
 const field=(label,input)=>{const l=node('label',label);l.append(input);return l;};
 const result=node('p','','small'),preview=node('div','','card');preview.hidden=true;
 let projectNext=null,taskNext=null,previewId=null,busy=false,version=0;
 function invalidate(){previewId=null;preview.hidden=true;preview.replaceChildren();version++;}
 function clearEditor(){title.value='';notes.value='';due.value='';done.checked=false;invalidate();}
 function reset(){project.replaceChildren();tasks.replaceChildren(new Option('Новая задача',''));projectNext=taskNext=null;clearEditor();}
 async function action(fn){if(busy)return;busy=true;page.querySelectorAll('button,select,input,textarea').forEach(x=>x.disabled=true);try{await fn();}catch(e){result.textContent=e.message;}finally{busy=false;page.querySelectorAll('button,select,input,textarea').forEach(x=>x.disabled=false);moreProjects.hidden=!projectNext;moreTasks.hidden=!taskNext;}}
 async function loadTasks(append=false){const r=await window.petya.asanaTasks(project.value,append?taskNext:null);if(!append){tasks.replaceChildren(new Option('Новая задача',''));clearEditor();}r.items.forEach(t=>tasks.add(new Option((t.completed?'✓ ':'')+t.name,t.gid)));taskNext=r.next;}
 const load=button('Загрузить проекты',()=>action(async()=>{reset();const r=await window.petya.asanaProjects();r.items.forEach(p=>project.add(new Option(p.name+(p.archived?' (архив)':''),p.gid)));projectNext=r.next;if(project.value)await loadTasks();result.textContent=r.items.length?'Выберите проект и задачу или создайте новую.':'Нет доступных проектов.';}));
 const moreProjects=button('Ещё проекты',()=>action(async()=>{if(!projectNext)return;const r=await window.petya.asanaProjects(projectNext);r.items.forEach(p=>project.add(new Option(p.name,p.gid)));projectNext=r.next;}));moreProjects.hidden=true;
 const moreTasks=button('Ещё задачи',()=>action(()=>loadTasks(true)));moreTasks.hidden=true;
 project.onchange=()=>action(()=>loadTasks());
 tasks.onchange=()=>action(async()=>{clearEditor();if(!tasks.value)return;const t=await window.petya.asanaTask(tasks.value);title.value=t.name;notes.value=t.notes||'';due.value=t.due_on||'';done.checked=t.completed;});
 for(const x of [title,notes,due,done])x.oninput=invalidate;
 const context=button('Добавить задачу в контекст',()=>action(async()=>{if(!tasks.value)throw new Error('Выберите существующую задачу.');await window.petya.asanaContext(tasks.value);await refreshContexts();result.textContent='Задача добавлена в контекст Пети.';}));
 const prepare=button('Проверить перед отправкой',()=>action(async()=>{
  invalidate();const r=await window.petya.asanaPreview({project:project.value,task:tasks.value||null,name:title.value,notes:notes.value,due_on:due.value||null,completed:done.checked});previewId=r.id;
  preview.append(node('h2',r.before?'Изменение задачи':'Новая задача'),node('p','Проект: '+r.project));
  const labels={name:'Название',notes:'Описание',due_on:'Срок',completed:'Завершена'};
  for(const key of Object.keys(labels)){if(r.before&&r.before[key]===r.after[key])continue;preview.append(node('h3',labels[key]));if(r.before)preview.append(node('p','Было: '+String(r.before[key]??'—')));preview.append(node('p','Будет: '+String(r.after[key]??'—')));}
  const submit=button(r.before?'Подтвердить изменение':'Создать задачу в Asana',()=>action(async()=>{const id=previewId;if(!id)throw new Error('Подготовьте предпросмотр заново.');invalidate();const saved=await window.petya.asanaApply(id);result.textContent='Сохранено в Asana · '+saved.url;await loadTasks();}));submit.className='primary';preview.append(submit);preview.hidden=false;
 }));
 page.append(node('h1','Asana'),node('p','Выберите проект, загрузите задачу или подготовьте новую. Изменяются только название, описание, срок и отметка выполнения.'),load,moreProjects,field('Проект',project),field('Задача',tasks),moreTasks,context,field('Название',title),field('Описание',notes),field('Срок',due),field('Завершена',done),prepare,result,preview);
 document.querySelector('main').insertBefore(page,document.querySelector('main footer'));
})();
