// Feature: who takes the tasks of a decomposed feature, how loaded people are, and sending the plan to Jira or Asana.
// The planner asks for the targets that are connected, gets an assignment with a summary per person (open tasks
// before and after), and sends to Asana through a batch here (Jira keeps its own batch in workspace.cjs).
// The same workload snapshot answers «загрузка команды» in chat and shows load on the team page.
const assign = require('../assign.cjs');
const { Workload, loadQuestion, answer, personAnswer } = require('../workload.cjs');
const { Asana } = require('../asana.cjs');

module.exports = {
  name: 'assignment',
  setup(s) {
    // The workspace's settings: the same as the app's, and the ones the planner's Jira calls use.
    const live = () => s.workspace?.settings?.() || s.settings;
    const asana = new Asana({ settings: live, request: s.request });
    const workload = new Workload({ settings: live, workspace: () => s.workspace, asana, modules: s.modules });
    const suggested = new Map();
    const members = () => { try { return require('../team.cjs').members(live()); } catch { return []; } };
    async function suggest(planId, command, tasks, rows) {
      const key = JSON.stringify([planId, command, tasks.map(t => t.summary + '\n' + t.description), rows.map(r => r.key + r.name + r.role + r.responsibilities)]);
      if (suggested.get(planId)?.key === key) return suggested.get(planId);
      const empty = { key, suggestions: tasks.map(() => ({ effort: 'M', candidates: [] })), dropped: 0, model: false };
      if (!live().model || !rows.some(r => r.team)) return empty;
      const { cards, dropped } = assign.cards(rows, tasks);
      const body = assign.suggestRequest(live().model, { command, tasks, team: cards });
      let result = empty;
      try {
        const response = await (s.workspace?.request || s.request)(s.core.localEndpoint(live().ollamaUrl), { method: 'POST', headers: { 'Content-Type': 'application/json' }, timeoutMs: 10 * 60000, body: JSON.stringify(body) });
        result = { key, suggestions: assign.parseSuggestions(response?.message?.content, tasks.length, rows), dropped, model: true };
      } catch (error) { result = { ...empty, error: error.message }; }
      suggested.set(planId, result); if (suggested.size > 20) suggested.delete(suggested.keys().next().value);
      return result;
    }
    // The assignment for one target. Switching the target reuses the model's suggestions and only rebalances.
    async function plan({ planId, command = '', tasks, target, force = false }) {
      if (typeof planId !== 'string' || !/^[0-9a-f-]{36}$/i.test(planId)) throw Error('Некорректный план.');
      if (!Array.isArray(tasks) || !tasks.length || tasks.length > 30) throw Error('В плане нет задач.');
      tasks = tasks.map(t => ({ summary: String(t.summary || '').slice(0, 200), description: String(t.description || '').slice(0, 4000), assigneeId: String(t.assigneeId || '') }));
      const on = workload.sources();
      if (!on[target]) throw Error(target === 'asana' ? 'Asana не подключена.' : 'Jira не подключена.');
      const snapshot = await workload.snapshot({ force });
      const rows = snapshot.rows, idOf = r => target === 'asana' ? r.asanaId : r.jiraId;
      const { suggestions, dropped, model, error } = await suggest(planId, String(command).slice(0, 2000), tasks, rows);
      const load = new Map(snapshot.people.filter(p => (target === 'asana' ? p.asana : p.jira)).map(p => [p.key, target === 'asana' ? p.asana.open : p.jira.open]));
      // A person the plan already names (an explicit request) keeps the task.
      const fixed = tasks.map(t => t.assigneeId ? rows.find(r => r.jiraId === t.assigneeId || r.asanaId === t.assigneeId)?.key || '' : '');
      const result = assign.balance(tasks, suggestions, rows, { ids: idOf, load, fixed });
      const byKey = new Map(rows.map(r => [r.key, r]));
      const warnings = [];
      if (!snapshot.hasTeam) warnings.push('«Команда» не заполнена: Петя не знает ролей и подставил только тех, кого назвали в запросе. Заполните роли и зоны ответственности — тогда он подберёт людей сам.');
      else if (!model) warnings.push(error ? 'Модель не подобрала людей: ' + error : 'Для подбора людей нужна модель Ollama в подключениях.');
      if (dropped) warnings.push(`В окно модели вошли не все карточки команды (без ${dropped}): подбирал среди тех, кто ближе к задачам.`);
      const missing = rows.filter(r => r.team && !idOf(r)).map(r => r.name);
      if (snapshot.hasTeam && missing.length) warnings.push(`Нет аккаунта в ${target === 'asana' ? 'Asana' : 'Jira'} у: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' и ещё ' + (missing.length - 6) : ''} — им задачи не назначаются.`);
      warnings.push(...snapshot.warnings);
      return {
        target,
        tasks: result.assignments.map(a => ({ assigneeId: a.key ? idOf(byKey.get(a.key)) : '', name: a.key ? byKey.get(a.key).name : '', reason: a.reason, effort: a.effort || '', named: !!a.named })),
        summary: { ...result.summary, people: result.summary.people.map(p => ({ ...p, id: idOf(byKey.get(p.key)) })) },
        candidates: rows.filter(idOf).map(r => ({ id: idOf(r), name: r.name + (r.role ? ' · ' + r.role : ''), open: load.has(r.key) ? load.get(r.key) : null })),
        warnings
      };
    }
    async function projects() {
      const out = []; let offset = null; const seen = new Set();
      do { if (seen.has(offset)) break; seen.add(offset); const page = await asana.projects(offset); out.push(...page.items.filter(p => !p.archived).map(p => ({ id: String(p.gid), name: p.name }))); offset = page.next; } while (offset && out.length < 1000 && seen.size < 10);
      return out;
    }
    const turn = async text => {
      const question = loadQuestion(text); if (!question) return null;
      const snapshot = await workload.snapshot();
      const reply = answer(snapshot, question, members());
      s.dialogue.rememberAction(text, reply); const t = s.dialogue.active();
      return { handled: true, text: reply, by: 'загрузка команды', topicId: t?.id, topicTitle: t?.title, messages: t?.messages };
    };
    return {
      ipc: {
        targets: () => workload.sources(),
        workload: async force => { const snap = await workload.snapshot({ force: force === true }); return { at: snap.at, sources: snap.sources, hasTeam: snap.hasTeam, warnings: snap.warnings, people: snap.people.map(({ key, name, role, jira, asana: a, total, known }) => ({ key, name, role, jira, asana: a, total, known })) }; },
        assign: input => plan(input || {}),
        asanaProjects: projects,
        asanaSend: async ({ id, project, tasks } = {}) => { await asana.prepareBatch({ id, project: String(project || ''), tasks }); workload.cache = null; return asana.sendBatch(id); }
      },
      teamLoad: { turn, workload,
        // A question about one colleague («чем Аня занимается?»): the card and what is open on them in Jira.
        person: async (member, text) => { const reply = await personAnswer(workload, member, members()); s.dialogue.rememberAction(text, reply); const t = s.dialogue.active(); return { handled: true, text: reply, by: 'команда', topicId: t?.id, topicTitle: t?.title, messages: t?.messages }; } }
    };
  }
};
