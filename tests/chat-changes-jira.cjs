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

const feature=require('../src/features/chat-changes.cjs');
const {scope}=require('../src/features/chat-results.cjs');
(async()=>{
 const f=await fixture(),t={id:'chat',jiraProject:'TEST',projectId:'general',messages:[]};
 const s={settings,companyId:'one',workspace:f.w,modules:require('../src/modules.cjs'),dialogue:{active:()=>t,state:{topics:[t],projects:[{id:'general'}]},persist(){}}};
 let api=feature.setup(s);const expected=scope(s,t),row={adapter:{id:'jira'},item:{key:'TEST-1',site:settings.jiraUrl}};
 let id=(await api.chatChanges.start(row,expected)).changeEditor;
 await assert.rejects(api.ipc.prepare(expected,id,{field:'assignee',accountId:'injected'}));
 const people=await api.ipc.people(expected,id,'Маша');assert.equal(people.length,2);
 await api.ipc.prepare(expected,id,{field:'assignee',accountId:'u2'});assert.equal(f.writes.length,0);
 api=feature.setup(s);await api.ipc.apply(expected,id);assert.equal(api.ipc.snapshot().items[0].state,'done');assert.equal(f.issues.get('TEST-1').fields.assignee.accountId,'u2');
 await api.ipc.apply(expected,id);assert.equal(f.writes.length,1);
 const undo=(await api.ipc.undo(expected,id)).items.at(-1).id;assert.equal(f.writes.length,1);await api.ipc.apply(expected,undo);assert.equal(f.issues.get('TEST-1').fields.assignee.accountId,'u1');
 id=(await api.chatChanges.start(row,expected)).changeEditor;await api.ipc.prepare(expected,id,{field:'summary',value:'New title'});
 f.issues.get('TEST-1').fields.updated='external';await api.ipc.apply(expected,id);assert.equal(api.ipc.snapshot().items.at(-1).state,'failed');assert.equal(f.writes.length,2);
 id=(await api.chatChanges.start(row,expected)).changeEditor;await api.ipc.prepare(expected,id,{field:'summary',value:'New title'});f.fail('timeout');await api.ipc.apply(expected,id);assert.equal(api.ipc.snapshot().items.at(-1).state,'uncertain');await assert.rejects(api.ipc.apply(expected,id));
 const count=f.writes.length;await api.ipc.verify(expected,id);assert.equal(api.ipc.snapshot().items.at(-1).state,'uncertain');assert.equal(f.writes.length,count);f.issues.get('TEST-1').fields.summary='New title';await api.ipc.verify(expected,id);assert.equal(api.ipc.snapshot().items.at(-1).state,'done');assert.equal(api.ipc.snapshot().items.at(-1).receipt.canUndo,false);assert.equal(f.writes.length,count);
 assert(f.w.history.filter(e=>e.kind==='edit-existing').every(e=>e.rows.every(r=>!r.canDelete)));
 s.dialogue.state.projects[0].disabledServices=['jira'];await assert.rejects(api.chatChanges.start(row,expected),/отключён/);
 console.log('Jira chat changes: explicit person, preview, restart, single write, undo, conflict, timeout and disabled project passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
