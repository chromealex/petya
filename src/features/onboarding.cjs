// First-run introduction («Знакомство»): name, company, role and permissions. Progress is saved after every
// step in userData/onboarding.json, so a restart (macOS asks for one after screen recording is granted) resumes
// at the same step. The guesses report each source as it is checked so Petya's animation follows real work.
const fs = require('node:fs'), path = require('node:path');
const guesses = require('../onboarding-guess.cjs');
const ROLES = require('../onboarding-roles.cjs');
const KINDS = { name: guesses.guessName, company: guesses.guessCompany, role: guesses.guessRole, team: guesses.guessTeam };
const projectShare = require('../project-share.cjs');
const TEAM_FIELDS = ['name', 'email', 'role', 'projects', 'responsibilities'];
const STEPS = 6;
const customRole = value => /^custom:[\p{L}\p{M}\p{N} ,.'’/+&()-]{1,60}$/u.test(value);
function store(file, fsImpl = fs) {
  const read = () => { try { const value = JSON.parse(fsImpl.readFileSync(file, 'utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; } };
  const write = value => { fsImpl.mkdirSync(path.dirname(file), { recursive: true }); fsImpl.writeFileSync(file + '.tmp', JSON.stringify(value), { mode: 0o600 }); fsImpl.renameSync(file + '.tmp', file); };
  return { read, write };
}
function cleanAnswers(input = {}) {
  const out = {};
  for (const key of ['name', 'company', 'role']) if (typeof input[key] === 'string') out[key] = input[key].trim().slice(0, 100);
  if (Array.isArray(input.team)) out.team = input.team.filter(m => m && typeof m.name === 'string' && m.name.trim()).slice(0, 50)
    .map(m => ({ ...Object.fromEntries(TEAM_FIELDS.map(k => [k, typeof m[k] === 'string' ? m[k].trim().slice(0, 400) : ''])), on: m.on !== false }));
  if (typeof input.shareProject === 'string') out.shareProject = input.shareProject.slice(0, 200);
  if (Array.isArray(input.skipped)) out.skipped = input.skipped.filter(id => ['microphone', 'screen', 'accessibility'].includes(id));
  return out;
}
// A fresh install (no name, no chats) or an unfinished introduction shows it; PETYA_ONBOARDING=1 shows it again.
function pendingState(saved, { userName = '', hasChats = false, force = false }) {
  if (force) return { pending: true, step: saved.done ? 0 : saved.step || 0, answers: saved.done ? {} : saved.answers || {} };
  if (saved.done) return { pending: false, step: 0, answers: {} };
  return { pending: !!saved.step || (!userName && !hasChats), step: saved.step || 0, answers: saved.answers || {} };
}
module.exports = {
  name: 'onboarding', defaults: { userRole: '' }, ROLES, pendingState, cleanAnswers, store,
  validate(next) { if (next.userRole && !ROLES.some(role => role.id === next.userRole) && !customRole(next.userRole)) throw Error('Некорректная роль.'); },
  setup(services) {
    const { app } = require('electron');
    const saved = store(path.join(app.getPath('userData'), 'onboarding.json'));
    const hasChats = () => (services.dialogue?.state?.topics || []).some(topic => topic.messages?.length);
    let guessing = false;
    return { ipc: {
      state() {
        const state = pendingState(saved.read(), { userName: services.settings?.userName, hasChats: hasChats(), force: process.env.PETYA_ONBOARDING === '1' });
        return { ...state, roles: ROLES, platform: process.platform };
      },
      progress(step, answers) {
        if (!Number.isInteger(step) || step < 0 || step >= STEPS) throw Error('Некорректный шаг знакомства.');
        saved.write({ step, answers: cleanAnswers(answers), at: Date.now() });
      },
      async guess(kind) {
        if (!Object.hasOwn(KINDS, kind)) throw Error('Неизвестная догадка.');
        if (guessing) throw Error('Петя уже угадывает.');
        guessing = true;
        const report = source => { const win = services.win; if (win && !win.isDestroyed()) win.webContents.send('onboarding-guess', { kind, source }); };
        try { return await KINDS[kind](guesses.environment(), report); } finally { guessing = false; }
      },
      // Writes .petya/team.json into one of the recent project folders found on this computer (never a path
      // from the page), so colleagues get the team with git.
      shareTeam(project, members) {
        const dir = guesses.recentProjects(guesses.environment()).dirs.find(d => path.basename(d) === project);
        if (!dir) throw Error('Папка проекта не найдена.');
        return { file: projectShare.writeTeam(dir, members), project };
      },
      finish() { saved.write({ done: true, at: Date.now() }); },
      // Some permissions apply only to a new process; the introduction resumes at the saved step after it.
      relaunch() { app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '--hidden') }); app.quit(); }
    } };
  }
};
