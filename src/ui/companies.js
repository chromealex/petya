(() => {
 let current='',settingsDirty=false;
 $('settings-form').addEventListener('input',()=>settingsDirty=true);document.addEventListener('petya-settings-displayed',()=>settingsDirty=false);const select=$('company-select');
 function render(data){current=data.activeId;select.replaceChildren();for(const c of data.companies)select.add(new Option(c.name,c.id));select.value=current;select.disabled=false;const name=data.companies.find(c=>c.id===current).name;$('company-name').value=name;$('connections-company').textContent='Подключения компании «'+name+'»';}
 const companyReady=window.petya.companies().then(render).catch(e=>notice(e.message,true));
 $('company-manage').onclick=()=>view('companies');
 $('company-create-form').onsubmit=run(async()=>{await companyReady;const c=await window.petya.companyCreate($('company-new-name').value);render(await window.petya.companies());$('company-new-name').value='';$('company-status').textContent='Компания «'+c.name+'» добавлена. Выберите её слева для переключения.';});
 $('company-rename-form').onsubmit=run(async()=>{await companyReady;render(await window.petya.companyRename(current,$('company-name').value));$('company-status').textContent='Название сохранено.';});
 select.onchange=run(async()=>{const target=select.value;select.disabled=true;try{
  if(settingsDirty||$('team-status').textContent==='Изменения не сохранены.')throw Error('Сохраните изменения команды или подключений перед переключением.');
  if(currentDraft||planning||draftBusy||workspaceBusy||agentBusy||mic.active||meeting.active||window.petyaAutoMeetingActive)throw Error('Завершите текущий запрос и остановите прослушивание перед переключением компании.');
  const result=await window.petya.companySwitch(target);if(result.restarting){notice('Переключаю компанию… Петя сейчас откроется снова.');document.querySelectorAll('button,input,textarea,select').forEach(e=>e.disabled=true);}else {select.value=current;select.disabled=false;}
 }catch(e){select.value=current;select.disabled=false;throw e;}});
})();
