// Local guesses for the first-run introduction («Угадай»): the user's name, company and role.
// Runs only when the user presses the button and reads only files that need no OS permission: the account's full
// name, git settings, Chromium browser profiles, the desktop Slack's workspace list, installed apps and project
// folders. Nothing leaves the computer. Results carry structured evidence (source ids and raw details); the
// renderer words them. Every reader is injectable for tests.
const path = require('node:path');
const PUBLIC_MAIL = new Set(['gmail.com', 'googlemail.com', 'yandex.ru', 'yandex.com', 'ya.ru', 'mail.ru', 'bk.ru', 'inbox.ru', 'list.ru', 'rambler.ru',
  'icloud.com', 'me.com', 'mac.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'proton.me', 'protonmail.com', 'gmx.com', 'gmx.de',
  'users.noreply.github.com', 'example.com', 'localhost']);
const LOGIN = /^[a-z0-9._-]+$/;

function environment({ platform = process.platform, home = require('node:os').homedir(), env = process.env } = {}) {
  const fs = require('node:fs'), { execFile } = require('node:child_process');
  const run = (command, args, timeout = 2500) => new Promise(resolve => {
    try { execFile(command, args, { timeout, windowsHide: true, env: { ...env, LANG: 'C.UTF-8' } }, (error, stdout) => resolve(error ? '' : String(stdout).trim())); }
    catch { resolve(''); }
  });
  const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
  const list = dir => { try { return fs.readdirSync(dir); } catch { return []; } };
  const mtime = file => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };
  const exists = file => { try { fs.accessSync(file); return true; } catch { return false; } };
  return { platform, home, env, run, read, list, mtime, exists, now: Date.now() };
}

// Chromium browsers keep the signed-in Google account per profile in «Local State».
function browserFiles({ platform, home, env }) {
  const browsers = platform === 'darwin'
    ? [['Chrome', 'Library/Application Support/Google/Chrome'], ['Yandex', 'Library/Application Support/Yandex/YandexBrowser'], ['Edge', 'Library/Application Support/Microsoft Edge'], ['Brave', 'Library/Application Support/BraveSoftware/Brave-Browser'], ['Arc', 'Library/Application Support/Arc/User Data']].map(([n, d]) => [n, path.join(home, d)])
    : platform === 'win32'
      ? [['Chrome', 'Google/Chrome/User Data'], ['Yandex', 'Yandex/YandexBrowser/User Data'], ['Edge', 'Microsoft/Edge/User Data'], ['Brave', 'BraveSoftware/Brave-Browser/User Data']].map(([n, d]) => [n, path.join(env.LOCALAPPDATA || path.join(home, 'AppData/Local'), d)])
      : [['Chrome', '.config/google-chrome'], ['Yandex', '.config/yandex-browser'], ['Edge', '.config/microsoft-edge'], ['Brave', '.config/BraveSoftware/Brave-Browser'], ['Chromium', '.config/chromium']].map(([n, d]) => [n, path.join(home, d)]);
  return browsers.map(([browser, dir]) => [browser, path.join(dir, 'Local State')]);
}
function browserProfiles(e) {
  const out = [];
  for (const [browser, file] of browserFiles(e)) {
    let state; try { state = JSON.parse(e.read(file) || 'null'); } catch { continue; }
    for (const profile of Object.values(state?.profile?.info_cache || {})) {
      const email = String(profile.user_name || '').trim().toLowerCase();
      const name = String(profile.gaia_name || '').trim(), given = String(profile.gaia_given_name || '').trim();
      if (email || name) out.push({ browser, email: /@/.test(email) ? email : '', name, given });
    }
  }
  return out;
}
function slackFile({ platform, home, env }) {
  // The App Store build keeps its data inside a sandbox container; reading it makes macOS ask, so it is skipped.
  return platform === 'darwin' ? path.join(home, 'Library/Application Support/Slack/storage/root-state.json')
    : platform === 'win32' ? path.join(env.APPDATA || path.join(home, 'AppData/Roaming'), 'Slack/storage/root-state.json')
      : path.join(home, '.config/Slack/storage/root-state.json');
}
function slackWorkspaces(e) {
  let state; try { state = JSON.parse(e.read(slackFile(e)) || 'null'); } catch { return []; }
  const found = new Map();
  const walk = (value, depth) => {
    if (!value || typeof value !== 'object' || depth > 6) return;
    if (typeof value.name === 'string' && value.name.trim() && (typeof value.domain === 'string' || typeof value.url === 'string') && /^[TE][A-Z0-9]{6,}$/.test(String(value.id || ''))) found.set(value.id, value.name.trim());
    for (const child of Object.values(value)) walk(child, depth + 1);
  };
  walk(state, 0);
  return [...found.values()];
}
async function fullName(e) {
  if (e.platform === 'darwin') return e.run('id', ['-F']);
  if (e.platform === 'win32') return e.run('powershell', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_UserAccount -Filter "Name=\'$env:USERNAME\'" -ErrorAction SilentlyContinue).FullName'], 4000);
  const entry = await e.run('getent', ['passwd', e.env.USER || require('node:os').userInfo().username]);
  return (entry.split(':')[4] || '').split(',')[0];
}
const gitValue = (e, key) => e.run('git', ['config', '--global', '--get', key]);

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
const realName = value => { value = clean(value); return value.length >= 2 && value.length <= 50 && /^[\p{L}\p{M}][\p{L}\p{M} '’-]*$/u.test(value) && !(LOGIN.test(value) && !/\s/.test(value)) ? value : ''; };
const given = full => full.split(' ')[0];
const nameFromEmail = email => {
  const local = String(email || '').split('@')[0].split('+')[0];
  const parts = local.split(/[._-]/).filter(p => /^[a-z]{2,}$/i.test(p));
  return parts.length >= 2 ? parts.map(p => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' ') : '';
};
const workDomain = email => { const domain = String(email || '').split('@')[1]?.toLowerCase() || ''; return domain && !PUBLIC_MAIL.has(domain) && /\./.test(domain) ? domain : ''; };
const companyFromDomain = domain => {
  const parts = domain.split('.'); const label = parts.length > 2 && ['co', 'com', 'org', 'net'].includes(parts.at(-2)) ? parts.at(-3) : parts.at(-2);
  return (label || '').split('-').filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
};

// Candidates with the same value merge their evidence; the strongest total wins.
function rank(entries) {
  const merged = new Map();
  for (const entry of entries) {
    const key = entry.value.toLocaleLowerCase('ru');
    const item = merged.get(key) || { value: entry.value, score: 0, evidence: [] };
    item.score += entry.weight; item.evidence.push(entry.evidence); merged.set(key, item);
  }
  const candidates = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 4);
  return { value: candidates[0]?.value || '', candidates };
}

async function guessName(e, onSource = () => {}) {
  const entries = [];
  onSource('system');
  const system = realName(await fullName(e));
  if (system) entries.push({ value: given(system), weight: 3, evidence: { source: 'system', detail: system } });
  onSource('browser');
  for (const profile of browserProfiles(e)) {
    const full = realName(profile.name);
    const first = realName(profile.given) || (full && given(full));
    if (first) entries.push({ value: first, weight: 3, evidence: { source: 'browser', detail: profile.browser + (full ? ': ' + full : '') } });
    else { const derived = nameFromEmail(profile.email); if (derived) entries.push({ value: given(derived), weight: 1, evidence: { source: 'browser', detail: profile.browser + ': ' + profile.email } }); }
  }
  onSource('git');
  const gitName = realName(await gitValue(e, 'user.name'));
  if (gitName) entries.push({ value: given(gitName), weight: 2, evidence: { source: 'git', detail: gitName } });
  else { const derived = nameFromEmail(await gitValue(e, 'user.email')); if (derived) entries.push({ value: given(derived), weight: 1, evidence: { source: 'git', detail: derived } }); }
  return rank(entries);
}

async function guessCompany(e, onSource = () => {}) {
  const entries = [];
  onSource('slack');
  for (const name of slackWorkspaces(e)) entries.push({ value: name, weight: 3, evidence: { source: 'slack', detail: name } });
  onSource('browser');
  for (const profile of browserProfiles(e)) { const domain = workDomain(profile.email); if (domain) entries.push({ value: companyFromDomain(domain), weight: 2, evidence: { source: 'browser', detail: profile.browser + ': ' + domain } }); }
  onSource('git');
  const domain = workDomain(await gitValue(e, 'user.email'));
  if (domain) entries.push({ value: companyFromDomain(domain), weight: 2, evidence: { source: 'git', detail: domain } });
  return rank(entries.filter(entry => entry.value));
}

// App names → role weights. Strong tools say more than common office ones; a lead is never guessed from apps.
const APP_RULES = [
  [/^unity( hub)?$|^unity hub/i, { unity: 4 }],
  [/^(jetbrains )?rider/i, { developer: 2, unity: 1 }],
  [/^(jetbrains )?(xcode|android studio|intellij idea|pycharm|webstorm|goland|clion|phpstorm|rubymine|datagrip|visual studio( code)?|code|cursor|zed|sublime text|docker( desktop)?|iterm2?|warp|github desktop|fork|sourcetree|tower|gitkraken)\b/i, { developer: 2 }],
  [/^(postman|insomnia|dbeaver)\b/i, { developer: 1, qa: 1 }],
  [/^(figma|sketch|adobe (photoshop|illustrator|after effects|xd)|photoshop|illustrator|affinity (designer|photo)|krita|aseprite|spine|zbrush|maya|houdini|substance|procreate|principle|framer)\b/i, { designer: 3 }],
  [/^blender\b/i, { designer: 2, unity: 1 }],
  [/^zeplin\b/i, { designer: 1, developer: 1 }],
  [/^(charles|proxyman|browserstack|testflight|genymotion|testrail|qase)\b/i, { qa: 3 }],
  [/^(tableau|power ?bi|rstudio|jupyter|anaconda|knime|spss|metabase)\b/i, { analyst: 3 }],
  [/^(jira|linear|asana|trello|clickup|youtrack|miro|notion|omniplan|microsoft project|monday|microsoft excel|numbers|keynote|microsoft powerpoint)\b/i, { manager: 1 }]
];
function appNames(e) {
  const strip = name => name.replace(/\.(app|lnk|desktop)$/i, '').replace(/[-_]/g, ' ').trim();
  if (e.platform === 'darwin') return [...new Set(['/Applications', '/Applications/Utilities', path.join(e.home, 'Applications')].flatMap(dir => e.list(dir).filter(n => n.endsWith('.app')).map(strip)))];
  if (e.platform === 'win32') {
    const dirs = [e.env.ProgramFiles, e.env['ProgramFiles(x86)'], e.env.LOCALAPPDATA && path.join(e.env.LOCALAPPDATA, 'Programs'),
      e.env.APPDATA && path.join(e.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs'), e.env.ProgramData && path.join(e.env.ProgramData, 'Microsoft/Windows/Start Menu/Programs'),
      // Per-user installs (messengers, meeting apps) live in the profile, not in Program Files.
      e.env.LOCALAPPDATA, e.env.APPDATA].filter(Boolean);
    return [...new Set(dirs.flatMap(dir => e.list(dir).map(strip)))];
  }
  return [...new Set(['/usr/share/applications', path.join(e.home, '.local/share/applications'), '/var/lib/flatpak/exports/share/applications', '/var/lib/snapd/desktop/applications'].flatMap(dir => e.list(dir).filter(n => n.endsWith('.desktop')).map(n => strip(n).split('.').at(-1))))];
}
// Project folders with commits in the last 30 days mean everyday development; a Unity project inside means Unity.
function recentProjects(e) {
  const roots = ['Projects', 'Developer', 'dev', 'code', 'src', 'repos', 'git', 'work', 'Documents/GitHub', 'source/repos', 'Documents/Projects'].map(d => path.join(e.home, d));
  let recent = 0, unity = 0;const dirs = [];
  for (const root of roots) for (const name of e.list(root).slice(0, 200)) {
    const dir = path.join(root, name);
    if (e.now - e.mtime(path.join(dir, '.git/logs/HEAD')) > 30 * 86400000) continue;
    recent++; dirs.push(dir); if (e.exists(path.join(dir, 'ProjectSettings/ProjectVersion.txt'))) unity++;
  }
  return { recent, unity, dirs };
}
async function guessRole(e, onSource = () => {}) {
  const score = {}, apps = {};
  const add = (role, weight, app) => { score[role] = (score[role] || 0) + weight; if (app) (apps[role] ||= []).push(app); };
  onSource('apps');
  for (const name of appNames(e)) for (const [pattern, weights] of APP_RULES) if (pattern.test(name)) { for (const [role, weight] of Object.entries(weights)) add(role, weight, name); break; }
  onSource('projects');
  const projects = recentProjects(e);
  if (projects.recent) add('developer', Math.min(5, 2 + projects.recent));
  if (projects.unity) add('unity', 3 + projects.unity);
  // Unity work is development too; when Unity leads, the plain developer score is its evidence, not a rival.
  if ((score.unity || 0) >= 4 && (score.developer || 0) > 0) { score.unity += Math.min(2, score.developer / 2); }
  const candidates = Object.entries(score).filter(([, s]) => s >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([role, s]) => ({
    value: role, score: s, evidence: [
      ...(apps[role]?.length ? [{ source: 'apps', detail: [...new Set(apps[role])].slice(0, 4).join(', ') }] : []),
      ...(role === 'developer' && projects.recent ? [{ source: 'projects', count: projects.recent }] : []),
      ...(role === 'unity' && projects.unity ? [{ source: 'projects', count: projects.unity }] : [])
    ]
  }));
  return { value: candidates[0]?.score >= 3 ? candidates[0].value : '', candidates };
}

// Team: authors of the last 60 days of commits in the recent project folders, without the user and bots.
// Only names, work emails and the folders they commit to; roles are never guessed (see docs/team.md).
const BOT = /\[bot\]|dependabot|renovate|github-actions|gitlab-ci|jenkins|teamcity|\bci\b|\bbot\b/i;
async function guessTeam(e, onSource = () => {}) {
  onSource('git');
  const myEmail = (await gitValue(e, 'user.email')).toLowerCase(), myName = clean(await gitValue(e, 'user.name')).toLocaleLowerCase('ru');
  onSource('projects');
  const { dirs } = recentProjects(e);
  const projects = dirs.map(dir => path.basename(dir));
  // A team a colleague already shared through git (.petya/team.json) comes first, with roles and duties.
  onSource('shared');
  const shared = [], sharedIn = [];
  for (const dir of dirs) {
    const members = require('./project-share.cjs').readTeam(dir, e.read);
    if (!members) continue;
    sharedIn.push(path.basename(dir));
    for (const m of members) if (!shared.some(s => (s.email && s.email === m.email) || s.name.toLocaleLowerCase('ru') === m.name.toLocaleLowerCase('ru'))) shared.push({ ...m, shared: true });
  }
  const people = new Map();
  const logs = await Promise.all(dirs.slice(0, 25).map(dir => e.run('git', ['-C', dir, 'log', '--since=60.days', '--no-merges', '-n', '3000', '--format=%aN%x09%aE'], 4000).then(out => [dir, out])));
  for (const [dir, out] of logs) for (const line of out.split('\n')) {
    const [rawName, rawEmail = ''] = line.split('\t'), name = clean(rawName), email = rawEmail.trim().toLowerCase();
    if (!name || BOT.test(name) || BOT.test(email) || email === myEmail || name.toLocaleLowerCase('ru') === myName) continue;
    const key = (email && !/noreply/.test(email) ? email : name.toLocaleLowerCase('ru'));
    const person = people.get(key) || { name, email: /noreply|localhost|\.local$/.test(email) || !/@.+\./.test(email) ? '' : email, projects: new Set(), commits: 0 };
    // Prefer the spelling with a space (a full name) over a login.
    if (!/\s/.test(person.name) && /\s/.test(name)) person.name = name;
    person.projects.add(path.basename(dir)); person.commits++; people.set(key, person);
  }
  // The same person under two emails: merge by name.
  const byName = new Map();
  for (const person of people.values()) {
    const key = person.name.toLocaleLowerCase('ru'), same = byName.get(key);
    if (same) { same.commits += person.commits; person.projects.forEach(p => same.projects.add(p)); same.email ||= person.email; } else byName.set(key, person);
  }
  const known = m => shared.some(s => (m.email && s.email === m.email) || s.name.toLocaleLowerCase('ru') === m.name.toLocaleLowerCase('ru'));
  const authors = [...byName.values()].filter(p => (realName(p.name) || /\s/.test(p.name)) && !known(p)).sort((a, b) => b.commits - a.commits)
    .map(p => ({ name: p.name, email: p.email, projects: [...p.projects].slice(0, 6).join(', '), commits: p.commits }));
  const members = [...shared, ...authors].filter(m => !(myEmail && m.email === myEmail) && m.name.toLocaleLowerCase('ru') !== myName).slice(0, 40);
  const evidence = [...(sharedIn.length ? [{ source: 'shared', detail: sharedIn.join(', ') }] : []), ...(authors.length ? [{ source: 'projects', count: Math.min(dirs.length, 25) }] : [])];
  return { value: members.length ? String(members.length) : '', members, projects, candidates: [], evidence };
}

module.exports = { environment, guessName, guessCompany, guessRole, guessTeam, browserProfiles, slackWorkspaces, appNames, recentProjects, nameFromEmail, companyFromDomain, workDomain };
