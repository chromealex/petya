(() => {
  const card = document.getElementById('image-install-card');
  card.classList.add('artist-not-added');
  const section = document.createElement('section');
  section.innerHTML = '<h2>Художник</h2><p>При первом рисунке Петя предложит скачать генератор и модель (около 2,2 ГБ). Следующие картины можно рисовать офлайн.</p><button type="button" id="artist-enable">Включить Художника</button><details><summary>Свой сервер Stable Diffusion</summary><label>Адрес WebUI<input id="artist-url" type="url" placeholder="http://127.0.0.1:7860"></label><button id="artist-connect" type="button">Сохранить подключение</button><button id="artist-remove" type="button">Удалить скачанную модель</button></details><form id="artist-form" hidden><label>Что нарисовать?<textarea id="artist-prompt" required maxlength="4000"></textarea></label><label>Качество<select id="artist-quality"><option value="draft">Эскиз</option><option value="standard" selected>Стандартное</option><option value="high">Высокое</option></select></label><label>Холст<select id="artist-format"><option value="square">Квадратный</option><option value="portrait">Вертикальный</option><option value="landscape">Горизонтальный</option></select></label><button id="artist-draw">Нарисовать</button></form><p id="artist-status" role="status"></p><div id="artist-result" hidden><img id="artist-preview" width="320" alt="Созданная картина"><a id="artist-download" download="Картина.png">Скачать PNG</a></div>';
  card.prepend(section);
  const call = (method, ...args) => window.petya.feature('artist', method, ...args);
  let enabled = false;
  function progress(state) {
    $('artist-status').textContent = state.message || '';
    $('artist-draw').disabled = $('artist-enable').disabled = $('artist-connect').disabled = state.busy;
  }
  function configure(state) {
    enabled = state.enabled;
    card.classList.toggle('artist-not-added',!enabled&&!window.petyaImageInstalled);
    window.petyaArtistAdded=enabled;

    $('artist-url').value = state.url || '';
    $('artist-form').hidden = !enabled;
    $('artist-enable').textContent = enabled ? 'Отключить Художника' : 'Включить Художника';
    progress(state);
  }
  window.configureArtistCard=configure;
  $('artist-enable').onclick = run(async () => configure(await call('configure', !enabled, $('artist-url').value)));
  $('artist-remove').onclick = run(async () => configure(await call('remove')));
  $('artist-connect').onclick = run(async () => configure(await call('configure', true, $('artist-url').value)));
  $('artist-form').onsubmit = run(async () => {
    const { image } = await call('generate', { prompt: $('artist-prompt').value, quality: $('artist-quality').value, format: $('artist-format').value });
    $('artist-preview').src = $('artist-download').href = 'data:image/png;base64,' + image;
    $('artist-result').hidden = false;
  });
  window.petyaEvents.onArtistProgress(progress);
  call('status').then(configure).catch(error => { $('artist-status').textContent = error.message; });
})();
