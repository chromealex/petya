// Assigning decomposed tasks to people and sending them to Asana as one batch.
const assert = require('assert').strict;
const a = require('../src/assign.cjs');
const { Asana } = require('../src/extensions/asana/asana.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const team = [
  { name: 'Мария Соколова', role: 'QA', responsibilities: 'тестирование оплаты', jiraId: 'u-m', email: 'masha@corp.ru' },
  { name: 'Иван Петров', role: 'бэкенд-разработчик', responsibilities: 'API оплаты, платежи', email: 'ivan@corp.ru' },
  { name: 'Олег Ким', role: 'бэкенд-разработчик', responsibilities: 'API', jiraName: 'Oleg Kim' },
  { name: 'Анна Белова', role: 'дизайнер', responsibilities: 'экраны приложения' }
];
const jira = [{ id: 'u-i', name: 'Иван Петров' }, { id: 'u-o', name: 'Oleg Kim' }, { id: 'u-m', name: 'Мария С.' }];
const asana = [{ id: '111', name: 'Ivan Petrov', email: 'IVAN@corp.ru' }, { id: '222', name: 'Мария Соколова', email: '' }];
const tasks = ['API оплаты', 'Вебхуки оплаты', 'Тесты оплаты', 'Миграция данных', 'Экран оплаты'].map(summary => ({ summary, description: 'Сделать ' + summary }));
const answer = (tasks, rows) => a.parseSuggestions(JSON.stringify({ tasks }), 5, rows);
(async () => {
  await test('team members get their Jira and Asana ids by card, name or email', () => {
    const rows = a.people(team, { jira, asana });
    assert.deepEqual(rows.map(r => [r.name, r.jiraId, r.asanaId]), [['Мария Соколова', 'u-m', '222'], ['Иван Петров', 'u-i', '111'], ['Олег Ким', 'u-o', ''], ['Анна Белова', '', '']]);
    const bare = a.people([], { jira, asana });
    assert(bare.every(r => !r.team)); assert.equal(bare.find(r => r.name === 'Иван Петров').jiraId, 'u-i');
  });
  await test('the model answer keeps only real tasks and people', () => {
    const rows = a.people(team, { jira });
    const s = a.parseSuggestions(JSON.stringify({ tasks: [{ i: 0, effort: 'XL', candidates: [{ n: 1, fit: 1.7, why: 'API', named: false }, { n: 1, fit: 0.2, why: 'дубль', named: false }, { n: 99, fit: 1, why: 'нет такого', named: true }] }, { i: 9, effort: 'S', candidates: [] }] }), 2, rows);
    assert.equal(s[0].effort, 'M'); assert.deepEqual(s[0].candidates.map(c => [c.key, c.fit]), [['m1', 1]]); assert.deepEqual(s[1], { effort: 'M', candidates: [] });
    assert.deepEqual(a.parseSuggestions('не json', 2, rows).map(x => x.candidates.length), [0, 0]);
  });
  await test('the best fit wins, near-equal fits go to the less loaded person', () => {
    const rows = a.people(team, { jira });
    const s = answer([
      { i: 0, effort: 'L', candidates: [{ n: 1, fit: 0.9, why: 'API оплаты — его зона', named: false }, { n: 2, fit: 0.8, why: 'бэкенд', named: false }] },
      { i: 1, effort: 'M', candidates: [{ n: 1, fit: 0.8, why: 'API', named: false }, { n: 2, fit: 0.8, why: 'бэкенд', named: false }] },
      { i: 2, effort: 'S', candidates: [{ n: 0, fit: 0.95, why: 'QA оплаты', named: false }] },
      { i: 3, effort: 'M', candidates: [{ n: 3, fit: 0.2, why: 'не её работа', named: false }] },
      { i: 4, effort: 'M', candidates: [{ n: 3, fit: 0.9, why: 'экраны', named: false }] }
    ], rows);
    const r = a.balance(tasks, s, rows, { load: new Map([['m1', 2], ['m2', 6]]) });
    assert.deepEqual(r.assignments.map(x => x.key), ['m1', 'm2', 'm0', null, null]);
    assert(r.assignments[3].reason.includes('Никто')); // fit below the threshold
    assert(r.assignments[4].reason.includes('нет доступа')); // Anna has no Jira account
    assert.deepEqual(r.summary.unassigned, [3, 4]);
    const ivan = r.summary.people.find(p => p.key === 'm1'); assert.deepEqual([ivan.before, ivan.after, ivan.tasks], [2, 3, [0]]);
    assert.equal(r.summary.people.find(p => p.key === 'm0').before, null); // load unknown
  });
  await test('one strong person does not take the whole feature', () => {
    const rows = a.people(team, { jira });
    const s = answer(tasks.map((_, i) => ({ i, effort: 'M', candidates: [{ n: 1, fit: 0.85, why: 'бэкенд', named: false }, { n: 2, fit: 0.7, why: 'бэкенд', named: false }] })), rows);
    const r = a.balance(tasks, s, rows, { load: new Map([['m1', 0], ['m2', 0]]) });
    const ivan = r.assignments.filter(x => x.key === 'm1').length, oleg = r.assignments.filter(x => x.key === 'm2').length;
    assert(ivan >= 2 && oleg >= 2, `Иван ${ivan}, Олег ${oleg}`);
    assert(r.assignments.some(x => x.key === 'm2' && x.reason.includes('свободнее, чем Иван Петров')));
  });
  await test('a person named in the request keeps the task whatever the load', () => {
    const rows = a.people(team, { jira });
    const s = answer([{ i: 0, effort: 'M', candidates: [{ n: 1, fit: 0.9, why: 'API', named: false }, { n: 2, fit: 0.5, why: 'Олег назван исполнителем', named: true }] }, ...[1, 2, 3, 4].map(i => ({ i, effort: 'S', candidates: [] }))], rows);
    const r = a.balance(tasks, s, rows, { load: new Map([['m1', 0], ['m2', 30]]) });
    assert.equal(r.assignments[0].key, 'm2'); assert(r.assignments[0].named);
    const fixed = a.balance(tasks, s, rows, { fixed: ['m0'] }); assert.equal(fixed.assignments[0].key, 'm0');
  });
  await test('Asana ids decide who can take a task when the target is Asana', () => {
    const rows = a.people(team, { jira, asana });
    const s = answer([{ i: 0, effort: 'M', candidates: [{ n: 2, fit: 0.9, why: 'API', named: false }, { n: 1, fit: 0.6, why: 'бэкенд', named: false }] }, ...[1, 2, 3, 4].map(i => ({ i, effort: 'S', candidates: [] }))], rows);
    assert.equal(a.balance(tasks, s, rows, { ids: r => r.jiraId }).assignments[0].key, 'm2');
    assert.equal(a.balance(tasks, s, rows, { ids: r => r.asanaId }).assignments[0].key, 'm1'); // Oleg is not in Asana
  });
  await test('a large team fits the model window, people related to the tasks first', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ key: 'm' + i, name: 'Сотрудник ' + i, role: 'инженер', responsibilities: 'склад, логистика, отчёты '.repeat(10), projects: 'Склад' }));
    big[77] = { ...big[77], role: 'бэкенд', responsibilities: 'оплата заказов, вебхуки' };
    const { cards, dropped } = a.cards(big, tasks, 3000);
    assert(dropped > 0); assert(cards.some(c => c.n === 77)); assert(require('../src/decompose.cjs').estimate(JSON.stringify(cards)) <= 3000);
    const body = a.suggestRequest('qwen', { command: 'декомпозируй', tasks, team: cards });
    assert.equal(body.think, false); assert(body.messages[1].content.includes('Сотрудник 77'));
  });
  await test('an Asana batch assigns people, links dependencies and never re-sends an unknown result', async () => {
    const calls = []; let fail = '';
    const request = async (url, options = {}) => {
      const u = new URL(url); calls.push({ path: u.pathname, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (u.pathname === '/api/1.0/projects/555') return { data: { gid: '555', name: 'Оплата', workspace: { gid: '9' }, archived: false } };
      if (u.pathname === '/api/1.0/tasks' && options.method === 'POST') {
        const n = calls.filter(c => c.path === '/api/1.0/tasks' && c.method === 'POST').length;
        if (fail === 'timeout' && n === 2) throw new Error('timeout');
        if (fail === 'reject' && n === 2) throw Object.assign(new Error('Bad request'), { status: 400 });
        return { data: { gid: String(1000 + n) } };
      }
      if (/addDependencies$/.test(u.pathname)) return { data: {} };
      if (u.pathname === '/api/1.0/workspaces/9/users') return { data: [{ gid: '111', name: 'Ivan Petrov', email: 'ivan@corp.ru' }] };
      if (u.pathname === '/api/1.0/tasks') return { data: [{ gid: '1' }, { gid: '2' }, { gid: '3' }] };
      throw new Error('Unexpected ' + url);
    };
    const settings = { asanaCredential: 'c', asanaWorkspace: '9' };
    const id = () => require('node:crypto').randomUUID();
    const plan = [{ summary: 'API', description: 'a', assigneeId: '111', dependsOn: [] }, { summary: 'Тесты', description: 'b', assigneeId: '', dependsOn: [0] }, { summary: 'Экран', description: 'c', assigneeId: '111', dependsOn: [0, 1] }];
    let asanaApi = new Asana({ settings: () => settings, request });
    assert.deepEqual(await asanaApi.users(), [{ id: '111', name: 'Ivan Petrov', email: 'ivan@corp.ru' }]);
    assert.equal(await asanaApi.openCount('111'), 3);
    const ok = id(); await asanaApi.prepareBatch({ id: ok, project: '555', tasks: plan });
    const sent = await asanaApi.sendBatch(ok);
    assert(sent.rows.every(r => r.state === 'done')); assert.equal(sent.rows[0].url, 'https://app.asana.com/0/555/1001');
    const creates = calls.filter(c => c.method === 'POST' && c.path === '/api/1.0/tasks');
    assert.equal(creates[0].body.data.assignee, '111'); assert(!('assignee' in creates[1].body.data)); assert.deepEqual(creates[0].body.data.projects, ['555']);
    assert.deepEqual(calls.filter(c => /addDependencies/.test(c.path)).map(c => [c.path, c.body.data.dependencies]), [['/api/1.0/tasks/1002/addDependencies', ['1001']], ['/api/1.0/tasks/1003/addDependencies', ['1001', '1002']]]);
    // Unknown result: stop, keep what was created, block a retry.
    calls.length = 0; fail = 'timeout'; asanaApi = new Asana({ settings: () => settings, request });
    const unsure = id(); await asanaApi.prepareBatch({ id: unsure, project: '555', tasks: plan });
    const first = await asanaApi.sendBatch(unsure);
    assert.deepEqual(first.rows.map(r => r.state), ['done', 'uncertain', 'ready']);
    await assert.rejects(() => asanaApi.sendBatch(unsure), /повтор заблокирован/);
    // A definite rejection can be retried, and only the rest is sent.
    calls.length = 0; fail = 'reject'; asanaApi = new Asana({ settings: () => settings, request });
    const rejected = id(); await asanaApi.prepareBatch({ id: rejected, project: '555', tasks: plan });
    assert.deepEqual((await asanaApi.sendBatch(rejected)).rows.map(r => r.state), ['done', 'rejected', 'ready']);
    fail = ''; const again = await asanaApi.sendBatch(rejected);
    assert(again.rows.every(r => r.state === 'done')); assert.equal(calls.filter(c => c.method === 'POST' && c.path === '/api/1.0/tasks').length, 4);
    // The same batch prepared twice is the same batch.
    assert.equal((await asanaApi.prepareBatch({ id: rejected, project: '555', tasks: [] })).rows.length, 3);
  });
  console.log(`${count} assignment tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
