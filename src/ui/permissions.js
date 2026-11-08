(() => {
  const labels = {
    microphone: ['Микрофон', 'Голосовые команды и ваш голос во время встречи.'],
    screen: ['Запись экрана и системного звука', 'Звук встречи и определение окна приложения встреч. Видео не сохраняется.']
  };
  const states = { 'not-determined': 'Доступ ещё не запрошен', denied: 'Доступ выключен', restricted: 'Ограничено системой', unknown: 'Статус неизвестен' };
  let busy = false;
  async function refresh(requestId) {
    if (busy) return;
    busy = true;
    const summary = document.getElementById('permission-summary');
    const refreshButton = document.getElementById('refresh-permissions');
    refreshButton.disabled = true;
    document.querySelectorAll('#permission-list button').forEach(button => button.disabled = true);
    try {
      const result = requestId ? await window.petya.requestPermission(requestId) : await window.petya.permissionStatus();
      const list = document.getElementById('permission-list');
      list.replaceChildren();
      for (const { id, state } of result.items) {
        const granted = state === 'granted';
        const unconfirmedScreen = result.platform === 'darwin' && id === 'screen' && state === 'denied';
        const row = document.createElement('li'); row.className = 'permission-row';
        const mark = document.createElement('span'); mark.className = 'permission-mark'; mark.textContent = granted ? '✓' : '○'; mark.setAttribute('aria-hidden', 'true');
        const info = document.createElement('div'); info.className = 'grow';
        const title = document.createElement('strong'); title.textContent = labels[id][0];
        const description = document.createElement('p'); description.textContent = labels[id][1];
        const stateText = document.createElement('p'); stateText.className = 'small'; stateText.textContent = unconfirmedScreen
          ? 'Текущий запуск Пети не подтверждает доступ. Если переключатель Petya уже включён, полностью завершите Петю (⌘Q) и откройте снова. Если это не помогло после обновления, удалите старую запись Petya кнопкой «−» и добавьте текущее приложение кнопкой «+»: разрешение могло остаться привязано к старой подписи.'
          : granted && id === 'screen' ? 'Доступ к экрану разрешён. Звук проверяется кнопкой «Подключить звук встречи».'
          : granted ? 'Доступ разрешён' : states[state] || states.unknown;
        info.append(title, description, stateText);
        const button = document.createElement('button'); button.type = 'button'; button.textContent = granted ? '✓ Выдано' : unconfirmedScreen ? 'Открыть настройки' : 'Разрешить';
        button.disabled = granted || state === 'restricted'; button.dataset.locked = String(button.disabled);
        button.className = granted ? 'permission-granted' : 'primary';
        button.setAttribute('aria-label', `${labels[id][0]}: ${granted ? 'выдано' : unconfirmedScreen ? 'открыть настройки' : 'разрешить'}`);
        button.onclick = () => refresh(id);
        row.append(mark, info, button); list.append(row);
      }
      summary.textContent = `Подтверждено приложением: ${result.items.filter(item => item.state === 'granted').length} из ${result.items.length}`;
      document.getElementById('permission-help').textContent = result.platform === 'darwin'
        ? 'Нажмите «Разрешить» и включите Петю в системном окне или настройках macOS. После изменения доступа может потребоваться перезапуск Пети. При возврате сюда статусы обновятся автоматически.'
        : '«Разрешить» открывает настройки ОС. В Windows включите доступ к микрофону для классических приложений. Для захвата экрана отдельное разрешение не требуется.';
    } catch (error) { summary.textContent = 'Не удалось обновить разрешения: ' + error.message; }
    finally {
      busy = false; refreshButton.disabled = false;
      document.querySelectorAll('#permission-list button').forEach(button => button.disabled = button.dataset.locked === 'true');
    }
  }
  document.getElementById('refresh-permissions').onclick = () => refresh();
  window.addEventListener('focus', () => { if (!document.getElementById('settings').hidden) refresh(); });
  new MutationObserver(() => { if (!document.getElementById('settings').hidden) refresh(); }).observe(document.getElementById('settings'), { attributes: true, attributeFilter: ['hidden'] });
  refresh();
})();
