// Read-only Jira chat provider. The host supplies its authorized project scope and API client.
const { chartReply } = require('../chart-reply.cjs');
function matches(command) {
  return /(?:^|[^\p{L}])(?:jira|д?жир[аеуы]?)(?![\p{L}])/iu.test(command)
    && /зада[чн]|таск/iu.test(command)
    && /у меня|мо[ияёе]|на мн[её]|мне назнач/iu.test(command)
    && /сколько|количеств|по типам|по статусам|распределен|распределён|диаграмм|пончик/iu.test(command)
    && !/^(?:петя[,!\s]+)?(?:не\s|[«"“]|объясни фразу|переведи)/iu.test(command.trim())
    && !/проект[аеу]?\s+[A-Z][A-Z0-9_-]*\b/u.test(command)
    && !/созда[йт]|заведи|удали|перенеси|просроч|за неделю|за месяц|вчера|сегодня|открыт|закрыт|незакрыт|спринт/iu.test(command);
}
async function answer(command, { projects, searchPage }) {
  if (!projects.length) throw Error('Выберите доступный проект в подключении Jira.');
  const stalled = /завис|застрял|без движения/iu.test(command);
  const staleKeys = [];
  const cutoff = Date.now() - 7 * 86400000;
  const byStatus = stalled || /статус/iu.test(command);
  const field = byStatus ? 'status' : 'issuetype';
  const quote = s => '"' + s.replace(/["\\]/g, '\\$&') + '"';
  const jql = 'assignee = currentUser() AND project IN (' + projects.map(quote).join(', ') + ') ORDER BY key';
  const groups = new Map(), ids = new Set(), tokens = new Set();
  let token;
  do {
    const params = new URLSearchParams({ jql, fields: stalled ? 'status,updated' : field, maxResults: '100' });
    if (token) params.set('nextPageToken', token);
    const page = await searchPage('/rest/api/3/search/jql?' + params);
    if (!Array.isArray(page?.issues)) throw Error('Jira вернула неполную страницу задач.');
    for (const issue of page.issues) {
      const id = issue.id || issue.key;
      if (!id) throw Error('Jira вернула задачу без идентификатора.');
      if (ids.has(id)) continue;
      ids.add(id);
      if (stalled && issue.fields?.status?.statusCategory?.key === 'indeterminate' &&
          Date.parse(issue.fields.updated) <= cutoff) staleKeys.push(issue.key);
      const label = issue.fields?.[field]?.name || 'Без значения';
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    token = page.nextPageToken;
    if (page.isLast === false && !token || token && tokens.has(token)) throw Error('Не удалось получить все страницы задач из Jira.');
    if (token) tokens.add(token);
  } while (token);
  const rows = Array.from(groups, ([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  const title = 'Мои задачи Jira по ' + (byStatus ? 'статусам' : 'типам') + ' · ' + projects.join(', ');
  const content = chartReply({ kind: 'donut', title, rows, emptyText: 'Назначенных вам задач нет.' });
  if (stalled) content.push({type:'text',text:'В работе без обновлений 7 дней и дольше: ' + (staleKeys.join(', ') || 'нет') + '.'});
  return content;
}
function context({ settings, workspace, check }) {
  return { projects: settings.jiraProject ? [settings.jiraProject] : [], searchPage: async path => {
    check();
    const page = await workspace.api(path, {}, settings);
    check();
    return page;
  } };
}
module.exports = { matches, answer, context };
