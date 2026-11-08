// «Запись встреч» settings: when to start the local capture and whether the microphone is recorded too,
// plus the current capture state with start/stop. Zoom is not signed in to: capture uses system audio.
(async()=>{
 await connectionsReady;
 const call=(method,...args)=>window.petya.feature('zoomBot',method,...args),card=document.createElement('article');card.className='card';card.dataset.extension='zoom-bot';
 card.innerHTML='<h2>Запись встреч</h2><p>Локальная запись забирает системный звук и ваш микрофон отдельно от чатов. После встречи Петя расшифровывает запись и сохраняет её в памяти компании. Вход в Zoom не нужен.</p><label>Начало записи<select id="zoom-bot-mode"><option value="auto">Автоматически</option><option value="ask">Сначала спрашивать</option><option value="off">Не записывать</option></select></label><label class="check"><input id="zoom-local-mic" type="checkbox">Записывать мой микрофон вместе с собеседниками</label><button type="button" id="zoom-bot-save">Сохранить</button><p id="zoom-bot-status" role="status"></p><div id="zoom-bot-actions"></div>';
 const local=document.querySelector('article[data-service="zoom"]');local.before(card);local.dataset.service='zoom-local';
 for(const name of ['zoomAutoRecord','zoomCaptureMic'])document.querySelector('[name="'+name+'"]')?.closest('label')?.setAttribute('hidden','');
 function renderLocal(value){$('zoom-bot-status').textContent=value.message;$('zoom-bot-actions').replaceChildren();for(const [label,method] of value.busy?[['Остановить и обработать','stopCapture']]:value.canStart||value.canRetry?[['Записать встречу','startCapture']]:[]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(async()=>renderLocal(await window.petya.feature('meetingMemory',method)));$('zoom-bot-actions').append(b);}}
 const initial=await call('status');$('zoom-bot-mode').value=initial.mode;$('zoom-local-mic').checked=initial.microphone;
 window.petya.feature('meetingMemory','captureStatus').then(renderLocal);
 $('zoom-bot-save').onclick=run(async()=>{await call('configure',{mode:$('zoom-bot-mode').value,microphone:$('zoom-local-mic').checked});renderLocal(await window.petya.feature('meetingMemory','captureStatus'));});
 window.petyaEvents.onLocalMeeting(renderLocal);
})().catch(e=>notice(e.message,true));
