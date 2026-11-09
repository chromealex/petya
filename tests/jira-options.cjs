const assert = require('node:assert/strict');
const { jiraOptions, guideUrl } = require('../src/extensions/jira/options.cjs');
(async () => {
  const saved = { jiraUrl: 'https://test.atlassian.net', jiraEmail: 'a@example.com', jiraToken: 'fixture' };
  let calls = 0;
  const result = await jiraOptions({ ...saved, jiraToken: '' }, saved, async (url, options) => {
    assert.equal(options.headers.Authorization, 'Basic ' + Buffer.from('a@example.com:fixture').toString('base64'));
    calls++; return calls === 1 ? { values: [{ key: 'ONE', name: 'One' }], isLast: false } : { values: [{ key: 'TWO', name: 'Two' }], isLast: true };
  });
  assert.equal(result.projects.length, 2);
  await assert.rejects(jiraOptions({ ...saved, jiraUrl: 'https://other.atlassian.net', jiraToken: '' }, saved, () => assert.fail('Credentials leaked')));
  await assert.rejects(jiraOptions({ ...saved, jiraUrl: 'https://evil.example' }, saved, () => assert.fail('Credentials leaked')));
  const types = await jiraOptions({ ...saved, jiraProject: 'TWO' }, saved, async url => {
    assert(url.endsWith('/project/TWO')); return { issueTypes: [{ id: '1', name: 'Task', subtask: false }, { id: '2', name: 'Subtask', subtask: true }] };
  });
  assert.deepEqual(types.types, [{ id: '1', name: 'Task' }]);
  assert.equal(guideUrl('types', saved.jiraUrl, 'TWO'), saved.jiraUrl + '/plugins/servlet/project-config/TWO/issuetypes');
  assert.throws(() => guideUrl('types', saved.jiraUrl, '../other'));
  assert.throws(() => guideUrl('projects', 'https://test.atlassian.net@evil.example'));
  console.log('Jira options: pagination, project types, credential boundaries and links passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
