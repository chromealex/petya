const assert = require('assert').strict;
const { Notion } = require('../src/extensions/notion/client.cjs');
const { Workspace } = require('../src/workspace.cjs');
const title = text => ({ type: 'title', title: [{ plain_text: text }] });
const page = { id: 'abc-123', object: 'page', properties: { Name: title('Вход по коду') } };
const paragraph = (id, text) => ({ id, type: 'paragraph', paragraph: { rich_text: [{ plain_text: text }] } });
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
  await test('Notion search paginates, deduplicates and reads nested text in order', async () => {
    const calls = [];
    const n = new Notion(async (url, options) => {
      calls.push({ url, options }); assert.equal(new URL(url).origin, 'https://api.notion.com'); assert.equal(options.headers.Authorization, 'Bearer test');
      if (url.endsWith('/search')) { const body = JSON.parse(options.body); assert.equal(body.filter.value, 'page'); return { results: [page], has_more: !body.start_cursor, next_cursor: 'next' }; }
      if (url.includes('/blocks/child/')) return { results: [paragraph('p2', 'Вложенное требование')] };
      if (url.includes('start_cursor')) return { results: [paragraph('p3', 'Вторая страница')] };
      return { results: [{ id: 'child', type: 'toggle', toggle: { rich_text: [{ plain_text: 'Детали' }] }, has_children: true }], has_more: true, next_cursor: 'blocks-next' };
    }, async () => {});
    const r = await n.search(['вход', 'код'], 'test'); assert.equal(r.docs.length, 1); assert.equal(r.docs[0].id, 'notion:abc-123'); assert.equal(r.docs[0].text, 'Детали\nВложенное требование\nВторая страница\n'); assert.equal(r.docs[0].source, 'Notion'); assert(calls.every(c => c.options.method === 'GET' || c.url.endsWith('/search')));
  });
  await test('deep or large pages explicitly report truncated content', async () => { let i = 0; const n = new Notion(async () => ({ results: [{ ...paragraph('nested-' + i++, 'текст'), has_children: true }] }), async () => {}); const result = await n.content('root', 'test'); assert(result.truncated); assert.equal(i, 5); });
  await test('unreadable pages are not passed to the planner as empty documents', async () => { const n = new Notion(async url => { if (url.endsWith('/search')) return { results: [page] }; const e = new Error('HTTP 403'); e.status = 403; throw e; }, async () => {}); const r = await n.search(['код'], 'test'); assert.equal(r.docs.length, 0); assert(r.warnings[0].includes('403')); });
  await test('Notion works without Jira and provider errors preserve other documents', async () => {
    let settings = { notionToken: 'test' }; const w = new Workspace({ settings: () => settings, request: async () => { throw new Error('Confluence offline'); } });
    require('../src/extensions/notion/doc-source.cjs').client(w.request).search = async () => ({ docs: [{ id: 'notion:1', source: 'Notion', title: 'Код', text: 'текст', score: 1 }], warnings: [] });
    const context = { title: 'Код', text: 'Вход' }; assert.equal((await w.searchDocs(context)).docs.length, 1);
    settings = { ...settings, jiraUrl: 'https://test.atlassian.net', jiraEmail: 'a', jiraToken: 't', jiraProject: 'TEST' };
    const r = await w.searchDocs(context); assert.equal(r.docs.length, 1); assert(r.warnings.some(x => x.includes('Confluence offline')));
    w.searchConfluence = async () => ({ docs: [{ id: 'confluence:1', title: 'Код', score: 1 }] }); require('../src/extensions/notion/doc-source.cjs').client(w.request).search = async () => { throw new Error('HTTP 429'); };
    const partial = await w.searchDocs(context); assert.equal(partial.docs[0].id, 'confluence:1'); assert(partial.warnings.some(x => x.includes('429')));
  });
  await test('selected Notion content and citation reach decomposition', async () => {
    let sent;
    const w = new Workspace({ settings: () => ({ model: 'test', ollamaUrl: 'http://localhost:11434/api/chat' }), request: async (url, options) => { sent = JSON.parse(options.body); return { message: { content: JSON.stringify({ tasks: [{ summary: 'API', description: 'Код', assigneeId: '', dependsOn: [] }, { summary: 'UI', description: 'Экран', assigneeId: '', dependsOn: [] }] }) } }; } });
    w.metadata = async () => ({}); w.people = async () => []; w.docs.set('notion:1', { title: 'Вход', text: 'Код живёт 10 минут', url: 'https://www.notion.so/1', source: 'Notion' });
    const result = await w.prepare('Разбей', { title: 'Вход', text: 'тема', source: 'Zoom' }, ['notion:1']); assert(sent.messages[1].content.includes('Код живёт 10 минут')); assert(result.tasks[0].description.includes('https://www.notion.so/1'));
  });
  console.log(`${count} Notion tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
