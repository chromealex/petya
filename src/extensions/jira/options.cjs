function siteOrigin(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.atlassian.net') || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw new Error('Укажите адрес Jira: https://company.atlassian.net');
  return u.origin;
}
function guideUrl(kind, site, project) {
  if (kind === 'help') return 'https://support.atlassian.com/jira/kb/finding-the-issue-type-id-in-jira-cloud/';
  const origin = siteOrigin(site);
  if (kind === 'confluence') return origin + '/wiki';
  if (kind === 'projects') return origin + '/jira/projects';
  if (kind === 'types') {
    if (!/^[A-Z][A-Z0-9_]*$/.test(project || '')) throw new Error('Сначала укажите ключ проекта.');
    return origin + '/plugins/servlet/project-config/' + encodeURIComponent(project) + '/issuetypes';
  }
  throw new Error('Неизвестная ссылка Jira.');
}
async function jiraOptions(input, saved, request) {
  const origin = siteOrigin(input.jiraUrl || '');
  const email = String(input.jiraEmail || '').trim();
  const sameAccount = saved.jiraUrl && origin === siteOrigin(saved.jiraUrl) && email === saved.jiraEmail;
  const token = String(input.jiraToken || '').trim() || (sameAccount ? saved.jiraToken : '');
  if (!email || !token || input.clear_jiraToken) throw new Error('Введите email и API token. Для другого адреса или аккаунта нужен его токен.');
  const headers = { Authorization: 'Basic ' + Buffer.from(email + ':' + token).toString('base64'), Accept: 'application/json' };
  const get = path => request(origin + path, { headers });
  if (input.jiraProject) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(input.jiraProject)) throw new Error('Укажите один ключ проекта, например TEAM.');
    const data = await get('/rest/api/3/project/' + encodeURIComponent(input.jiraProject));
    if (!Array.isArray(data.issueTypes)) throw new Error('Jira не вернула типы задач проекта.');
    return { types: data.issueTypes.filter(t => !t.subtask).map(t => ({ id: String(t.id), name: String(t.name) })) };
  }
  const projects = [];
  for (let startAt = 0; ; ) {
    const data = await get('/rest/api/3/project/search?' + new URLSearchParams({ startAt, maxResults: 100 }));
    if (!Array.isArray(data.values)) throw new Error('Jira не вернула список проектов.');
    projects.push(...data.values.map(p => ({ key: String(p.key), name: String(p.name) })));
    startAt += data.values.length;
    if (data.isLast || !data.values.length || (Number.isFinite(data.total) && startAt >= data.total)) break;
    if (startAt >= 10000) throw new Error('Слишком много проектов. Укажите ключ проекта вручную.');
  }
  return { projects };
}
module.exports = { siteOrigin, guideUrl, jiraOptions };
