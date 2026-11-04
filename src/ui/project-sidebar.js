(()=>{
 const home=$('home'),shell=home.querySelector('.chat-shell');
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(label,fn)=>{const b=node('button',label);b.type='button';b.onclick=fn;return b;};
 const panel=node('section',null,'project-sidebar');panel.setAttribute('aria-label','Проекты и чаты');panel.id='project-sidebar';
 const head=node('div',null,'project-sidebar-head'),title=node('strong','Проекты'),status=node('p',null,'project-sidebar-status');status.hidden=true;status.setAttribute('role','status');
 const toggle=button('›',()=>setCollapsed(!home.classList.contains('projects-collapsed')));toggle.className='project-sidebar-toggle';toggle.setAttribute('aria-controls',panel.id);
 const close=button('‹',()=>setCollapsed(true));close.title='Свернуть проекты';close.setAttribute('aria-label',close.title);head.append(title,close);
 const manage=button('+ Проект',()=>window.openProjectSettings());manage.title='Добавить проект';
 const search=node('input');search.type='search';search.placeholder='Поиск по всем чатам';search.setAttribute('aria-label',search.placeholder);search.maxLength=200;
 const list=node('nav',null,'project-sidebar-tree');list.setAttribute('aria-label','Чаты по проектам');
 panel.append(head,manage,search,status,list);home.prepend(panel);home.append(toggle);home.classList.add('with-project-sidebar');const chatTitle=node('span',null,'chat-title-label');shell.querySelector('.chat-heading').append(chatTitle);topicControls.hidden=true;dialogueTitle.hidden=true;const syncTitle=()=>{chatTitle.textContent=topicSelect.value?(topicSelect.selectedOptions[0]?.textContent||'Чат'):'Новый чат';};new MutationObserver(syncTitle).observe(topicSelect,{childList:true});syncTitle();
 function setCollapsed(value){home.classList.toggle('projects-collapsed',value);toggle.setAttribute('aria-expanded',String(!value));toggle.title=value?'Показать проекты':'Свернуть проекты';toggle.setAttribute('aria-label',toggle.title);try{localStorage.setItem('petya-projects-collapsed',String(value));}catch{}}
 let collapsed=false;try{collapsed=localStorage.getItem('petya-projects-collapsed')==='true';}catch{}setCollapsed(collapsed||matchMedia('(max-width:800px)').matches);
 const guard=()=>{if(window.chatStartPending||commandProgress.busy||chatQueue?.active||(voiceReply&&!window.backgroundClarification)||currentDraft||workspaceBusy)throw Error('Завершите текущий запрос, уточнение или очередь перед переключением.');};
 const action=fn=>async()=>{status.hidden=true;try{guard();window.chatNavigationPending=true;await fn();}catch(e){status.textContent=e.message;status.hidden=false;}finally{window.chatNavigationPending=false;}};
 let revision=0,timer,latestState;
 async function refresh(){const revisionAtStart=++revision;try{const state=await window.petya.chatNavigation(search.value);if(revisionAtStart!==revision)return;latestState=state;draw(state);await refreshContext();}catch(e){if(revisionAtStart===revision){status.textContent=e.message;status.hidden=false;}}}
 const expanded=new Set();let archiveMode=false,dragging='';
 const archiveButton=button('Архив',()=>{archiveMode=!archiveMode;archiveButton.textContent=archiveMode?'← Все проекты':'Архив';refresh();});archiveButton.className='project-archive-toggle';panel.append(archiveButton);
 const menu=node('div',null,'project-context-menu');menu.hidden=true;menu.setAttribute('role','menu');document.body.append(menu);
 const menuPaths={pin:'M8 3h8l-1 6 3 4v2H6v-2l3-4-1-6M12 15v6',unpin:'M3 3l18 18M9 3h7l-1 6 3 4v2h-3M6 15v-2l2-3M12 15v6',rename:'M4 20l4-1L20 7l-3-3L5 16l-1 4M14 7l3 3',move:'M3 7V4h6l3 3h9v13H3V7M8 13h8m-3-3 3 3-3 3',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',archive:'M4 8v12h16V8M3 4h18v4H3V4M9 12h6',restore:'M4 8v12h16V8M3 4h18v4H3V4M12 17v-6m-3 3 3-3 3 3',add:'M12 5v14M5 12h14',folder:'M3 7V4h6l3 3h9v13H3V7'};
 function menuIcon(label){const key=label==='Закрепить'?'pin':label==='Открепить'?'unpin':label==='Переименовать'?'rename':label.startsWith('Перенести')?'move':label.startsWith('Настройки')?'settings':label==='В архив'?'archive':label==='Восстановить'?'restore':label==='Новый чат'?'add':'folder';const icon=node('span',null,'project-menu-icon');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+menuPaths[key]+'"/></svg>';return icon;}
 function closeMenu(){menu.hidden=true;}
 function openMenu(anchor,items){menu.replaceChildren();for(const [label,fn]of items){const item=button(label,()=>{closeMenu();fn();});item.prepend(menuIcon(label));item.setAttribute('role','menuitem');menu.append(item);}menu.hidden=false;const box=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-menu.offsetWidth-8,box.right-menu.offsetWidth))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,box.bottom+4))+'px';menu.querySelector('button')?.focus();}
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!e.target.closest('.project-more'))closeMenu();});
 menu.onkeydown=e=>{if(e.key==='Escape'){closeMenu();return;}const items=[...menu.children],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();items[(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}};
 function more(label,items){const b=button('',()=>openMenu(b,items()));b.innerHTML='<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>';b.className='project-more';b.title=label;b.setAttribute('aria-label',label);b.setAttribute('aria-haspopup','menu');return b;}
 async function archive(kind,id,value){await window.petya.chatArchive(kind,id,value);await refreshTopics();if(!topicSelect.value)await selectDialogueTopic('');await refresh();}
 function renameChat(t){const dialog=node('dialog',null,'ux-topic-dialog chat-rename-dialog'),form=node('form'),input=node('input');input.value=t.title;input.maxLength=160;input.required=true;input.setAttribute('aria-label','Название чата');const save=node('button','Сохранить');save.type='submit';const error=node('p');form.append(node('h2','Название чата'),input,error,button('Отмена',()=>dialog.close()),save);form.onsubmit=async e=>{e.preventDefault();try{await window.petya.dialogueRename(t.id,input.value);dialog.close();await refreshTopics();await refresh();}catch(e){error.textContent=e.message;}};dialog.append(form);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();input.focus();}
 function chooseDestination(t,anchor){openMenu(anchor,latestState.projects.filter(p=>!p.archived&&p.id!==t.projectId).map(p=>[p.name,action(async()=>{await window.petya.chatReorder(t.id,p.id,'');await refreshTopics();await refresh();})]));}
 function bindDrop(target,projectId,beforeId=''){
  target.ondragover=e=>{if(dragging){e.preventDefault();e.stopPropagation();target.classList.add('chat-drop-target');e.dataTransfer.dropEffect='move';}};
  target.ondragleave=()=>target.classList.remove('chat-drop-target');
  target.ondrop=e=>{target.classList.remove('chat-drop-target');if(!dragging)return;e.preventDefault();e.stopPropagation();const id=dragging;dragging='';action(async()=>{await window.petya.chatReorder(id,projectId,beforeId);await refreshTopics();await refresh();})();};
 }
 function chatRow(t){const row=node('div',null,'project-chat-row'),b=button('',action(async()=>{if(t.archived||latestState.projects.find(p=>p.id===t.projectId)?.archived)throw Error('Сначала восстановите чат или проект из архива через меню «…».');await selectDialogueTopic(t.id);if(t.job)await window.petya.chatJobAcknowledge(t.id,t.job.at);await refresh();if(t.index>=0)await window.jumpToChatMessage(t.index);if(matchMedia('(max-width:800px)').matches)setCollapsed(true);}));b.className='project-sidebar-chat';b.title=t.title;b.setAttribute('aria-current',String(t.id===latestState.activeId));if(t.pinned)b.prepend(node('span','⌁ ','chat-pin-mark'));
  const label=node('span',t.title,'project-chat-title');b.append(label);titleSizes.observe(label);
  if(t.job){const running=['running','queued'].includes(t.job.state),unread=!t.job.acknowledged&&['done','attention'].includes(t.job.state);if(running||unread){b.dataset.jobState=t.job.state;const description=t.job.state==='running'?'В процессе':t.job.state==='queued'?'В очереди':t.job.state==='attention'?'Нужно внимание':'Работа завершена';b.setAttribute('aria-label',t.title+' — '+description);if(unread){const dot=node('span',null,'chat-job-dot');dot.dataset.state=t.job.state;dot.title=description;dot.setAttribute('aria-hidden','true');row.append(dot);}}}if(t.snippet)b.append(node('small',t.snippet));
  let options;options=more('Действия с чатом «'+t.title+'»',()=>t.archived?[
   ['Восстановить',action(()=>archive('chat',t.id,false))],['Переименовать',()=>renameChat(t)]
  ]:[
   [t.pinned?'Открепить':'Закрепить',action(async()=>{await window.petya.chatPin(t.id,!t.pinned);await refresh();})],
   ['Переименовать',()=>renameChat(t)],['Перенести в проект…',()=>chooseDestination(t,options)],
   ['Настройки проекта',()=>window.openProjectSettings(t.projectId)],['В архив',action(()=>archive('chat',t.id,true))]
  ]);row.append(b,options);row.dataset.chatId=t.id;
  row.draggable=!t.archived&&!['running','queued'].includes(t.job?.state);row.ondragstart=e=>{dragging=t.id;e.dataTransfer.setData('application/x-petya-chat',t.id);e.dataTransfer.effectAllowed='move';};row.ondragend=()=>{dragging='';document.querySelectorAll('.chat-drop-target').forEach(n=>n.classList.remove('chat-drop-target'));};if(!archiveMode)bindDrop(row,t.projectId,t.id);return row;
 }
 const titleSizes=new ResizeObserver(entries=>{for(const {target}of entries)target.classList.toggle('is-truncated',target.scrollWidth>target.clientWidth+1);});
 function draw(state){titleSizes.disconnect();list.replaceChildren();for(const p of [...state.projects].sort((a,b)=>Number(b.id==='general')-Number(a.id==='general')||Number(!!b.pinned)-Number(!!a.pinned))){const allRows=state.topics.filter(t=>t.projectId===p.id),rows=allRows.filter(t=>archiveMode?p.archived||t.archived:!t.archived).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(a.order??-a.at)-(b.order??-b.at));if(!archiveMode&&p.archived)continue;if(archiveMode&&!p.archived&&!rows.length&&p.id!=='general')continue;if(search.value&&!rows.length&&p.id!=='general')continue;
  const group=node('div',null,'project-sidebar-group'),bar=node('div',null,'project-sidebar-project');group.dataset.projectId=p.id;
  const select=button(p.name,action(async()=>{if(p.archived)throw Error('Восстановите проект через меню «…».');if(p.id!==state.activeProjectId){await window.petya.chatProjectSelect(p.id);await selectDialogueTopic('');}await refresh();}));
  const icon=node('img');icon.className='project-folder-icon';icon.alt='';if(p.icon?.startsWith('data:image/png;base64,'))icon.src=p.icon;else{const fallback=node('span',null,'project-folder-icon');fallback.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h6l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"/></svg>';select.prepend(fallback);}if(icon.src)select.prepend(icon);select.title=p.name;select.setAttribute('aria-current',String(p.id===state.activeProjectId));
  const newChat=action(async()=>{if(p.id!==state.activeProjectId)await window.petya.chatProjectSelect(p.id);await selectDialogueTopic('');await refresh();$('command').focus();});
  const add=button('+',newChat);add.title='Новый чат в «'+p.name+'»';add.setAttribute('aria-label',add.title);add.className='project-new-chat';add.hidden=!!p.archived;
  const options=more('Действия с проектом «'+p.name+'»',()=>p.archived?[
   ['Восстановить',action(()=>archive('project',p.id,false))],['Настройки проекта',()=>window.openProjectSettings(p.id)]
  ]:[['Новый чат',newChat],['Настройки проекта',()=>window.openProjectSettings(p.id)],...(p.id==='general'?[]:[[p.pinned?'Открепить':'Закрепить',action(async()=>{await window.petya.chatProjectPin(p.id,!p.pinned);await refresh();})],['В архив',action(()=>archive('project',p.id,true))]])]);bar.append(select,add,options);group.append(bar);if(!archiveMode)bindDrop(bar,p.id);
  const pinned=rows.filter(t=>t.pinned),ordinary=rows.filter(t=>!t.pinned);const visible=search.value||expanded.has(p.id)?ordinary:ordinary.slice(0,5);for(const t of [...pinned,...visible])group.append(chatRow(t));
  if(!search.value&&ordinary.length>5){const all=button(expanded.has(p.id)?'Свернуть':'View all ('+ordinary.length+')',()=>{expanded.has(p.id)?expanded.delete(p.id):expanded.add(p.id);draw(state);});all.className='project-view-all';group.append(all);}
  if(!rows.length&&p.id===state.activeProjectId)group.append(node('small','Пока нет чатов'));list.append(group);
 }if(!list.children.length)list.append(node('p','Ничего не найдено'));}
 search.oninput=()=>{++revision;clearTimeout(timer);timer=setTimeout(refresh,180);};
 // Show actual source bindings; do not infer a Jira/Slack association from a name.
 const context=node('details',null,'chat-project-context'),summary=node('summary','Контекст'),body=node('div',null,'chat-context-body');context.append(summary,body);shell.querySelector('.chat-heading').after(context);
 let contextRevision=0;
 async function refreshContext(){const current=++contextRevision;const value=await window.petya.chatProjectContext();if(current!==contextRevision)return;
  summary.textContent='Контекст'+(value.jira?' · '+value.jira:'')+(value.channels.length?' · Slack: '+value.channels.length:'')+(value.files.length?' · Файлы: '+value.files.length:'');
  body.replaceChildren();body.append(node('p','Проект: '+value.projectName));
  const sources=node('div',null,'chat-context-sources');sources.append(node('span','Jira: '+(value.jira||'не выбран')),node('span','Slack: '+(value.channels.map(c=>'#'+c.name).join(', ')||'каналы не выбраны')));body.append(sources);
  if(value.effectiveName)body.append(node('p','Связи рабочего проекта: '+value.effectiveName));
  if(value.files.length){const files=node('ul');for(const file of value.files)files.append(node('li',file.name+(file.scope==='draft'?' · прикреплён к следующему запросу':'')));body.append(files);}else body.append(node('p','В этом чате нет прикреплённых файлов.'));
  body.append(node('p','Петя также может использовать сохранённые материалы компании. Ссылки на источники появляются под ответом, когда они доступны.','small'));
  if(value.context)body.append(node('p',value.context));if(value.folder)body.append(node('p','Папка: '+value.folder));if(value.disabledServices.length)body.append(node('p','Отключены для проекта: '+value.disabledServices.join(', '),'small'));body.append(button('Настройки проекта',()=>window.openProjectSettings(value.projectId)));
  const materials=button('Открыть материалы',()=>view('sources')),connections=button('Настроить подключения',()=>view('settings'));const links=node('div',null,'chat-context-links');links.append(materials,connections);body.append(links);

 }
 document.addEventListener('petya-dialogue-state',refresh);document.addEventListener('petya-chat-job',()=>{clearTimeout(timer);timer=setTimeout(refresh,80);});
 document.addEventListener('petya-project-settings',refresh);
 document.addEventListener('petya-view',()=>{if(!home.hidden)refresh();});
 new MutationObserver(()=>{if(context.open)refreshContext().catch(()=>{});}).observe($('attachment-list'),{childList:true});
 refresh();
})();
