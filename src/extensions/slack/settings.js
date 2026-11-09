(() => {
 // The Slack connection card: sign-in through the Slack app or an API token, the channels to read and the background
 // sync. It joins Petya's connection cards through window.addConnectionCard (src/ui/connections.js) and is checked by
 // connection-check.cjs; the host shows it
 // only while the app is added.
 const form = $('settings-form');
 if (!form || form.elements.slackToken) return;
 const node = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
 const card = node('article', '', 'card');
 const token = document.createElement('input'); token.name = 'slackToken'; token.type = 'password'; token.autocomplete = 'off'; token.placeholder = 'Оставьте пустым, чтобы сохранить текущий';
 const channels = document.createElement('input'); channels.name = 'slackChannels'; channels.placeholder = '* или jw-*, general, D0123456789';
 const clear = document.createElement('input'); clear.type = 'checkbox'; clear.name = 'clear_slackToken'; clear.dataset.clearSecret = '';
 const auto = document.createElement('input'); auto.type = 'checkbox'; auto.name = 'slackAutoSync'; auto.dataset.boolSetting = '';
 const interval = document.createElement('select'); interval.name = 'slackInterval';
 for (const [value, text] of [['1', 'Каждую минуту'], ['5', 'Каждые 5 минут'], ['15', 'Каждые 15 минут']]) interval.add(new Option(text, value));
 const label = (text, input, cls) => { const l = node('label', '', cls); if (cls === 'check') l.append(input, text); else l.append(text, input); return l; };
 const rights = node('details'); rights.append(node('summary', 'Все каналы, личные переписки и необходимые права'), node('p', '* — все доступные неархивные каналы; jw-* — по префиксу. Для названий и масок нужны channels:read / groups:read. Личные переписки добавляются по ID. Нужен user token с channels:history / groups:history / im:history / mpim:history и доступом к выбранным перепискам. Для текстовых вложений нужен files:read. Для «что с билдом» — chat:write, im:write и users:read: Петя пишет ответственному или в канал обсуждения и ждёт ответ. При включённом модуле Петя запоминает видимый тред в активном приложении Slack: можно спросить «почему билд падает в этом логе». На macOS нужен Универсальный доступ. История просмотров начинается после запуска Пети; Slack в браузере пока не поддерживается. Личные переписки имеют ID D…. Учитываются лимиты Slack; первичная загрузка недели и тредов может занять время.', 'small'));
 card.append(node('div', 'КОНТЕКСТ', 'eyebrow'), node('h2', 'Slack'),
  label('OAuth token', token), label('Каналы: названия, маски или ID через запятую', channels), label('Удалить сохранённый токен', clear, 'check'),
  node('p', 'Укажите каналы через запятую. Например: general или jw-* для каналов с таким началом названия.', 'small'), rights,
  label('Автоматически обновлять выбранные переписки Slack', auto, 'check'), label('Начинать обновление Slack', interval),
  node('p', 'Чтение идёт через API и работает, даже если окно Slack закрыто. Обновляется история корневых сообщений за срок хранения и их доступные треды. Запросы могут ждать лимита Slack.', 'small'));
 // Where the card always stood: before Notion, after the other service cards.
 const notion = form.elements.notionToken?.closest('article');
 if (notion) form.insertBefore(card, notion); else form.insertBefore(card, form.lastElementChild);
 // «Обновить Slack» under «Сохранённые обсуждения» and among the ways to add context when a task lacks it (src/ui/app.js).
 (window.petyaContextRefreshers ||= []).push({ id: 'slack', label: 'Обновить контекст Slack', button: 'Обновить Slack', run: () => window.petya.syncSlack() });
 window.addConnectionCard?.({
  id: 'slack', title: 'Slack', description: 'Обсуждения команды', field: 'slackToken', flag: 'hasSlackToken', fields: ['slackToken', 'slackChannels'],
  oauth: true, connectLabel: 'Через приложение Slack', connected: 'Укажите каналы или маску jw-* в настройках.',
  savedOnly: 'Подключите Slack через приложение или укажите API-токен.', checkedOk: true, manualTitle: 'API-токен Slack', tokenButton: 'По API-токену',
  decorate({ card }) {
   const help = node('details', '', 'connection-help slack-setup');
   help.append(node('summary', 'Как получить токен и настроить права'));
   const steps = node('ol');
   [
    'Нажмите «Открыть настройки сервиса», выберите своё приложение Slack и откройте OAuth & Permissions → User Token Scopes.',
    'Добавьте channels:read и groups:read — эти права нужны для названий каналов, масок jw-* и выбора всех каналов через *.',
    'Нажмите Reinstall to Workspace и подтвердите новые права. Одного добавления прав в настройках недостаточно: нужна повторная авторизация.',
    'Скопируйте User OAuth Token в поле OAuth token ниже и нажмите «Сохранить и проверить». Маску jw-* или * оставьте в поле каналов.'
   ].forEach(text => steps.append(node('li', text)));
   help.append(steps, node('p', 'Ошибка missing_scope означает, что токену не хватает прав. Для чтения сообщений также нужны channels:history / groups:history, а для личных и групповых переписок — im:history / mpim:history. Если Slack требует согласование новых прав, обратитесь к администратору рабочего пространства.', 'small'));
   help.append(node('p', 'Нужен User OAuth Token из OAuth & Permissions конкретного приложения. Токен из Your App Configuration Tokens предназначен для управления приложениями, действует 12 часов и не подходит для чтения переписок. Если у OAuth-токена включена ротация, требуется автоматическое обновление; используйте основной вход через браузер — там Петя обновляет токены автоматически.', 'small'));
   const links = node('div', '', 'actions');
   for (const [key, title] of [['slackPublicRead', 'Право channels:read ↗'], ['slackPrivateRead', 'Право groups:read ↗'], ['slackOAuth', 'Повторная авторизация ↗'], ['slackTokens', 'Какой токен нужен ↗']]) {
    const link = node('button', title); link.type = 'button';
    link.onclick = run(() => window.petya.connectionGuide(key)); links.append(link);
   }
   help.append(links);
   card.append(help);
  },
  // A missing_scope answer offers the instructions right under the status.
  after({ card, status, controls }) {
   const shortcuts = node('div', '', 'slack-shortcuts'); shortcuts.hidden = true;
   shortcuts.append(node('p', 'Slack сообщил, что подключению не хватает прав. Откройте инструкцию или повторите подключение через приложение.', 'small'));
   const instructions = node('button', 'Как настроить права'); instructions.type = 'button';
   instructions.onclick = () => {
    const help = card.querySelector('.slack-setup');
    for (let parent = help; parent && parent !== card; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    help.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
   };
   shortcuts.append(instructions); card.insertBefore(shortcuts, controls);
   const update = () => { shortcuts.hidden = !(status.classList.contains('error') && /\bmissing_scope\b/i.test(status.textContent)); };
   new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
   update();
  }
 });
 window.petya.settings().then(settings => { channels.value = settings.slackChannels || ''; auto.checked = settings.slackAutoSync === 'true'; interval.value = settings.slackInterval || '5'; }).catch(() => {});
})();
