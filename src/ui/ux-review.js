// Shared page controls. Reuse existing forms and handlers without changing their ownership.
(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const n=el('button',text,cls);n.type='button';n.onclick=fn;return n;};
 const search=(placeholder)=>{const n=el('input');n.type='search';n.placeholder=placeholder;n.setAttribute('aria-label',placeholder);return n;};
 function disclosure(node,title){const d=el('details',null,'ux-editor'),s=el('summary',title);node.before(d);d.append(s,node);d.addEventListener('invalid',()=>d.open=true,true);return d;}
 function watchList(list,apply){new MutationObserver(apply).observe(list,{childList:true,subtree:true,characterData:true});apply();}
 function filters(list,placeholder,match){const bar=el('div',null,'ux-filters'),q=search(placeholder),count=el('span',null,'small');bar.append(q,count);bar.addEventListener('input',event=>event.stopPropagation());list.before(bar);const apply=()=>{let total=0,shown=0;for(const row of list.children){if(row.matches('[data-empty]'))continue;total++;const visible=match?match(row,q.value.toLocaleLowerCase()):row.textContent.toLocaleLowerCase().includes(q.value.toLocaleLowerCase());row.classList.toggle('ux-filtered',!visible);if(visible)shown++;}count.textContent=total?(shown?'Показано: '+shown+' из '+total:'Ничего не найдено'):'';bar.classList.toggle('is-empty',!total&&!q.value);};q.oninput=apply;list.addEventListener('invalid',event=>{for(let n=event.target;n&&n!==list;n=n.parentElement){n.classList.remove('ux-filtered');if(n.tagName==='DETAILS')n.open=true;}},true);watchList(list,apply);return {bar,q,apply};}
 function segmented(host,items,onChange){const bar=el('div',null,'ux-tabs');bar.setAttribute('role','group');bar.setAttribute('aria-label','Разделы');const select=id=>{for(const b of bar.children)b.setAttribute('aria-pressed',String(b.dataset.tab===id));onChange(id);};for(const [id,title]of items){const b=button(title,()=>select(id));b.dataset.tab=id;bar.append(b);}host.append(bar);return {bar,select};}
 const day=at=>new Date(at).toLocaleDateString('ru-RU');
 // Every section keeps its own result message, including failures from asynchronous actions.
 for(const page of document.querySelectorAll('.view:not(#home)')){const result=el('p',null,'ux-page-status');result.hidden=true;result.setAttribute('role','status');page.querySelector('h1')?.after(result);}
 document.addEventListener('petya-notice',event=>{const page=document.querySelector('.view:not([hidden])');if(!page||page.id==='home')return;const n=page.querySelector('.ux-page-status');if(n){n.textContent=event.detail.message;n.hidden=false;n.classList.toggle('error',event.detail.error);}});
 // Materials: collection first, optional editor second.
 const materialForm=$('context-form'),materialCard=materialForm.closest('article');
 const materialEditor=disclosure(materialCard,'Добавить материал');
 const materials=$('sources');materials.querySelector(':scope>.intro').textContent='Заметки, переписка и встречи, которые Петя использует в ответах.';
 materials.insertBefore($('context-list'),materialEditor);materials.insertBefore(materialEditor,$('context-list'));materialEditor.id='material-editor';const materialHeading=[...materials.querySelectorAll('h2')].find(n=>n.textContent==='Сохранённые материалы');if(materialHeading)materialHeading.remove();
 const sourceFilter=el('select');
 const materialFilters=filters($('context-list'),'Поиск по материалам',(row,q)=>row.textContent.toLocaleLowerCase().includes(q)&&(!sourceFilter.value||row.dataset.source===sourceFilter.value));
 sourceFilter.setAttribute('aria-label','Источник материала');sourceFilter.add(new Option('Все источники',''));materialFilters.bar.append(sourceFilter);sourceFilter.onchange=materialFilters.apply;
 const refreshSources=()=>{const selected=sourceFilter.value;const names=[...new Set([...$('context-list').children].map(n=>n.dataset.source).filter(Boolean))];sourceFilter.replaceChildren(new Option('Все источники',''),...names.map(n=>new Option(n,n)));sourceFilter.value=names.includes(selected)?selected:'';materialFilters.apply();};new MutationObserver(refreshSources).observe($('context-list'),{childList:true});refreshSources();
 materialCard.querySelector('h2').hidden=true;materialCard.querySelector(':scope>p').textContent='Вставьте текст или загрузите файл.';
 $('context-source').setAttribute('title','Источник — подпись записи, а не автоматическая загрузка');$('source-help').hidden=true;
 materialForm.addEventListener('submit',()=>{materialEditor.open=true;});
 // Team: a searchable roster, optional service IDs, persistent save strip.
 const teamList=$('team-list');if(teamList){let project='';const teamFilters=filters(teamList,'Найти человека',(row,q)=>row.textContent.toLocaleLowerCase().includes(q)&&(!project||(row.querySelector('[data-field="projects"]')?.value||'').split(',').map(x=>x.trim()).includes(project)));const select=el('select');select.setAttribute('aria-label','Проект команды');teamFilters.bar.append(select);const addMember=$('team-add'),reloadTeam=addMember?.nextElementSibling;if(addMember){teamFilters.bar.append(addMember);if(reloadTeam?.tagName==='BUTTON')teamFilters.bar.append(reloadTeam);}select.onchange=()=>{project=select.value;teamFilters.apply();};
 const adapt=()=>{const projects=new Set();for(const row of teamList.children){for(const p of (row.querySelector('[data-field="projects"]')?.value||'').split(',').map(s=>s.trim()).filter(Boolean))projects.add(p);const fields=row.querySelector('.team-member-fields');if(fields&&!fields.querySelector('.ux-service-ids')){const d=el('details',null,'ux-service-ids team-member-wide');d.append(el('summary','Связи с сервисами'));for(const key of ['slackId']){const input=fields.querySelector('[data-field="'+key+'"]');if(input)d.append(input.closest('label'));}fields.append(d);}}
 const value=select.value;select.replaceChildren(new Option('Все проекты',''),...[...projects].sort().map(p=>new Option(p,p)));select.value=value;teamFilters.apply();};new MutationObserver(adapt).observe(teamList,{childList:true});adapt();
 const notes=$('team-notes')?.closest('article');if(notes)disclosure(notes,'Общие заметки о команде');const strip=el('div',null,'ux-save-strip');$('team-save').before(strip);strip.append($('team-save'),$('team-status'));}
 // Connection groups without moving controls out of their original form.
 const settings=$('settings'),settingsHeading=settings.querySelector('h1');settingsHeading.textContent='Настройки';
 const controls=el('div',null,'ux-settings-controls');settingsHeading.after(controls);
 let group='services',state='all';const find=search('Найти сервис или настройку'),statusFilter=el('select');statusFilter.setAttribute('aria-label','Состояние подключения');for(const [v,t]of [['all','Все'],['connected','Подключённые'],['attention','Требуют внимания']])statusFilter.add(new Option(t,v));
 const cards=()=>[...settings.querySelectorAll('article.settings-card, #computer-control')];
 const serviceIds=new Set(optionalModules.map(([id])=>id));
 const category=card=>{
   if(card.dataset.extension||serviceIds.has(card.dataset.service))return 'services';
   const name=card.querySelector('h2')?.textContent||card.querySelector(':scope>summary')?.textContent||'';
   if(card.dataset.service==='images'||/Whisper|Ollama|Zoom|Манера|модел|Распознавание|Звук встречи|Запись системного/i.test(name))return 'voice';
   return 'app';
 };
 const settingsEmpty=el('p',null,'small');controls.after(settingsEmpty);
 // First run: suggest the common work services right on the «Сервисы» tab instead of an almost empty page.
 const settingsStart=el('article',null,'card settings-start');settingsStart.append(el('h2','С чего начать'),el('p','Подключите рабочие сервисы — Петя будет брать из них контекст и ставить задачи. Остальные приложения — в каталоге.'));
 const startActions=el('div',null,'actions');for(const [id,name] of [['slack','Slack'],['jira','Jira'],['notion','Notion'],['gmail','Почта']])startActions.append(button(name,async()=>{try{await window.enableAppModule?.(id);}catch(e){notice(e.message,true);}}));startActions.append(button('Все приложения…',()=>window.openAppCatalog()));settingsStart.append(startActions);settingsEmpty.after(settingsStart);
 const settingsIntro=[...settings.querySelectorAll(':scope>p.intro')],chatExtensions=$('chat-extension-details');
 const filterSettings=()=>{
   const services=group==='services',query=find.value.trim().toLocaleLowerCase();
   let shown=false,added=false,addedService=false;
   for(const card of cards()){
     const selected=!!card.dataset.extension||serviceIds.has(card.dataset.service)&&moduleSettings['module_'+card.dataset.service]==='true';
     if(selected)added=true;if(serviceIds.has(card.dataset.service)&&moduleSettings['module_'+card.dataset.service]==='true')addedService=true;
     const connected=card.querySelector('.connection-status')?.classList.contains('connected');
     const matchesState=state==='all'||(state==='connected'?connected:!connected);
     const visible=category(card)===group&&card.textContent.toLocaleLowerCase().includes(query)&&(!services||(selected&&matchesState));
     card.classList.toggle('ux-filtered',!visible);
     if(visible&&!card.hidden)shown=true;
   }
   statusFilter.hidden=!services;catalogButton.hidden=!services;settingsEmpty.hidden=shown||services&&!added;settingsStart.hidden=!(services&&!addedService&&!query);
   for(const intro of settingsIntro)intro.hidden=!services||!settingsStart.hidden;if(chatExtensions)chatExtensions.hidden=group!=='app'||!chatExtensions.textContent.toLocaleLowerCase().includes(query);
   settingsEmpty.textContent=services&&!added?'Пока нет добавленных сервисов. Выберите приложение в каталоге.':'По этим фильтрам ничего не найдено.';
 };
 const catalogButton=button('Каталог приложений',()=>window.openAppCatalog());catalogButton.className='app-catalog-trigger';
 const settingsTabs=segmented(controls,[['services','Сервисы'],['voice','Голос и модели'],['app','Приложение']],id=>{group=id;filterSettings();});
 const filterRow=el('div',null,'ux-filters');filterRow.append(find,statusFilter,catalogButton);controls.append(filterRow);find.oninput=filterSettings;statusFilter.onchange=()=>{state=statusFilter.value;filterSettings();};
 window.revealSettings=card=>{find.value='';state='all';statusFilter.value='all';settingsTabs.select(category(card));const d=card.querySelector('.settings-disclosure');if(d)d.open=true;card.scrollIntoView({block:'nearest'});};
 for(const card of cards()){const heading=card.querySelector('h2');if(heading){heading.textContent=heading.textContent.replace(/whisper\.cpp/i,'Распознавание речи · Whisper').replace(/^Ollama$/,'Локальная модель · Ollama').replace('Zoom · звук встречи','Запись системного звука');}
 const toggle=card.querySelector('.settings-disclosure>summary');
 if(toggle&&serviceIds.has(card.dataset.service)){
   const label='Настройки '+heading.textContent;
   const gear=el('span','⚙︎','service-settings-gear');gear.title=label;gear.setAttribute('aria-hidden','true');
   toggle.append(gear);toggle.setAttribute('aria-label',label);
 }
 const source=card.querySelector('.connection-status');if(source){const meta=el('p',null,'small ux-check-time');source.after(meta);const update=()=>{const status=connectionBadge(source.textContent,[...source.classList],card.dataset.service);const summary=card.querySelector('.settings-summary-status');if(summary){summary.textContent=serviceIds.has(card.dataset.service)&&['disconnected','setup'].includes(status.state)?'Требуется настройка':serviceIds.has(card.dataset.service)&&status.state==='connected'?'Подключён':status.label;summary.title=source.textContent;}if(source.classList.contains('connected')||source.classList.contains('error')){meta.textContent='Результат проверки получен '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}filterSettings();};new MutationObserver(update).observe(source,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});update();}
 }
 $('settings-form').addEventListener('invalid',event=>{const card=event.target.closest('article.settings-card');if(card)window.revealSettings(card);},true);
 settingsTabs.select('services');document.addEventListener('petya-modules-changed',filterSettings);document.addEventListener('petya-extensions-changed',filterSettings);
 const savePanel=settings.querySelector('.settings-save-panel');if(savePanel){savePanel.classList.add('ux-save-strip');const note=el('span','Изменений нет','small');note.title='Ручные поля сохраняются этой кнопкой. Вход в сервис, переключатели модулей и проверка доступа выполняются сразу.';savePanel.append(note);const save=savePanel.querySelector('button');save.textContent='Сохранить настройки';// The save strip appears only with unsaved manual edits, and briefly confirms a save.
 let idleTimer;const idle=value=>{clearTimeout(idleTimer);savePanel.classList.toggle('is-idle',value);};idle(true);
 $('settings-form').addEventListener('input',()=>{note.textContent='Есть несохранённые изменения';save.classList.add('primary');idle(false);});document.addEventListener('petya-settings-displayed',()=>{if(savePanel.classList.contains('is-idle'))return;note.textContent='Настройки сохранены';save.classList.remove('primary');idleTimer=setTimeout(()=>idle(true),2500);});}
 // Permissions: keep long recovery advice available, without filling the whole page.
 const permissionList=$('permission-list');if(permissionList)new MutationObserver(()=>{for(const p of permissionList.querySelectorAll('p.small'))if(p.textContent.length>240&&!p.closest('details'))disclosure(p,'Как восстановить доступ');}).observe(permissionList,{childList:true});
 // Learning: separate corrections, phrase commands and reminders.
 const learning=$('learning');learning.querySelector('h1').textContent='Словарь и команды';learning.querySelector(':scope>p:not(.ux-page-status)').textContent='Исправляйте распознавание, добавляйте команды и управляйте напоминаниями.';
 const learningGroups=new Map();for(const card of learning.querySelectorAll(':scope>article')){const text=card.querySelector('h2')?.textContent||'';learningGroups.set(card,/Напоминания/.test(text)?'reminders':/словарь|исправления/i.test(text)?'dictionary':'commands');}
 const tabsHost=el('div');learning.querySelector(':scope>p:not(.ux-page-status)').after(tabsHost);const learnTabs=segmented(tabsHost,[['dictionary','Исправления фраз'],['commands','Команды'],['reminders','Напоминания']],id=>{for(const [card,tab]of learningGroups)card.classList.toggle('ux-filtered',tab!==id);});learnTabs.select('dictionary');
 const growth=$('growth-card');if(growth){growth.querySelector('h2').textContent='Уровень Пети';const update=()=>growth.hidden=!$('growth-content').textContent.trim();watchList($('growth-content'),update);}
 // Instruction scenarios: list first, editor only when requested.
 const skills=$('skills');if(skills){skills.querySelector('h1').textContent='Сценарии';skills.querySelector(':scope>p:not(.ux-page-status)').textContent='Сценарий задаёт порядок работы и формат ответа. Выберите готовый или создайте свой. Голосовые команды и исправления фраз — в разделе «Словарь и команды».';
 skills.querySelector('h2').textContent='Мои сценарии';$('instruction-new').textContent='Создать сценарий';
 const editor=$('instruction-form').closest('article');editor.classList.add('ux-scenario-editor');editor.hidden=true;$('instruction-form').querySelector('h2').textContent='Настройка сценария';
 document.addEventListener('petya-scenario-edit',()=>{editor.hidden=false;editor.scrollIntoView({block:'nearest'});});
 $('instruction-form').addEventListener('invalid',()=>editor.hidden=false,true);
 const close=button('Закрыть редактор',()=>editor.hidden=true);$('instruction-result').before(close);
 const upload=$('instruction-import'),label=upload.closest('label');label.className='file-label';label.firstChild.textContent='Импортировать файл';
 const explanation=label.nextElementSibling;if(explanation?.tagName==='P')disclosure(explanation,'Формат импорта и ограничения');
 filters($('instruction-list'),'Найти сценарий');
 const testRow=el('div',null,'ux-filters'),example=search('Пример запроса для проверки');example.type='text';const test=button('Проверить на примере',run(async()=>{if(!$('instruction-name').value||!example.value.trim())throw Error('Сохраните сценарий и введите пример запроса.');const rows=await window.petya.skillsList();const saved=rows.find(s=>s.name===$('instruction-name').value);if(!saved)throw Error('Сначала сохраните сценарий.');$('command').value='/'+saved.name+' '+example.value;view('home');await processCommand($('command').value);}));testRow.append(example,test);$('instruction-result').after(testRow);}
 // Histories: common search plus state and date filters; keep operation previews intact.
 const history=$('batch-history');let period='all',result='all',projectHistory='';const hf=filters(history,'Найти задачу или проект',(row,q)=>row.textContent.toLocaleLowerCase().includes(q)&&(!projectHistory||row.dataset.project===projectHistory)&&(period==='all'||Number(row.dataset.at)>=Date.now()-Number(period)*86400000)&&(result==='all'||row.dataset.result===result));const dates=el('select'),states=el('select');dates.setAttribute('aria-label','Период истории');states.setAttribute('aria-label','Результат действия');for(const [v,t]of [['all','За всё время'],['1','Сегодня и последние сутки'],['7','За неделю'],['30','За месяц']])dates.add(new Option(t,v));for(const [v,t]of [['all','Все результаты'],['done','Выполнено'],['attention','Требует внимания']])states.add(new Option(t,v));const hp=el('select');hp.setAttribute('aria-label','Проект истории');hp.add(new Option('Все проекты',''));hf.bar.append(dates,states,hp);hp.onchange=()=>{projectHistory=hp.value;hf.apply();};new MutationObserver(()=>{const value=hp.value;hp.replaceChildren(new Option('Все проекты',''),...[...new Set([...history.children].map(r=>r.dataset.project).filter(Boolean))].map(p=>new Option(p,p)));hp.value=value;}).observe(history,{childList:true});dates.onchange=()=>{period=dates.value;hf.apply();};states.onchange=()=>{result=states.value;hf.apply();};
 $('agents').querySelector('h1').textContent='Claude и Codex';const handoff=button('Передать задачу',()=>{view('home');$('command').value='Передай задачу Codex: ';$('command').focus();},'primary');$('refresh-agents').before(handoff);filters($('agent-history'),'Найти передачу или проект');run(refreshAgents)();
 // Computer control: distinct OS access and enabled control, with an always available stop.
 const computer=$('computer-control');const computerHelp=computer.querySelector('p.small');if(computerHelp)disclosure(computerHelp,'Команды и горячие клавиши');
 const computerState=$('computer-state');const updateControl=()=>{const off=/выключено/i.test(computerState.textContent);$('computer-stop').hidden=off;$('computer-start').hidden=!off;$('computer-command').disabled=off;};new MutationObserver(updateControl).observe(computerState,{childList:true});updateControl();
 // Drafts: destinations and one clear final action.
 $('draft-card').querySelector('.eyebrow').textContent='ПРОВЕРКА ЗАДАЧИ';$('send').textContent='Создать задачу в Jira';$('expand-draft').textContent='Разбить на несколько задач';
 const destination=el('p',null,'ux-destination');$('draft-form').before(destination);new MutationObserver(()=>{if(!$('draft-card').hidden)destination.textContent='Компания: '+($('company-tabs').querySelector('[aria-current]')?.textContent||'')+' · Проект: '+(currentDraft?.project||activeJiraRoute?.project||'указан в черновике');}).observe($('draft-card'),{attributes:true,attributeFilter:['hidden']});
 // Explicitly labelled alternatives for clarification.
 const other=button('Написать свой вариант',()=>{$('command').focus();}),cancel=button('Отменить',()=>{voiceReply=null;voiceTurn.reset();$('resolution').hidden=true;commandProgress.update('idle','Уточнение отменено');});const alternatives=el('div',null,'actions');alternatives.append(other,cancel);$('resolution').append(alternatives);

 // Projects contain the chats of the current company.
 const topicButton=button('Проекты и чаты',()=>{topicDialog.showModal();topicSearch.value='';projectAction(drawTopics)();});topicButton.id='topic-picker-button';topicSelect.hidden=true;topicSelect.before(topicButton);
 const topicDialog=el('dialog',null,'ux-topic-dialog ux-project-dialog'),topicTitle=el('h2','Проекты и чаты'),topicSearch=search('Найти чат в проекте'),topicRows=el('div');
 topicTitle.id='topic-dialog-title';topicDialog.setAttribute('aria-labelledby',topicTitle.id);
 const projectList=el('nav',null,'chat-project-list');projectList.setAttribute('aria-label','Проекты');
 const projectName=el('input');projectName.placeholder='Название проекта';projectName.maxLength=80;projectName.setAttribute('aria-label','Название нового проекта');
 const projectForm=el('form',null,'chat-project-form'),createProject=button('Добавить проект');createProject.type='submit';projectForm.append(projectName,createProject);
 const projectPane=el('section',null,'chat-project-pane');projectPane.append(el('h3','Проекты'),projectList,projectForm);
 const chatsPane=el('section',null,'chat-project-chats'),projectHeading=el('h3'),chatActions=el('div',null,'actions');
 const projectStatus=el('p',null,'small');projectStatus.setAttribute('role','status');projectStatus.hidden=true;
 function projectAction(fn){return async event=>{event?.preventDefault();projectStatus.hidden=true;const target=event?.currentTarget;try{if(target?.tagName==='BUTTON')target.disabled=true;window.chatNavigationPending=true;await fn();}catch(error){projectStatus.textContent=error.message;projectStatus.hidden=false;}finally{window.chatNavigationPending=false;if(target?.tagName==='BUTTON')target.disabled=false;}};}
 function canSwitchProject(){if(window.chatStartPending||commandProgress.busy||window.chatQueue?.active||(voiceReply&&!window.backgroundClarification)||currentDraft||workspaceBusy)throw Error('Сначала завершите текущий запрос, уточнение или очередь.');}
 async function resetProjectChat(){voiceReply=null;voiceTurn.reset();await selectDialogueTopic('');await drawTopics();}
 projectForm.onsubmit=projectAction(async()=>{canSwitchProject();await window.petya.chatProjectCreate(projectName.value);projectName.value='';await resetProjectChat();});
 const renameProject=button('Переименовать',()=>{const current=projectState.projects.find(p=>p.id===projectState.activeProjectId);const input=el('input');input.value=current.name;input.maxLength=80;input.setAttribute('aria-label','Новое название проекта');const save=button('Сохранить',projectAction(async()=>{await window.petya.chatProjectRename(current.id,input.value);await refreshTopics();await drawTopics();}));projectHeading.replaceChildren(input,save);input.focus();});
 chatActions.append(button('+ Новый чат',projectAction(async()=>{canSwitchProject();await selectDialogueTopic('');topicDialog.close();$('command').focus();})),renameProject);
 chatsPane.append(projectHeading,chatActions,topicSearch,topicRows);
 const columns=el('div',null,'chat-project-columns');columns.append(projectPane,chatsPane);
 topicDialog.append(button('Закрыть',()=>topicDialog.close(),'quiet'),topicTitle,projectStatus,columns);document.body.append(topicDialog);
 let topics=[],projectState={projects:[]};
 const renderTopics=()=>{topicRows.replaceChildren();for(const topic of topics.filter(t=>t.title.toLocaleLowerCase().includes(topicSearch.value.toLocaleLowerCase()))){
  const row=el('div',null,'ux-topic-row'),open=button(topic.title,projectAction(async()=>{canSwitchProject();await selectDialogueTopic(topic.id);topicDialog.close();})),time=el('time',day(topic.at));open.append(time);if(topic.id===projectState.activeId)open.setAttribute('aria-current','true');
  const rename=button('Переименовать',()=>{const input=el('input');input.value=topic.title;input.maxLength=160;input.setAttribute('aria-label','Название диалога');const save=button('Сохранить',projectAction(async()=>{await window.petya.dialogueRename(topic.id,input.value);await refreshTopics();await drawTopics();}));row.replaceChildren(input,save);input.focus();});
  const move=el('select');move.setAttribute('aria-label','Перенести чат «'+topic.title+'» в проект');move.add(new Option('Перенести…',''));for(const p of projectState.projects)if(p.id!==topic.projectId)move.add(new Option(p.name,p.id));move.hidden=projectState.projects.length<2;
  move.onchange=projectAction(async()=>{if(!move.value)return;canSwitchProject();await window.petya.chatProjectMove(topic.id,move.value);if(topicSelect.value===topic.id)await selectDialogueTopic('');await refreshTopics();await drawTopics();});
  row.append(open,rename,move);topicRows.append(row);
 }if(!topicRows.children.length)topicRows.textContent=topicSearch.value?'Чаты не найдены.':'В проекте пока нет чатов. Начните новый разговор.';};
 async function drawTopics(){projectState=await window.petya.dialogueTopics();topics=projectState.topics.slice().sort((a,b)=>b.at-a.at);projectHeading.textContent=projectState.projects.find(p=>p.id===projectState.activeProjectId)?.name||'Общее';projectList.replaceChildren();for(const project of projectState.projects){const b=button(project.name,projectAction(async()=>{canSwitchProject();await window.petya.chatProjectSelect(project.id);topicSearch.value='';await resetProjectChat();}));b.append(el('span',String(project.count)));b.setAttribute('aria-current',String(project.id===projectState.activeProjectId));projectList.append(b);}renderTopics();}
 topicSearch.oninput=renderTopics;
 const syncTopic=()=>{const project=topicSelect.dataset.projectName||'Общее',chat=topicSelect.value?(topicSelect.selectedOptions[0]?.textContent||'Чат'):'Новый чат';topicButton.textContent=project+' / '+chat;topicButton.title='Проекты и чаты · '+topicButton.textContent;};new MutationObserver(syncTopic).observe(topicSelect,{childList:true,attributes:true,attributeFilter:['data-project-name']});new MutationObserver(syncTopic).observe(dialogueMessages,{childList:true});syncTopic();
 // Explicit confirmation names the local change that will be undone.
 window.confirmLocalUndo=info=>new Promise(resolve=>{const dialog=el('dialog',null,'ux-topic-dialog');dialog.append(el('h2','Отменить действие?'),el('p',info.label+' · '+new Date(info.at).toLocaleString('ru-RU')));let answer=false;dialog.append(button('Отменить это действие',()=>{answer=true;dialog.close();}),button('Оставить',()=>dialog.close()));dialog.addEventListener('close',()=>{dialog.remove();resolve(answer);},{once:true});document.body.append(dialog);dialog.showModal();});
 // Batch preparation: optional source setup, compact task editors and a live review summary.
 const planControls=$('workspace-controls');disclosure(planControls,'1. Материалы и параметры проекта');
 const planSummary=el('div',null,'ux-plan-summary');$('submit-batch').parentElement.before(planSummary);
 function summarizePlan(){const rows=[...$('batch-tasks').children];let missing=0;for(const row of rows){const title=row.querySelector('.task-summary'),person=row.querySelector('.task-assignee');if(!title?.value.trim()||!person?.value)missing++;}
 planSummary.textContent='2. Задачи: '+rows.length+' · Требуют проверки: '+missing+' · 3. После проверки создайте задачи кнопкой ниже.';
 if(!frozenBatch)$('submit-batch').textContent='Создать задачи ('+rows.length+')';}
 const adaptTasks=()=>{for(const row of $('batch-tasks').children){if(row.querySelector(':scope>details'))continue;const d=el('details'),summary=el('summary');d.open=$('batch-tasks').children.length===1;const title=row.querySelector('.task-summary');const update=()=>summary.textContent=title?.value||'Новая задача';update();title?.addEventListener('input',update);d.append(summary,...row.childNodes);row.append(d);d.addEventListener('invalid',()=>d.open=true,true);}summarizePlan();};
 new MutationObserver(adaptTasks).observe($('batch-tasks'),{childList:true});$('batch-tasks').addEventListener('input',summarizePlan);$('batch-tasks').addEventListener('change',summarizePlan);adaptTasks();
 // Model setup belongs in settings, not in the routine file picker.
 const vision=$('attachment-vision')?.closest('details');if(vision){const target=settings.querySelector('[data-service="ollama"] .settings-disclosure-body');if(target)target.append(vision);}
 attachmentCard.querySelector('h2').textContent='Файлы этой темы';
 const formats=attachmentCard.querySelector('.compact-help');if(formats)formats.querySelector('summary').textContent='Поддерживаемые форматы';
 // Empty lists are a state, not blank cards.
 for(const [id,text]of [['instruction-list','Сценариев пока нет. Создайте сценарий или импортируйте файл.'],['dictionary-list','Исправлений пока нет. Добавьте правило для имени или фразы.'],['learned-list','Команд пока нет. Нажмите «Новый навык», чтобы добавить первую.']]){const list=$(id);const update=()=>{if(!list.textContent.trim())list.textContent=text;};watchList(list,update);}
window.petyaEvents.onBrowserAction(run(async state=>{view('home');if(state.service==='web'){await showDialogueReply(await window.petya.webSearchContinue());return;}const read=[...dialogueChoices.querySelectorAll('[data-browser-service]')].find(b=>b.dataset.browserService===state.service);if(!read)throw Error('Этот запрос уже закрыт. Задайте вопрос по странице заново.');read.click();}));
 const voiceCard=settings.querySelector('[data-service="whisper"] .settings-disclosure-body');if(voiceCard)voiceCard.append(previewVoice);

 const tg=$('tg-chats');if(tg){const tf=filters(tg,'Найти чат Telegram');const selection=el('span',null,'small');tf.bar.append(selection);const count=()=>selection.textContent='Выбрано: '+tg.querySelectorAll('input:checked').length;tg.addEventListener('change',count);watchList(tg,count);}
 // Place optional connection guides behind a disclosure, preserving their fields.
 for(const card of settings.querySelectorAll('[data-service="googleplay"], [data-service="web"], [data-service="gmail"]')){const body=card.querySelector('.settings-disclosure-body');if(body){const text=[...body.querySelectorAll(':scope>p')].filter(p=>!p.classList.contains('connection-status')&&!p.id&&p.textContent.length>180);if(text.length){const d=el('details',null,'compact-help');d.append(el('summary','Как это работает'));text[0].before(d);d.append(...text);}}}

 const computerLive=el('div',null,'ux-computer-live');computerLive.hidden=true;const computerLabel=el('span');computerLive.append(computerLabel,button('Стоп',()=>$('computer-stop').click()));document.querySelector('.app-chrome').insertBefore(computerLive,$('company-manage'));
 document.addEventListener('petya-computer-status',event=>{computerLive.hidden=event.detail.mode==='off';computerLabel.textContent=event.detail.mode==='desktop'?'Управление компьютером':event.detail.target?.name||'Управление приложением';});
 for(const card of settings.querySelectorAll(':scope>article.settings-card')){if(card.querySelector('input,select')&&!card.querySelector('#permission-list')){const label=el('p','Изменения сохраняются сразу','small');card.querySelector('.settings-disclosure-body')?.append(label);}}
})();
