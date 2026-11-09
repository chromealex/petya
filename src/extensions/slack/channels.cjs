const channelId = /^[CDG][A-Z0-9]+$/;

function selectors(value) {
  const parts = String(value || '').split(/[,\s]+/).filter(Boolean).map(s => s.replace(/^#/, ''));
  if (!parts.length) throw new Error('Укажите каналы Slack: * для всех, jw-* для маски, название или ID.');
  if (parts.some(p => !channelId.test(p) && !/^[\p{L}\p{N}_.*-]+$/u.test(p))) throw new Error('Укажите название, маску вроде jw-* или ID канала Slack.');
  return [...new Set(parts)];
}

async function resolveChannels(value, token, request) {
  const parts = selectors(value);
  const ids = new Set(parts.filter(s => channelId.test(s)));
  const patterns = parts.filter(s => !channelId.test(s)).map(s => new RegExp('^' + s.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i'));
  if (!patterns.length) return [...ids];
  let cursor = '';
  const seen = new Set();
  do {
    const url = new URL('https://slack.com/api/conversations.list');
    url.search = new URLSearchParams({ types: 'public_channel,private_channel', exclude_archived: 'true', limit: '200', ...(cursor ? { cursor } : {}) }).toString();
    const data = await request(url.href, { headers: { Authorization: `Bearer ${token}` } });
    if (!data.ok) throw new Error('Slack: ' + String(data.error) + (data.error === 'missing_scope' ? '. Для поиска каналов нужны channels:read и groups:read. Повторите подключение Slack через браузер и разрешите доступ. При ручном подключении добавьте эти права в OAuth & Permissions → User Token Scopes и выполните Reinstall to Workspace.' : ''));
    for (const c of data.channels || []) {
      if (!c.is_archived && channelId.test(c.id) && patterns.some(p => p.test(c.name || ''))) ids.add(c.id);
    }
    cursor = (data.response_metadata?.next_cursor || '').trim();
    if (cursor && seen.has(cursor)) throw new Error('Slack повторил страницу списка каналов. Повторите обновление.');
    seen.add(cursor);
  } while (cursor);
  if (!ids.size) throw new Error('Не найдены доступные каналы Slack по указанным названиям или маскам.');
  return [...ids];
}

function matches(name, parts) {
  return parts.filter(s => !channelId.test(s)).some(s => new RegExp('^' + s.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i').test(name || ''));
}

module.exports = { resolveChannels, selectors, channelId, matches };
