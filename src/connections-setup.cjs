// Connections: OAuth flows, Atlassian, saved-connection checks and manual connect.
// Extracted from main.cjs: shared state comes through ctx (live getters/setters).
module.exports=ctx=>{
  const oauthClient = name => { if (!Object.hasOwn(ctx.serviceOAuth, name)) throw new Error('Неизвестный сервис.'); return ctx.serviceOAuth[name]; };
  ctx.handle('serviceOAuthStart', async name => { ctx.modules.assertEnabled(ctx.settings, name); const result = await oauthClient(name).start(); await ctx.shell.openExternal(result.url); return {code: result.code}; });
  ctx.handle('serviceOAuthPoll', name => oauthClient(name).poll());
  ctx.handle('serviceOAuthClaim', async (name, siteId) => { const result = await oauthClient(name).claim(ctx.text(siteId, 200)); return ctx.saveSettings({[name+'Credential']: result.credential, ...(name==='asana'?{asanaWorkspace:result.site.id}:{}), ['clear_'+name+'Token']: true}, true); });
  ctx.handle('serviceOAuthDisconnect', async name => { const client=oauthClient(name); if(ctx.settings[name+'Credential']) await client.disconnect(ctx.settings[name+'Credential']); return ctx.saveSettings({['clear_'+name+'Credential']: true, ...(name==='asana'?{asanaWorkspace:''}:{})}, true); });
  ctx.handle('atlassianStart', async () => { if (!ctx.modules.enabled(ctx.settings, 'jira') && !ctx.modules.enabled(ctx.settings, 'confluence')) ctx.modules.assertEnabled(ctx.settings, 'jira'); const result = await ctx.atlassianOAuth.start(); await ctx.shell.openExternal(result.url); return { code: result.code }; });
  ctx.handle('atlassianPoll', () => ctx.atlassianOAuth.poll());
  ctx.handle('atlassianClaim', async siteId => { const result = await ctx.atlassianOAuth.claim(ctx.text(siteId, 200)); return ctx.saveSettings({atlassianCredential: result.credential, jiraUrl: result.site.url, clear_jiraToken: true}, true); });
  ctx.handle('atlassianDisconnect', async () => { if(ctx.settings.atlassianCredential) await ctx.atlassianOAuth.disconnect(ctx.settings.atlassianCredential); return ctx.saveSettings({clear_atlassianCredential: true}, true); });
  const connectionChecks = new Map();
  ctx.handle('checkSavedConnection', service => {
    if (!ctx.modules.enabled(ctx.settings, service)) return { ready: false, state: 'disabled', message: 'Модуль выключен' };
    if (connectionChecks.has(service)) return connectionChecks.get(service);
    const snapshot = { ...ctx.settings };
    const check = (async () => {
      if (service === 'meetings') {
        const screen = process.platform === 'darwin' ? ctx.systemPreferences.getMediaAccessStatus('screen') : 'unknown';
        return { ready: false, state: 'unknown', message: screen === 'granted' ? 'Разрешение экрана есть. Для проверки звуковой дорожки нажмите «Проверить доступ к звуку».' : 'Захват звука требует отдельной проверки кнопкой подключения. Автопроверка не включает запись.' };
      }
      if (['claude', 'codex'].includes(service)) { const ready = await ctx.available(service); return { ready, state: ready ? 'connected' : 'disconnected', message: ready ? 'Приложение найдено. Вход и выполнение проверяются в самом приложении.' : 'Приложение не найдено. Установите его и выполните вход.' }; }
      if (!Object.hasOwn(ctx.guides, service) || !['slack', 'notion', 'asana', 'jira', 'confluence', 'ollama', 'whisper'].includes(service)) throw new Error('Неизвестный сервис.');
      const configured = service === 'asana' ? snapshot.asanaCredential : service === 'slack' ? snapshot.slackToken || snapshot.slackCredential : service === 'notion' ? snapshot.notionToken || snapshot.notionCredential : ['jira', 'confluence'].includes(service) ? snapshot.atlassianCredential || snapshot.jiraToken && snapshot.jiraEmail && snapshot.jiraUrl : true;
      if (!configured) return { ready: false, state: 'disconnected', message: 'Не подключено. Откройте настройки сервиса.' };
      let timer;
      try {
        const result = service === 'whisper' ? await ctx.speech.ensure(snapshot) : await Promise.race([
          ctx.checkConnection(service, snapshot, (...args) => ctx.workspace.request(...args)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Проверка заняла больше 15 секунд. Повторите её позже.')), 15000); })
        ]);
        if (JSON.stringify(snapshot) !== JSON.stringify(ctx.settings)) return { ready: false, state: 'setup', message: 'Настройки изменены · повторите проверку' };
        return { ...result, state: result.ready ? 'connected' : 'setup' };
      } catch (error) { if (error.code === 'CONFLUENCE_NOT_GRANTED') return { ready: false, state: 'setup', action: 'reconnect', message: error.message }; const problem=require('./connection-failure.cjs').classify(error);if(problem && !['ollama','whisper'].includes(service))return {ready:false,state:'error',...problem};throw service === 'whisper' ? ctx.speechError(error, snapshot.whisperUrl) : error; }
      finally { clearTimeout(timer); }
    })().finally(() => connectionChecks.delete(service));
    connectionChecks.set(service, check); return check;
  });
  ctx.handle('connectService', async (service, input) => {
    ctx.modules.assertEnabled(ctx.settings, service);
    const current = ctx.saveSettings(ctx.scopedInput(service, input));
    const snapshot = { ...ctx.settings };
    let result;
    try { result = service === 'whisper' ? await ctx.speech.ensure(snapshot) : await ctx.checkConnection(service, snapshot, (...args) => ctx.workspace.request(...args)); }
    catch (error) { const problem=require('./connection-failure.cjs').classify(error);if(problem && !['ollama','whisper'].includes(service))return {ready:false,state:'error',settings:current,...problem};throw service === 'whisper' ? ctx.speechError(error, snapshot.whisperUrl) : error; }
    if (JSON.stringify(snapshot) !== JSON.stringify(ctx.settings)) throw new Error('Настройки изменились во время проверки. Повторите подключение.');
    return { ...result, settings: current };
  });
};
