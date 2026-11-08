// First-run introduction: local guesses (name, company, role), saved progress and settings validation.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const guess = require('../src/onboarding-guess.cjs');
const onboarding = require('../src/features/onboarding.cjs');

const DAY = 86400000, NOW = Date.UTC(2026, 10, 9);
function fake({ platform = 'darwin', home = '/Users/alex', commands = {}, files = {}, dirs = {}, mtimes = {}, exists = [] } = {}) {
  const calls = [];
  return {
    platform, home, env: { USER: 'alex', LOCALAPPDATA: 'C:/Users/alex/AppData/Local', APPDATA: 'C:/Users/alex/AppData/Roaming', ProgramFiles: 'C:/Program Files' }, now: NOW, calls,
    run: async (command, args) => { calls.push(command + ' ' + args.join(' ')); return commands[command + ' ' + args.join(' ')] || ''; },
    read: file => files[file] || '', list: dir => dirs[dir] || [], mtime: file => mtimes[file] || 0, exists: file => exists.includes(file)
  };
}
const chrome = (profiles) => JSON.stringify({ profile: { info_cache: Object.fromEntries(profiles.map((p, i) => ['Profile ' + i, p])) } });
const CHROME = '/Users/alex/Library/Application Support/Google/Chrome/Local State';
const YANDEX = '/Users/alex/Library/Application Support/Yandex/YandexBrowser/Local State';
const SLACK = '/Users/alex/Library/Application Support/Slack/storage/root-state.json';

(async () => {
  // Name: the account, browser profiles and git agree on the given name; evidence names every place.
  const sources = [];
  const env = fake({
    commands: { 'id -F': 'Александр Фер', 'git config --global --get user.name': 'Alex Silaev', 'git config --global --get user.email': 'alex@joy-way.com' },
    files: {
      [CHROME]: chrome([{ gaia_name: 'Александр Фер', gaia_given_name: 'Александр', user_name: 'chrome.alex@gmail.com' }, { name: 'Person 2' }]),
      [YANDEX]: chrome([{ user_name: 'a.fer@joy-way.com' }]),
      [SLACK]: JSON.stringify({ workspaces: { T01ABCDEF: { id: 'T01ABCDEF', name: 'Joy Way', domain: 'joyway' }, T02XYZ123: { id: 'T02XYZ123', name: 'Petya Dev', url: 'https://petya-dev.slack.com/' } }, settings: { name: 'not a workspace', domain: 'x' } })
    }
  });
  const name = await guess.guessName(env, s => sources.push(s));
  assert.deepEqual(sources, ['system', 'browser', 'git'], 'the lens follows each checked source');
  assert.equal(name.value, 'Александр');
  assert.deepEqual(name.candidates.map(c => c.value), ['Александр', 'Alex']);
  assert.deepEqual(name.candidates[0].evidence.map(e => e.source), ['system', 'browser']);
  assert.equal(guess.nameFromEmail('alex.silaev@joy-way.com'), 'Alex Silaev');
  assert.equal(guess.nameFromEmail('chrome.alex@gmail.com'), 'Chrome Alex', 'derived names are low-weight hints only');

  // Logins and junk are not names.
  const logins = fake({ commands: { 'id -F': 'aleksandrfeer', 'git config --global --get user.name': 'root' } });
  assert.equal((await guess.guessName(logins)).value, '');

  // Company: Slack workspaces first, then work mail domains; public mail never becomes a company.
  const company = await guess.guessCompany(env);
  assert.equal(company.value, 'Joy Way');
  assert.deepEqual(company.candidates[0].evidence.map(e => e.source), ['slack', 'browser', 'git']);
  assert.ok(company.candidates.some(c => c.value === 'Petya Dev'));
  assert.ok(!company.candidates.some(c => /gmail/i.test(c.value)));
  assert.equal(guess.companyFromDomain('studio.co.uk'), 'Studio');
  assert.equal(guess.workDomain('me@yandex.ru'), '');
  assert.equal((await guess.guessCompany(fake())).value, '', 'nothing found is a miss, not a made-up company');

  // Role: installed apps and fresh project folders. A Unity project makes the developer a Unity developer.
  const unity = fake({
    dirs: { '/Applications': ['Unity Hub.app', 'Rider.app', 'Figma.app', 'Slack.app', 'Docker.app'], '/Users/alex/Projects': ['Game', 'Old'] },
    mtimes: { '/Users/alex/Projects/Game/.git/logs/HEAD': NOW - 2 * DAY, '/Users/alex/Projects/Old/.git/logs/HEAD': NOW - 90 * DAY },
    exists: ['/Users/alex/Projects/Game/ProjectSettings/ProjectVersion.txt']
  });
  const roleSources = [];
  const role = await guess.guessRole(unity, s => roleSources.push(s));
  assert.deepEqual(roleSources, ['apps', 'projects']);
  assert.equal(role.value, 'unity');
  assert.deepEqual(role.candidates.map(c => c.value), ['unity', 'developer', 'designer']);
  assert.ok(role.candidates[0].evidence.some(e => e.source === 'apps' && /Unity Hub/.test(e.detail)));
  assert.ok(role.candidates[0].evidence.some(e => e.source === 'projects' && e.count === 1));

  const designer = await guess.guessRole(fake({ dirs: { '/Applications': ['Figma.app', 'Adobe Photoshop 2026.app', 'Slack.app'] } }));
  assert.equal(designer.value, 'designer');
  const manager = await guess.guessRole(fake({ dirs: { '/Applications': ['Microsoft Excel.app', 'Keynote.app', 'Miro.app'] } }));
  assert.equal(manager.value, 'manager', 'three office tools add up to a manager');
  const unsure = await guess.guessRole(fake({ dirs: { '/Applications': ['Notion.app', 'Slack.app'] } }));
  assert.equal(unsure.value, '', 'one weak signal is not a guess');

  // Windows and Linux read their own places.
  const win = fake({ platform: 'win32', home: 'C:/Users/alex', dirs: { 'C:/Program Files': ['Unity Hub', 'Docker'] }, files: { [path.join('C:/Users/alex/AppData/Local', 'Google/Chrome/User Data', 'Local State')]: chrome([{ gaia_given_name: 'Саша', gaia_name: 'Саша Фер' }]) } });
  assert.equal((await guess.guessName(win)).value, 'Саша');
  assert.ok(win.calls.some(c => c.startsWith('powershell')));
  assert.equal((await guess.guessRole(win)).value, 'unity');
  const linux = fake({ platform: 'linux', home: '/home/alex', commands: { 'getent passwd alex': 'alex:x:1000:1000:Alex Fer,,,:/home/alex:/bin/bash' }, dirs: { '/usr/share/applications': ['jetbrains-pycharm.desktop', 'code.desktop', 'org.gnome.Nautilus.desktop'] } });
  assert.equal((await guess.guessName(linux)).value, 'Alex');
  assert.equal((await guess.guessRole(linux)).value, 'developer');

  // Team: a team shared in a project comes first (with roles), then commit authors; the user and bots are left out.
  const share = require('../src/project-share.cjs');
  const repo = '/Users/alex/Projects/Game', site = '/Users/alex/Projects/Site';
  const teamEnv = fake({
    commands: {
      'git config --global --get user.email': 'alex@joy-way.com', 'git config --global --get user.name': 'Alex Silaev',
      ['git -C ' + repo + ' log --since=60.days --no-merges -n 3000 --format=%aN%x09%aE']: ['Polina Samarina\tpolina@joy-way.com', 'Alex Silaev\talex@joy-way.com', 'dependabot[bot]\t49699333+dependabot[bot]@users.noreply.github.com', 'ivan\tivan@joy-way.com', 'Ivan Petrov\tivan@joy-way.com', 'Polina Samarina\tpolina@joy-way.com'].join('\n'),
      ['git -C ' + site + ' log --since=60.days --no-merges -n 3000 --format=%aN%x09%aE']: 'Oleg Kim\t1234+oleg@users.noreply.github.com\nPolina Samarina\tpolina.s@gmail.com'
    },
    dirs: { '/Users/alex/Projects': ['Game', 'Site'] },
    mtimes: { [repo + '/.git/logs/HEAD']: NOW - DAY, [site + '/.git/logs/HEAD']: NOW - DAY },
    files: { [site + '/.petya/team.json']: JSON.stringify({ version: 1, members: [{ name: 'Мария Котова', role: 'Продюсер', responsibilities: 'Релизы', email: 'maria@joy-way.com', photo: 'data:image/png;base64,AAAA' }, { name: '' }] }) }
  });
  const teamSources = [];
  const found = await guess.guessTeam(teamEnv, s => teamSources.push(s));
  assert.deepEqual(teamSources, ['git', 'projects', 'shared']);
  assert.ok(!found.members.some(m => m.shared), 'a broken shared file (empty name) is ignored as a whole');
  assert.deepEqual(found.evidence.map(e => e.source), ['projects']);
  const goodTeam = JSON.stringify({ version: 1, members: [{ name: 'Мария Котова', role: 'Продюсер', responsibilities: 'Релизы', email: 'maria@joy-way.com', photo: 'data:image/png;base64,AAAA', token: 'x' }] });
  teamEnv.read = file => file === site + '/.petya/team.json' ? goodTeam : '';
  const team = await guess.guessTeam(teamEnv);
  assert.deepEqual(team.members.map(m => m.name), ['Мария Котова', 'Polina Samarina', 'Ivan Petrov', 'Oleg Kim']);
  assert.equal(team.members[0].role, 'Продюсер'); assert.equal(team.members[0].shared, true); assert.equal(team.members[0].photo, undefined);
  assert.equal(team.members[1].projects, 'Game, Site', 'one person with a work and a personal email is merged by name');
  assert.equal(team.members[3].email, '', 'noreply addresses are not kept');
  assert.deepEqual(team.projects, ['Game', 'Site']);
  assert.deepEqual(team.evidence.map(e => e.source), ['shared', 'projects']);
  assert.equal((await guess.guessTeam(fake())).value, '');
  // Writing the shared file: only shareable fields, stable JSON for small git diffs, read back the same.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'petya-share-'));
  assert.equal(share.writeTeam(tmp, [{ name: 'Мария', role: 'Продюсер', email: 'm@x.ru', photo: 'data:image/png;base64,AAAA', accounts: { slack: { id: 'U1' } } }]), path.join('.petya', 'team.json'));
  const written = fs.readFileSync(path.join(tmp, '.petya/team.json'), 'utf8');
  assert.ok(written.endsWith('\n') && written.includes('\n  "members"'));
  assert.deepEqual(JSON.parse(written), { version: 1, members: [{ name: 'Мария', role: 'Продюсер', email: 'm@x.ru' }] });
  assert.deepEqual(share.readTeam(tmp, f => fs.readFileSync(f, 'utf8')), [{ name: 'Мария', role: 'Продюсер', email: 'm@x.ru' }]);
  assert.throws(() => share.writeTeam(tmp, [{ name: '' }]), /имя/);
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.deepEqual(onboarding.cleanAnswers({ team: [{ name: ' Мария ', role: 'Продюсер', on: false }, { name: '' }, 'x'], shareProject: 'Game' }),
    { team: [{ name: 'Мария', email: '', role: 'Продюсер', projects: '', responsibilities: '', on: false }], shareProject: 'Game' });

  // Progress survives a restart; a done introduction stays closed unless forced.
  const p = onboarding.pendingState;
  assert.equal(p({}, { userName: '', hasChats: false }).pending, true, 'fresh install');
  assert.equal(p({}, { userName: 'Саша', hasChats: false }).pending, false, 'an existing user is not interrupted');
  assert.equal(p({}, { userName: '', hasChats: true }).pending, false);
  assert.deepEqual(p({ step: 3, answers: { name: 'Саша' } }, { userName: 'Саша' }), { pending: true, step: 3, answers: { name: 'Саша' } }, 'resume after a restart');
  assert.equal(p({ done: true }, { userName: '' }).pending, false);
  assert.deepEqual(p({ done: true, answers: { name: 'x' } }, { force: true }), { pending: true, step: 0, answers: {} });
  assert.deepEqual(onboarding.cleanAnswers({ name: '  Саша ', role: 'unity', skipped: ['screen', 'camera'], extra: 1 }), { name: 'Саша', role: 'unity', skipped: ['screen'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'petya-onboarding-'));
  const store = onboarding.store(path.join(dir, 'nested', 'onboarding.json'));
  assert.deepEqual(store.read(), {});
  store.write({ step: 2, answers: { name: 'Саша' } });
  assert.deepEqual(store.read(), { step: 2, answers: { name: 'Саша' } });
  fs.writeFileSync(path.join(dir, 'nested', 'onboarding.json'), '{broken');
  assert.deepEqual(store.read(), {}, 'a broken file starts over instead of crashing');
  fs.rmSync(dir, { recursive: true, force: true });

  // Settings: a known role id or a custom role; nothing else.
  for (const ok of ['', 'developer', 'custom:Продюсер звука', 'custom:Tech Artist (VFX)']) onboarding.validate({ userRole: ok });
  for (const bad of ['boss', 'custom:', 'custom:<script>', 'custom:' + 'x'.repeat(61)]) assert.throws(() => onboarding.validate({ userRole: bad }), /роль/);

  // The window loads the avatar and the introduction; the splash can hand Petya over to it.
  const html = fs.readFileSync(path.join(__dirname, '../src/ui/index.html'), 'utf8');
  assert.ok(html.indexOf('data-src="petya-avatar.js"') < html.indexOf('data-src="onboarding.js"'));
  assert.match(html, /href="onboarding\.css"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../src/ui/boot-splash.js'), 'utf8'), /petyaBootSplash=\{target:null/);
  for (const layer of ['body', 'head', 'cap', 'eye-l', 'eye-r', 'mouth']) assert.ok(fs.existsSync(path.join(__dirname, '../assets/boot/petya-' + layer + '.png')));
  console.log('Onboarding: name/company/role guesses on macOS, Windows and Linux, resume after restart and role validation passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
