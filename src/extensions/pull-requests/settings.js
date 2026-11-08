// Settings of «Pull requests»: it uses the shared GitHub connection, so this card only shows its state
// and opens the «GitHub» card.
(()=>{
 const card=document.createElement('article');card.className='card';card.dataset.extension='pull-requests';
 card.innerHTML='<h2>Pull requests</h2><p>Спрашивайте в чате: «какие PR ждут моего ревью», «мои пулл-реквесты», «что в PR 123», «резюме пулл-реквеста». Комментарий в PR отправляется только после подтверждения в карточке.</p>'+
  '<p class="small pr-github"></p><button type="button" class="pr-open-github">Настроить GitHub</button><p class="connection-status" role="status"></p>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),status=q('[role=status]');
 async function refresh(){
  try{const st=await window.petya.feature('githubConnection','status');
   q('.pr-github').textContent=st.connected?'GitHub подключён (общий токен из карточки «GitHub»).':'GitHub не подключён: добавьте токен в карточке «GitHub».';
   status.textContent='';}
  catch{q('.pr-github').textContent='GitHub не подключён: добавьте токен в карточке «GitHub».';}
 }
 q('.pr-open-github').onclick=async()=>{try{await window.extensionHost?.open('github');}catch(e){status.textContent=e.message;status.className='connection-status error';}};
 document.addEventListener('petya-extensions-changed',refresh);
 refresh();
})();
