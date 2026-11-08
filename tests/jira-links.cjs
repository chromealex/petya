// Jira batches: «Blocks» links between the created issues (right direction, no duplicates on retry, failures named)
// and a version per task, with the version the discussion names chosen by itself.
const assert = require('assert').strict;
const { Workspace, namedVersion } = require('../src/workspace.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const settings = { jiraUrl: 'https://t.atlassian.net', jiraEmail: 'a', jiraToken: 't', jiraProject: 'PAY', jiraIssueType: '10001', jiraBoardId: '1', model: 'm', ollamaUrl: 'http://localhost:11434/api/chat' };
// A fake Jira that keeps links. `reversed` makes POST /issueLink mean the opposite of its field names.
function jira({ reversed = false, noBlocks = false, failLink = '', failCreate = 0 } = {}) {
  const links = [], creates = [], log = []; let n = 0, linkId = 0;
  const request = async (address, options = {}) => {
    const u = new URL(address), method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null; log.push(method + ' ' + u.pathname);
    if (u.pathname === '/rest/agile/1.0/board') return { values: [{ id: 1, name: 'Team' }], isLast: true };
    if (u.pathname.endsWith('/versions')) return [{ id: '7', name: '1.19.3', released: false }, { id: '8', name: '1.20', released: false }, { id: '6', name: '1.19', released: true }];
    if (u.pathname.endsWith('/sprint')) return { values: [{ id: 11, name: 'Sprint 24', state: 'active' }], isLast: true };
    if (u.pathname.endsWith('/user/assignable/search')) return [{ accountId: 'u1', displayName: 'Иван', active: true }];
    if (u.pathname === '/rest/api/3/issue' && method === 'POST') { if (failCreate && ++n === failCreate) throw new Error('timeout'); creates.push(body.fields); return { key: 'PAY-' + (creates.length) }; }
    if (u.pathname === '/rest/agile/1.0/sprint/11/issue') return null;
    if (u.pathname === '/rest/api/3/issueLinkType') return { issueLinkTypes: noBlocks ? [{ id: '1', name: 'Relates', inward: 'relates to', outward: 'relates to' }] : [{ id: '1', name: 'Relates', inward: 'relates to', outward: 'relates to' }, { id: '3', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }] };
    if (u.pathname === '/rest/api/3/issueLink' && method === 'POST') {
      if (failLink && body.inwardIssue.key === failLink) throw Object.assign(new Error('Нет прав на связи'), { status: 403 });
      let blocker = body.outwardIssue.key, blocked = body.inwardIssue.key; if (reversed) [blocker, blocked] = [blocked, blocker];
      links.push({ id: String(++linkId), type: body.type.id, blocker, blocked }); return null;
    }
    if (/^\/rest\/api\/3\/issueLink\/\d+$/.test(u.pathname) && method === 'DELETE') { const id = u.pathname.split('/').pop(); links.splice(links.findIndex(l => l.id === id), 1); return null; }
    const read = /^\/rest\/api\/3\/issue\/(PAY-\d+)$/.exec(u.pathname);
    if (read && u.searchParams.get('fields') === 'issuelinks') {
      const key = read[1];
      return { fields: { issuelinks: links.filter(l => l.blocked === key || l.blocker === key).map(l => ({ id: l.id, type: { id: l.type, name: 'Blocks' }, ...(l.blocked === key ? { inwardIssue: { key: l.blocker } } : { outwardIssue: { key: l.blocked } }) })) } };
    }
    if (read) return { key: read[1], fields: { summary: 's', description: null, assignee: { accountId: 'u1' }, fixVersions: [], labels: [], customfield_10020: [], updated: '2026-01-01', subtasks: [] } };
    throw new Error('Unexpected ' + method + ' ' + address);
  };
  return { request, links, creates, log };
}
const task = (summary, dependsOn = [], extra = {}) => ({ summary, description: 'Описание ' + summary, assigneeId: 'u1', dependsOn, ...extra });
const input = (id, tasks) => ({ id, project: 'PAY', siteUrl: settings.jiraUrl, boardId: '1', sprintId: '11', versionId: '7', tasks });
const plan = [task('API'), task('Вебхуки', [0]), task('Экран', [0, 1])];
const blocks = links => links.map(l => l.blocker + '→' + l.blocked).sort();
const uuid = () => require('node:crypto').randomUUID();
(async () => {
  await test('dependencies become «Blocks» links between the created issues', async () => {
    const j = jira(), w = new Workspace({ settings: () => settings, request: j.request });
    const record = await w.submit(input(uuid(), plan));
    assert.deepEqual(blocks(j.links), ['PAY-1→PAY-2', 'PAY-1→PAY-3', 'PAY-2→PAY-3']);
    assert.deepEqual(record.rows.map(r => [r.key, r.blockedBy, r.linked, r.linkError]), [['PAY-1', [], [], ''], ['PAY-2', ['PAY-1'], ['PAY-1'], ''], ['PAY-3', ['PAY-1', 'PAY-2'], ['PAY-1', 'PAY-2'], '']]);
    assert(j.creates[1].description.content.some(p => JSON.stringify(p).includes('Зависимости внутри плана'))); // the text stays as a fallback
  });
  await test('a Jira that reads the link the other way round is detected and corrected once', async () => {
    const j = jira({ reversed: true }), w = new Workspace({ settings: () => settings, request: j.request });
    await w.submit(input(uuid(), plan));
    assert.deepEqual(blocks(j.links), ['PAY-1→PAY-2', 'PAY-1→PAY-3', 'PAY-2→PAY-3']);
    assert.equal(j.log.filter(l => l.startsWith('DELETE')).length, 1);
  });
  await test('a retry adds only the missing links, never a duplicate', async () => {
    const j = jira({ failLink: 'PAY-3' }), w = new Workspace({ settings: () => settings, request: j.request }), id = uuid();
    const first = await w.submit(input(id, plan));
    assert(first.rows[2].linkError.includes('Нет прав')); assert.deepEqual(blocks(j.links), ['PAY-1→PAY-2']);
    const j2 = jira(); j2.links.push(...j.links); // same links on the server, the permission is fixed
    w.request = j2.request; await w.submit(input(id, plan));
    assert.deepEqual(blocks(j2.links), ['PAY-1→PAY-2', 'PAY-1→PAY-3', 'PAY-2→PAY-3']);
    assert.equal(j2.log.filter(l => l === 'POST /rest/api/3/issueLink').length, 2);
    assert.equal(j2.log.filter(l => l === 'POST /rest/api/3/issue').length, 0); // nothing re-created
  });
  await test('without a «Blocks» link type the plan says so and keeps the text', async () => {
    const j = jira({ noBlocks: true }), w = new Workspace({ settings: () => settings, request: j.request });
    const record = await w.submit(input(uuid(), plan));
    assert.equal(j.links.length, 0); assert(record.rows[1].linkError.includes('нет типа связи «Blocks»')); assert(record.rows.every(r => r.state === 'done'));
  });
  await test('links wait for the issues they need: none while a creation result is unknown', async () => {
    const j = jira({ failCreate: 2 }), w = new Workspace({ settings: () => settings, request: j.request });
    const record = await w.submit(input(uuid(), plan));
    assert.equal(record.rows[1].state, 'uncertain'); assert.equal(j.links.length, 0);
  });
  await test('each task can have its own version; the batch version is the default', async () => {
    const j = jira(), w = new Workspace({ settings: () => settings, request: j.request });
    await w.submit(input(uuid(), [task('API'), task('Экран', [], { versionId: '8' })]));
    assert.deepEqual(j.creates.map(f => f.fixVersions), [[{ id: '7' }], [{ id: '8' }]]);
    await assert.rejects(() => w.submit(input(uuid(), [task('API', [], { versionId: '6' })])), /выпущена или недоступна/);
  });
  await test('the version the discussion names is chosen by itself', async () => {
    const versions = [{ id: '7', name: '1.19.3' }, { id: '8', name: '1.20' }, { id: '6', name: '1.19', released: true }];
    assert.equal(namedVersion(versions, 'делаем в 1.19.3'), '7'); assert.equal(namedVersion(versions, 'к релизу v1.20'), '8');
    assert.equal(namedVersion(versions, 'в 1.20 и 1.19.3'), ''); assert.equal(namedVersion(versions, 'было в 1.19'), ''); assert.equal(namedVersion(versions, 'выйдет в 1.20.1'), '');
    const j = jira(), w = new Workspace({ settings: () => settings, request: async (url, o) => url.includes('/api/chat') ? { message: { content: JSON.stringify({ tasks: [task('API'), task('UI')], questions: [] }) } } : j.request(url, o) });
    const result = await w.prepare('декомпозь', { title: 'Оплата', text: 'Решили выпустить оплату в 1.20', source: 'Zoom' }, []);
    assert.equal(result.metadata.versionId, '8'); assert(result.metadata.versionNamed);
  });
  console.log(`${count} Jira link and version tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
