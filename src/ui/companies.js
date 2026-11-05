(() => {
 document.documentElement.dataset.platform=window.petyaPlatform;
 let current='',settingsDirty=false,switching=false;
 const tabs=$('company-tabs');
 $('settings-form').addEventListener('input',()=>settingsDirty=true);
 document.addEventListener('petya-settings-displayed',()=>settingsDirty=false);
 function setBusy(busy){switching=busy;tabs.querySelectorAll('button').forEach(button=>button.disabled=busy);}
 async function switchCompany(target){
  if(switching)return;
  if(window.chatQueue?.items.length||window.chatQueue?.active)throw Error('Завершите или удалите запросы в очереди перед сменой компании.');
  if(target===current){view('home');return;}
  setBusy(true);
  try{
   if(settingsDirty||$('team-status').textContent==='Изменения не сохранены.')throw Error('Сохраните изменения команды или подключений перед переключением.');
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
   const tab=document.createElement('button');tab.type='button';tab.className='company-tab';tab.textContent=company.name;tab.title=company.name;tab.dataset.companyId=company.id;
   if(company.id===current)tab.setAttribute('aria-current','true');const row=document.createElement('div');row.className='ux-company-row';const title=document.createElement('strong');title.textContent=company.name;const action=document.createElement('button');action.type='button';action.textContent=company.id===current?'Переименовать':'Переключиться';action.onclick=company.id===current?()=>{renameCard.hidden=false;$('company-name').focus();$('company-name').select();}:run(()=>switchCompany(company.id));row.append(title);if(company.id===current){const active=document.createElement('small');active.textContent='Текущая';row.append(active);}row.append(action);companyList.append(row);
   tab.onclick=run(()=>switchCompany(company.id));tabs.append(tab);
  }
  setBusy(false);
  const name=data.companies.find(c=>c.id===current).name;
  $('company-name').value=name;$('connections-company').textContent='Подключения компании «'+name+'»';
  tabs.querySelector('[aria-current]')?.scrollIntoView({block:'nearest',inline:'nearest'});
 }
 const companyReady=window.petya.companies().then(render).catch(e=>notice(e.message,true));
 $('company-manage').onclick=()=>view('companies');
 $('company-create-form').onsubmit=run(async()=>{await companyReady;const c=await window.petya.companyCreate($('company-new-name').value);render(await window.petya.companies());$('company-new-name').value='';$('company-status').textContent='Компания «'+c.name+'» добавлена. Выберите её вкладку сверху для переключения.';});
 $('company-rename-form').onsubmit=run(async()=>{await companyReady;render(await window.petya.companyRename(current,$('company-name').value));$('company-status').textContent='Название сохранено.';renameCard.hidden=true;});
})();
