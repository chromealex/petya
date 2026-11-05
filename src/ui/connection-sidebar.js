// These badges mirror the latest connection check, not continuous availability.
function connectionBadge(message, classes, service, phase) {
  const stages={preparing:'Подготовка…',downloading:'Загрузка…',pulling:'Загрузка модели…',extracting:'Распаковка…',installing:'Установка…',starting:'Запуск…',warming:'Запуск модели…',verifying:'Проверка…'};
  if(stages[phase])return {state:'checking',label:stages[phase]};
  if(service==='images'){
    if(classes.includes('connected'))return {state:'connected',label:'Установлено'};
    if(classes.includes('disconnected'))return {state:'disconnected',label:'Не установлено'};
    if(/Скачиваю|Подготавливаю|Останавливаю/.test(message))return {state:'checking',label:'Установка…'};
  }
  if (service === 'ollama' && classes.includes('setup')) return { state: 'setup', label: 'Запустить' };
  if (/^(?:Загружаю|Скачиваю|Загрузка)/.test(message)) return {state:'checking',label:'Загрузка…'};
  if (/^(?:Устанавливаю|Установка)/.test(message)) return {state:'checking',label:'Установка…'};
  if (/^(?:Запускаю|Запуск)/.test(message)) return {state:'checking',label:'Запуск…'};
  if (/^Проверяю|^Проверка/.test(message)) return {state:'checking',label:'Проверка…'};
  if (classes.includes('disconnected')) return { state: 'disconnected', label: 'Не подключено' };
  if (classes.includes('setup')) return { state: 'setup', label: 'Настроить' };
  if(classes.includes('error')){
    const reasons=[['Нет сети','Нет сети'],['Нужно войти','Нужен вход'],['Сервис ограничил','Лимит запросов'],['Сервис недоступен','Недоступен']];
    return {state:'error',label:reasons.find(([prefix])=>message.startsWith(prefix))?.[1]||'Ошибка'};
  }
  if (classes.includes('connected')) return { state: 'connected', label: service === 'zoom' ? 'Доступ есть' : 'Подключено' };
  if (/Не подключено/.test(message)) return { state: 'disconnected', label: 'Не подключено' };
  if (/изменены|Требуется настройка|Сначала укажите/.test(message)) return { state: 'setup', label: 'Настроить' };
  return { state: 'unknown', label: 'Не проверено' };
}
function setupConnectionSidebar() {
  const panel = document.getElementById('connection-sidebar');
  const disclosure = document.getElementById('sidebar-services');
  const preferenceKey = 'petya.sidebar.services.open';
  try { disclosure.open = localStorage.getItem(preferenceKey) === 'true'; } catch {}
  disclosure.addEventListener('toggle', () => {
    try { localStorage.setItem(preferenceKey, String(disclosure.open)); } catch {}
  });
  const services = [ ['images','Картинки'], ['telegram','Telegram'], ['whisper', 'Whisper'], ['ollama', 'Ollama'], ['slack', 'Slack'], ['notion', 'Notion'], ['asana', 'Asana'], ['jira', 'Jira'], ['confluence', 'Confluence'], ['zoom', 'Звук встреч'], ['ai', 'ИИ'], ['googleplay', 'Google Play'], ['gmail','Почта'], ['web','Интернет'] ];
  for (const [id, title] of services) {
    const card = document.querySelector(`[data-service="${id}"]`);
    const status = card?.querySelector('.connection-status');
    if (!status) continue;
    const button = document.createElement('button'); button.type = 'button'; button.className = 'connection-badge';
    const dot = document.createElement('span'); dot.className = 'connection-dot'; dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span'); name.className = 'connection-name'; name.textContent = title;
    const label = document.createElement('span'); label.className = 'connection-label';
    button.append(dot, name, label); panel.append(button);
    let connected=false;
    const update = () => {
      const badge = connectionBadge(status.textContent, [...status.classList], id, status.dataset.installPhase);
      if(badge.state==='connected')connected=true;
      const disconnected=badge.state==='disconnected'||/отключ[её]н/iu.test(status.textContent);
      if(disconnected)connected=false;
      const flags={slack:['hasSlackToken','hasSlackOAuth'],notion:['hasNotionToken','hasNotionOAuth'],jira:['hasJiraToken','hasAtlassianOAuth'],confluence:['hasJiraToken','hasAtlassianOAuth'],asana:['hasAsanaOAuth'],telegram:['hasTelegram'],googleplay:['hasGooglePlay'],gmail:['hasGmail','hasMicrosoft']};
      const configured=(flags[id]||[]).some(key=>!!moduleSettings[key]);
      button.hidden=!moduleEnabled(id)||disconnected||!(badge.state==='connected'||['error','checking'].includes(badge.state)&&(connected||configured));
      button.dataset.state = badge.state; label.textContent = badge.label;
      button.title = `${title}: ${status.textContent}`;if(['connected','error'].includes(badge.state)){button.dataset.checkedAt=new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});button.title+=' · Результат проверки '+button.dataset.checkedAt;}
      button.setAttribute('aria-label', `${title}: ${badge.label}. Открыть настройки подключения`);
    };
    button.onclick = () => {
      view('settings');window.revealSettings?.(card);
      const section=card.querySelector('.settings-disclosure');if(section)section.open=true;
      const details = card.querySelector('.connection-options'); if (details && id !== 'ollama') details.open = true;
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const heading = card.querySelector('h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
    };
    new MutationObserver(update).observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class','data-install-phase'] });
    document.addEventListener('petya-modules-changed', update);
    update();
  }
}
setupConnectionSidebar();
