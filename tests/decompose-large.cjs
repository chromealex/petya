// Decomposition of material of any size: every request fits the model window, every part of the material is read,
// and whatever could not reach the plan is named in the planner's warnings.
const assert = require('assert').strict;
const plan = require('../src/decompose.cjs');
const { Workspace } = require('../src/workspace.cjs');
const { Notion } = require('../src/extensions/notion/client.cjs');
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
const settings = { jiraUrl: 'https://test.atlassian.net', jiraEmail: 'a@b.c', jiraToken: 't', jiraProject: 'TEST', model: 'qwen', ollamaUrl: 'http://localhost:11434/api/chat', notionToken: 'n' };
const filler = 'Пользователь открывает экран оплаты, видит список способов и выбирает подходящий для заказа. ';
// A specification of `sections` sections, each with one requirement marker REQ-<n> somewhere in its middle.
function spec(sections, size = 6000) {
  let html = '';
  for (let i = 1; i <= sections; i++) html += `<h2>Раздел ${i}</h2><p>${filler.repeat(Math.floor(size / filler.length / 2))}</p><p>Требование REQ-${i}: лимит ${i * 10} операций.</p><p>${filler.repeat(Math.floor(size / filler.length / 2))}</p>`;
  return html;
}
const markers = text => [...new Set(String(text).match(/REQ-\d+/g) || [])];
// A fake Ollama that answers each step from what it was given and refuses prompts that do not fit, like Ollama with
// truncate:false; `limit` makes it refuse smaller prompts to exercise splitting.
function ollama({ limit = plan.SIZE, failing = () => false, tasks, verbose = 0, merge = 'pairs' } = {}) {
  const log = [];
  const respond = body => {
    const system = body.messages[0].content, user = body.messages.at(-1).content;
    const prompt = plan.estimate(body.messages.map(m => m.content).join('\n'));
    log.push({ system, user, prompt, options: body.options, think: body.think, truncate: body.truncate });
    assert.equal(body.think, false); assert.equal(body.truncate, false); assert.equal(body.options.num_ctx, plan.SIZE);
    assert(prompt + body.options.num_predict <= plan.SIZE, `request of ~${prompt}+${body.options.num_predict} tokens exceeds the window`);
    if (prompt > limit || failing(user)) throw new Error('the input length exceeds the context length');
    if (system.startsWith('Ты читаешь')) return { points: markers(JSON.parse(user).text).map(m => 'Требование ' + m + ' ' + filler.repeat(verbose)), questions: [] };
    if (system.startsWith('Сожми')) {
      const notes = JSON.parse(user);
      // 'pairs': two notes become one short point, but the model forgets the last note of the group;
      // 'none': the model returns everything unchanged, so merging cannot shrink the notes.
      if (merge === 'none') return { points: notes.map(n => ({ text: n.text, from: [n.id] })) };
      const points = [];
      for (let i = 0; i + 1 < notes.length - 1; i += 2) points.push({ text: markers(notes[i].text + notes[i + 1].text).join(' и '), from: [notes[i].id, notes[i + 1].id] });
      return { points };
    }
    const data = JSON.parse(user);
    if (tasks) return tasks(data);
    const ids = (data.notes || []).map(n => n.id);
    return { tasks: [{ summary: 'Бэкенд', description: 'API', assigneeId: '', assignmentReason: '', dependsOn: [], covers: ids.slice(0, -1) }, { summary: 'Экран', description: 'UI', assigneeId: '', assignmentReason: '', dependsOn: [0], covers: [] }], questions: [] };
  };
  let running = 0, peak = 0;
  const request = async (url, options = {}) => {
    const u = new URL(url);
    if (u.pathname === '/api/chat') {
      const body = JSON.parse(options.body); assert(options.timeoutMs >= 60000);
      running++; peak = Math.max(peak, running);
      try { await new Promise(r => setTimeout(r, 2)); return { message: { content: JSON.stringify(respond(body)) }, prompt_eval_count: 100, eval_count: 50, done_reason: 'stop' }; } finally { running--; }
    }
    if (u.pathname === '/rest/agile/1.0/board') return { values: [{ id: 1 }], isLast: true };
    if (u.pathname.endsWith('/versions')) return [];
    if (u.pathname.endsWith('/sprint')) return { values: [], isLast: true };
    if (u.pathname.endsWith('/user/assignable/search')) return [{ accountId: 'u1', displayName: 'Иван Петров', active: true }];
    throw new Error('Unexpected URL ' + url);
  };
  return { request, log, peak: () => peak };
}
function workspace(fake, page) {
  const progress = [];
  const w = new Workspace({ settings: () => settings, request: async (url, options) => url.includes('/wiki/') ? { results: [{ id: '5', title: 'Спецификация оплаты', body: { storage: { value: page } } }] } : fake.request(url, options), progress: s => progress.push(s) });
  return { w, progress };
}
const context = { title: 'Оплата', text: 'Обсудили новую оплату заказов.', source: 'Zoom' };
(async () => {
  await test('Confluence pages keep headings, paragraphs and list items', () => {
    const text = plan.outline('<h1>Оплата</h1><p>Первый абзац</p><ul><li>карта</li><li>СБП</li></ul><table><tr><td>A</td><td>B</td></tr></table><script>x</script>');
    assert.equal(text, '# Оплата\n\nПервый абзац\n\n- карта\n\n- СБП\n\nA | B |');
    assert.deepEqual(plan.sections('# A\nтекст\n## B\nещё').map(s => s.heading), ['A', 'A › B']);
  });
  await test('parts fit the budget and lose no text', () => {
    const text = plan.outline(spec(40)), all = plan.parts({ title: 'Док', text }, 3000);
    assert(all.length > 5); assert(all.every(p => plan.estimate(p.text) <= 3000));
    const squeeze = s => s.replace(/\s+/g, '');
    assert.equal(squeeze(all.map(p => p.text).join('')), squeeze(text));
    assert(all[0].label.startsWith('Док · Раздел 1')); assert(all.at(-1).label.includes(`часть ${all.length} из ${all.length}`));
  });
  await test('small material is planned in one request, as before', async () => {
    const fake = ollama(), { w } = workspace(fake, spec(2, 800));
    await w.searchDocs(context); const result = await w.prepare('декомпозь давай', context, ['confluence:5']);
    assert.equal(fake.log.length, 1); assert.equal(result.coverage.mode, 'direct'); assert.deepEqual(result.coverage.warnings, []);
    assert(fake.log[0].user.includes('REQ-1') && fake.log[0].user.includes('REQ-2'));
  });
  await test('a large specification is read whole, condensed, and every requirement reaches the plan', async () => {
    const fake = ollama(), { w, progress } = workspace(fake, spec(60)); // ~360 000 characters
    const found = await w.searchDocs(context);
    assert(found.docs[0].text.length <= 18000 && found.docs[0].size > 300000); // the list gets a preview, not the whole page
    const result = await w.prepare('декомпозируй эту фичу', context, ['confluence:5']);
    const read = fake.log.filter(l => l.system.startsWith('Ты читаешь'));
    assert(read.length > 5);
    const seen = new Set(read.flatMap(l => markers(l.user)));
    for (let i = 1; i <= 60; i++) assert(seen.has('REQ-' + i), 'never read: REQ-' + i);
    const finalCall = fake.log.at(-1); assert(finalCall.system.includes('выжимкой'));
    for (let i = 1; i <= 60; i++) assert(finalCall.user.includes('REQ-' + i), 'not in the plan input: REQ-' + i);
    assert.equal(result.coverage.mode, 'notes'); assert.equal(result.coverage.uncovered.length, 1);
    assert(result.coverage.warnings[0].includes('по частям')); assert(result.coverage.warnings.some(x => x.includes('Ни одна задача не покрывает 1')));
    assert(result.tasks[0].description.includes('Разделы: Спецификация оплаты'));
    // Each agent reads its own contiguous range: together they read every part exactly once.
    const last = progress.filter(p => p.stage === 'reading').at(-1);
    assert.equal(last.agents.length, plan.AGENTS); assert(last.agents.every(a => a.state === 'done' && a.done === a.total));
    assert.equal(last.agents.reduce((n, a) => n + a.total, 0), read.length);
    const labels = read.map(l => JSON.parse(l.user).source); assert.equal(new Set(labels).size, labels.length);
    assert(fake.peak() > 1 && fake.peak() <= plan.AGENTS, 'agents did not read in parallel: ' + fake.peak());
    // The overall bar only moves forward and ends at 100.
    const percents = progress.map(p => p.percent).filter(Number.isFinite);
    assert(percents.every((p, i) => !i || p >= percents[i - 1])); assert(percents.some(p => p > 0 && p < 100)); assert.equal(percents.at(-1), 100);
    assert.equal(progress.at(-1).stage, 'done'); assert.equal(w.decomposing, null);
  });
  await test('notes that do not fit are merged, and a note the merge forgets is kept', async () => {
    const fake = ollama({ verbose: 6 }), { w } = workspace(fake, spec(60));
    await w.searchDocs(context); const result = await w.prepare('декомпозируй', context, ['confluence:5']);
    assert(fake.log.some(l => l.system.startsWith('Сожми')));
    const finalCall = fake.log.at(-1);
    for (let i = 1; i <= 60; i++) assert(finalCall.user.includes('REQ-' + i), 'lost in merging: REQ-' + i);
    assert.deepEqual(result.coverage.dropped, []);
  });
  await test('notes that cannot be merged into the window are named as not in the plan', async () => {
    const fake = ollama({ verbose: 12, merge: 'none' }), { w } = workspace(fake, spec(60));
    await w.searchDocs(context); const result = await w.prepare('декомпозируй', context, ['confluence:5']);
    assert(result.coverage.dropped.length > 0);
    const finalCall = fake.log.at(-1), missing = [];
    for (let i = 1; i <= 60; i++) if (!finalCall.user.includes('REQ-' + i + ' ')) missing.push(i);
    assert.equal(missing.length, result.coverage.dropped.length);
    assert(result.coverage.warnings.some(x => x.startsWith(`В окно модели не поместились ${missing.length} требований`) && x.includes('Раздел ' + missing.at(-1))));
  });
  await test('a part the model cannot take is split; one it never takes is named', async () => {
    const fake = ollama({ limit: 2500, failing: user => user.includes('REQ-7:') && user.length < 2500 }), { w } = workspace(fake, spec(12));
    await w.searchDocs(context); const result = await w.prepare('разбей фичу на задачи', context, ['confluence:5']);
    const seen = new Set(fake.log.filter(l => l.system.startsWith('Ты читаешь') && l.prompt <= 2500).flatMap(l => markers(l.user)));
    for (let i = 1; i <= 12; i++) if (i !== 7) assert(seen.has('REQ-' + i), 'lost: REQ-' + i);
    assert(result.coverage.failed.length >= 1 && result.coverage.failed.every(x => x.includes('Раздел 7')));
    assert(result.coverage.warnings.some(x => x.startsWith('Не удалось прочитать') && x.includes('Раздел 7')));
  });
  await test('more than 12 proposed tasks are kept to 12 and the rest are named', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ summary: 'Задача ' + i, description: 'Описание', assigneeId: '', assignmentReason: '', dependsOn: i ? [i - 1] : [] }));
    const fake = ollama({ tasks: () => ({ tasks: many, questions: [] }) }), { w } = workspace(fake, spec(1, 500));
    await w.searchDocs(context); const result = await w.prepare('нарежь задач по спеке', context, ['confluence:5']);
    assert.equal(result.tasks.length, 12); assert(result.coverage.warnings.some(x => x.includes('Задача 12') && x.includes('Задача 13')));
  });
  await test('a long Notion page chosen for the plan is read in full', async () => {
    let reads = 0;
    const n = new Notion(async url => { reads++; const i = reads; return { results: [{ id: 'b' + i, type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Раздел ' + i }] } }, { id: 'p' + i, type: 'paragraph', paragraph: { rich_text: [{ plain_text: filler.repeat(40) + ' REQ-' + i } ] } }], has_more: i < 30, next_cursor: 'c' + i }; }, async () => {});
    const preview = await n.content('page', 'n'); assert(preview.truncated && preview.text.length <= 18000);
    reads = 0; const full = await n.content('page', 'n', { full: true }); assert(!full.truncated); assert(full.text.includes('REQ-30')); assert(full.text.startsWith('## Раздел 1'));
    const fake = ollama(), w = new Workspace({ settings: () => settings, request: fake.request });
    require('../src/extensions/notion/doc-source.cjs').client(w.request).content = async (id, token, options) => { assert.equal(id, 'abc'); assert(options.full); return { text: '# Оплата\n' + 'REQ-99 ' + filler.repeat(10), truncated: false }; };
    w.docs.set('notion:abc', { id: 'notion:abc', source: 'Notion', title: 'Оплата', text: 'начало', more: true, url: 'https://www.notion.so/abc' });
    await w.prepare('декомпозируй', context, ['notion:abc']); assert(fake.log.at(-1).user.includes('REQ-99'));
  });
  await test('agent ranges are contiguous, balanced and never overlap', () => {
    const all = plan.parts({ title: 'Док', text: plan.outline(spec(40)) }, 3000), ranges = plan.assign(all, 3);
    assert.equal(ranges.length, 3); assert.deepEqual(ranges.flat(), all);
    const cost = r => r.reduce((n, p) => n + p.text.length, 0), sizes = ranges.map(cost);
    assert(Math.max(...sizes) < Math.min(...sizes) * 2, 'unbalanced: ' + sizes);
    assert.equal(plan.assign(all.slice(0, 2), 3).length, 2); assert.deepEqual(plan.assign([], 3), []);
    const meter = plan.createMeter(); meter.add(100); meter.finish(50); assert.equal(meter.percent(), 50); meter.add(100); assert.equal(meter.percent(), 50); meter.finish(150); assert.equal(meter.percent(), 99);
  });
  await test('a large team is narrowed to the people the material names, and the planner says so', () => {
    const people = Array.from({ length: 900 }, (_, i) => ({ id: 'u' + i, name: 'Сотрудник' + i + ' Фамилия' + i })).concat({ id: 'masha', name: 'Мария Соколова' });
    const result = plan.trimPeople(people, 'Бэкенд делает Соколова', 1500);
    assert.deepEqual(result.people.map(p => p.id), ['masha']); assert(result.note.includes('1 из 901'));
    assert.equal(plan.trimPeople(people.slice(0, 3), '', 1500).note, '');
  });
  await test('a model failure stops all agents and is reported, not hidden', async () => {
    const fake = ollama({ failing: user => user.includes('REQ-30:') }), { w, progress } = workspace(fake, spec(60));
    const original = fake.request; let calls = 0;
    const broken = { request: async (url, options) => { if (url.includes('/api/chat') && options.body.includes('REQ-30:')) throw new Error('Ollama не отвечает'); if (url.includes('/api/chat')) calls++; return original(url, options); } };
    const ws = new Workspace({ settings: () => settings, request: async (url, options) => url.includes('/wiki/') ? { results: [{ id: '5', title: 'Спецификация', body: { storage: { value: spec(60) } } }] } : broken.request(url, options), progress: s => progress.push(s) });
    await ws.searchDocs(context); await assert.rejects(() => ws.prepare('декомпозируй', context, ['confluence:5']), /Ollama не отвечает/);
    assert.equal(ws.decomposing, null); assert.equal(progress.at(-1).stage, 'error');
    assert(calls < 25, 'agents kept reading after a failure: ' + calls);
  });
  await test('without Jira the plan is made from the material alone (for Asana)', async () => {
    const fake = ollama(), w = new Workspace({ settings: () => ({ model: 'qwen', ollamaUrl: settings.ollamaUrl, asanaCredential: 'c', asanaWorkspace: '9' }), request: fake.request });
    const result = await w.prepare('декомпозь давай', context, []);
    assert.equal(result.metadata, null); assert.deepEqual(result.people, []); assert.equal(result.tasks.length, 2);
  });
  await test('a second decomposition does not start while one is running', async () => {
    const fake = ollama(), { w } = workspace(fake, spec(1, 500)); await w.searchDocs(context);
    w.decomposing = { busy: true }; await assert.rejects(() => w.prepare('декомпозируй', context, ['confluence:5']), /уже идёт/);
  });
  console.log(`${count} large decomposition tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
