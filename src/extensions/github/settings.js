// Settings of the shared GitHub connection: one fine-grained token for «Сборки» and «Pull requests»
// and the default repositories. The token is a secret: the form only says whether one is stored.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='github';
 card.innerHTML='<h2>GitHub</h2><p>Одно подключение для «Сборок» (GitHub Actions) и «Pull requests». Нужен fine-grained токен (Settings → Developer settings → Fine-grained tokens) с доступом к нужным репозиториям.</p>'+
  '<p class="small github-permissions"></p>'+
  '<label>Токен GitHub<input name="githubToken" type="password" autocomplete="off" placeholder="github_pat_…"></label>'+
  '<label><input type="checkbox" class="github-clear">Удалить токен</label>'+
  '<label>Репозитории по умолчанию<input name="githubRepos" type="text" autocomplete="off" spellcheck="false" placeholder="owner/repo, owner/other"></label>'+
  '<p class="small github-project"></p>'+
  '<button type="button" class="github-save">Сохранить</button> <button type="button" class="github-check quiet">Проверить</button><p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]'),call=(method,...args)=>window.petya.feature('githubConnection',method,...args);
 const say=(text,kind='')=>{status.textContent=text;status.className='connection-status'+(kind?' '+kind:'');};
 async function refresh(){
  try{
   const st=await call('status');
   q('.github-permissions').textContent='Права токена: '+st.permissions+'.';
   q('[name=githubRepos]').value=st.repos.join(', ');
   q('.github-project').textContent=st.repos.length?'':st.project?'Без списка берётся репозиторий проекта: '+st.project+'.':'Без списка берётся репозиторий из git remote текущего проекта, если он на GitHub.';
   say(st.connected?'Токен сохранён.':'Токен не задан.',st.connected?'connected':'');
  }catch(e){say(e.message,'error');}
 }
 q('.github-save').onclick=async()=>{
  try{await window.petya.saveSettings({githubToken:q('[name=githubToken]').value,githubRepos:q('[name=githubRepos]').value,clear_githubToken:q('.github-clear').checked});q('[name=githubToken]').value='';q('.github-clear').checked=false;await refresh();say('Сохранено.','connected');}
  catch(e){say(e.message,'error');}
 };
 q('.github-check').onclick=async()=>{
  const b=q('.github-check');b.disabled=true;say('Проверяю…');
  try{const r=await call('check');say('Подключено как '+r.login+'.'+(r.missing.length?' Нет доступа: '+r.missing.join(', ')+'.':''),r.missing.length?'error':'connected');}
  catch(e){say(e.message,'error');}finally{b.disabled=false;}
 };
 refresh();
})();
