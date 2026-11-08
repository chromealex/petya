// Petya's data shared through a project's git (.petya/): file formats, save/load, automatic use in the project.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const share = require('../src/project-share.cjs');
const feature = require('../src/features/project-share.cjs');
const read = f => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'petya-share-'));
  const repo = path.join(root, 'Game'), other = path.join(root, 'Tools');
  fs.mkdirSync(repo); fs.mkdirSync(other);

  // Dictionary: aliases go to git, personal corrections and broken rules do not.
  share.writeDictionary(repo, [{ from: 'бэ-вэ', to: 'BW', kind: 'alias', id: 'x', enabled: true }, { from: 'не то', to: 'список', kind: 'correction' }, { from: 'off', to: 'OFF', kind: 'alias', enabled: false }, { from: 'мв', to: 'MW', scope: 'MW', kind: 'alias' }]);
  assert.deepEqual(JSON.parse(read(path.join(repo, '.petya/dictionary.json'))), { version: 1, rules: [{ from: 'бэ-вэ', to: 'BW' }, { from: 'мв', to: 'MW', scope: 'MW' }] });
  fs.writeFileSync(path.join(other, 'bad.json'), '');
  fs.mkdirSync(path.join(other, '.petya'));
  fs.writeFileSync(path.join(other, '.petya/dictionary.json'), JSON.stringify({ rules: [{ from: 'a', to: 'a' }, { from: 'гит', to: 'Git' }, null] }));
  assert.deepEqual(share.readDictionary(other, read), [{ from: 'гит', to: 'Git' }], 'a broken rule is skipped, the rest stays');

  // Project: channels by purpose and the Jira key; account hashes and junk never reach git.
  share.writeProject(repo, { name: 'Game', slack: { a: { id: 'C0123ABCD', name: '#jw-bw-dev', role: 'dev', account: 'secret-hash' }, b: { id: 'not-a-channel', role: 'qa' } }, jira: { key: 'bw', url: 'x' } });
  assert.deepEqual(JSON.parse(read(path.join(repo, '.petya/project.json'))), { version: 1, name: 'Game', slack: [{ id: 'C0123ABCD', name: 'jw-bw-dev', role: 'dev' }], jira: { key: 'BW' } });
  assert.throws(() => share.writeProject(other, { slack: {} }), /каналов Slack/);

  // Skills: standard SKILL.md that the project skill library reads.
  assert.equal(share.writeSkill(repo, { name: 'bug-report', description: 'Как оформлять баг', body: '# Баг\n- шаги' }), path.join('.petya', 'skills', 'bug-report', 'SKILL.md'));
  const projectSkills = require('../src/skill-library/project-skills.cjs');
  const loaded = (projectSkills.load || projectSkills.skills)?.(repo) || [];
  assert.ok(loaded.some(s => s.name === 'bug-report'), 'the library picks the shared skill up');
  assert.throws(() => share.writeSkill(repo, { name: '../evil', description: 'x', body: 'y' }), /Имя/);

  // The feature: folders come from the project settings, never from the page.
  let team = [{ name: 'Полина', role: 'QA', email: 'p@x.ru', photo: 'data:image/png;base64,AAAA' }];
  const dictionary = [{ id: '1', from: 'бэ-вэ', to: 'BW!', kind: 'alias', enabled: true }];
  const memory = { id: 'm1', name: 'Game', slack: {}, jira: null };
  const services = {
    dialogue: { state: { activeProjectId: 'p1', projects: [{ id: 'general', name: 'Общее' }, { id: 'p1', name: 'Game', memoryId: 'm1', folders: [repo, other, path.join(root, 'missing')] }] } },
    projectMemory: { get: id => id === 'm1' ? memory : null, active: () => memory, context() { return { id: 'm1', name: 'Game', projectChannels: [], hasSavedChannels: false }; } },
    get settings() { return { teamMembers: JSON.stringify(team) }; },
    saveSettings: async input => { team = JSON.parse(input.teamMembers); },
    learning: { list: () => ({ dictionary }), putRule: r => dictionary.push({ id: String(dictionary.length + 1), enabled: true, ...r }) },
    instructionSkills: { list: () => [{ name: 'release-notes', description: 'Релиз-ноты', body: 'Пиши кратко', enabled: true }, { name: 'off', description: 'x', body: 'y', enabled: false }] }
  };
  const { ipc, projectShare } = feature.setup(services);
  const status = ipc.status();
  assert.deepEqual(status.project, { id: 'p1', name: 'Game' });
  assert.deepEqual(status.folders.map(f => f.name), ['Game', 'Tools'], 'missing folders are not offered');
  assert.deepEqual(status.folders[0].shared, { team: 0, dictionary: 2, channels: 1, jira: 'BW', skills: ['bug-report'] });
  assert.deepEqual(status.local, { team: 1, dictionary: 1, channels: 0, jira: '', skills: ['release-notes'] });
  assert.equal(ipc.status('general').project, null);

  // Shared channels and Jira key fill in when you saved none of your own; the glossary joins the chat rules.
  const context = services.projectMemory.context();
  assert.deepEqual(context.projectChannels, [{ id: 'C0123ABCD', name: 'jw-bw-dev', role: 'dev' }]);
  assert.equal(context.hasSavedChannels, true); assert.deepEqual(context.jira, { key: 'BW' }); assert.equal(context.sharedFrom, 'Game');
  assert.deepEqual(projectShare.sharedRules().map(r => [r.from, r.to, r.kind, r.enabled]), [['бэ-вэ', 'BW', 'alias', true], ['мв', 'MW', 'alias', true], ['гит', 'Git', 'alias', true]]);

  // Save: chosen kinds into the chosen folder; nothing to save is reported, not written empty.
  const saved = ipc.save('p1', 1, ['team', 'skills', 'project']);
  assert.deepEqual(saved.written, [path.join('.petya', 'team.json'), path.join('.petya', 'skills', 'release-notes', 'SKILL.md')]);
  assert.deepEqual(saved.skipped, ['project']);
  assert.deepEqual(JSON.parse(read(path.join(other, '.petya/team.json'))).members, [{ name: 'Полина', role: 'QA', email: 'p@x.ru' }]);
  assert.throws(() => ipc.save('p1', 5, ['team']), /Папка проекта не найдена/);
  assert.throws(() => ipc.save('p1', 0, ['passwords']), /Неизвестный вид/);

  // Load: colleagues and glossary join yours; the same person or phrase is never duplicated or replaced.
  share.writeTeam(repo, [{ name: 'Полина', email: 'p@x.ru', role: 'Lead QA' }, { name: 'Иван Петров', role: 'Сервер' }]);
  const loadedBack = await ipc.load('p1', 0, ['team', 'dictionary']);
  assert.deepEqual(loadedBack, { folder: 'Game', team: 1, dictionary: 1 });
  assert.deepEqual(team.map(m => [m.name, m.role]), [['Полина', 'QA'], ['Иван Петров', 'Сервер']]);
  assert.ok(team[0].photo, 'your own data (photo) stays');
  assert.deepEqual(dictionary.map(r => r.to), ['BW!', 'MW'], 'your own rule wins on the same phrase');
  assert.deepEqual(await ipc.load('p1', 0, ['team', 'dictionary']), { folder: 'Game', team: 0, dictionary: 0 }, 'loading twice adds nothing');

  // The window loads the block and the Team tab buttons.
  const html = fs.readFileSync(path.join(__dirname, '../src/ui/index.html'), 'utf8');
  assert.match(html, /data-src="project-share\.js"/); assert.match(html, /href="project-share\.css"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/ui/project-editor.js'), 'utf8'), /paintProjectShare\?\.\(shareBox,project\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/converse.cjs'), 'utf8'), /ctx\.projectShare\?\.sharedRules\(\)/);
  fs.rmSync(root, { recursive: true, force: true });
  console.log('Project share: team, glossary, channels/Jira and skills in .petya — formats, save, load and automatic use passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
