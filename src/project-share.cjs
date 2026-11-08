// Petya's data shared through a project's git: files in `<repo>/.petya/`, committed like any other file, so
// colleagues get them with `git pull`. Only data that is safe to share with the team goes there — no tokens,
// no photos, no private service accounts. The first kind is the team roster (`.petya/team.json`); add further
// kinds here with their own file name and validation.
const path = require('node:path');
const team = require('./team.cjs');
const DIR = '.petya', VERSION = 1;
const KINDS = { team: 'team.json' };
const SHARED_FIELDS = ['name', 'aliases', 'role', 'projects', 'responsibilities', 'email', 'slackId', 'jiraId'];
const file = (dir, kind) => path.join(dir, DIR, KINDS[kind]);
// Members as they go to git: the shareable fields only, validated by the same rules as the Team tab.
function shareable(members) {
  return team.validate(members).map(member => Object.fromEntries(SHARED_FIELDS.filter(key => member[key]).map(key => [key, member[key]])));
}
// `read` is a function returning the file text or '' (injected for tests and for the guess environment).
function readTeam(dir, read) {
  let data; try { data = JSON.parse(read(file(dir, 'team')) || 'null'); } catch { return null; }
  if (!data || !Array.isArray(data.members)) return null;
  try { return shareable(data.members.slice(0, 100).map(m => Object.fromEntries(SHARED_FIELDS.map(k => [k, typeof m?.[k] === 'string' ? m[k] : ''])))); } catch { return null; }
}
function writeTeam(dir, members, fs = require('node:fs')) {
  const target = file(dir, 'team');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // Stable, readable JSON with one member per block, so git diffs stay small.
  fs.writeFileSync(target + '.tmp', JSON.stringify({ version: VERSION, members: shareable(members) }, null, 2) + '\n');
  fs.renameSync(target + '.tmp', target);
  return path.join(DIR, KINDS.team);
}
module.exports = { DIR, KINDS, readTeam, writeTeam, shareable };
