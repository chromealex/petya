const assert = require('node:assert/strict');
const { Workspace } = require('../src/workspace.cjs');
const { normalizeSelection, choices } = require('../src/jira-selection.cjs');
(async () => {
  const old = { jiraUrl: 'https://test.atlassian.net', jiraProject: 'ONE', jiraIssueType: '1', jiraBoardId: '2', jiraVersionId: '3' };
  let next = { ...old }; normalizeSelection(next, old, {}); assert.equal(next.jiraProjects, 'ONE');
  next = { ...old, jiraProjects: 'ONE,TWO,ONE', jiraProject: 'TWO' };
  normalizeSelection(next, old, { jiraProject: 'TWO', jiraProjects: next.jiraProjects });
  assert.equal(next.jiraProjects, 'ONE,TWO'); assert.equal(next.jiraBoardId, ''); assert.equal(next.jiraIssueType, ''); assert.equal(next.jiraVersionId, '');
  next = { ...old, jiraProjects: 'ONE,TWO', jiraProject: 'TWO', jiraIssueType: '5' };
  normalizeSelection(next, old, { jiraProject: 'TWO', jiraIssueType: '5' }); assert.equal(next.jiraIssueType, '5');
  assert.throws(() => normalizeSelection({ ...old, jiraProjects: 'TWO' }, old, {}), /среди выбранных/);
  next = { ...old, jiraUrl: 'https://other.atlassian.net', jiraProjects: 'ONE,TWO' };
  normalizeSelection(next, old, next); assert.equal(next.jiraProjects, ''); assert.equal(next.jiraProject, ''); assert.equal(next.jiraBoardId, '');
  const settings = { jiraUrl: old.jiraUrl, atlassianCredential: 'fixture', jiraProject: '' };
  const calls = [];
  const w = new Workspace({ settings: () => settings, request: async (address, opts) => {
    calls.push(address); assert(!opts.method); assert(!opts.headers.Authorization);
    const u = new URL(address);
    if (u.pathname.endsWith('/project/search')) return u.searchParams.get('startAt') === '0' ? { values: [{ id: '1', key: 'ONE', name: 'Первый' }], total: 2 } : { values: [{ id: '2', key: 'TWO', name: 'Второй' }], total: 2 };
    if (u.pathname.endsWith('/project/TWO')) return { issueTypes: [{ id: '5', name: 'Задача' }, { id: '6', name: 'Подзадача', subtask: true }] };
    if (u.pathname.endsWith('/board')) { assert.equal(u.searchParams.get('projectKeyOrId'), 'TWO'); throw new Error('Нет доступа'); }
    if (u.pathname.endsWith('/versions')) return [{ id: '7', name: 'Будущая' }, { id: '8', released: true }, { id: '9', archived: true }];
    throw new Error(address);
  } });
  assert.equal((await choices(w, settings)).projects.length, 2);
  const details = await choices(w, settings, 'TWO');
  assert.deepEqual(details.issueTypes, [{ id: '5', name: 'Задача' }]); assert.equal(details.versions.length, 1); assert.equal(details.warnings.length, 1);
  await assert.rejects(choices(w, settings, '../evil'));
  await assert.rejects(choices(w, { ...settings, jiraUrl: 'https://evil.example' }));
  await assert.rejects(w.metadata(), /проект Jira по контексту/);
  console.log('Jira selection: migration, multiple projects, resets, pagination, OAuth and partial failures passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
