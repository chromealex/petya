// «Zoom» settings: what the extension adds to Petya's meeting recording (start by Zoom's meeting window, speaker
// names) and the personal room link the calendar offers for new meetings. When and how meetings are recorded is set
// in Petya's own «Запись встреч» card. Zoom is not signed in to.
(async()=>{
 await connectionsReady;
 const call=(method,...args)=>window.petya.feature('zoom',method,...args),card=document.createElement('article');card.className='card';card.dataset.extension='zoom';
 card.innerHTML='<h2>Zoom</h2><p>Когда в Zoom идёт встреча, Петя видит её окно: запись начинается сама (или Петя спросит — как выбрано в «Запись встреч»), а в расшифровке подписано, кто говорит. Вход в Zoom не нужен.</p><p class="small" id="zoom-app-status" role="status"></p><label>Личная комната Zoom<input id="zoom-personal-link" type="url" placeholder="https://…zoom.us/j/1234567890" autocomplete="off"></label><p class="small">Календарь предложит эту ссылку для новых встреч. Это одна и та же комната для всех встреч. Ссылка — в Zoom: «Встречи» → «Личная комната».</p><button type="button" id="zoom-save">Сохранить</button>';
 document.getElementById('settings-form').append(card);
 const paint=value=>{$('zoom-app-status').textContent=value.zoomInstalled?'Zoom установлен на этом компьютере.':'Zoom на этом компьютере не найден. Установите приложение Zoom, чтобы Петя видел встречи.';$('zoom-personal-link').value=value.personalLink||'';};
 paint(await call('status'));
 $('zoom-save').onclick=run(async()=>{paint(await call('configure',{personalLink:$('zoom-personal-link').value}));notice('Ссылка на личную комнату сохранена.');});
})().catch(e=>notice(e.message,true));
