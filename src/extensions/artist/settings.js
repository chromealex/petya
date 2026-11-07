(() => {
  // Художник in settings: the model download with its progress, removal, and an own Stable Diffusion server.
  // What to draw, quality and canvas are asked for in the chat («нарисуй…»).
  const card = document.createElement('article');
  card.className='card';card.dataset.extension='artist';card.id='artist-settings';
  document.getElementById('settings-form').before(card);
  const section = document.createElement('section');
  section.innerHTML = '<h2>Художник</h2><p>Рисует по просьбе в чате: «нарисуй…». Работает на этом компьютере после одной загрузки генератора и модели (около 2,2 ГБ).</p>'+
   '<p class="connection-status" id="artist-model-status" role="status"></p><progress id="artist-progress" max="100" hidden></progress>'+
   '<div class="actions"><button type="button" id="artist-download">Скачать модель</button><button type="button" id="artist-stop" hidden>Остановить</button><button type="button" id="artist-remove" class="quiet">Удалить модель</button><button type="button" id="artist-enable" class="quiet">Отключить Художника</button></div>'+
   '<details><summary>Свой сервер Stable Diffusion</summary><label>Адрес WebUI<input id="artist-url" type="url" placeholder="http://127.0.0.1:7860"></label><button id="artist-connect" type="button">Сохранить подключение</button></details>';
  card.prepend(section);
  const call = (method, ...args) => window.petya.feature('artist', method, ...args);
  let enabled = false, installed = false, busy = false;
  function paint(state = {}) {
    busy = !!state.busy;
    const downloading = busy && state.phase === 'download';
    $('artist-progress').hidden = !downloading;
    if (downloading && Number.isFinite(state.percent)) $('artist-progress').value = state.percent;
    const status = $('artist-model-status');
    status.textContent = downloading ? (state.message || 'Скачиваю…') + (Number.isFinite(state.percent) ? ' · ' + state.percent + '%' : '')
      : state.phase === 'error' ? state.message : $('artist-url').value ? 'Рисует через свой сервер ' + $('artist-url').value : installed ? 'Модель установлена · можно рисовать офлайн' : 'Модель не скачана · около 2,2 ГБ';
    status.className = 'connection-status ' + (state.phase === 'error' ? 'error' : installed || $('artist-url').value ? 'connected' : 'disconnected');
    $('artist-download').hidden = installed || downloading; $('artist-stop').hidden = !busy;
    $('artist-remove').hidden = !installed || busy; $('artist-download').disabled = $('artist-connect').disabled = busy;
  }
  function configure(state) {
    enabled = state.enabled; installed = !!state.installed;
    card.hidden = !enabled; document.dispatchEvent(new Event('petya-extensions-changed'));
    $('artist-url').value = state.url || '';
    $('artist-enable').textContent = enabled ? 'Отключить Художника' : 'Включить Художника';
    paint(state);
  }
  $('artist-enable').onclick = run(async () => configure(await call('configure', !enabled, $('artist-url').value)));
  $('artist-download').onclick = run(async () => { if (!enabled) configure(await call('configure', true, $('artist-url').value)); configure(await call('download')); });
  $('artist-stop').onclick = run(async () => { await call('stop'); configure(await call('status')); });
  $('artist-remove').onclick = run(async () => configure(await call('remove')));
  $('artist-connect').onclick = run(async () => configure(await call('configure', true, $('artist-url').value)));
  document.addEventListener('petya-extension-open',event=>{if(event.detail==='artist')call('status').then(configure).catch(error=>{$('artist-model-status').textContent=error.message;});});
  window.petyaEvents.onArtistProgress(state => { paint(state); if (state.phase === 'done' || state.phase === 'removed') call('status').then(configure).catch(() => {}); });
  call('status').then(configure).catch(error => { $('artist-model-status').textContent = error.message; });
})();
