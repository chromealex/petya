const keys = value => [...new Set(String(value || '').split(',').map(x => x.trim()).filter(Boolean))];
function normalizeSelection(next, previous, input) {
  const siteChanged = next.jiraUrl !== previous.jiraUrl;
  if (siteChanged) {
    next.jiraProjects = ''; next.jiraProject = '';
    next.jiraIssueType = ''; next.jiraBoardId = ''; next.jiraVersionId = '';
    return;
  }
  const projects = keys(next.jiraProjects || (Object.hasOwn(input, 'jiraProjects') ? '' : next.jiraProject));
  if (projects.some(k => !/^[A-Z][A-Z0-9_]*$/i.test(k))) throw new Error('Некорректный выбор проектов Jira. Обновите список.');
  next.jiraProjects = projects.join(',');
  if (next.jiraProject && !projects.includes(next.jiraProject)) throw new Error('Рабочий проект должен быть среди выбранных проектов.');
  if (!next.jiraProject || next.jiraProject !== previous.jiraProject) {
    for (const key of ['jiraIssueType', 'jiraBoardId', 'jiraVersionId']) if (!next.jiraProject || !Object.hasOwn(input, key)) next[key] = '';
  }
}
async function choices(workspace, settings, project = '') {
  const s = { ...settings };
  if (typeof project !== 'string' || (project && !/^[A-Z][A-Z0-9_]*$/i.test(project))) throw new Error('Выберите проект из списка.');
  const site = new URL(s.jiraUrl);
  if (site.protocol !== 'https:' || !site.hostname.endsWith('.atlassian.net') || site.username || site.password || site.pathname !== '/') throw new Error('Подключите сайт Jira Cloud.');
  if (!project) {
    const projects = await workspace.pages('/rest/api/3/project/search?status=live&orderBy=name', s);
    return { projects: projects.map(p => ({ id: p.id, key: p.key, name: p.name })) };
  }
  const route = '/rest/api/3/project/' + encodeURIComponent(project);
  const results = await Promise.allSettled([
    workspace.api(route, {}, s),
    workspace.pages('/rest/agile/1.0/board?' + new URLSearchParams({ projectKeyOrId: project, type: 'scrum' }), s),
    workspace.api(route + '/versions', {}, s)
  ]);
  if (results[0].status === 'rejected') throw results[0].reason;
  const details = results[0].value;
  return {
    issueTypes: (details.issueTypes || []).filter(t => !t.subtask).map(t => ({ id: t.id, name: t.name })),
    boards: results[1].status === 'fulfilled' ? results[1].value.map(b => ({ id: b.id, name: b.name })) : [],
    versions: results[2].status === 'fulfilled' ? results[2].value.filter(v => !v.released && !v.archived).map(v => ({ id: v.id, name: v.name })) : [],
    warnings: results.slice(1).flatMap((r, i) => r.status === 'rejected' ? [(i ? 'Версии' : 'Доски') + ': ' + r.reason.message] : [])
  };
}
module.exports = { keys, normalizeSelection, choices };
