(() => {
 document.documentElement.dataset.platform=window.petyaPlatform;
 let current='',settingsDirty=false,switching=false;
 const tabs=$('company-tabs');
 function setBusy(busy){switching=busy;tabs.querySelectorAll('button').forEach(button=>button.disabled=busy);}
 async function switchCompany(target){
  if(switching)return;
  if(window.chatQueue?.items.length||window.chatQueue?.active)throw Error('Завершите или удалите запросы в очереди перед сменой компании.');
  if(target===current){view('home');return;}
  setBusy(true);
  try{
   // Nothing to save by hand: pending settings are saved now, team edits are saved before the switch.
   await window.flushSettings?.();if([ 'Изменения не сохранены.',(window.t||String)('Изменения не сохранены.')].includes($('team-status').textContent))await window.saveTeamNow?.();
   if(mic.active)throw Error('Выключите микрофон перед переключением компании.');if(meeting.active||window.petyaAutoMeetingActive)throw Error('Остановите запись системного звука перед переключением компании.');if(currentDraft||workspaceBusy)throw Error('Завершите или закройте черновик в Ассистенте.');if(planning||draftBusy||agentBusy)throw Error('Дождитесь завершения текущего запроса; статус показан в верхней панели.');
   const result=await window.petya.companySwitch(target);
   if(result.switching){notice('Переключаю компанию…');document.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=true);}
   else setBusy(false);
  }catch(error){setBusy(false);throw error;}
 }
 const renameCard=$('company-rename-form').closest('article');renameCard.hidden=true;
 const companyList=document.createElement('div');companyList.id='company-list';$('company-rename-form').closest('article').before(companyList);
 function render(data){
  current=data.activeId;tabs.replaceChildren();companyList.replaceChildren();
  for(const company of data.companies){
   const tab=document.createElement('button');tab.type='button';tab.className='company-tab';tab.title=company.name;tab.dataset.companyId=company.id;
   // Slack workspace icon when available, otherwise the first letter.
   const badge=document.createElement(company.icon?'img':'span');badge.className='company-icon';badge.setAttribute('aria-hidden','true');if(company.icon){badge.src=company.icon;badge.alt='';}else badge.textContent=company.name.trim().slice(0,1).toLocaleUpperCase();
   const label=document.createElement('span');label.textContent=company.name;tab.append(badge,label);
   if(company.id===current)tab.setAttribute('aria-current','true');const row=document.createElement('div');row.className='ux-company-row';const title=document.createElement('strong');title.textContent=company.name;const action=document.createElement('button');action.type='button';action.textContent=company.id===current?'Переименовать':'Переключиться';action.onclick=company.id===current?()=>{renameCard.hidden=false;$('company-name').focus();$('company-name').select();}:run(()=>switchCompany(company.id));row.append(title);if(company.id===current){const active=document.createElement('small');active.textContent='Текущая';row.append(active);}row.append(action);
   // Any company except the current one and the first (its data is the app's own folder) can be removed.
   if(company.id!==current&&company.id!=='default'){const remove=document.createElement('button');remove.type='button';window.asDeleteButton(remove,'Удалить компанию «'+company.name+'»: её данные переместятся в Корзину');remove.onclick=run(async()=>{const next=await window.petya.companyRemove(company.id);render(next);if(!next.cancelled)$('company-status').textContent='Компания «'+company.name+'» удалена, её данные — в Корзине.';});row.append(remove);}
   companyList.append(row);
   tab.onclick=run(()=>switchCompany(company.id));tabs.append(tab);
  }
  setBusy(false);
  const name=data.companies.find(c=>c.id===current).name;
  $('company-name').value=name;$('connections-company').textContent='Подключения компании «'+name+'»';
  tabs.querySelector('[aria-current]')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 const companyReady=window.petya.companies().then(render).catch(e=>notice(e.message,true));
 // Pull the company icon (Slack, then Jira) in the background; once a day, and right after Slack or Jira is connected.
 const refreshIcon=force=>companyReady.then(()=>window.petya.companyIconRefresh(force)).then(data=>{if(!switching)render(data);}).catch(()=>{});
 refreshIcon(false);document.addEventListener('petya-connection-checked',event=>{if(['slack','jira'].includes(event.detail?.service)&&event.detail?.ok)refreshIcon(true);});
 $('company-manage').onclick=()=>view('companies');
 $('company-create-form').onsubmit=run(async()=>{await companyReady;const c=await window.petya.companyCreate($('company-new-name').value);render(await window.petya.companies());$('company-new-name').value='';$('company-status').textContent='Компания «'+c.name+'» добавлена. Выберите её вкладку сверху для переключения.';});
 $('company-rename-form').onsubmit=run(async()=>{await companyReady;render(await window.petya.companyRename(current,$('company-name').value));$('company-status').textContent='Название сохранено.';renameCard.hidden=true;});
})();
