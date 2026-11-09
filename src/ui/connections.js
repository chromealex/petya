const serviceLogins = new Set();
// Browser sign-in through Petya's OAuth broker; `options` of a card an app owns: {title, connected} (its name and what
// to say once connected).
async function connectCloudService(name, status, button, form, options = {}) {
  if(serviceLogins.has(name)) return;
  serviceLogins.add(name);button.disabled=true;
  let cancelled=false;
  const cancel=connectionNode('button','Отменить');cancel.type='button';cancel.onclick=()=>{cancelled=true;};status.after(cancel);
  try {
    const login=await window.petya.serviceOAuthStart(name);
    status.textContent='Сверьте код '+login.code+' в браузере и разрешите доступ '+(options.title||({slack:'Slack',asana:'Asana'})[name])+'.';
    const deadline=Date.now()+600000;
    while(!cancelled && Date.now()<deadline) {
      await new Promise(r=>setTimeout(r,2000));if(cancelled)break;
      const state=await window.petya.serviceOAuthPoll(name);
      if(state.status==='failed')throw new Error('Сервис не выдал доступ. Повторите подключение.');
      if(state.status!=='ready')continue;
      if(!state.sites?.length)throw new Error('Нет доступных рабочих пространств.');
      let site=state.sites[0];
      if(state.sites.length>1){
        const select=document.createElement('select');state.sites.forEach(s=>select.add(new Option(s.name,s.id)));
        const apply=connectionNode('button','Выбрать пространство');apply.type='button';status.after(select,apply);
        const id=await new Promise(resolve=>{apply.onclick=()=>resolve(select.value);cancel.onclick=()=>{cancelled=true;resolve(null);};});select.remove();apply.remove();if(!id)break;site=state.sites.find(s=>s.id===id);
      }
      await window.petya.serviceOAuthClaim(name,site.id);
      document.dispatchEvent(new CustomEvent('petya-connection-checked',{detail:{service:name,ok:true}}));
      if(form.elements[name+'Token']){form.elements[name+'Token'].value='';form.elements['clear_'+name+'Token'].checked=false;}
      status.textContent='Подключено · '+site.name+(name==='asana'?'. Откройте раздел Asana для работы с задачами.':name==='slack'?'. Укажите каналы или маску jw-* в настройках.':options.connected?'. '+options.connected:'.');
      status.className='connection-status connected';return;
    }
    status.textContent=cancelled?'Подключение отменено.':'Время входа истекло. Повторите подключение.';
  } catch(e){status.textContent=e.message;status.className='connection-status error';}
  finally{cancel.remove();button.disabled=false;serviceLogins.delete(name);}
}
const connectionDefinitions = [
  { id: 'whisper', title: 'whisper.cpp', description: 'Распознавание речи на вашем компьютере', field: 'whisperUrl', fields: ['whisperUrl', 'whisperBinary', 'whisperModel', 'whisperVocabulary'] },
  { id: 'ollama', title: 'Ollama', description: 'Понимание команд и декомпозиция', field: 'ollamaUrl', fields: ['ollamaUrl', 'model'] },
  { id: 'slack', title: 'Slack', description: 'Обсуждения команды', field: 'slackToken', flag: 'hasSlackToken', fields: ['slackToken', 'slackChannels'], oauth: true }
];
const connectionCards = new Map();
function connectionNode(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
function connectionStatus(def, settings) {
  const card = connectionCards.get(def.id);
  def.status?.(settings);
  card.status.textContent = def.flag && settings[def.flag] ? 'Настроено · проверка не выполнена' : ['whisper', 'ollama'].includes(def.id) ? 'Локальный сервис · требуется проверка' : 'Не подключено';
  card.status.className = 'connection-status';
  if (def.placeholder) {
    card.content.open = false;
    $('settings-form').elements[def.field].placeholder = settings[def.flag] ? def.placeholder.saved : def.placeholder.empty;
  }
}
// A service card an app owns (its settings.js, loaded after this file): the same card as Petya's own services, from
// its markup already in the form and a definition {id, title, description, field, flag?, fields, oauth?, guideLabel?,
// placeholder?: {saved, empty}, connected?}; «Сохранить и проверить» goes to the app's connection-check. A card with
// its own sign-in adds {login?: {label, run(status, button, form)}, logout?: {label, run(status)}, hint?, manual?: [field
// names folded into «Ручное подключение по токену»], status?(settings), checked?(result)} (Jira: Atlassian sign-in).
window.addConnectionCard = def => {
  setupConnection(def, $('settings-form'));
  return window.petya.settings().then(settings => connectionStatus(def, settings)).catch(e => notice(e.message, true));
};
function setupConnection(def, form) {
    const field = form.elements[def.field], card = field.closest('article'); card.dataset.service = def.id;
    const content = document.createElement('details'); content.className = 'connection-options'; content.append(connectionNode('summary', 'Настройки подключения'));
    const original = [...card.children]; original.forEach(child => { if (!['H2'].includes(child.tagName) && !child.classList.contains('eyebrow')) content.append(child); });
    const status = connectionNode('p', 'Не проверено', 'connection-status'); status.setAttribute('role', 'status');
    const description = connectionNode('p', def.description), controls = connectionNode('div', '', 'actions');
    const connect = connectionNode('button', 'Подключить', 'primary'); connect.type = 'button';connect.dataset.connectionLogin='true';
    const guide = connectionNode('button', def.id === 'ollama' ? 'Установить Ollama' : def.guideLabel ? def.guideLabel : ['ollama', 'whisper'].includes(def.id) ? 'Установка' : 'Открыть настройки сервиса ↗'); guide.type = 'button'; guide.onclick = run(() => window.petya.connectionGuide(def.id));
    connect.onclick = () => { content.open = true; if (!def.oauth) field.focus(); content.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    if(def.login) {
      connect.textContent=def.login.label;
      connect.onclick=()=>def.login.run(status,connect,form);
    }
    if(def.logout) {
      const disconnect=connectionNode('button',def.logout.label);disconnect.type='button';
      disconnect.onclick=run(()=>def.logout.run(status));
      controls.append(disconnect);
    }
    if(def.oauth) {
      connect.textContent=def.id==='slack'?'Через приложение Slack':'Подключить '+def.title;
      connect.onclick=()=>connectCloudService(def.id,status,connect,form,def);
      const disconnect=connectionNode('button','Отключить '+def.title);disconnect.type='button';
      disconnect.onclick=run(async()=>{await window.petya.serviceOAuthDisconnect(def.id);status.textContent=def.title+' отключён';status.className='connection-status';});controls.append(disconnect);
    }
    const verify = connectionNode('button', 'Сохранить и проверить', 'primary'); verify.type = 'button';
    const savedOnly = connectionNode('p', def.oauth || def.login ? 'Нажмите «Подключить» и разрешите доступ в браузере. Создавать приложение и копировать ключи не нужно. Токены обновляются автоматически.' : 'Запустите локальный сервер, затем проверьте доступ.', 'small');
    if(def.id === 'slack') savedOnly.textContent='Подключите Slack через приложение или укажите API-токен.';
    if(def.hint) savedOnly.textContent=def.hint;
    verify.onclick = run(async () => {
      verify.disabled = true; connect.disabled = true; status.textContent = 'Проверяю доступ…'; status.className = 'connection-status';
      const input = Object.fromEntries(def.fields.map(k => [k, form.elements[k].value]));
      for (const key of def.fields) if (key.endsWith('Token')) input['clear_' + key] = form.elements['clear_' + key].checked;
      try {
        const result = await window.petya.connectService(def.id, input);
        await def.checked?.(result);
        if (!result.reason) document.dispatchEvent(new CustomEvent('petya-connection-checked',{detail:{service:def.id,ok:!!result.ready||def.id==='slack'}}));
        // Do not overwrite unsaved fields from another service.
        for (const key of def.fields) if (key.endsWith('Token')) { form.elements[key].value = ''; form.elements['clear_' + key].checked = false; }
        status.textContent = result.reason ? result.message : (result.ready ? 'Подключено · ' : 'Требуется настройка · ') + result.message;
        status.className = 'connection-status' + (result.reason ? ' error' : result.ready ? ' connected' : '');window.showConnectionRecovery?.(card,status,result); if(!(def.oauth || def.login)) connect.textContent = 'Настроить';
        if (def.placeholder) { if (input[def.field].trim() && !input['clear_' + def.field]) field.placeholder = def.placeholder.saved; content.open = !result.ready; }
        if (def.id === 'ollama' && Array.isArray(result.models)) {
          let list = $('ollama-models'); if (!list) { list = document.createElement('datalist'); list.id = 'ollama-models'; content.append(list); form.elements.model.setAttribute('list', list.id); }
          list.replaceChildren(...result.models.map(name => new Option(name, name)));
        }
        $('connection-state').textContent = 'Настройки сервиса сохранены. Статус указан в его карточке.';
      } catch (e) { status.textContent = 'Подключение не подтверждено · ' + e.message; status.className = 'connection-status error'; }
      finally { verify.disabled = false; connect.disabled = false; }
    });
    if (def.id === 'slack') {
      const help = connectionNode('details', '', 'slack-setup');
      help.append(connectionNode('summary', 'Как получить токен и настроить права'));
      const steps = connectionNode('ol');
      [
        'Нажмите «Открыть настройки сервиса», выберите своё приложение Slack и откройте OAuth & Permissions → User Token Scopes.',
        'Добавьте channels:read и groups:read — эти права нужны для названий каналов, масок jw-* и выбора всех каналов через *.',
        'Нажмите Reinstall to Workspace и подтвердите новые права. Одного добавления прав в настройках недостаточно: нужна повторная авторизация.',
        'Скопируйте User OAuth Token в поле OAuth token ниже и нажмите «Сохранить и проверить». Маску jw-* или * оставьте в поле каналов.'
      ].forEach(text => steps.append(connectionNode('li', text)));
      help.append(steps, connectionNode('p', 'Ошибка missing_scope означает, что токену не хватает прав. Для чтения сообщений также нужны channels:history / groups:history, а для личных и групповых переписок — im:history / mpim:history. Если Slack требует согласование новых прав, обратитесь к администратору рабочего пространства.', 'small'));
      help.append(connectionNode('p', 'Нужен User OAuth Token из OAuth & Permissions конкретного приложения. Токен из Your App Configuration Tokens предназначен для управления приложениями, действует 12 часов и не подходит для чтения переписок. Если у OAuth-токена включена ротация, требуется автоматическое обновление; используйте основной вход через браузер — там Петя обновляет токены автоматически.', 'small'));
      const links = connectionNode('div', '', 'actions');
      for (const [key, title] of [['slackPublicRead', 'Право channels:read ↗'], ['slackPrivateRead', 'Право groups:read ↗'], ['slackOAuth', 'Повторная авторизация ↗'], ['slackTokens', 'Какой токен нужен ↗']]) {
        const link = connectionNode('button', title); link.type = 'button';
        link.onclick = run(() => window.petya.connectionGuide(key)); links.append(link);
      }
      help.append(links);
      card.append(help);
    }
    if (def.id === 'ollama') {
      connect.hidden = true; guide.hidden = true;
      content.querySelector('summary').textContent = 'Дополнительные настройки';
      const open = connectionNode('button', 'Запустить Ollama', 'primary'); open.type = 'button';
      const restart = connectionNode('button', 'Перезапустить Ollama'); restart.type = 'button';
      const help = connectionNode('div', '', 'ollama-setup');
      help.append(connectionNode('p', 'Нажмите «Запустить Ollama» — Петя сам установит приложение при необходимости, подготовит модель и подключится.'));
      help.append(connectionNode('p', 'Модель загружается один раз. Название выбранной модели, фактический объём и прогресс загрузки показаны ниже. Следующие запуски используют сохранённую модель.', 'small'));
      const installPanel = connectionNode('div', '', 'ollama-install'); installPanel.hidden = true;
      const installLabel = connectionNode('p', '', 'small'); installLabel.setAttribute('role', 'status');
      const progress = document.createElement('progress'); progress.max = 100; progress.setAttribute('aria-label', 'Загрузка и установка Ollama');
      const cancel = connectionNode('button', 'Отменить загрузку', 'quiet'); cancel.type = 'button';
      cancel.onclick = run(() => window.petya.cancelOllamaInstall());
      installPanel.append(installLabel, progress, cancel); help.append(installPanel); card.append(help);
      let revision = 0;
      const renderInstall = state => {
        guide.disabled = state.busy; open.disabled = state.busy; restart.disabled = state.busy;
        open.textContent = state.busy ? ({preparing:'Подготовка…',downloading:'Загрузка…',pulling:'Загрузка модели…',extracting:'Распаковка…',installing:'Установка…',warming:'Запуск модели…',verifying:'Проверка…'}[state.phase]||'Запуск…') : 'Запустить Ollama';
        status.dataset.installPhase=state.busy?state.phase:'';
        guide.textContent = state.busy ? 'Устанавливается…' : state.phase === 'error' || state.phase === 'cancelled' ? 'Повторить установку' : 'Установить Ollama';
        installPanel.hidden = state.phase === 'idle';
        progress.hidden = !state.busy;
        cancel.hidden = !['preparing', 'downloading', 'pulling', 'warming', 'starting'].includes(state.phase);
        let detail = state.message;
        if (['downloading', 'pulling'].includes(state.phase) && state.received) {
          const mb = n => (n >= 1e9 ? n / 1e9 : n / 1e6).toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:n>=1e9?2:1}) + (n>=1e9?' ГБ':' МБ');
          detail += state.total ? ` ${Math.floor(state.received * 100 / state.total)}% · ${mb(state.received)} из ${mb(state.total)}` : ` ${mb(state.received)}`;
        }
        if (['downloading', 'pulling'].includes(state.phase) && state.total) progress.value = state.received * 100 / state.total;
        else progress.removeAttribute('value');
        installLabel.textContent = detail;
        cancel.textContent = state.phase === 'pulling' ? 'Отменить загрузку модели' : 'Отменить запуск';
        if (state.ready) { form.elements.model.value = state.model; form.elements.ollamaUrl.value = state.ollamaUrl; content.open = false; }
        if (state.phase !== 'idle') { status.textContent = state.message; status.className = 'connection-status' + (state.phase === 'error' ? ' error' : state.ready ? ' connected' : ''); }
      };
      window.petyaEvents.onOllamaInstall(state => { revision++; renderInstall(state); });
      window.petya.ollamaInstallStatus().then(state => { if (!revision) renderInstall(state); }).catch(e => notice(e.message, true));
      guide.onclick = run(async () => { guide.disabled = true; try { renderInstall(await window.petya.installOllama()); } finally { guide.disabled = false; } });
      open.onclick = run(async () => { open.disabled = true; try { renderInstall(await window.petya.openOllama()); } finally { open.disabled = false; } });
      restart.onclick = run(async () => { restart.disabled = true; try { renderInstall(await window.petya.restartOllama()); } finally { restart.disabled = false; } });
      const brain=connectionNode('button','Подготовить Qwen3.5 · 9B');brain.type='button';
      brain.onclick=run(async()=>{brain.disabled=true;try{renderInstall(await window.petya.installBrain());}finally{brain.disabled=false;}});
      const semantic=connectionNode('label','Понимать новые формулировки через модель','check');
      const toggle=document.createElement('input');toggle.type='checkbox';toggle.name='semanticTools';
      toggle.onchange=run(()=>window.petya.saveSettings({semanticTools:String(toggle.checked)}));semantic.prepend(toggle);
      window.petya.settings().then(s=>{toggle.checked=s.semanticTools!=='false';});
      content.append(semantic,connectionNode('p','Модель выбирает чтение Jira, ANR, почты, поиск и сводку по смыслу запроса. Действия выполняются доступными инструментами Пети. Qwen3.5:9B загружается на компьютер; для слабых устройств можно оставить меньшую модель.','small'));
      controls.append(brain);
      // The answer model already on disk needs no «Подготовить».
      const brainState=()=>window.petya.feature('optional-models','installed').then(r=>{brain.hidden=r.names.includes('qwen3.5:9b');}).catch(()=>{});brainState();window.petyaEvents.onOllamaInstall(state=>{if(!state.busy)brainState();});
      controls.append(open, restart);
    }
    if (def.id === 'whisper') {
      const start = connectionNode('button', 'Запустить распознавание', 'primary'); start.type = 'button';
      start.onclick = run(async () => {
        start.disabled = true; status.textContent = 'Запускаю Whisper и загружаю модель…'; status.className = 'connection-status';
        try { await window.petya.saveSettings(Object.fromEntries(def.fields.map(k => [k, form.elements[k].value]))); const result = await window.petya.ensureSpeech(); status.textContent = result.message; status.className = 'connection-status connected'; }
        catch (e) { status.textContent = e.message; status.className = 'connection-status error'; }
        finally { start.disabled = false; }
      }); controls.append(start);
    }
    if(def.oauth || def.manual) {
      const manual=document.createElement('details');manual.append(connectionNode('summary','Ручное подключение по токену'));
      for(const key of def.manual||[def.id+'Token','clear_'+def.id+'Token']) {
        const node=content.querySelector('[name="'+key+'"]')?.closest('label');if(node)manual.append(node);
      }
      const oldHelp=content.querySelector('.connection-help') || card.querySelector('.slack-setup');if(oldHelp)manual.append(oldHelp);
      manual.append(guide);content.append(manual);card.append(savedOnly);
      if(def.id==='slack') {
        manual.querySelector('summary').textContent='API-токен Slack';
        const tokenButton=connectionNode('button','По API-токену');tokenButton.type='button';tokenButton.dataset.slackAuth='token';
        tokenButton.onclick=()=>{content.open=true;manual.open=true;field.focus();field.scrollIntoView({block:'center',behavior:'smooth'});};
        controls.append(tokenButton);
      }
    } else controls.append(guide);
    content.append(verify); controls.append(connect); card.append(description, status, controls, content);
    if (def.id === 'slack') {
      const shortcuts = connectionNode('div', '', 'slack-shortcuts');shortcuts.hidden=true;
      shortcuts.append(connectionNode('p','Slack сообщил, что подключению не хватает прав. Откройте инструкцию или повторите подключение через приложение.','small'));
      const instructions=connectionNode('button','Как настроить права');instructions.type='button';
      instructions.onclick=()=>{
        const help=card.querySelector('.slack-setup');
        for(let parent=help;parent&&parent!==card;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
        help.scrollIntoView({block:'nearest',behavior:'smooth'});
      };
      shortcuts.append(instructions);card.insertBefore(shortcuts,controls);
      const updateScopeHelp=()=>{shortcuts.hidden=!(status.classList.contains('error')&&/\bmissing_scope\b/i.test(status.textContent));};
      new MutationObserver(updateScopeHelp).observe(status,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class']});
      updateScopeHelp();
    }
    const setupHelp = card.querySelector('.ollama-setup'); if (setupHelp) card.insertBefore(setupHelp, content);
    connectionCards.set(def.id, { card, status, content });
    card.querySelectorAll('input,textarea,select').forEach(e => { const invalidate = () => { status.textContent = 'Настройки изменены · сохраните и проверьте'; status.className = 'connection-status'; }; e.addEventListener('input', invalidate); e.addEventListener('change', invalidate); });
}
function setupConnections() {
  const form = $('settings-form');
  for (const def of connectionDefinitions) setupConnection(def, form);
  // «Запись встреч»: the core recorder. Meeting apps (extensions that provide a meeting source) add automatic start
  // and speaker names; without one a meeting is recorded with «Слушать встречу».
  const meetings = connectionNode('article', '', 'card'); meetings.dataset.service = 'meetings';
  const modeLabel = connectionNode('label', 'Когда приложение встреч показывает встречу');
  const mode = document.createElement('select'); mode.id = 'meeting-record-mode';
  for (const [value, text] of [['auto', 'Записывать автоматически'], ['ask', 'Спрашивать'], ['off', 'Только вручную']]) { const o = connectionNode('option', text); o.value = value; mode.append(o); }
  modeLabel.append(mode);
  const micLabel = connectionNode('label', '', 'check'); const mic = document.createElement('input'); mic.type = 'checkbox'; mic.id = 'meeting-record-mic'; micLabel.append(mic, 'Записывать мой микрофон вместе с собеседниками');
  const sources = connectionNode('p', '', 'small'); sources.id = 'meeting-sources';
  const save = connectionNode('button', 'Сохранить'); save.type = 'button';
  const state = connectionNode('p', '', 'small meeting-record-state'); state.id = 'meeting-record-status'; state.setAttribute('role', 'status');
  const actions = connectionNode('div', '', 'actions'); actions.id = 'meeting-record-actions';
  const renderSources = list => { sources.textContent = list.length ? 'Приложения встреч: ' + list.join(', ') + '. Запись начинается, когда они показывают встречу, и подписывает, кто говорит.' : 'Приложения встреч не добавлены: запись — по кнопке «Слушать встречу» на главной. Добавьте приложение встреч в каталоге, чтобы запись начиналась сама.'; modeLabel.hidden = !list.length; };
  const renderCapture = value => {
    state.textContent = value.message; actions.replaceChildren();
    for (const [label, method] of value.busy ? [['Остановить и обработать', 'stopCapture']] : [['Записать встречу', 'startCapture']]) { const b = connectionNode('button', label); b.type = 'button'; b.onclick = run(async () => renderCapture(await window.petya.feature('meetingMemory', method))); actions.append(b); }
  };
  renderSources([]);
  window.petya.feature('meetingMemory', 'options').then(options => { mode.value = options.mode; mic.checked = options.microphone; renderSources(options.sources); }).catch(() => {});
  save.onclick = run(async () => { const r = await window.petya.feature('meetingMemory', 'configure', { mode: mode.value, microphone: mic.checked }); renderSources(r.sources); notice('Настройки записи встреч сохранены.'); });
  window.petya.feature('meetingMemory', 'captureStatus').then(renderCapture).catch(() => {});
  window.petyaEvents.onLocalMeeting(renderCapture);
  document.addEventListener('petya-extensions-changed', () => window.petya.feature('meetingMemory', 'options').then(r => renderSources(r.sources)).catch(() => {}));
  const zs = connectionNode('p', 'Захват не проверен', 'connection-status'); zs.setAttribute('role', 'status');
  const zb = connectionNode('button', 'Проверить доступ к звуку'); zb.type = 'button';
  zb.onclick = run(async () => {
    zb.disabled = true; zs.textContent = 'Проверяю захват звука…'; zs.className = 'connection-status'; let stream;
    try { stream = await captureMeetingAudio(); zs.textContent = 'Доступ к системному звуку проверен.'; zs.className = 'connection-status connected'; }
    catch (e) { zs.textContent = 'Подключение не подтверждено · ' + meetingCaptureError(e).message; zs.className = 'connection-status error'; }
    finally { stream?.getTracks().forEach(t => t.stop()); zb.disabled = false; }
  });
  meetings.append(connectionNode('h2', 'Запись встреч'), connectionNode('p', 'Петя записывает системный звук встречи и, если разрешено, ваш микрофон — отдельно от чатов. После встречи он расшифровывает разговор и сохраняет его в общую память компании для любого чата. Аудио хранится зашифрованным до обработки, видео не сохраняется.'), sources, modeLabel, micLabel, save, state, actions, zs, zb, connectionNode('p', 'Записывается весь системный звук, а не одно приложение. Потребуются разрешения ОС. Остановка из трея приостанавливает автозапуск до следующей встречи.', 'small')); form.prepend(meetings);
  return window.petya.settings().then(settings => connectionDefinitions.forEach(def => connectionStatus(def, settings))).catch(e => notice(e.message, true));
}
const connectionsReady = setupConnections();
