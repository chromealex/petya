const { resolveChannels } = require('./slack.cjs');
const { localEndpoint } = require('./core.cjs');
const guides = Object.freeze({ asana: 'https://app.asana.com/0/my-apps', slackTokens: 'https://docs.slack.dev/authentication/tokens/', slackPublicRead: 'https://docs.slack.dev/reference/scopes/channels.read/', slackPrivateRead: 'https://docs.slack.dev/reference/scopes/groups.read/', slackOAuth: 'https://docs.slack.dev/authentication/installing-with-oauth/', slack: 'https://api.slack.com/apps', notion: 'https://www.notion.so/my-integrations', jira: 'https://id.atlassian.com/manage-profile/security/api-tokens', confluence: 'https://id.atlassian.com/manage-profile/security/api-tokens', ollama: 'https://ollama.com/download', whisper: 'https://github.com/ggml-org/whisper.cpp/tree/master/examples/server' });
const fields = Object.freeze({ asana: [], slack: ['slackToken', 'slackChannels'], notion: ['notionToken'], jira: ['jiraUrl', 'jiraEmail', 'jiraToken', 'jiraProjects', 'jiraProject', 'jiraIssueType', 'jiraBoardId', 'jiraVersionId', 'confluenceSpace'], confluence: ['jiraUrl', 'jiraEmail', 'jiraToken', 'confluenceSpace'], ollama: ['ollamaUrl', 'model'], whisper: ['whisperUrl', 'whisperBinary', 'whisperModel'] });
function scopedInput(service, input) {
  if (!Object.hasOwn(fields, service)) throw new Error('Неизвестный сервис.');
  const result = Object.fromEntries(fields[service].filter(k => typeof input?.[k] === 'string').map(k => [k, input[k]]));
  for (const key of fields[service]) if (key.endsWith('Token') && input?.['clear_' + key] === true) result['clear_' + key] = true;
  return result;
}
async function checkConnection(service, s, request) {
  const need = (value, name) => { if (!value) throw new Error('Укажите ' + name + '.'); return value; };
  const call = (url, headers = {}, options = {}) => request(url, { ...options, headers });
  if (service === 'asana') {
    if (!s.asanaCredential || !/^\d+$/.test(s.asanaWorkspace)) throw new Error('Подключите Asana через браузер.');
    const r = await call('https://app.asana.com/api/1.0/workspaces/'+s.asanaWorkspace+'?opt_fields=name');
    if (!r.data?.gid) throw new Error('Asana вернула неожиданный ответ.');
    return {ready:true,message:'Asana · '+r.data.name+'. Доступ к рабочему пространству проверен.'};
  }
  if (service === 'slack') {
    const headers = { Authorization: 'Bearer ' + (s.slackCredential ? '' : need(s.slackToken, 'Slack token')) };
    const data = await call('https://slack.com/api/auth.test', headers, { method: 'POST' });
    if (!data.ok) throw new Error('Slack: ' + data.error);
    const channels = (s.slackChannels || '').trim() ? await resolveChannels(s.slackChannels, s.slackToken, request) : [];
    for (const channel of channels.slice(0, 1)) { const history = await call('https://slack.com/api/conversations.history?' + new URLSearchParams({ channel, limit: 1 }), headers); if (!history.ok) throw new Error(`Нет доступа к ${channel}: ${history.error}`); }
    return { message: `${data.team || 'Slack'} · ${data.user || 'авторизация проверена'}. ${channels.length ? `Найдено каналов/переписок: ${channels.length}. Чтение первого проверено; остальные проверяются при загрузке.` : 'Укажите каналы для загрузки обсуждений.'}`, ready: !!channels.length };
  }
  if (service === 'notion') {
    const headers = { Authorization: 'Bearer ' + (s.notionCredential ? '' : need(s.notionToken, 'Notion token')), 'Notion-Version': '2025-09-03', 'Content-Type': 'application/json' };
    const data = await call('https://api.notion.com/v1/search', headers, { method: 'POST', body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 1 }) });
    if (!Array.isArray(data.results)) throw new Error('Notion вернул неожиданный ответ.');
    return { message: data.results.length ? 'Доступ к поиску страниц проверен.' : 'Авторизация проверена. Доступных страниц пока нет — добавьте интеграцию в Connections нужных страниц.', ready: !!data.results.length };
  }
  if (service === 'jira' || service === 'confluence') {
    const site = new URL(need(s.jiraUrl, 'адрес Atlassian'));
    if (site.protocol !== 'https:' || !site.hostname.endsWith('.atlassian.net') || site.username || site.password || site.pathname !== '/') throw new Error('Нужен адрес https://company.atlassian.net');
    const headers = s.atlassianCredential ? {} : { Authorization: 'Basic ' + Buffer.from(need(s.jiraEmail, 'email Atlassian') + ':' + need(s.jiraToken, 'API token')).toString('base64') };
    if (service === 'confluence') { const data = await call(site.origin + '/wiki/rest/api/content/search?' + new URLSearchParams({ cql: 'type = page' + (s.confluenceSpace ? ' AND space = ' + JSON.stringify(s.confluenceSpace) : ''), limit: 1 }), headers); if (!Array.isArray(data.results)) throw new Error('Confluence вернул неожиданный ответ.'); return { message: data.results.length ? 'Доступ к поиску Confluence проверен.' : 'Доступ проверен, страниц в выбранной области пока нет.', ready: !!data.results.length }; }
    const user = await call(site.origin + '/rest/api/3/myself', headers);
    if (s.jiraProject) await call(site.origin + '/rest/api/3/project/' + encodeURIComponent(s.jiraProject), headers);
    return { message: `${user.displayName || 'Atlassian'} · ${s.jiraProjects || s.jiraProject || 'отметьте проекты для выбора по контексту'}. Доступ проверен; права создания и изменения задач проверяются при выполнении.`, ready: true };
  }
  if (service === 'ollama') {
    const url = new URL(localEndpoint(s.ollamaUrl)); url.pathname = '/api/tags'; url.search = ''; url.hash = '';
    let data;
    try { data = await request(url.href); } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('Ollama не ответил вовремя. Проверьте сервер и повторите попытку.');
      if (e.status === 404) throw new Error('По этому адресу не найден API Ollama: ' + url.origin);
      if (e instanceof TypeError || e.cause?.code === 'ECONNREFUSED') throw new Error('Ollama недоступен по адресу ' + url.origin + '. Запустите Ollama и повторите проверку.');
      throw e;
    }
    if (!Array.isArray(data.models)) throw new Error('Сервер не вернул список моделей Ollama.');
    const models = data.models.map(m => m.name);
    const ready = models.some(m => m === s.model || m === s.model + ':latest');
    return { message: ready ? `Модель ${s.model} доступна.` : 'Нажмите «Запустить Ollama» — Петя автоматически подготовит модель.', ready, models };
  }
  if (service === 'whisper') {
    const url = new URL(localEndpoint(s.whisperUrl)); url.pathname = '/health'; url.search = ''; url.hash = '';
    const data = await request(url.href);
    if (data?.status !== 'ok') throw new Error('whisper-server ещё не готов. Проверьте загрузку модели.');
    return { message: 'whisper-server готов. Качество распознавания проверьте голосовой командой.', ready: true };
  }
  throw new Error('Неизвестный сервис.');
}
module.exports = { guides, fields, scopedInput, checkConnection };
