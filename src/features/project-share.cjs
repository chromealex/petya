// Petya's data shared with the team through a project's git (`.petya/`, see src/project-share.cjs).
// Save and load from the project settings and the Team tab; in chats of the project the shared glossary and
// the shared Slack channels / Jira key work by themselves (your own saved ones win). The page names a project
// and a folder index, never a path: folders are resolved here from the project's own settings.
const fs = require('node:fs'), path = require('node:path');
const share = require('../project-share.cjs');
const { projectFolders } = require('../project-folders.cjs');
const KINDS = ['team', 'dictionary', 'project', 'skills'];
const read = file => { try { const st = fs.statSync(file); return st.isFile() && st.size <= 1000000 ? fs.readFileSync(file, 'utf8') : ''; } catch { return ''; } };
const list = dir => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.isSymbolicLink()).map(e => e.name); } catch { return []; } };
const isDir = dir => { try { return fs.statSync(dir).isDirectory(); } catch { return false; } };
const lower = value => String(value || '').trim().toLocaleLowerCase('ru').replace(/ё/g, 'е');
const samePerson = (a, b) => (a.email && b.email && lower(a.email) === lower(b.email)) || lower(a.name) === lower(b.name);
const ruleKey = r => lower(r.from) + '|' + lower(r.scope);
// Shared files change with `git pull`; re-read only when their modification time changes.
function cached() {
  const memo = new Map();
  return (key, files, compute) => {
    const stamp = files.map(f => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }).join(':');
    const hit = memo.get(key); if (hit?.stamp === stamp) return hit.value;
    const value = compute(); memo.set(key, { stamp, value }); return value;
  };
}
function safeRules(rules) { const out = []; for (const r of rules || []) { try { out.push(...share.shareableRules([r])); } catch { /* skipped */ } } return out; }

module.exports = {
  name: 'projectShare', defaults: {}, validate() {}, KINDS,
  setup(s) {
    const chatProject = id => { const state = s.dialogue?.state; return state?.projects?.find(p => p.id === (id || state.activeProjectId)) || null; };
    const folders = id => { const p = chatProject(id); if (!p || p.id === 'general') return []; return projectFolders(p, s.projectMemory?.get(p.memoryId)).filter(isDir).slice(0, 20); };
    const folderAt = (id, index) => { const dir = folders(id)[index]; if (!dir) throw Error('Папка проекта не найдена.'); return dir; };
    const memoryOf = id => { const p = chatProject(id); return (p?.memoryId && s.projectMemory?.get(p.memoryId)) || (!id ? s.projectMemory?.active() : null) || null; };
    const members = () => require('../team.cjs').members(s.settings);
    const local = id => {
      const memory = memoryOf(id);
      return { team: members().length, dictionary: safeRules(s.learning?.list().dictionary).length, channels: Object.keys(memory?.slack || {}).length, jira: memory?.jira?.key || '',
        skills: (s.instructionSkills?.list() || []).filter(k => k.enabled !== false).map(k => k.name) };
    };
    const memo = cached();
    const activeFiles = kind => folders().map(dir => path.join(dir, share.DIR, share.KINDS[kind]));
    // Shared glossary of the active project, as dictionary rules (aliases) for the chat.
    const sharedRules = () => memo('dictionary', activeFiles('dictionary'), () => {
      const out = []; for (const dir of folders()) for (const r of share.readDictionary(dir, read) || []) if (!out.some(o => ruleKey(o) === ruleKey(r))) out.push({ id: 'shared:' + out.length, kind: 'alias', enabled: true, shared: true, ...r });
      return out;
    });
    const sharedProject = () => memo('project', activeFiles('project'), () => { for (const dir of folders()) { const value = share.readProject(dir, read); if (value) return { ...value, folder: path.basename(dir) }; } return null; });
    // Project memory falls back to the shared channels and Jira key when you have none of your own.
    const pm = s.projectMemory;
    if (pm && !pm.sharedContext) {
      const own = pm.context.bind(pm);
      pm.sharedContext = true;
      pm.context = () => {
        const context = own();
        if (context.projectChannels?.length && context.jira) return context;
        const shared = sharedProject(); if (!shared) return context;
        const out = { ...context };
        if (!out.projectChannels?.length && shared.slack) { out.projectChannels = shared.slack; out.hasSavedChannels = true; out.sharedFrom = shared.folder; }
        if (!out.jira && shared.jira) out.jira = shared.jira;
        if (!out.name && shared.name) out.name = shared.name;
        return out;
      };
    }
    const ipc = {
      status(id = '') {
        const p = chatProject(id);
        return { project: p && p.id !== 'general' ? { id: p.id, name: p.name } : null, local: local(id),
          folders: folders(id).map((dir, index) => ({ index, name: path.basename(dir), shared: share.summary(dir, { read, list }) })) };
      },
      save(id, index, kinds = [], { skills } = {}) {
        if (!Array.isArray(kinds) || kinds.some(k => !KINDS.includes(k))) throw Error('Неизвестный вид данных.');
        const dir = folderAt(id, index), written = [], skipped = [];
        if (kinds.includes('team')) { const rows = members(); if (rows.length) written.push(share.writeTeam(dir, rows)); else skipped.push('team'); }
        if (kinds.includes('dictionary')) { const rules = safeRules(s.learning?.list().dictionary); if (rules.length) written.push(share.writeDictionary(dir, rules)); else skipped.push('dictionary'); }
        if (kinds.includes('project')) { const m = memoryOf(id); try { written.push(share.writeProject(dir, { name: m?.name || chatProject(id)?.name, slack: m?.slack, jira: m?.jira })); } catch { skipped.push('project'); } }
        if (kinds.includes('skills')) {
          const chosen = (s.instructionSkills?.list() || []).filter(k => k.enabled !== false && (!Array.isArray(skills) || skills.includes(k.name)));
          if (chosen.length) for (const skill of chosen) written.push(share.writeSkill(dir, skill)); else skipped.push('skills');
        }
        return { folder: path.basename(dir), written, skipped };
      },
      // Team and glossary join your own (nothing is replaced); channels, Jira key and skills are used directly.
      async load(id, index, kinds = []) {
        const dir = folderAt(id, index), result = { folder: path.basename(dir), team: 0, dictionary: 0 };
        if (kinds.includes('team')) {
          const current = members(), incoming = share.readTeam(dir, read) || [];
          const added = incoming.filter(m => !current.some(c => samePerson(c, m)));
          if (added.length) { await s.saveSettings({ teamMembers: JSON.stringify([...current, ...added]) }); result.team = added.length; }
        }
        if (kinds.includes('dictionary')) {
          const have = new Set(safeRules(s.learning?.list().dictionary).map(ruleKey));
          for (const r of share.readDictionary(dir, read) || []) if (!have.has(ruleKey(r))) { s.learning.putRule({ ...r, kind: 'alias' }); have.add(ruleKey(r)); result.dictionary++; }
        }
        return result;
      }
    };
    return { ipc, projectShare: { sharedRules, sharedProject, folders } };
  }
};
