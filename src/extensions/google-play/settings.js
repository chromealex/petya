(()=>{
// The «Google Play Console» card of «Google Play» in «Настройки» → «Сервисы»: one «Подключить» signs in with Google;
// a service account key stays under «Другой способ». Moved here from Petya's core (src/ui/dialogue.js); the
// connection is the app's IPC (feature.cjs). Shown while the module is on (renderModules hides [data-service] cards).
const play=(method,...args)=>window.petya.feature('googlePlay',method,...args);
const playCard=document.createElement('article');playCard.className='card';playCard.dataset.service='googleplay';playCard.dataset.foldGuides='';
const playTitle=document.createElement('h2');playTitle.textContent='Google Play Console';
const playHelp=document.createElement('p');playHelp.textContent='Петя читает ANR из Android vitals. Войдите аккаунтом Google, у которого есть доступ к приложениям в Play Console.';
const playStatus=document.createElement('p');playStatus.className='connection-status';playStatus.textContent='Не подключено';
const playShow=(text,kind='')=>{playStatus.textContent=text;playStatus.className='connection-status '+kind;};
const playConnect=document.createElement('button');playConnect.type='button';playConnect.className='primary';playConnect.textContent='Подключить';
const playDisconnect=document.createElement('button');playDisconnect.type='button';playDisconnect.textContent='Отключить';
const playOther=document.createElement('details');playOther.innerHTML='<summary>Другой способ — ключ сервисного аккаунта</summary><p class="small">Включите Play Developer Reporting API в Google Cloud, дайте сервисному аккаунту право просмотра приложений в Play Console и выберите его JSON-ключ. Ключ хранится зашифрованным на этом компьютере.</p>';
const playImport=document.createElement('button');playImport.type='button';playImport.textContent='Выбрать ключ';playOther.append(playImport);
async function playCheckNow(){try{const r=await play('check');playShow('Подключено · приложений: '+r.apps.length,'connected');}catch(e){playShow(e.message,'error');}}
function playState(connected){playConnect.hidden=connected;playOther.hidden=connected;playDisconnect.hidden=!connected;}
playConnect.onclick=run(async()=>{playConnect.disabled=true;playShow('Откройте браузер и войдите в Google…');try{const settings=await play('connect');renderModules(settings);playState(true);if(settings.playApps===null)await playCheckNow();else playShow('Подключено · приложений: '+settings.playApps,'connected');}catch(e){playShow(e.message,'error');throw e;}finally{playConnect.disabled=false;}});
playImport.onclick=run(async()=>{const settings=await play('importKey');if(!settings)return;renderModules(settings);playState(!!settings.hasGooglePlay);if(settings.hasGooglePlay)await playCheckNow();});
playDisconnect.onclick=run(async()=>{await play('disconnect');playState(false);playShow('Не подключено');});
playCard.append(playTitle,playHelp,playStatus,playConnect,playDisconnect,playOther);$('settings-form').insertBefore(playCard,$('settings-form').querySelector(':scope > button'));
window.petya.settings().then(s=>{playCard.hidden=s.module_googleplay==='false';playState(!!s.hasGooglePlay);if(s.hasGooglePlay)playShow('Подключено','connected');});
})();
