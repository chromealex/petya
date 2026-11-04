(()=>{
 const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
 const button=(title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;return b;};
 const dialog=el('dialog');dialog.className='ux-topic-dialog project-edit-dialog';const form=el('form'),heading=el('h2'),name=el('input'),context=el('textarea'),services=el('div'),status=el('p');heading.id='project-edit-title';dialog.setAttribute('aria-labelledby',heading.id);name.maxLength=80;name.required=true;name.placeholder='Например: Мобильное приложение';name.setAttribute('aria-label','Название проекта');context.rows=3;context.maxLength=12000;context.placeholder='Цели, важные сведения и правила работы';context.setAttribute('aria-label','Контекст проекта');services.className='project-service-checks';status.setAttribute('role','status');status.hidden=true;
 let project=null,folders=[],disabled=[];
 const folderRow=el('div'),folderLabel=el('span');folderRow.className='project-folder-row';
 const choose=button('Добавить папку',async()=>{try{const value=await window.petya.chatProjectPickFolder(project?.id||'');if(value&&!folders.includes(value)){folders.push(value);paintFolder();}}catch(e){error(e);}});folderRow.append(choose,folderLabel);
 function paintFolder(){folderLabel.replaceChildren();for(const folder of folders){const row=el('div'),text=el('span',folder);const remove=button('',()=>{folders=folders.filter(p=>p!==folder);paintFolder();});remove.className='project-folder-remove';remove.title='Убрать папку';remove.setAttribute('aria-label','Убрать папку '+folder);remove.innerHTML='<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg>';row.append(text,remove);folderLabel.append(row);}choose.disabled=folders.length>=20;}
 function error(e){status.textContent=e.message;status.hidden=false;}
 const actions=el('div');actions.className='project-editor-actions';const cancel=button('Отмена',()=>dialog.close()),save=el('button','Создать проект');save.type='submit';save.className='primary';actions.append(cancel,save);
 const label=(text,input)=>{const l=el('label',text);l.append(input);return l;};
 form.append(heading,label('Название',name),label('Контекст · необязательно',context),folderRow,el('h3','Сервисы проекта'),services,status,actions);dialog.append(form);document.body.append(dialog);
 window.openProjectSettings=async id=>{
  if(dialog.open)return;dialog.showModal();form.setAttribute('aria-busy','true');save.disabled=true;status.hidden=true;
  try{const state=await window.petya.chatProjectSettings(id||'');project=state.project;folders=project?.folders|| (project?.folder?[project.folder]:[]);disabled=project?.disabledServices||[];name.value=project?.name||'';name.readOnly=project?.id==='general';context.value=project?.context||'';heading.textContent=project?'Настройки проекта':'Новый проект';save.textContent=project?'Сохранить':'Создать проект';folderRow.hidden=project?.id==='general';paintFolder();services.replaceChildren();
   for(const service of state.services.filter(s=>s.connected)){const input=el('input');input.type='checkbox';input.dataset.projectService=service.id;input.checked=!disabled.includes(service.id);const row=el('label');row.className='check';row.append(input,document.createTextNode(service.name));services.append(row);}
   if(!services.children.length)services.append(el('p','Нет подключённых сервисов. Их можно добавить в «Подключениях».'));
   save.disabled=false;name.focus();
  }catch(e){error(e);}finally{form.removeAttribute('aria-busy');}
 };
 form.onsubmit=async event=>{event.preventDefault();status.hidden=true;save.disabled=true;try{
  const checks=[...services.querySelectorAll('input')],shown=new Set(checks.map(c=>c.dataset.projectService));const disabledServices=[...disabled.filter(id=>!shown.has(id)),...checks.filter(c=>!c.checked).map(c=>c.dataset.projectService)];
  const result=await window.petya.chatProjectSave({id:project?.id||'',name:name.value,context:context.value,folders,disabledServices});dialog.close();if(!project)await selectDialogueTopic('');await refreshTopics();document.dispatchEvent(new Event('petya-project-settings'));if(result.activeId)await window.restoreChatJob?.(result.activeId);
 }catch(e){error(e);}finally{save.disabled=false;}};
 const picker=$('topic-picker-button');if(picker)picker.onclick=()=>window.openProjectSettings(topicSelect.dataset.projectId||'general');
})();
