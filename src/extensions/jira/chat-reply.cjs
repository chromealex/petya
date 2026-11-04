// Read-only Jira chat provider. The host supplies its authorized project scope and API client.
const colors = ['#86c2ff', '#ffd07d', '#ba9bff', '#83dcbb', '#ff9daf', '#94dbea'];
function matches(command) {
  return /(?:^|[^\p{L}])(?:jira|д?жир[аеуы]?)(?![\p{L}])/iu.test(command)
    && /зада[чн]|таск/iu.test(command)
    && /у меня|мо[ияёе]|на мн[её]|мне назнач/iu.test(command)
    && /сколько|количеств|по типам|по статусам|распределен|распределён|диаграмм|пончик/iu.test(command)
    && !/^(?:петя[,!\s]+)?(?:не\s|[«"“]|объясни фразу|переведи)/iu.test(command.trim())
    && !/проект[аеу]?\s+[A-Z][A-Z0-9_-]*\b/u.test(command)
    && !/созда[йт]|заведи|удали|перенеси|просроч|за неделю|за месяц|вчера|сегодня|открыт|закрыт|незакрыт|спринт/iu.test(command);
}
function donut(rows, total) {
  let offset = 0;
  const rings = rows.map(({ count }, index) => {
    const percentage = 100 * count / total;
    const circle = `<circle r="54" cx="76" cy="76" pathLength="100" fill="none" stroke="${colors[index % colors.length]}" stroke-width="18" stroke-dasharray="${percentage} ${100 - percentage}" stroke-dashoffset="${-offset}"/>`;
    offset += percentage;
    return circle;
  }).join('');
  const xml = value => value.replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' })[c]);
  const height = Math.max(152, rows.length * 24 + 16);
  const legend = rows.map(({ label, count }, i) => {
    const y = 24 + i * 24;
    return `<circle cx="166" cy="${y-5}" r="5" fill="${colors[i % colors.length]}"/><text x="178" y="${y}" font-size="14">${xml(label.slice(0, 26))}</text><text x="446" y="${y}" text-anchor="end" font-size="14">${count}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 ${height}" width="460" height="${height}" font-family="sans-serif" fill="#edf2f5"><rect width="100%" height="100%" rx="12" fill="#20282d"/><g transform="rotate(-90 76 76)">${rings}</g><text x="76" y="84" text-anchor="middle" font-size="26">${total}</text>${legend}</svg>`;
  return { type: 'image', mimeType: 'image/svg+xml', data: Buffer.from(svg).toString('base64') };
}
async function answer(command, { projects, searchPage }) {
  if (!projects.length) throw Error('Выберите доступный проект в подключении Jira.');
  const byStatus = /статус/iu.test(command);
  const field = byStatus ? 'status' : 'issuetype';
  const quote = s => '"' + s.replace(/["\\]/g, '\\$&') + '"';
  const jql = 'assignee = currentUser() AND project IN (' + projects.map(quote).join(', ') + ') ORDER BY key';
  const groups = new Map(), ids = new Set(), tokens = new Set();
  let token;
  do {
    const params = new URLSearchParams({ jql, fields: field, maxResults: '100' });
    if (token) params.set('nextPageToken', token);
    const page = await searchPage('/rest/api/3/search/jql?' + params);
    if (!Array.isArray(page?.issues)) throw Error('Jira вернула неполную страницу задач.');
    for (const issue of page.issues) {
      const id = issue.id || issue.key;
      if (!id) throw Error('Jira вернула задачу без идентификатора.');
      if (ids.has(id)) continue;
      ids.add(id);
      const label = issue.fields?.[field]?.name || 'Без значения';
      groups.set(label, (groups.get(label) || 0) + 1);
    }
    token = page.nextPageToken;
    if (page.isLast === false && !token || token && tokens.has(token)) throw Error('Не удалось получить все страницы задач из Jira.');
    if (token) tokens.add(token);
  } while (token);
  const rows = Array.from(groups, ([label, count]) => ({ label, count })).sort((a,b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  const title = 'Мои задачи Jira по ' + (byStatus ? 'статусам' : 'типам') + ' · ' + projects.join(', ');
  const text = rows.length ? [title, 'Всего: ' + ids.size, ...rows.map(row => row.label + ' — ' + row.count)].join('\n') : title + '\nНазначенных вам задач нет.';
  return [{ type: 'text', text }, ...(rows.length ? [donut(rows, ids.size)] : [])];
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
