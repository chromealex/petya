// The assignment feature end to end with fake Jira, Asana and model: targets, summary per person, rebalancing on a
// target switch without asking the model again, the chat answer, and the Asana batch.
const assert = require('assert').strict;
const feature = require('../src/features/assignment.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const team = [
  { name: 'Мария Соколова', role: 'QA', responsibilities: 'тестирование оплаты', jiraId: 'u-m', email: 'masha@corp.ru' },
  { name: 'Иван Петров', role: 'бэкенд', responsibilities: 'API оплаты', email: 'ivan@corp.ru' },
  { name: 'Олег Ким', role: 'бэкенд', responsibilities: 'API', jiraName: 'Oleg Kim', email: 'oleg@corp.ru' }
];
function setup({ settings: extra = {}, modelAnswer } = {}) {
  const settings = { teamMembers: JSON.stringify(team), model: 'qwen', ollamaUrl: 'http://localhost:11434/api/chat', jiraUrl: 'https://t.atlassian.net', jiraEmail: 'a', jiraToken: 't', jiraProject: 'PAY', asanaCredential: 'c', asanaWorkspace: '9', ...extra };
  const calls = { model: 0, asana: [] }, remembered = [];
  const workspace = {
    settings: () => settings,
    people: async () => [{ id: 'u-i', name: 'Иван Петров' }, { id: 'u-o', name: 'Oleg Kim' }, { id: 'u-m', name: 'Мария С.' }],
    api: async () => ({ issues: [...Array(6)].map(() => ({ fields: { assignee: { accountId: 'u-o' }, status: { statusCategory: { key: 'new' } } } })).concat({ fields: { assignee: { accountId: 'u-i' }, status: { statusCategory: { key: 'indeterminate' } } } }), isLast: true }),
    request: async (url, options) => {
      calls.model++; const body = JSON.parse(options.body); assert.equal(body.think, false); assert(options.timeoutMs >= 60000);
      return { message: { content: JSON.stringify(modelAnswer || { tasks: [
        { i: 0, effort: 'M', candidates: [{ n: 1, fit: 0.85, why: 'API оплаты', named: false }, { n: 2, fit: 0.8, why: 'бэкенд', named: false }] },
        { i: 1, effort: 'M', candidates: [{ n: 1, fit: 0.8, why: 'API', named: false }, { n: 2, fit: 0.8, why: 'бэкенд', named: false }] },
        { i: 2, effort: 'S', candidates: [{ n: 0, fit: 0.95, why: 'QA оплаты', named: false }] }
      ] }) } };
    }
  };
  const request = async (url, options = {}) => {
    const u = new URL(url); calls.asana.push(u.pathname + (options.method ? ' ' + options.method : ''));
    if (u.pathname === '/api/1.0/workspaces/9/users') return { data: [{ gid: '111', name: 'Ivan Petrov', email: 'ivan@corp.ru' }, { gid: '333', name: 'Oleg Kim', email: 'oleg@corp.ru' }] };
    if (u.pathname === '/api/1.0/tasks' && !options.method) return { data: u.searchParams.get('assignee') === '333' ? [{ gid: '1' }] : [{ gid: '1' }, { gid: '2' }, { gid: '3' }, { gid: '4' }, { gid: '5' }] };
    if (u.pathname === '/api/1.0/workspaces/9/projects') return { data: [{ gid: '555', name: 'Оплата', archived: false }, { gid: '556', name: 'Старое', archived: true }] };
    if (u.pathname === '/api/1.0/projects/555') return { data: { gid: '555', name: 'Оплата', workspace: { gid: '9' }, archived: false } };
    if (u.pathname === '/api/1.0/tasks' && options.method === 'POST') return { data: { gid: String(900 + calls.asana.filter(c => c.endsWith('/tasks POST')).length) } };
    if (u.pathname.endsWith('/addDependencies')) return { data: {} };
    throw new Error('Unexpected ' + url);
  };
  const services = { settings, workspace, request, modules: null, core: require('../src/core.cjs'), dialogue: { rememberAction: (q, a) => remembered.push([q, a]), active: () => ({ id: 't', title: 'Чат', messages: [] }) } };
  const out = feature.setup(services);
  return { ipc: out.ipc, turn: out.teamLoad.turn, calls, remembered };
}
const tasks = [{ summary: 'API оплаты', description: 'Эндпоинты' }, { summary: 'Вебхуки', description: 'Подписи' }, { summary: 'Тесты оплаты', description: 'Сценарии' }];
const planId = '12345678-1234-1234-1234-123456789abc';
(async () => {
  await test('both trackers are offered when both are connected', async () => {
    assert.deepEqual(await setup().ipc.targets(), { jira: true, asana: true });
    assert.deepEqual(await setup({ settings: { jiraUrl: '' } }).ipc.targets(), { jira: false, asana: true });
  });
  await test('Jira: tasks go to the right people with load in the summary', async () => {
    const { ipc } = setup(), r = await ipc.assign({ planId, command: 'декомпозь', tasks, target: 'jira' });
    assert.deepEqual(r.tasks.map(t => [t.name, t.assigneeId]), [['Иван Петров', 'u-i'], ['Иван Петров', 'u-i'], ['Мария Соколова', 'u-m']]);
    // Oleg has 6 open tasks, Ivan 1: equal fits for «Вебхуки» go to Ivan.
    assert.deepEqual(r.summary.people.map(p => [p.name, p.before, p.after]), [['Иван Петров', 1, 3], ['Мария Соколова', 0, 1]]);
    assert.deepEqual(r.candidates.map(c => [c.id, c.open]), [['u-m', 0], ['u-i', 1], ['u-o', 6]]);
    assert.deepEqual(r.warnings, []);
  });
  await test('switching to Asana rebalances with Asana load without asking the model again', async () => {
    const { ipc, calls } = setup();
    await ipc.assign({ planId, command: 'декомпозь', tasks, target: 'jira' });
    const r = await ipc.assign({ planId, command: 'декомпозь', tasks, target: 'asana' });
    assert.equal(calls.model, 1);
    // In Asana Ivan has 5 open tasks and Oleg 1, so the near-equal fit goes to Oleg first; Maria has no Asana account.
    assert.deepEqual(r.tasks.map(t => [t.name, t.assigneeId]), [['Олег Ким', '333'], ['Иван Петров', '111'], ['', '']]);
    assert(r.tasks[0].reason.includes('свободнее, чем Иван Петров: открыто 1 против 5'));
    assert(r.tasks[2].reason.includes('нет доступа'));
    assert(r.warnings.some(w => w.includes('Нет аккаунта в Asana у: Мария Соколова')));
  });
  await test('a task named for someone in the plan keeps that person', async () => {
    const r = await setup().ipc.assign({ planId, command: 'Олегу вебхуки', tasks: tasks.map((t, i) => i === 1 ? { ...t, assigneeId: 'u-o' } : t), target: 'jira' });
    assert.equal(r.tasks[1].name, 'Олег Ким'); assert(r.tasks[1].named);
  });
  await test('without a team only named people are filled, and the summary says why', async () => {
    const r = await setup({ settings: { teamMembers: '[]' } }).ipc.assign({ planId, command: 'декомпозь', tasks, target: 'jira' });
    assert(r.tasks.every(t => !t.assigneeId)); assert(r.warnings[0].includes('«Команда» не заполнена'));
    assert(r.candidates.some(c => c.id === 'u-i')); // Jira users are still offered by hand
  });
  await test('a target that is not connected is refused', async () => {
    await assert.rejects(() => setup({ settings: { asanaCredential: '' } }).ipc.assign({ planId, tasks, target: 'asana' }), /Asana не подключена/);
  });
  await test('Asana projects and the batch send', async () => {
    const { ipc, calls } = setup();
    assert.deepEqual(await ipc.asanaProjects(), [{ id: '555', name: 'Оплата' }]);
    const sent = await ipc.asanaSend({ id: planId, project: '555', tasks: tasks.map((t, i) => ({ ...t, assigneeId: i < 2 ? '111' : '', dependsOn: i ? [0] : [] })) });
    assert(sent.rows.every(r => r.state === 'done')); assert.equal(calls.asana.filter(c => c.endsWith('addDependencies POST')).length, 2);
  });
  await test('chat: «загрузка команды» and «сколько задач у Олега»', async () => {
    const { turn, remembered } = setup();
    assert.equal(await turn('какая погода'), null);
    const all = await turn('загрузка команды');
    assert(all.handled && all.text.includes('больше всего — Олег Ким (7)'), all.text);
    assert(all.text.includes('- Олег Ким — бэкенд: 7 открытых задач · Jira 6, Asana 1'));
    const one = await turn('сколько задач у Олега');
    assert.equal(one.text, '- Олег Ким — бэкенд: 7 открытых задач · Jira 6, Asana 1');
    assert.equal(remembered.length, 2);
  });
  console.log(`${count} assignment feature tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
