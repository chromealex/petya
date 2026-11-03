const assert = require('assert').strict;
const { Workspace } = require('../src/workspace.cjs');
const { snapshot } = require('../src/history.cjs');
const clone = v => JSON.parse(JSON.stringify(v));
const settings = { jiraUrl: 'https://test.atlassian.net', jiraEmail: 'test@example.com', jiraToken: 'fixture', jiraProject: 'TEST', jiraIssueType: '1', model: 'fixture', ollamaUrl: 'http://localhost:11434/api/chat' };
const id = '12345678-1234-1234-1234-123456789abc';
async function fixture() {
  let tick = 0, saved, failure = '', proposed = [{ key: 'TEST-1', summary: 'Новое название' }];
  const writes = [], issues = new Map();
  const original = { summary: 'Исходное название', description: { version: 1, type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ссылка', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }] }, assignee: { accountId: 'u1', displayName: 'Иван' }, fixVersions: [{ id: '7', name: '1.0' }], updated: '0', project: { key: 'TEST' }, labels: ['petya-' + id], subtasks: [], status: { id: '1' } };
  issues.set('TEST-1', { fields: clone(original), sprint: { id: 11, name: 'Sprint 11', state: 'active' } });
  const request = async (address, options = {}) => {
    const path = new URL(address).pathname, method = options.method || 'GET', body = options.body ? JSON.parse(options.body) : null;
    if (path === '/api/chat') return { message: { content: JSON.stringify({ changes: proposed, questions: [] }) } };
    if (path.endsWith('/user/assignable/search')) return [{ accountId: 'u1', displayName: 'Иван', active: true }, { accountId: 'u2', displayName: 'Маша', active: true }];
    if (path.endsWith('/versions')) return [{ id: '7', name: '1.0' }, { id: '8', name: '2.0' }];
    if (/\/sprint\/\d+$/.test(path)) return { id: path.split('/').pop(), state: 'active' };
    if (method !== 'GET') {
      writes.push({ path, method, body });
      if (failure === 'timeout') throw new Error('timeout');
      if (failure === 'sprint' && path.includes('/agile/')) { const e = new Error('Sprint rejected'); e.status = 400; throw e; }
      if (path === '/rest/api/3/issue') { const key = 'TEST-2'; issues.set(key, { fields: { ...clone(original), ...body.fields, project: { key: 'TEST' }, updated: String(++tick) }, sprint: null }); return { key }; }
      if (path.includes('/agile/')) { for (const key of body.issues) { const issue = issues.get(key); issue.sprint = path.includes('/backlog/') ? null : { id: Number(path.split('/')[5]), name: 'Sprint ' + path.split('/')[5], state: 'active' }; issue.fields.updated = String(++tick); } return null; }
      const key = path.split('/').pop(); if (method === 'DELETE') { issues.delete(key); return null; }
      const issue = issues.get(key); Object.assign(issue.fields, body.fields); if (body.fields.assignee) issue.fields.assignee.displayName = body.fields.assignee.accountId === 'u1' ? 'Иван' : 'Маша';
      if (body.fields.fixVersions) issue.fields.fixVersions = body.fields.fixVersions.map(v => ({ ...v, name: v.id === '7' ? '1.0' : '2.0' })); issue.fields.updated = String(++tick); return null;
    }
    const key = path.split('/').pop(), issue = issues.get(key);
    if (!issue) throw new Error('Missing fixture ' + path);
    return clone(path.includes('/agile/') ? { fields: { sprint: issue.sprint } } : issue);
  };
  const w = new Workspace({ settings: () => settings, request, save: h => { saved = clone(h); } });
  w.metadata = async () => ({ versions: [{ id: '7', name: '1.0' }, { id: '8', name: '2.0' }], sprints: [{ id: '11', name: 'Sprint 11' }, { id: '12', name: 'Sprint 12' }] });
  w.history = [{ id, at: Date.now(), url: settings.jiraUrl, project: 'TEST', rows: [{ key: 'TEST-1', title: original.summary, state: 'done', canDelete: true, snapshot: await snapshot(w, 'TEST-1', settings) }] }];
  return { w, issues, writes, original, saved: () => saved, propose: p => proposed = p, fail: v => failure = v };
}
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
  await test('preview is read-only; edit and undo preserve exact rich description', async () => {
    const f = await fixture(); f.propose([{ key: 'TEST-1', summary: 'Новое', description: 'Текст', assigneeId: 'u2', versionId: '8', sprintId: '' }]);
    const p = await f.w.actions.previewEdit(id, 'Измени поля'); assert.equal(f.writes.length, 0); assert.equal(p.rows[0].changes.length, 5);
    const result = await f.w.actions.apply(p.id); assert.equal(result.operations[0].rows[0].state, 'done');
    const undo = await f.w.actions.previewUndo(id, p.id); await f.w.actions.apply(undo.id);
    assert.deepEqual(f.issues.get('TEST-1').fields.description, f.original.description); assert.equal(f.issues.get('TEST-1').fields.summary, f.original.summary); assert.equal(f.issues.get('TEST-1').sprint.id, 11);
    assert(f.w.history[0].operations[0].rows[0].undone);
  });
  await test('foreign changes after preview stop all remote writes', async () => { const f = await fixture(); const p = await f.w.actions.previewEdit(id, 'Переименуй'); f.issues.get('TEST-1').fields.updated = 'other'; await assert.rejects(f.w.actions.apply(p.id), /изменились/); assert.equal(f.writes.length, 0); });
  await test('foreign changes after creation prevent destructive undo', async () => { const f = await fixture(); f.issues.get('TEST-1').fields.updated = 'other'; await assert.rejects(f.w.actions.previewUndo(id), /изменилась/); assert.equal(f.writes.length, 0); });
  await test('creation undo requires explicit confirmation and cannot replay', async () => { const f = await fixture(); const p = await f.w.actions.previewUndo(id); await assert.rejects(f.w.actions.apply(p.id), /Подтвердите/); await f.w.actions.apply(p.id, true); assert(!f.issues.has('TEST-1')); assert.equal(f.w.history[0].rows[0].state, 'deleted'); await assert.rejects(f.w.actions.apply(p.id, true)); assert.equal(f.writes.length, 1); });
  await test('unowned tasks and tasks with subtasks cannot be deleted', async () => { for (const field of ['labels', 'subtasks']) { const f = await fixture(); f.issues.get('TEST-1').fields[field] = field === 'labels' ? [] : [{ key: 'TEST-3' }]; f.w.history[0].rows[0].snapshot = await snapshot(f.w, 'TEST-1', settings); await assert.rejects(f.w.actions.previewUndo(id), /метки|подзадачами/); } });
  await test('unknown model fields, targets and identities are rejected', async () => { for (const proposal of [{ key: 'OTHER-1', summary: 'x' }, { key: 'TEST-1', status: 'Done' }, { key: 'TEST-1', assigneeId: 'unknown' }, { key: 'TEST-1', sprintId: '900' }]) { const f = await fixture(); f.propose([proposal]); await assert.rejects(f.w.actions.previewEdit(id, 'Правка')); assert.equal(f.writes.length, 0); } });
  await test('concurrent application cannot duplicate writes', async () => { const f = await fixture(); const p = await f.w.actions.previewEdit(id, 'Правка'); const results = await Promise.allSettled([f.w.actions.apply(p.id), f.w.actions.apply(p.id)]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.writes.length, 1); });
  await test('timeout is journaled and never automatically retried', async () => { const f = await fixture(); const p = await f.w.actions.previewEdit(id, 'Правка'); f.fail('timeout'); const result = await f.w.actions.apply(p.id); assert.equal(result.operations[0].rows[0].state, 'uncertain'); await assert.rejects(f.w.actions.apply(p.id)); assert.equal(f.writes.length, 1); });
  await test('partial edit can undo only the successful part', async () => { const f = await fixture(); f.propose([{ key: 'TEST-1', summary: 'Новое', sprintId: '12' }]); const p = await f.w.actions.previewEdit(id, 'Правка'); f.fail('sprint'); const result = await f.w.actions.apply(p.id); assert.equal(result.operations[0].rows[0].state, 'partial'); f.fail(''); const undo = await f.w.actions.previewUndo(id, p.id); assert.equal(undo.rows[0].changes.length, 1); await f.w.actions.apply(undo.id); assert.equal(f.issues.get('TEST-1').fields.summary, f.original.summary); });
  await test('restored journal supports undo after restart', async () => { const f = await fixture(); const p = await f.w.actions.previewEdit(id, 'Правка'); await f.w.actions.apply(p.id); f.w.history = f.saved(); f.w.actions.previews.clear(); const undo = await f.w.actions.previewUndo(id, p.id); await f.w.actions.apply(undo.id); assert.equal(f.issues.get('TEST-1').fields.summary, f.original.summary); });
  await test('approved foreign edits disable later creation deletion', async () => { const f = await fixture(); f.issues.get('TEST-1').fields.updated = 'other'; const p = await f.w.actions.previewEdit(id, 'Правка'); await f.w.actions.apply(p.id); assert.equal(f.w.history[0].rows[0].canDelete, false); await assert.rejects(f.w.actions.previewUndo(id)); });
  await test('single issue creation is journaled and cannot repeat', async () => { const f = await fixture(); const input = { id: '22345678-1234-1234-1234-123456789abc', summary: 'Одиночная', description: 'Тест' }; const issue = await f.w.createSingle(input); assert.equal(issue.key, 'TEST-2'); const entry = f.w.history.find(h => h.id === input.id); assert(entry.rows[0].snapshot); assert(entry.rows[0].canDelete); await assert.rejects(f.w.createSingle(input)); });
  console.log(`${count} history tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
