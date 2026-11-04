const { chartReply } = require('../chart-reply.cjs');

function matches(command) {
  return /confluence|конфл[юу][еэ]нс/iu.test(command)
    && /страниц/iu.test(command) && /пространств/iu.test(command)
    && /сколько|количеств|график|диаграмм|распределени/iu.test(command)
    && !/^(?:петя[,!\s]+)?(?:не\s|[«"“]|переведи|объясни фразу)/iu.test(command.trim())
    && !/вчера|сегодня|за (?:недел|месяц|год)|создан|обновл|моих/iu.test(command);
}

async function answer(command, { space, searchPage }) {
  const params = new URLSearchParams({ cql: 'type = page' + (space ? ' AND space = ' + JSON.stringify(space) : ''), expand: 'space', limit: '100' });
  const pages = new Set(), counts = new Map(), cursors = new Set();
  for (;;) {
    const page = await searchPage('/wiki/rest/api/content/search?' + params);
    if (!Array.isArray(page?.results)) throw Error('Confluence вернул неполную страницу результатов.');
    for (const item of page.results) {
      if (!item.id || !item.space?.key) throw Error('Confluence не вернул идентификатор страницы или пространство.');
      if (pages.has(item.id)) continue;
      pages.add(item.id);
      counts.set(item.space.key, (counts.get(item.space.key) || 0) + 1);
    }
    if (!page._links?.next) break;
    // Copy only the cursor. The base URL, CQL scope and authorization stay local.
    const cursor = new URL(page._links.next, 'https://pagination.invalid').searchParams.get('cursor');
    if (!cursor || cursors.has(cursor)) throw Error('Не удалось получить все страницы Confluence.');
    cursors.add(cursor);
    params.set('cursor', cursor);
  }
  const rows = Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a,b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'));
  return chartReply({ kind: 'bars', title: 'Страницы Confluence по пространствам' + (space ? ' · ' + space : ''),
    rows, emptyText: 'Нет доступных страниц.' });
}

function context({ settings, workspace, check }) {
  const { confluenceUrl, confluenceEmail, confluenceToken, confluenceSpace } = settings;
  if (!confluenceUrl || !confluenceEmail || !confluenceToken) throw Error('Настройте подключение Confluence.');
  const headers = { Authorization: 'Basic ' + Buffer.from(confluenceEmail + ':' + confluenceToken).toString('base64') };
  return { space: confluenceSpace, searchPage: async path => {
    check();
    const data = await workspace.request(confluenceUrl + path, { headers });
    check();
    return data;
  } };
}
module.exports = { matches, answer, context };
