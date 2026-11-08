// Settings of «Сборки»: Unity Build Automation (organization, project, service account key) and the state
// of the shared GitHub connection, which has its own card («GitHub»).
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='ci-builds';
 card.innerHTML='<h2>Сборки</h2><p>Запуски CI в чате: «почему упала сборка?», «что с билдом на андроид», «последние сборки», «статус CI». Перезапуск — только кнопкой в карточке.</p>'+
  '<p class="small ci-github"></p><button type="button" class="ci-open-github quiet">Настроить GitHub</button>'+
  '<h3>Unity Build Automation</h3><p class="small">Сервисный аккаунт (Administration → Service accounts) с ролью Automation User в проекте. ID организации и проекта — в Unity Cloud Dashboard.</p>'+
  '<label>ID организации<input name="ciUnityOrg" type="text" autocomplete="off" spellcheck="false"></label>'+
  '<label>ID проекта<input name="ciUnityProject" type="text" autocomplete="off" spellcheck="false"></label>'+
  '<label>Key ID<input class="ci-key-id" type="text" autocomplete="off" spellcheck="false"></label>'+
  '<label>Secret key<input class="ci-key-secret" type="password" autocomplete="off"></label>'+
  '<label><input type="checkbox" class="ci-clear">Удалить ключ Unity</label>'+
  '<button type="button" class="ci-save">Сохранить</button><p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),call=(method,...args)=>window.petya.feature('ciBuilds',method,...args);
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 async function refresh(){
  try{
   const st=await call('status');
   q('.ci-github').textContent=st.github?'GitHub подключён (общий токен из карточки «GitHub»).':'GitHub не подключён: добавьте токен в карточке «GitHub».';
   q('[name=ciUnityOrg]').value=st.org;q('[name=ciUnityProject]').value=st.project;q('.ci-key-id').value=st.keyId;
   say(st.unity?'Unity Build Automation подключён.':'Unity Build Automation не подключён.',st.unity?'connected':'');
  }catch(e){say(e.message,'error');}
 }
 q('.ci-open-github').onclick=async()=>{try{await window.extensionHost?.open('github');}catch(e){say(e.message,'error');}};
 q('.ci-save').onclick=async()=>{
  const id=q('.ci-key-id').value.trim(),secret=q('.ci-key-secret').value.trim();
  if(secret&&!id){say('Укажите Key ID сервисного аккаунта.','error');return;}
  try{await window.petya.saveSettings({ciUnityOrg:q('[name=ciUnityOrg]').value,ciUnityProject:q('[name=ciUnityProject]').value,ciUnityKey:secret?id+':'+secret:'',clear_ciUnityKey:q('.ci-clear').checked});
   q('.ci-key-secret').value='';q('.ci-clear').checked=false;await refresh();say('Сохранено.','connected');}
  catch(e){say(e.message,'error');}
 };
 document.addEventListener('petya-extensions-changed',refresh);
 refresh();
})();
