const serviceLogins = new Set();
async function connectCloudService(name, status, button, form) {
  if(serviceLogins.has(name)) return;
  serviceLogins.add(name);button.disabled=true;
  let cancelled=false;
  const cancel=connectionNode('button','Отменить');cancel.type='button';cancel.onclick=()=>{cancelled=true;};status.after(cancel);
  try {
    const login=await window.petya.serviceOAuthStart(name);
    status.textContent='Сверьте код '+login.code+' в браузере и разрешите доступ '+({slack:'Slack',notion:'Notion',asana:'Asana'})[name]+'.';
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
      if(form.elements[name+'Token']){form.elements[name+'Token'].value='';form.elements['clear_'+name+'Token'].checked=false;}
      status.textContent='Подключено · '+site.name+(name==='asana'?'. Откройте раздел Asana для работы с задачами.':name==='slack'?'. Укажите каналы или маску jw-* в настройках.':'. Доступны страницы, выбранные при входе.');
      status.className='connection-status connected';return;
    }
    status.textContent=cancelled?'Подключение отменено.':'Время входа истекло. Повторите подключение.';
  } catch(e){status.textContent=e.message;status.className='connection-status error';}
  finally{cancel.remove();button.disabled=false;serviceLogins.delete(name);}
}
let atlassianLoginActive = false, atlassianConnected = false;
async function connectAtlassian(status, button, form) {
  if (atlassianLoginActive) return;
  atlassianLoginActive = true; button.disabled = true;
  const choices = document.createElement('div'); status.after(choices);
  let cancelled = false;
  const cancel = connectionNode('button', 'Отменить'); cancel.type='button'; cancel.onclick=()=>{cancelled=true;}; choices.append(cancel);
  try {
    const login=await window.petya.atlassianStart();
    status.textContent='Сверьте код '+login.code+' в браузере и разрешите доступ Atlassian.';
    const deadline=Date.now()+600000;
    while(!cancelled && Date.now()<deadline) {
      await new Promise(r=>setTimeout(r,2000)); if(cancelled) break;
      const state=await window.petya.atlassianPoll();
      if(state.status==='failed') throw new Error('Вход отменён или Atlassian не выдал доступ. Повторите подключение.');
      if(state.status!=='ready') continue;
      let siteId;
      if(state.sites.length===1) siteId=state.sites[0].id;
      else {
        status.textContent='Выберите сайт Atlassian для Пети.';
        const select=document.createElement('select');state.sites.forEach(site=>select.add(new Option(site.name+' — '+site.url,site.id)));
        const apply=connectionNode('button','Подключить сайт');apply.type='button';choices.prepend(select,apply);
        siteId=await new Promise(resolve=>{apply.onclick=()=>resolve(select.value);cancel.onclick=()=>{cancelled=true;resolve(null);};});
      }
      if(!siteId || cancelled) break;
      const saved=await window.petya.atlassianClaim(siteId);
      displaySettings(saved); form.elements.jiraUrl.value=saved.jiraUrl;form.elements.jiraToken.value='';atlassianConnected=true;
      status.textContent='Atlassian подключён · '+saved.jiraUrl+'. Выберите проект Jira в настройках.';status.className='connection-status connected';
      connectionCards.get('jira').content.open = true;
      if (moduleEnabled('jira')) await refreshJiraChoices();
      const confluenceCard = document.querySelector('[data-service="confluence"]');
      if (confluenceCard && moduleEnabled('confluence')) {
        const result = await window.petya.checkSavedConnection('confluence');
        confluenceCard.dataset.reconnect = String(result.action === 'reconnect');
        const label = confluenceCard.querySelector('.connection-status');
        label.textContent = result.message; label.className = 'connection-status ' + result.state;
      }
      return;
    }
    status.textContent=cancelled?'Подключение отменено.':'Время входа истекло. Повторите подключение.';
  } catch(e) { status.textContent=e.message;status.className='connection-status error'; }
  finally {choices.remove();button.disabled=false;atlassianLoginActive=false;}
}
const connectionDefinitions = [
  { id: 'whisper', title: 'whisper.cpp', description: 'Распознавание речи на вашем компьютере', field: 'whisperUrl', fields: ['whisperUrl', 'whisperBinary', 'whisperModel', 'whisperVocabulary'] },
  { id: 'ollama', title: 'Ollama', description: 'Понимание команд и декомпозиция', field: 'ollamaUrl', fields: ['ollamaUrl', 'model'] },
  { id: 'slack', title: 'Slack', description: 'Обсуждения команды', field: 'slackToken', flag: 'hasSlackToken', fields: ['slackToken', 'slackChannels'] },
  { id: 'notion', title: 'Notion', description: 'Документация и требования', field: 'notionToken', flag: 'hasNotionToken', fields: ['notionToken'] },
  { id: 'jira', title: 'Jira', description: 'Задачи, спринты и версии', field: 'jiraToken', flag: 'hasJiraToken', fields: ['jiraUrl', 'jiraEmail', 'jiraToken', 'jiraProjects', 'jiraProject', 'jiraIssueType', 'jiraBoardId', 'jiraVersionId', 'confluenceSpace'] }
];
const connectionCards = new Map();
function connectionNode(tag, text, cls) { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
function connectionStatus(def, settings) {
  const card = connectionCards.get(def.id);
  if(def.id === 'jira') atlassianConnected=!!settings.hasAtlassianOAuth;
  card.status.textContent = def.flag && settings[def.flag] ? 'Настроено · проверка не выполнена' : ['whisper', 'ollama'].includes(def.id) ? 'Локальный сервис · требуется проверка' : 'Не подключено';
  card.status.className = 'connection-status';
  if (def.id === 'notion') {
    card.content.open = false;
    $('settings-form').elements.notionToken.placeholder = settings.hasNotionToken ? 'Токен сохранён. Оставьте пустым, чтобы использовать его' : 'Вставьте токен, скопированный из Notion';
  }
}
function setupConnections() {
  const form = $('settings-form');
  for (const def of connectionDefinitions) {
    const field = form.elements[def.field], card = field.closest('article'); card.dataset.service = def.id;
    const content = document.createElement('details'); content.className = 'connection-options'; content.append(connectionNode('summary', 'Настройки подключения'));
    const original = [...card.children]; original.forEach(child => { if (!['H2'].includes(child.tagName) && !child.classList.contains('eyebrow')) content.append(child); });
    const status = connectionNode('p', 'Не проверено', 'connection-status'); status.setAttribute('role', 'status');
    const description = connectionNode('p', def.description), controls = connectionNode('div', '', 'actions');
    const connect = connectionNode('button', 'Подключить', 'primary'); connect.type = 'button';connect.dataset.connectionLogin='true';
    const guide = connectionNode('button', def.id === 'ollama' ? 'Установить Ollama' : def.id === 'notion' ? 'Настройки Notion ↗' : ['ollama', 'whisper'].includes(def.id) ? 'Установка' : 'Открыть настройки сервиса ↗'); guide.type = 'button'; guide.onclick = run(() => window.petya.connectionGuide(def.id));
    connect.onclick = () => { content.open = true; if (def.id !== 'notion') field.focus(); content.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    if(def.id === 'jira') {
      connect.textContent='Подключить Jira и Confluence';
      connect.onclick=()=>connectAtlassian(status,connect,form);
      const disconnect=connectionNode('button','Отключить Atlassian');disconnect.type='button';
      disconnect.onclick=run(async()=>{ await window.petya.atlassianDisconnect();atlassianConnected=false;status.textContent='Atlassian отключён';status.className='connection-status'; });
      controls.append(disconnect);
    }
    if(['slack','notion'].includes(def.id)) {
      connect.textContent=def.id==='slack'?'Через приложение Slack':'Подключить '+def.title;
      connect.onclick=()=>connectCloudService(def.id,status,connect,form);
      const disconnect=connectionNode('button','Отключить '+def.title);disconnect.type='button';
      disconnect.onclick=run(async()=>{await window.petya.serviceOAuthDisconnect(def.id);status.textContent=def.title+' отключён';status.className='connection-status';});controls.append(disconnect);
    }
    const verify = connectionNode('button', 'Сохранить и проверить', 'primary'); verify.type = 'button';
    const savedOnly = connectionNode('p', ['slack', 'notion', 'jira'].includes(def.id) ? 'Нажмите «Подключить» и разрешите доступ в браузере. Создавать приложение и копировать ключи не нужно. Токены обновляются автоматически.' : 'Запустите локальный сервер, затем проверьте доступ.', 'small');
    if(def.id === 'slack') savedOnly.textContent='Подключите Slack через приложение или укажите API-токен.';
    if(def.id === 'jira') savedOnly.textContent='При входе разрешите доступ к Jira и Confluence на нужном сайте. Доступ к каждому сервису проверяется отдельно. Токены обновляются автоматически.';
    verify.onclick = run(async () => {
      verify.disabled = true; connect.disabled = true; status.textContent = 'Проверяю доступ…'; status.className = 'connection-status';
      const input = Object.fromEntries(def.fields.map(k => [k, form.elements[k].value]));
      for (const key of def.fields) if (key.endsWith('Token')) input['clear_' + key] = form.elements['clear_' + key].checked;
      try {
        const result = await window.petya.connectService(def.id, input);
        if (def.id === 'jira' && result.ready) await refreshJiraChoices();
        // Do not overwrite unsaved fields from another service.
        for (const key of def.fields) if (key.endsWith('Token')) { form.elements[key].value = ''; form.elements['clear_' + key].checked = false; }
        status.textContent = result.reason ? result.message : (result.ready ? 'Подключено · ' : 'Требуется настройка · ') + result.message;
        status.className = 'connection-status' + (result.reason ? ' error' : result.ready ? ' connected' : '');window.showConnectionRecovery?.(card,status,result); if(!['slack','notion','jira'].includes(def.id)) connect.textContent = 'Настроить';
        if (def.id === 'notion') { if (input.notionToken.trim() && !input.clear_notionToken) field.placeholder = 'Токен сохранён. Оставьте пустым, чтобы использовать его'; content.open = !result.ready; }
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
          const mb = n => (n >= 1e9 ? n / 1e9 : n / 1e6).toLocaleString('ru-RU',{maximumFractionDigits:n>=1e9?2:1}) + (n>=1e9?' ГБ':' МБ');
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
    if(['slack','notion','jira'].includes(def.id)) {
      const manual=document.createElement('details');manual.append(connectionNode('summary','Ручное подключение по токену'));
      for(const key of def.id==='jira'?['jiraEmail','jiraToken','clear_jiraToken']:[def.id+'Token','clear_'+def.id+'Token']) {
        const node=content.querySelector('[name="'+key+'"]')?.closest('label');if(node)manual.append(node);
      }
      const oldHelp=content.querySelector('.notion-setup') || card.querySelector('.slack-setup');if(oldHelp)manual.append(oldHelp);
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
  const zoom = connectionNode('article', '', 'card'); zoom.dataset.service = 'zoom';
  const zs = connectionNode('p', 'Захват не проверен', 'connection-status'); zs.setAttribute('role', 'status');
  const zb = connectionNode('button', 'Проверить доступ к звуку', 'primary'); zb.type = 'button';
  zb.onclick = run(async () => {
    zb.disabled = true; zs.textContent = 'Проверяю захват звука…'; zs.className = 'connection-status'; let stream;
    try { stream = await captureMeetingAudio(); zs.textContent = 'Доступ к системному звуку проверен. Встречи Zoom подхватываются автоматически, если автозапись включена.'; zs.className = 'connection-status connected'; }
    catch (e) { zs.textContent = 'Подключение не подтверждено · ' + meetingCaptureError(e).message; zs.className = 'connection-status error'; }
    finally { stream?.getTracks().forEach(t => t.stop()); zb.disabled = false; }
  });
  zoom.append(connectionNode('h2', 'Zoom · звук встречи'), connectionNode('p', 'Петя получает контекст через системный звук. Выберите источник в системном диалоге, если он появится. Кнопка проверит доступ к звуковой дорожке и сразу остановит захват. Вход в аккаунт Zoom не требуется.'), zs, zb, connectionNode('p', 'Захватывается весь системный звук, не только Zoom. Встречи Zoom подхватываются автоматически. Расшифровка сохраняется в общую память текущей компании и доступна в любом чате в течение срока хранения.', 'small')); form.prepend(zoom);
  return window.petya.settings().then(settings => connectionDefinitions.forEach(def => connectionStatus(def, settings))).catch(e => notice(e.message, true));
}
const connectionsReady = setupConnections();
