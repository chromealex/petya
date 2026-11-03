const assert = require('assert').strict;
const { checkConnection, scopedInput, guides } = require('../src/connections.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
  await test('service save cannot alter other credentials', () => { assert.deepEqual(scopedInput('notion', { notionToken: 'n', jiraToken: 'j', slackChannels: 'C1' }), { notionToken: 'n' }); assert.throws(() => scopedInput('__proto__', {})); assert(Object.values(guides).every(v => v.startsWith('https://'))); });
  await test('Slack verification detects revoked auth and missing channel access', async () => { await assert.rejects(checkConnection('slack', { slackToken: 't' }, async () => ({ ok: false, error: 'invalid_auth' })), /invalid_auth/); await assert.rejects(checkConnection('slack', { slackToken: 't', slackChannels: 'C12' }, async url => url.includes('auth.test') ? { ok: true } : { ok: false, error: 'missing_scope' }), /missing_scope/); const r = await checkConnection('slack', { slackToken: 't' }, async () => ({ ok: true, team: 'Team' })); assert.equal(r.ready, false); });
  await test('Notion without shared pages is not reported ready', async () => { const r = await checkConnection('notion', { notionToken: 't' }, async (url, options) => { assert.equal(url, 'https://api.notion.com/v1/search'); assert.equal(options.headers.Authorization, 'Bearer t'); return { results: [] }; }); assert.equal(r.ready, false); });
  await test('Atlassian credentials never go to arbitrary hosts', async () => { let called = false; await assert.rejects(checkConnection('jira', { jiraUrl: 'https://evil.example', jiraEmail: 'e', jiraToken: 't' }, async () => { called = true; })); assert.equal(called, false); });
  await test('Jira checks identity and project, without creating issues', async () => { const calls = []; const r = await checkConnection('jira', { jiraUrl: 'https://test.atlassian.net', jiraEmail: 'e', jiraToken: 't', jiraProject: 'TEST', jiraIssueType: '1' }, async (url, options) => { calls.push(url); assert(!options.method); return { displayName: 'Tester' }; }); assert(r.ready); assert(calls[1].endsWith('/project/TEST')); });
  await test('local services reject remote endpoints and validate model readiness', async () => { await assert.rejects(checkConnection('ollama', { ollamaUrl: 'https://evil.example' }, async () => ({}))); const r = await checkConnection('ollama', { ollamaUrl: 'http://localhost:11434/api/chat', model: 'test' }, async url => { assert(url.endsWith('/api/tags')); return { models: [{ name: 'test:latest' }] }; }); assert(r.ready); await assert.rejects(checkConnection('whisper', { whisperUrl: 'http://localhost:8080/inference' }, async () => ({ status: 'loading' }))); });
  await test('Ollama errors distinguish offline, timeout and wrong endpoint', async () => {
    const s = { ollamaUrl: 'http://127.0.0.1:11434/api/chat' };
    await assert.rejects(checkConnection('ollama', s, async () => { throw new TypeError('fetch failed'); }), /Ollama недоступен.*11434/);
    await assert.rejects(checkConnection('ollama', s, async () => { const e = new Error(); e.name = 'TimeoutError'; throw e; }), /не ответил вовремя/);
    await assert.rejects(checkConnection('ollama', s, async () => { const e = new Error(); e.status = 404; throw e; }), /не найден API Ollama/);
    const empty = await checkConnection('ollama', s, async () => ({ models: [] }));
    assert.equal(empty.ready, false); assert.deepEqual(empty.models, []);
  });
  console.log(`${count} connection tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
