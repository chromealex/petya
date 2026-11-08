// Workload of the team: open tasks per person from Jira and Asana, for the team page, chat and assignment.
const assert = require('assert').strict;
const { Workload, loadQuestion, answer, sources, personAnswer, groupAnswer } = require('../src/workload.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const team = [
  { name: 'Мария Соколова', aliases: 'Маша', role: 'QA', jiraId: 'u-m', email: 'masha@corp.ru' },
  { name: 'Иван Петров', role: 'бэкенд', email: 'ivan@corp.ru' },
  { name: 'Анна Белова', role: 'дизайнер' }
];
const settings = { teamMembers: JSON.stringify(team), jiraUrl: 'https://t.atlassian.net', jiraEmail: 'a', jiraToken: 't', jiraProject: 'PAY', asanaCredential: 'c', asanaWorkspace: '9' };
function fixture({ jiraFails = false } = {}) {
  const calls = [];
  const issue = (id, cat) => ({ fields: { assignee: { accountId: id }, status: { statusCategory: { key: cat } } } });
  const workspace = {
    people: async () => [{ id: 'u-i', name: 'Иван Петров' }, { id: 'u-m', name: 'Мария С.' }],
    api: async (route, options) => { calls.push(JSON.parse(options.body).jql); if (jiraFails) throw new Error('HTTP 401'); return { issues: [issue('u-m', 'indeterminate'), issue('u-m', 'new'), issue('u-i', 'new'), issue('x', 'new')], isLast: true }; }
  };
  const asana = { users: async () => [{ id: '111', name: 'Ivan Petrov', email: 'ivan@corp.ru' }], openCount: async id => { calls.push('asana:' + id); return 4; } };
  let now = 1000;
  const w = new Workload({ settings: () => settings, workspace: () => workspace, asana, modules: null, now: () => now });
  return { w, calls, tick: ms => { now += ms; } };
}
(async () => {
  await test('open tasks per person come from Jira (with in progress) and Asana', async () => {
    const { w, calls } = fixture(), snap = await w.snapshot();
    assert.deepEqual(snap.people.map(p => [p.name, p.jira, p.asana, p.total, p.known]), [
      ['Мария Соколова', { open: 2, inProgress: 1 }, null, 2, true],
      ['Иван Петров', { open: 1, inProgress: 0 }, { open: 4 }, 5, true],
      ['Анна Белова', null, null, 0, false]
    ]);
    assert(calls[0].includes('"u-m"') && calls[0].includes('"u-i"') && calls[0].includes('statusCategory != Done'));
  });
  await test('the snapshot is cached for a few minutes and refreshed on demand', async () => {
    const { w, calls, tick } = fixture();
    await Promise.all([w.snapshot(), w.snapshot()]); assert.equal(calls.length, 2); // one Jira search, one Asana count
    await w.snapshot(); assert.equal(calls.length, 2);
    tick(6 * 60000); await w.snapshot(); assert.equal(calls.length, 4);
    await w.snapshot({ force: true }); assert.equal(calls.length, 6);
  });
  await test('a failed source is reported, not shown as zero', async () => {
    const snap = await fixture({ jiraFails: true }).w.snapshot();
    assert.equal(snap.people[0].jira, null); assert.equal(snap.people[0].known, false); assert(snap.warnings[0].includes('401'));
    assert(answer(snap, { who: '' }, team).includes('Не всё удалось прочитать: Jira: HTTP 401'));
  });
  await test('load questions in everyday words, and look-alikes left alone', () => {
    for (const t of ['загрузка команды', 'Петя, какая загрузка у команды?', 'кто сколько задач', 'кто сейчас свободен', 'кто перегружен', 'у кого меньше задач', 'покажи загрузку']) assert.deepEqual(loadQuestion(t), { who: '' }, t);
    assert.deepEqual(loadQuestion('сколько задач у Маши'), { who: 'маши' });
    assert.deepEqual(loadQuestion('загрузка Ивана Петрова'), { who: 'ивана петрова' });
    assert.deepEqual(loadQuestion('насколько загружена Анна'), { who: 'анна' });
    for (const t of ['что такое загрузка', 'сколько задач в спринте', 'загрузи файл', 'мои задачи', 'какие задачи у Ивана', 'не надо загрузку']) assert.equal(loadQuestion(t), null, t);
  });
  await test('the chat answer lists people by load and finds one person in any case', async () => {
    const snap = await fixture().w.snapshot();
    const all = answer(snap, { who: '' }, team);
    assert(all.startsWith('Загрузка команды по открытым задачам: больше всего — Иван Петров (5), меньше всего — Мария Соколова (2).'));
    assert(all.includes('- Иван Петров — бэкенд: 5 открытых задач · Jira 1, Asana 4'));
    assert(all.includes('- Мария Соколова — QA: 2 открытые задачи · в работе 1'));
    assert(all.includes('- Анна Белова — дизайнер: нет данных'));
    assert.equal(answer(snap, { who: 'маши' }, team), '- Мария Соколова — QA: 2 открытые задачи · в работе 1');
    assert(answer(snap, { who: 'ивана петрова' }, team).startsWith('- Иван Петров'));
    assert(answer(snap, { who: 'сергея' }, team).includes('Не нашёл'));
    assert(answer({ ...snap, hasTeam: false }, { who: '' }, []).includes('заполните «Команду»'));
    assert(answer({ ...snap, sources: { jira: false, asana: false } }, { who: '' }, team).includes('подключите'));
  });
  await test('connected trackers are read from settings and modules', () => {
    assert.deepEqual(sources(settings), { jira: true, asana: true });
    assert.deepEqual(sources({ ...settings, module_asana: 'false', asanaWorkspace: 'x' }), { jira: true, asana: false });
    assert.deepEqual(sources({ asanaCredential: 'c', asanaWorkspace: '9' }), { jira: false, asana: true });
  });
  await test('«чем Маша занимается?»: the card and her open Jira issues, in progress first', async () => {
    const { w } = fixture();
    const issues = [{ key: 'PAY-2', fields: { summary: 'Регресс 1.20', status: { name: 'To Do', statusCategory: { key: 'new' } } } }, { key: 'PAY-1', fields: { summary: 'Проверка оплаты', status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } } }];
    const api = w.workspace().api; w.workspace().api = async (route, options) => JSON.parse(options.body).fields.includes('summary') ? { issues, isLast: true } : api(route, options);
    const masha = { ...team[0], responsibilities: 'регресс и релизы' };
    const text = await personAnswer(w, masha, team);
    assert.match(text, /^Мария Соколова — QA\.\nОтвечает за: регресс и релизы\./);
    assert.match(text, /открыто 2 задачи, в работе 1:\n- PAY-1 Проверка оплаты \(In Progress\)\n- PAY-2 Регресс 1\.20 \(To Do\)/);
    assert.match(await personAnswer(w, team[2], team), /Аккаунт Jira не найден/);
    const group = await groupAnswer(w, [masha, team[1]], team);
    assert.match(group, /^Нашёл в «Команде» 2 человека: Мария Соколова, Иван Петров\.\n\nМария Соколова — QA\./);
    assert.match(group, /\n\nИван Петров — бэкенд\./);
    const off = new Workload({ settings: () => ({ teamMembers: settings.teamMembers }), workspace: () => null, asana: null, modules: null });
    assert.match(await personAnswer(off, team[1], team), /Jira не подключена/);
  });
  console.log(`${count} workload tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
