// Settings of «Docker»: nothing to configure, only what it needs (Docker Desktop installed and running) and its
// current state. Petya downloads nothing for this app; it uses the docker command that is already installed.
(()=>{
 // The extension host may run this script twice when several cards mount it at once.
 if(document.querySelector('#settings-form>[data-extension="docker"],#settings-form [data-extension="docker"]'))return;
 const card=document.createElement('article');card.className='card';card.dataset.extension='docker';
 card.innerHTML='<h2>Docker</h2><p>Нужен установленный Docker Desktop (macOS, Windows) или Docker Engine (Linux). Петя ничего не скачивает: он работает через команду docker на этом компьютере.</p>'+
  '<p class="small">Петя только смотрит контейнеры, образы, тома и логи. Запуск, остановка, перезапуск, compose up/down и удаление висячих образов — только после подтверждения в карточке. В контейнеры Петя не заходит и команды в них не выполняет.</p>'+
  '<p class="connection-status docker-state" role="status"></p><p class="small docker-detail"></p>'+
  '<button type="button" class="docker-check quiet">Проверить</button>';
 document.getElementById('settings-form').append(card);
 const q=s=>card.querySelector(s),say=(text,kind='')=>{const n=q('.docker-state');n.textContent=text;n.className='connection-status docker-state'+(kind?' '+kind:'');};
 async function check(){
  const b=q('.docker-check');b.disabled=true;say('Проверяю Docker…');
  try{
   const st=await window.petya.feature('dockerApp','status');
   say(st.text,st.running?'connected':'error');
   const detail=q('.docker-detail');detail.textContent=[st.client,st.context?'Контекст: '+st.context:'',st.binary?'Команда: '+st.binary:''].filter(Boolean).join(' · ');detail.dataset.noI18n='';
  }catch(e){say(e.message,'error');}
  finally{b.disabled=false;}
 }
 q('.docker-check').onclick=check;
 document.addEventListener('petya-extension-open',e=>{if(e.detail==='docker')check();});
 check();
})();
