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


const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const changesFeature=require('../src/features/chat-changes.cjs'),resultsFeature=require('../src/features/chat-results.cjs');
(async()=>{
 const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'petya-natural-'))),file=path.join(dir,'notes.txt');
 try{
  const before='Заголовок\n1. Старое\n2. Старое\n3. Старое\nКонец';await fs.writeFile(file,before);
  const f=await fixture(),t={id:'chat',projectId:'general',jiraProject:'TEST',messages:[{role:'user',text:'Файл',at:1,attachments:[{id:'file',name:'notes.txt',localSourcePath:file}]}]};
  const events=[],s={settings,companyId:'one',workspace:f.w,modules:require('../src/modules.cjs'),win:{webContents:{send:(event,value)=>events.push(value)}},dialogue:{active:()=>t,state:{topics:[t],projects:[{id:'general'}]},persist(){},rememberAction(command,text){t.messages.push({role:'user',text:command,at:Date.now()},{role:'assistant',text,at:Date.now()});}}};
  const results=resultsFeature.setup(s);s.chatResults=results.chatResults;const feature=changesFeature.setup(s);s.chatChanges=feature.chatChanges;
  const scope=resultsFeature.scope(s,t),turn=command=>s.chatResults.turn(command);
  let reply=await turn('Замени в файле «Старое» на «Новое»');assert(!reply.error,reply.text);assert.equal(t.messages.length,3);let first=t.chatChanges.at(-1);assert.equal(first.plan.rows.length,3);assert(!first.plan.rows.some(r=>r.before.includes('Заголовок')));assert.equal(await fs.readFile(file,'utf8'),before);
  reply=await turn('Нет, поменяй только второй пункт');assert(!reply.error,reply.text);let revised=t.chatChanges.at(-1);assert.equal(first.state,'superseded');assert.equal(revised.plan.rows.length,1);assert.equal(revised.plan.rows[0].label,'Строка 3');await assert.rejects(feature.ipc.apply(scope,first.id));
  await feature.ipc.apply(scope,revised.id);assert.equal(await fs.readFile(file,'utf8'),'Заголовок\n1. Старое\n2. Новое\n3. Старое\nКонец');
  reply=await turn('Поменяй только первый пункт');assert(reply.error);assert.equal(t.chatChanges.at(-1).state,'done');
  assert.equal(await turn('Что ты умеешь?'),null);
  t.messages.push({role:'assistant',text:'Задача',at:Date.now(),jiraItems:[{key:'TEST-1',site:settings.jiraUrl,summary:'Задача'}]});delete t.resultChoice;
  reply=await turn('Назначь эту задачу Маше');assert(reply.question);assert.equal(t.chatChanges.at(-1).people.length,2);assert.equal(t.chatChanges.at(-1).editor.field,'assignee');assert.equal(f.writes.length,0);
  await feature.ipc.prepare(scope,reply.changeEditor,{field:'assignee',accountId:'u2'});await feature.ipc.apply(scope,reply.changeEditor);assert.equal(f.issues.get('TEST-1').fields.assignee.accountId,'u2');
  const rich=clone(f.issues.get('TEST-1').fields.description);
  reply=await turn('Добавь в описание критерии приёмки');assert(reply.question);assert.equal(t.chatChanges.at(-1).editor.field,'append');assert.deepEqual(f.issues.get('TEST-1').fields.description,rich);
  await feature.ipc.prepare(scope,reply.changeEditor,{field:'append',heading:'Критерии приёмки',value:'1. Первый\n2. Второй'});
  reply=await turn('Нет, поменяй только второй пункт');assert(!reply.error,reply.text);let append=t.chatChanges.at(-1);assert(!append.plan.staged.rows[0].patch.description.content.map(x=>JSON.stringify(x)).join('').includes('Первый'));
  await feature.ipc.apply(scope,append.id);const actual=f.issues.get('TEST-1').fields.description;assert.deepEqual(actual.content.slice(0,rich.content.length),rich.content);assert(JSON.stringify(actual).includes('Второй'));
  const undo=(await feature.ipc.undo(scope,append.id)).items.at(-1);await feature.ipc.apply(scope,undo.id);assert.deepEqual(f.issues.get('TEST-1').fields.description,rich);
  results.ipc.choose(scope,null);reply=await turn('Переименуй задачу в Новое имя');assert(reply.resultChoices.length);const choices=reply.resultChoices;
  reply=await results.ipc.action(scope,choices[0],'edit');assert(!reply.error);assert.equal(t.chatChanges.at(-1).plan.staged.rows[0].patch.summary,'Новое имя');
  results.ipc.choose(scope,null);await turn('Назначь эту задачу Маше');assert(t.pendingChangeIntent);await turn('Как дела?');assert(!t.pendingChangeIntent);
  assert(events.some(e=>e.busy&&e.id.startsWith('change-prepare:')));assert(events.some(e=>e.version==='ready'&&!e.busy));
  const intent=require('../src/chat-change-intent.cjs');assert.equal(intent.parse('В документе написано: назначь задачу Маше'),null);assert.equal(intent.parse('Замени в файле X на Y').from,'X');
  console.log('Natural changes: multi-turn correction, stale preview, selected targets, people ambiguity, rich append/undo, pending intent and notifications passed');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
