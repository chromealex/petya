// «Удалить все компании»: two-phase reset keeps app-wide data, moves every company's data aside, and the
// next start is a fresh install (one default company, no onboarding progress).
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const reset = require('../src/company-reset.cjs');
const { Companies } = require('../src/companies.cjs');
const onboarding = require('../src/features/onboarding.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'petya-reset-'));
const put = (rel, text = 'x') => { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
// The first company's data in the root, a second company, app-wide files and Chromium's own files.
const companies = new Companies(root);
const second = companies.create('Вторая');
for (const rel of ['settings.json', 'dialogue-memory.json', 'project-memory.json', 'onboarding.json', 'Cookies', 'Local Storage/leveldb/1.log', 'meeting-recordings/a.wav', 'jira/cache.json',
  'companies/' + second.id + '/settings.json', 'extensions/reminders/reminders.json', 'extensions/my-app/extension.json', 'extensions/my-app/chat.js',
  'petya-models/model.bin', 'runtime/models/ggml-base.bin', 'interface-language.json', 'window-state.json', 'Local State', 'speech/a.bin', 'skill-packages/p.json']) put(rel);
put('onboarding.json', JSON.stringify({ done: true }));

assert.equal(reset.apply(root), null, 'nothing happens without the request');
reset.request(root);
assert.ok(reset.pending(root));
const removed = reset.apply(root, { now: 42 });
assert.equal(removed, path.join(root, '.removed-companies-42'));

const kept = rel => fs.existsSync(path.join(root, rel)), moved = rel => fs.existsSync(path.join(removed, rel));
for (const rel of ['petya-models/model.bin', 'runtime/models/ggml-base.bin', 'interface-language.json', 'window-state.json', 'Local State', 'speech/a.bin', 'skill-packages/p.json', 'extensions/my-app/extension.json'])
  assert.ok(kept(rel) && !moved(rel), 'app-wide stays: ' + rel);
for (const rel of ['settings.json', 'dialogue-memory.json', 'project-memory.json', 'onboarding.json', 'companies.json', 'Cookies', 'Local Storage/leveldb/1.log', 'meeting-recordings/a.wav', 'jira/cache.json',
  'companies/' + second.id + '/settings.json', 'extensions/reminders/reminders.json'])
  assert.ok(moved(rel) && !kept(rel), 'company data goes to the Trash folder: ' + rel);
assert.ok(!reset.pending(root), 'the marker is gone, a second start does not reset again');
assert.equal(reset.apply(root), null);

// The next start is a fresh install: one default company and the introduction from the first step.
const fresh = new Companies(root);
assert.deepEqual(fresh.state.companies.map(c => c.id), ['default']);
assert.equal(fresh.state.activeId, 'default');
const saved = onboarding.store(path.join(root, 'onboarding.json')).read();
assert.deepEqual(onboarding.pendingState(saved, { userName: '', hasChats: false }), { pending: true, step: 0, answers: {} });

// The main process wires both phases; the companies view offers the button.
const main = fs.readFileSync(path.join(__dirname, '../src/main.cjs'), 'utf8');
assert.ok(main.indexOf("require('./company-reset.cjs').apply(") < main.indexOf("new (require('./companies.cjs').Companies)"), 'reset runs before the company list is read');
assert.match(main, /handle\('companyRemoveAll'/);
assert.match(fs.readFileSync(path.join(__dirname, '../src/preload.cjs'), 'utf8'), /'companyRemoveAll'/);
assert.match(fs.readFileSync(path.join(__dirname, '../src/ui/companies.js'), 'utf8'), /companyRemoveAll\(\)/);
fs.rmSync(root, { recursive: true, force: true });
console.log('Company reset: app-wide data kept, every company moved aside, fresh start with the introduction passed');
