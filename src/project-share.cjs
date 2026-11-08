// Petya's data shared through a project's git: files in `<repo>/.petya/`, committed like any other file, so
// colleagues get them with `git pull`. Only data that is safe to share with the team goes there — no tokens,
// no photos, no private service accounts, no personal corrections. Stable pretty JSON keeps git diffs small.
//   team.json        — the team roster (name, aliases, role, projects, duties, email, Slack ID, Jira ID)
//   dictionary.json  — glossary aliases («бэ-вэ» → «BW»), applied in chats of the project
//   project.json     — the project's Slack channels by purpose and its Jira key, used when you saved none
//   skills/<name>/SKILL.md — instruction skills (read by skill-library/project-skills.cjs)
const path = require('node:path');
const team = require('./team.cjs');
const DIR = '.petya', VERSION = 1;
const KINDS = { team: 'team.json', dictionary: 'dictionary.json', project: 'project.json', skills: 'skills' };
const SHARED_FIELDS = ['name', 'aliases', 'role', 'projects', 'responsibilities', 'email', 'slackId', 'jiraId'];
const ROLES = ['default', 'dev', 'qa'];
const file = (dir, kind) => path.join(dir, DIR, KINDS[kind]);
const parse = text => { try { return JSON.parse(text || 'null'); } catch { return null; } };
function write(fs, target, value) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target + '.tmp', typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(target + '.tmp', target);
}

// Team: the shareable fields only, validated by the same rules as the Team tab.
function shareable(members) {
  return team.validate(members).map(member => Object.fromEntries(SHARED_FIELDS.filter(key => member[key]).map(key => [key, member[key]])));
}
function readTeam(dir, read) {
  const data = parse(read(file(dir, 'team')));
  if (!data || !Array.isArray(data.members)) return null;
  try { return shareable(data.members.slice(0, 100).map(m => Object.fromEntries(SHARED_FIELDS.map(k => [k, typeof m?.[k] === 'string' ? m[k] : ''])))); } catch { return null; }
}
function writeTeam(dir, members, fs = require('node:fs')) {
  write(fs, file(dir, 'team'), { version: VERSION, members: shareable(members) });
  return path.join(DIR, KINDS.team);
}

// Dictionary: aliases only; corrections of Petya's answers are personal and stay on this computer.
function shareableRules(rules) {
  const { rule } = require('./personal-dictionary.cjs');
  return (rules || []).filter(r => r && r.kind !== 'correction' && r.enabled !== false).slice(0, 500)
    .map(r => { const v = rule({ from: r.from, to: r.to, scope: r.scope }); return { from: v.from, to: v.to, ...(v.scope ? { scope: v.scope } : {}) }; });
}
function readDictionary(dir, read) {
  const data = parse(read(file(dir, 'dictionary')));
  if (!data || !Array.isArray(data.rules)) return null;
  const out = [];
  for (const r of data.rules.slice(0, 500)) { try { out.push(...shareableRules([{ from: r?.from, to: r?.to, scope: r?.scope, kind: 'alias' }])); } catch { /* A broken rule is skipped. */ } }
  return out;
}
function writeDictionary(dir, rules, fs = require('node:fs')) {
  write(fs, file(dir, 'dictionary'), { version: VERSION, rules: shareableRules(rules) });
  return path.join(DIR, KINDS.dictionary);
}

// Project: Slack channels by purpose (no account hash — any colleague in the workspace can use them) and Jira key.
function shareableProject(value) {
  const slack = (Array.isArray(value?.slack) ? value.slack : Object.values(value?.slack || {}))
    .filter(c => /^[CG][A-Z0-9]{6,}$/.test(String(c?.id || ''))).slice(0, 20)
    .map(c => ({ id: c.id, name: String(c.name || '').replace(/^#/, '').slice(0, 80), role: ROLES.includes(c.role) ? c.role : 'default' }));
  const key = String(value?.jira?.key || '').toUpperCase();
  return { ...(value?.name ? { name: String(value.name).slice(0, 100) } : {}), ...(slack.length ? { slack } : {}), ...(/^[A-Z][A-Z0-9_]{1,19}$/.test(key) ? { jira: { key } } : {}) };
}
function readProject(dir, read) {
  const data = parse(read(file(dir, 'project')));
  if (!data || typeof data !== 'object') return null;
  const value = shareableProject(data);
  return value.slack || value.jira ? value : null;
}
function writeProject(dir, value, fs = require('node:fs')) {
  const shared = shareableProject(value);
  if (!shared.slack && !shared.jira) throw Error('У проекта нет сохранённых каналов Slack и ключа Jira.');
  write(fs, file(dir, 'project'), { version: VERSION, ...shared });
  return path.join(DIR, KINDS.project);
}

// Skills: one SKILL.md per skill in the standard Agent Skills layout, so Claude Code and Codex can read them too.
function writeSkill(dir, skill, fs = require('node:fs')) {
  const { markdown, validate } = require('./instruction-skills.cjs');
  const value = validate(skill);
  write(fs, path.join(dir, DIR, KINDS.skills, value.name, 'SKILL.md'), markdown(value));
  return path.join(DIR, KINDS.skills, value.name, 'SKILL.md');
}
function listSkills(dir, list) {
  return list(path.join(dir, DIR, KINDS.skills)).filter(name => /^[a-z][a-z0-9-]{0,63}$/.test(name)).sort();
}

// What a folder shares: counts per kind, for the project settings and the Team tab.
function summary(dir, { read, list }) {
  const teamRows = readTeam(dir, read), rules = readDictionary(dir, read), project = readProject(dir, read);
  return { team: teamRows?.length || 0, dictionary: rules?.length || 0, channels: project?.slack?.length || 0, jira: project?.jira?.key || '', skills: listSkills(dir, list) };
}
module.exports = { DIR, KINDS, readTeam, writeTeam, shareable, readDictionary, writeDictionary, shareableRules, readProject, writeProject, shareableProject, writeSkill, listSkills, summary };
