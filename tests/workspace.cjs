const assert = require('assert').strict;
const { Workspace, chooseVersion, validateTasks, queryTerms, plain } = require('../src/workspace.cjs');
const settings = { jiraUrl: 'https://test.atlassian.net', jiraEmail: 'test@example.com', jiraToken: 'fixture', jiraProject: 'TEST', jiraIssueType: '10001', jiraBoardId: '1', model: 'fixture', ollamaUrl: 'http://localhost:11434/api/chat' };
const task = { summary: 'API одноразового кода', description: 'Проверить срок жизни кода.', assigneeId: 'user-1', dependsOn: [] };
const input = () => ({ id: '12345678-1234-1234-1234-123456789abc', project: 'TEST', siteUrl: settings.jiraUrl, boardId: '1', sprintId: '11', versionId: '7', tasks: [{ ...task }, { ...task, summary: 'Интерфейс входа', dependsOn: [0] }] });
function fixture(failure = '') {
  const calls = []; let creations = 0, fail = true, saved = [];
  const request = async (address, options = {}) => {
    const u = new URL(address); calls.push({ url: u, options });
    if (u.pathname === '/rest/agile/1.0/board') return { values: [{ id: 1, name: 'Team' }], isLast: true };
    if (u.pathname.endsWith('/versions')) return [{ id: '7', name: '1.0', released: false }, { id: '8', name: 'Old', released: true }];
    if (u.pathname.endsWith('/sprint')) return { values: [{ id: 11, name: 'Sprint 11', state: 'active' }], isLast: true };
    if (u.pathname.endsWith('/user/assignable/search')) return [{ accountId: 'user-1', displayName: 'Иван Петров', active: true }];
    if (u.pathname === '/rest/api/3/issue') {
      creations++;
      if (failure === 'create' && fail) { fail = false; throw new Error('timeout'); }
      if (failure === 'reject' && fail) { fail = false; const e = new Error('Bad request'); e.status = 400; throw e; }
      return { key: 'TEST-' + creations };
    }
    if (u.pathname === '/rest/agile/1.0/sprint/11/issue') { if (failure === 'schedule' && fail) { fail = false; throw new Error('timeout'); } return null; }
    if (u.pathname.includes('/wiki/')) return { results: [{ id: '5', title: 'Авторизация', body: { storage: { value: '<p>Одноразовый код</p><script>malicious</script>' } } }] };
    if (u.pathname === '/api/chat') return { message: { content: JSON.stringify({ tasks: [{ ...task }, { ...task, summary: 'UI', dependsOn: [0] }], questions: ['Уточнить платформу'] }) } };
    throw new Error('Unexpected URL ' + address);
  };
  return { service: new Workspace({ settings: () => settings, request, save: h => { saved = JSON.parse(JSON.stringify(h)); } }), calls, creations: () => creations, saved: () => saved };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
  await test('current release is never guessed among several open versions', () => { assert.equal(chooseVersion([{ id: '1' }, { id: '2' }]), ''); assert.equal(chooseVersion([{ id: '1' }, { id: '2' }], '2'), '2'); assert.equal(chooseVersion([{ id: '1', released: true }, { id: '2' }], '1'), '2'); });
  await test('cycles, self dependencies and unknown assignees are rejected', () => { assert.throws(() => validateTasks([{ ...task, dependsOn: [0] }], null, true)); assert.throws(() => validateTasks([{ ...task, dependsOn: [1] }, { ...task, dependsOn: [0] }], null, true)); assert.throws(() => validateTasks([task], [{ id: 'another' }], false)); assert.throws(() => validateTasks([{ ...task, assigneeId: '' }], null, true)); });
  await test('document query excludes CQL operators and markup remains plain text', async () => { const f = fixture(); const result = await f.service.searchDocs({ title: 'Вход', text: '' }, 'код" OR type=blogpost'); assert(result.docs[0].url.startsWith(settings.jiraUrl)); assert(!result.docs[0].text.includes('malicious')); assert(!queryTerms({ title: '', text: '' }, '" ()').length); assert.equal(plain('<b>&lt;hi&gt;</b>'), '<hi>'); });
  await test('metadata resolves the unique active sprint and release', async () => { const result = await fixture().service.metadata(); assert.equal(result.sprintId, '11'); assert.equal(result.versionId, '7'); });
  await test('decomposition uses selected source documents with citations', async () => { const f = fixture(); const context = { title: 'Вход', text: 'Вход по email', source: 'Zoom' }; await f.service.searchDocs(context); const result = await f.service.prepare('Разбей на задачи', context, ['confluence:5']); assert.equal(result.tasks.length, 2); assert(result.tasks[0].description.includes('pageId=5')); });
  await test('batch sets assignee, fixVersions, sprint and durable state', async () => { const f = fixture(); const result = await f.service.submit(input()); assert.equal(result.rows.filter(r => r.state === 'done').length, 2); const create = f.calls.find(c => c.url.pathname === '/rest/api/3/issue'); const fields = JSON.parse(create.options.body).fields; assert.deepEqual(fields.assignee, { accountId: 'user-1' }); assert.deepEqual(fields.fixVersions, [{ id: '7' }]); assert.equal(f.saved()[0].rows[0].key, 'TEST-1'); });
  await test('retry after sprint failure never recreates a known issue', async () => { const f = fixture('schedule'); const first = await f.service.submit(input()); assert.equal(first.rows[0].state, 'schedule-failed'); assert.equal(f.creations(), 1); const second = await f.service.submit(input()); assert(second.rows.every(r => r.state === 'done')); assert.equal(f.creations(), 2); await f.service.submit(input()); assert.equal(f.creations(), 2); });
  await test('unknown create result is not retried', async () => { const f = fixture('create'); const first = await f.service.submit(input()); assert.equal(first.rows[0].state, 'uncertain'); await f.service.submit(input()); assert.equal(f.creations(), 1); assert.equal(f.saved()[0].rows[0].state, 'uncertain'); });
  await test('definite Jira rejection can be retried', async () => { const f = fixture('reject'); assert.equal((await f.service.submit(input())).rows[0].state, 'rejected'); assert((await f.service.submit(input())).rows.every(r => r.state === 'done')); });
  await test('concurrent clicks cannot race preflight and duplicate issues', async () => { const f = fixture(); const results = await Promise.allSettled([f.service.submit(input()), f.service.submit(input())]); assert.equal(results.filter(r => r.status === 'rejected').length, 1); assert.equal(f.creations(), 2); });
  await test('invalid version causes no remote write', async () => { const f = fixture(); await assert.rejects(f.service.submit({ ...input(), versionId: '999' })); assert.equal(f.creations(), 0); });
  await test('editing a partially sent batch is blocked', async () => { const f = fixture('schedule'); await f.service.submit(input()); await assert.rejects(f.service.submit({ ...input(), tasks: [task] })); assert.equal(f.creations(), 1); });
  await test('restart history blocks resending the same batch ID', async () => { const f = fixture(); await f.service.submit(input()); const history = f.saved(); f.service.batches.clear(); f.service.history = history; await assert.rejects(f.service.submit(input())); assert.equal(f.creations(), 2); });
  console.log(`${count} workspace tests passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
