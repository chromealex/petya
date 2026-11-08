(()=>{
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;return b;};
 const dialog=el('dialog');dialog.className='ux-topic-dialog project-edit-dialog';const form=el('form'),heading=el('h2'),name=el('input'),context=el('textarea'),services=el('div'),status=el('p');heading.id='project-edit-title';dialog.setAttribute('aria-labelledby',heading.id);name.maxLength=80;name.required=true;name.placeholder='Например: Мобильное приложение';name.setAttribute('aria-label','Название проекта');context.rows=3;context.maxLength=12000;context.placeholder='Цели, важные сведения и правила работы';context.setAttribute('aria-label','Контекст проекта');services.className='project-service-checks';status.setAttribute('role','status');status.hidden=true;
 let project=null,folders=[],disabled=[],inherited=null;
 // Subprojects: choose the parent; inherited folders, notes and disabled services are shown read-only.
 const parent=el('select');parent.setAttribute('aria-label','Внутри проекта');const parentLabel=el('label','Внутри проекта');parentLabel.append(parent);
 const inheritedBox=el('div');inheritedBox.className='project-inherited';inheritedBox.hidden=true;
 const folderRow=el('div'),folderLabel=el('span');folderRow.className='project-folder-row';
 const choose=button('Добавить папку',async()=>{try{const value=await window.petya.chatProjectPickFolder(project?.id||'');if(value&&!folders.includes(value)){folders.push(value);paintFolder();}}catch(e){error(e);}});folderRow.append(choose,folderLabel);
 function paintFolder(){folderLabel.replaceChildren();for(const folder of inherited&&parent.value===(project?.parentId||'')?inherited.folders:[]){const row=el('div'),text=el('span',folder);row.className='project-folder-inherited';row.title='Из проекта «'+inherited.name+'»';row.append(text,el('small','из «'+inherited.name+'»'));folderLabel.append(row);}for(const folder of folders){const row=el('div'),text=el('span',folder);const remove=button('',()=>{folders=folders.filter(p=>p!==folder);paintFolder();});remove.className='project-folder-remove';remove.title='Убрать папку';remove.setAttribute('aria-label','Убрать папку '+folder);remove.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';row.append(text,remove);folderLabel.append(row);}choose.disabled=folders.length>=20;}
 // The parent's notes and folders are shown for the selected parent; changing the parent updates the hint after saving.
 function paintInherited(){const same=inherited&&parent.value===(project?.parentId||'');inheritedBox.replaceChildren();inheritedBox.hidden=!parent.value;
  if(!parent.value)return;const title=el('strong','Наследуется из «'+(parent.selectedOptions[0]?.textContent||'')+'»');inheritedBox.append(title);
  if(same){if(inherited.context)inheritedBox.append(el('p',inherited.context.length>280?inherited.context.slice(0,280)+'…':inherited.context));inheritedBox.append(el('p',(inherited.folders.length?'Папки: '+inherited.folders.length:'Папок нет')+(inherited.disabledServices.length?' · отключено: '+inherited.disabledServices.length:''),'small'));}
  else inheritedBox.append(el('p','Папки, контекст и отключённые сервисы родителя добавятся к настройкам ниже после сохранения.','small'));}
 function error(e){status.textContent=e.message;status.hidden=false;}
 const actions=el('div');actions.className='project-editor-actions';const cancel=button('Отмена',()=>dialog.close()),save=el('button','Создать проект');save.type='submit';save.className='primary';actions.append(cancel,save);
 const label=(text,input)=>{const l=el('label',text);l.append(input);return l;};
 // Icon: what Petya found (and from which file), a picture chosen from the project's folder, or none.
 const iconRow=el('div');iconRow.className='project-icon-row';const iconImg=el('img');iconImg.alt='';iconImg.className='project-icon-preview';const iconText=el('p');iconText.className='small';
 const iconButtons=el('div');iconButtons.className='actions';const iconBtn=(text,mode)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{paintIcon(await window.petya.chatProjectIcon(project.id,mode));document.dispatchEvent(new Event('petya-project-settings'));}catch(e){error(e);}finally{b.disabled=false;}};return b;};
 const pickIcon=iconBtn('Выбрать картинку…','pick'),noIcon=iconBtn('Без иконки','none'),autoIcon=iconBtn('Найти автоматически','auto');iconButtons.append(pickIcon,autoIcon,noIcon);
 const iconLabel=el('h3','Иконка');iconRow.append(iconImg,iconText);
 function paintIcon(info){const has=/^data:image\/png;base64,/.test(info?.icon||'');iconImg.hidden=!has;if(has)iconImg.src=info.icon;
  iconText.textContent=info?.iconMode==='none'?'Без иконки.':!has?'Иконка не найдена: в папке проекта нет иконки приложения.':info.iconMode==='file'?'Выбрана вами: '+info.iconSource:'Найдена автоматически: '+info.iconSource;
  autoIcon.hidden=info?.iconMode==='auto';noIcon.hidden=info?.iconMode==='none';}
 const iconBox=el('div');iconBox.className='project-icon-box';iconBox.append(iconLabel,iconRow,iconButtons);
 const shareBox=el('div');shareBox.className='project-share';shareBox.hidden=true;
 form.append(heading,label('Название',name),parentLabel,inheritedBox,label('Контекст · необязательно',context),folderRow,iconBox,el('h3','Сервисы проекта'),services,shareBox,status,actions);dialog.append(form);document.body.append(dialog);
 window.openProjectSettings=async (id,{parentId=''}={})=>{
  if(dialog.open)return;dialog.showModal();form.setAttribute('aria-busy','true');save.disabled=true;status.hidden=true;
  try{const state=await window.petya.chatProjectSettings(id||'');project=state.project;window.paintProjectShare?.(shareBox,project);inherited=project?.inherited||null;parent.replaceChildren(new Option('— верхний уровень —',''),...(state.parents||[]).map(p=>new Option(p.name,p.id)));parent.value=project?project.parentId||'':parentId;if(parent.value!==(project?.parentId||parentId))parent.value='';parentLabel.hidden=project?.id==='general'||!(state.parents||[]).length;parent.onchange=()=>{paintInherited();paintFolder();};folders=project?.folders|| (project?.folder?[project.folder]:[]);disabled=project?.disabledServices||[];name.value=project?.name||'';name.readOnly=project?.id==='general';context.value=project?.context||'';heading.textContent=project?'Настройки проекта':parentId?'Новая подпапка':'Новый проект';save.textContent=project?'Сохранить':'Создать проект';folderRow.hidden=project?.id==='general';paintInherited();paintFolder();services.replaceChildren();
   for(const service of state.services.filter(s=>s.connected)){const input=el('input');input.type='checkbox';input.dataset.projectService=service.id;input.checked=!disabled.includes(service.id);if(inherited?.disabledServices?.includes(service.id)){input.checked=false;input.disabled=true;input.title='Отключено в проекте «'+inherited.name+'»';}const row=el('label');row.className='check';row.append(input,document.createTextNode(service.name));services.append(row);}
   if(!services.children.length)services.append(el('p','Нет подключённых сервисов. Их можно добавить в «Подключениях».'));
   iconBox.hidden=!project||project.id==='general';if(!iconBox.hidden)paintIcon(project);
   save.disabled=false;name.focus();
  }catch(e){error(e);}finally{form.removeAttribute('aria-busy');}
 };
 form.onsubmit=async event=>{event.preventDefault();status.hidden=true;save.disabled=true;try{
  const checks=[...services.querySelectorAll('input')],shown=new Set(checks.map(c=>c.dataset.projectService));const disabledServices=[...disabled.filter(id=>!shown.has(id)),...checks.filter(c=>!c.checked).map(c=>c.dataset.projectService)];
  const result=await window.petya.chatProjectSave({id:project?.id||'',name:name.value,context:context.value,folders,disabledServices:disabledServices.filter(id=>!inherited?.disabledServices?.includes(id)),parentId:parentLabel.hidden?(project?.parentId||''):parent.value});dialog.close();if(!project)await selectDialogueTopic('');await refreshTopics();document.dispatchEvent(new Event('petya-project-settings'));if(result.activeId)await window.restoreChatJob?.(result.activeId);
 }catch(e){error(e);}finally{save.disabled=false;}};
 const picker=$('topic-picker-button');if(picker)picker.onclick=()=>window.openProjectSettings(topicSelect.dataset.projectId||'general');
})();
