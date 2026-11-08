// How loaded each person of the team is: open tasks in Jira (and how many of them are in progress) and in Asana.
// One snapshot serves the team page, the chat («загрузка команды», «сколько задач у Маши») and the assignment of a
// decomposed feature. It is cached for a few minutes; force refreshes it.
const assign = require('./assign.cjs');
const TTL = 5 * 60000, JIRA_IDS = 60, ASANA_PEOPLE = 40;

function sources(s, modules) {
  const on = name => { try { return modules ? modules.enabled(s, name) : s['module_' + name] !== 'false'; } catch { return false; } };
  return {
    jira: on('jira') && !!s.jiraUrl && !!(s.atlassianCredential || (s.jiraEmail && s.jiraToken)),
    asana: on('asana') && !!s.asanaCredential && /^\d+$/.test(String(s.asanaWorkspace || ''))
  };
}

class Workload {
  constructor({ settings, workspace, asana, modules, team = require('./team.cjs'), now = () => Date.now() }) {
    Object.assign(this, { settings, workspace, asana, modules, team, now }); this.cache = null; this.pending = null;
  }
  sources() { return sources(this.settings(), this.modules); }
  // Users of each tracker, to find the team's ids by name or email.
  async directory(s, on) {
    const [jira, asana] = await Promise.all([
      on.jira && s.jiraProject ? this.workspace().people('', s).catch(() => []) : [],
      on.asana ? this.asana.users().catch(() => []) : []
    ]);
    return { jira, asana };
  }
  async snapshot({ force = false } = {}) {
    const s = this.settings(), on = sources(s, this.modules);
    const key = JSON.stringify([s.teamMembers, s.jiraUrl, s.jiraProject, s.asanaWorkspace, on]);
    if (!force && this.cache?.key === key && this.now() - this.cache.at < TTL) return this.cache.value;
    if (this.pending?.key === key) return this.pending.promise;
    const promise = this.read(s, on).then(value => { this.cache = { key, at: this.now(), value }; return value; }).finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { key, promise };
    return promise;
  }
  async read(s, on) {
    const members = (() => { try { return this.team.members(s); } catch { return []; } })();
    const directory = await this.directory(s, on);
    const rows = assign.people(members, directory), warnings = [];
    const jira = new Map(), asana = new Map();
    if (on.jira && members.length) {
      try { for (const [id, value] of await this.jiraCounts(rows.map(r => r.jiraId).filter(Boolean), s)) jira.set(id, value); }
      catch (error) { warnings.push('Jira: ' + error.message); }
    }
    if (on.asana && members.length) {
      const people = rows.filter(r => r.asanaId).slice(0, ASANA_PEOPLE);
      for (let i = 0; i < people.length; i += 4) await Promise.all(people.slice(i, i + 4).map(r => this.asana.openCount(r.asanaId).then(n => asana.set(r.asanaId, n)).catch(error => { if (!warnings.some(w => w.startsWith('Asana'))) warnings.push('Asana: ' + error.message); })));
    }
    const people = rows.map(r => {
      const j = r.jiraId && on.jira ? jira.get(r.jiraId) || (jira.size || !warnings.length ? { open: 0, inProgress: 0 } : null) : null;
      const a = r.asanaId && on.asana && asana.has(r.asanaId) ? { open: asana.get(r.asanaId) } : null;
      return { key: r.key, name: r.name, role: r.role, jiraId: r.jiraId, asanaId: r.asanaId, jira: j, asana: a, total: (j?.open || 0) + (a?.open || 0), known: !!(j || a) };
    });
    return { at: this.now(), sources: on, hasTeam: members.length > 0, people, rows, warnings };
  }
  // Open issues per Jira account, and how many are in progress, from one search.
  async jiraCounts(ids, s) {
    const unique = [...new Set(ids)].slice(0, JIRA_IDS), counts = new Map(unique.map(id => [id, { open: 0, inProgress: 0 }]));
    if (!unique.length) return counts;
    let token;
    for (let page = 0; page < 10; page++) {
      const r = await this.workspace().api('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify({ jql: 'assignee in (' + unique.map(id => JSON.stringify(id)).join(',') + ') AND statusCategory != Done', maxResults: 100, fields: ['assignee', 'status'], ...(token ? { nextPageToken: token } : {}) }) }, s);
      for (const issue of r?.issues || []) {
        const row = counts.get(issue.fields?.assignee?.accountId); if (!row) continue;
        row.open++; if (issue.fields?.status?.statusCategory?.key === 'indeterminate') row.inProgress++;
      }
      if (r?.isLast !== false || !r?.nextPageToken) break; token = r.nextPageToken;
    }
    return counts;
  }
  // One person's open Jira issues, in progress first: key, summary and status.
  async openIssues(jiraId, limit = 8) {
    const s = this.settings();
    const r = await this.workspace().api('/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify({ jql: 'assignee = ' + JSON.stringify(jiraId) + ' AND statusCategory != Done ORDER BY updated DESC', maxResults: 50, fields: ['summary', 'status'] }) }, s);
    const rows = (r?.issues || []).map(i => ({ key: String(i.key || ''), summary: String(i.fields?.summary || '').slice(0, 160), status: String(i.fields?.status?.name || ''), active: i.fields?.status?.statusCategory?.key === 'indeterminate' }));
    return { total: rows.length >= 50 && r?.isLast === false ? '50+' : rows.length, inProgress: rows.filter(i => i.active).length, items: [...rows.filter(i => i.active), ...rows.filter(i => !i.active)].slice(0, limit) };
  }
}

// «Чем Аня занимается?»: who she is on the team card and what is open on her in Jira.
async function personAnswer(workload, member, members = []) {
  const lines = [member.name + (member.role ? ' — ' + member.role : '') + '.'];
  if (member.responsibilities) lines.push('Отвечает за: ' + member.responsibilities.replace(/\s+/g, ' ').trim().replace(/[.;]$/, '') + '.');
  if (member.projects) lines.push('Проекты: ' + member.projects.replace(/\s+/g, ' ').trim().replace(/[.;]$/, '') + '.');
  const on = workload.sources();
  if (!on.jira) { lines.push('Задачи в Jira не смотрел: Jira не подключена.'); return lines.join('\n'); }
  const snap = await workload.snapshot();
  const row = snap.rows?.find(r => r.name === member.name);
  if (!row?.jiraId) { lines.push('Аккаунт Jira не найден: укажите его в карточке в «Команде».'); return lines.join('\n'); }
  let open;
  try { open = await workload.openIssues(row.jiraId); } catch (e) { lines.push('Задачи в Jira прочитать не удалось: ' + e.message); return lines.join('\n'); }
  if (!open.items.length) { lines.push('Открытых задач в Jira нет.'); return lines.join('\n'); }
  lines.push('В Jira открыто ' + open.total + ' ' + plural(Number(open.total) || 50, 'задача', 'задачи', 'задач') + (open.inProgress ? ', в работе ' + open.inProgress : '') + ':');
  for (const i of open.items) lines.push('- ' + i.key + ' ' + i.summary + (i.status ? ' (' + i.status + ')' : ''));
  return lines.join('\n');
}

// «загрузка команды», «кто сколько задач», «кто свободен», «сколько задач у Маши», «насколько загружен Иван».
function loadQuestion(text) {
  const s = String(text || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/^\s*петя[\s,:.!?—-]*/u, '').replace(/[.!?]+$/u, '').trim();
  if (!s || /^(?:не\s|как\s+(?:считать|работает)|что\s+такое)/u.test(s)) return null;
  const team = /(?:^|\s)(?:загрузк\p{L}*|загруженност\p{L}*|нагрузк\p{L}*)\s+(?:у\s+)?(?:команд\p{L}*|всех|людей|ребят)(?=\s|$)|(?:^|\s)кто\s+(?:сколько|чем)\s+(?:задач|тасков)?|(?:^|\s)кто\s+(?:сейчас\s+)?(?:свобод\p{L}*|загружен\p{L}*|перегружен\p{L}*|меньше\s+всего|больше\s+всего)|(?:^|\s)у\s+кого\s+(?:сколько|меньше|больше)\s|(?:^|\s)(?:какая|покажи)\s+загрузк\p{L}*(?:\s+команд\p{L}*)?$|^загрузк\p{L}*$/u;
  if (team.test(s)) return { who: '' };
  const person = /^(?:а\s+)?(?:сколько\s+(?:сейчас\s+)?(?:открытых\s+)?(?:задач|тасков)\s+у|загрузк\p{L}*(?:\s+у)?|насколько\s+загружен\p{L}*|чем\s+загружен\p{L}*|загружен\p{L}*\s+ли)\s+([\p{L}][\p{L}\s-]{1,60})$/u.exec(s);
  if (person && !/(?:команд|всех)/u.test(person[1])) return { who: person[1].trim() };
  return null;
}

const plural = (n, one, few, many) => n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many;
function line(p) {
  const parts = [];
  if (p.jira) parts.push(`Jira ${p.jira.open}${p.jira.inProgress ? ` (в работе ${p.jira.inProgress})` : ''}`);
  if (p.asana) parts.push(`Asana ${p.asana.open >= 100 ? '100+' : p.asana.open}`);
  return `${p.name}${p.role ? ' — ' + p.role : ''}: ${p.known ? `${p.total} ${plural(p.total, 'открытая задача', 'открытые задачи', 'открытых задач')}${parts.length > 1 ? ' · ' + parts.join(', ') : parts[0] && p.jira?.inProgress ? ' · в работе ' + p.jira.inProgress : ''}` : 'нет данных (нет связи с Jira или Asana)'}`;
}
// The answer in chat.
function answer(snapshot, question, members = []) {
  if (!snapshot.sources.jira && !snapshot.sources.asana) return 'Загрузку беру из Jira или Asana — подключите одну из них в «Подключениях».';
  if (!snapshot.hasTeam) return 'Чтобы показать загрузку людей, заполните «Команду»: имена и аккаунты Jira или почту для Asana.';
  let people = snapshot.people;
  if (question.who) {
    // «Маши», «Ивана Петрова»: the card's name, aliases or Jira name, also in another case.
    const member = require('./team-match.cjs').match(question.who, members);
    const stem = w => w.slice(0, Math.max(3, w.length - 2)), asked = question.who.toLocaleLowerCase('ru').split(/[\s-]+/).filter(w => w.length >= 3).map(stem);
    const names = m => [m.name, m.jiraName, ...String(m.aliases || '').split(/[,;]/)].join(' ').toLocaleLowerCase('ru').replace(/ё/g, 'е').split(/[\s-]+/).filter(Boolean);
    const named = member ? [member.name] : members.filter(m => asked.length && asked.every(a => names(m).some(n => n.startsWith(a)))).map(m => m.name);
    people = people.filter(p => named.includes(p.name));
    if (!people.length) return `Не нашёл «${question.who}» в «Команде». Проверьте имя или добавьте человека в команду.`;
  }
  const known = people.filter(p => p.known).sort((a, b) => b.total - a.total), unknown = people.filter(p => !p.known);
  const rows = [...known, ...unknown].map(p => '- ' + line(p));
  let head = question.who ? '' : 'Загрузка команды по открытым задачам:';
  if (!question.who && known.length >= 2) head += ` больше всего — ${known[0].name} (${known[0].total}), меньше всего — ${known.at(-1).name} (${known.at(-1).total}).`;
  const tail = snapshot.warnings.length ? '\n\nНе всё удалось прочитать: ' + snapshot.warnings.join('; ') : '';
  return (head ? head + '\n' : '') + rows.join('\n') + tail;
}

module.exports = { Workload, sources, loadQuestion, answer, line, personAnswer };
