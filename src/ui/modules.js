const optionalModules = [['telegram','Telegram'], ['slack','Slack'], ['notion','Notion'], ['asana','Asana'], ['jira','Jira'], ['confluence','Confluence'], ['ai','Claude / Codex'], ['googleplay','Google Play Console'], ['gmail','Gmail'], ['web','Поиск в интернете']];
let moduleSettings = {};
function moduleEnabled(name) { return moduleSettings['module_' + (['claude','codex'].includes(name) ? 'ai' : name)] !== 'false'; }
const modulePicker = connectionNode('article', '', 'card');
modulePicker.append(connectionNode('h2', 'Модули Пети'), connectionNode('p', 'Голос, локальная обработка, память и звук встреч доступны всегда. Отметьте нужные внешние сервисы, затем подключите их в появившихся карточках.'), connectionNode('p', 'Выбор сохраняется сразу. Выключение модуля останавливает обращения к сервису, но сохраняет его настройки и уже загруженный контекст.', 'small'));
const moduleChecks = new Map();
function renderModules(settings) {
  moduleSettings = settings;
  for (const [id] of optionalModules) {
    const active = moduleEnabled(id);
    moduleChecks.get(id).checked = active;
    const card = document.querySelector(`[data-service="${id}"]`);
    if (card) card.hidden = !active;
    if (id === 'asana' && !active && document.getElementById('asana')?.hidden === false) view('home');
    const nav = document.querySelector(`[data-view="${id === 'ai' ? 'agents' : id}"]`);
    if (nav) { nav.hidden = !active; if (!active && nav.classList.contains('active')) view('home'); }
  }
  for (const name of ['slackAutoSync','slackInterval']) $('settings-form').elements[name].closest('label').hidden = !moduleEnabled('slack');
  const sync = document.getElementById('sync-slack'); if (sync) sync.hidden = !moduleEnabled('slack');
  document.dispatchEvent(new Event('petya-modules-changed'));
}
for (const [id, title] of optionalModules) {
  const label = connectionNode('label', '', 'check'), check = document.createElement('input'); check.type = 'checkbox'; check.dataset.module = id;
  label.append(check, document.createTextNode(title)); modulePicker.append(label); moduleChecks.set(id, check);
  check.onchange = async () => {
    const previous = moduleSettings; moduleChecks.forEach(c => c.disabled = true);
    try { renderModules(await window.petya.saveSettings({ ['module_' + id]: String(check.checked) })); notice(title + (moduleEnabled(id) ? ': модуль включён. Подключите сервис в карточке ниже.' : ': модуль выключен.')); }
    catch (e) { renderModules(previous); notice(e.message, true); }
    finally { moduleChecks.forEach(c => c.disabled = false); }
  };
}
$('settings-form').prepend(modulePicker);
const modulesReady = window.petya.settings().then(renderModules).catch(e => notice(e.message, true));
