// Selection is kept in the settings form until the user saves it.
let jiraChoicesRevision = 0;
let jiraProjectsAvailable = [];
const jiraForm = $('settings-form');
const jiraField = name => jiraForm.elements[name];
const jiraKeys = () => [...new Set((jiraField('jiraProjects').value || jiraField('jiraProject').value).split(',').filter(Boolean))];
function jiraOptions(name, values, selected, placeholder) {
  const select = jiraField(name);
  select.replaceChildren(new Option(placeholder, ''));select.disabled=!values.length;
  for (const v of values) select.add(new Option(v.name, String(v.id)));
  select.value = values.some(v => String(v.id) === selected) ? selected : '';
}
function clearJiraDetails() {
  jiraOptions('jiraIssueType', [], '', 'Выберите тип задачи');
  jiraOptions('jiraBoardId', [], '', 'Выбрать при подготовке задач');
  jiraOptions('jiraVersionId', [], '', 'Выбрать при подготовке задач');
}
function renderJiraProjects() {
  const chosen = jiraKeys(), active = jiraField('jiraProject').value;
  jiraField('jiraProjects').value = chosen.join(',');
  const projects = [...jiraProjectsAvailable];
  for (const key of chosen) if (!projects.some(p => p.key === key)) projects.push({ key, name: key + ' · нет в доступном списке' });
  $('jira-projects').replaceChildren();
  for (const project of projects) {
    const label = connectionNode('label', '', 'check');
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = chosen.includes(project.key);
    check.addEventListener('change', () => {
      const next = new Set(jiraKeys());
      if (check.checked) next.add(project.key); else next.delete(project.key);
      jiraField('jiraProjects').value = [...next].join(',');
      if (!next.has(jiraField('jiraProject').value)) { jiraField('jiraProject').value = ''; clearJiraDetails(); ++jiraChoicesRevision; }
      renderJiraProjects();
      jiraField('jiraProjects').dispatchEvent(new Event('change', { bubbles: true }));
    });
    label.append(check, document.createTextNode(project.name + (project.name === project.key ? '' : ' (' + project.key + ')')));
    $('jira-projects').append(label);
  }
  jiraOptions('jiraProject', projects.filter(p => chosen.includes(p.key)).map(p => ({ id: p.key, name: p.name })), active, 'Выберите рабочий проект');
}
async function loadJiraDetails(preserve = false) {
  const revision = ++jiraChoicesRevision, project = jiraField('jiraProject').value;
  const selected = Object.fromEntries(['jiraIssueType', 'jiraBoardId', 'jiraVersionId'].map(k => [k, preserve ? jiraField(k).value : '']));
  clearJiraDetails();
  if (!project) { $('jira-choices-status').textContent = 'Отметьте проекты и выберите рабочий проект.'; return; }
  $('jira-choices-status').textContent = 'Загружаю настройки проекта…';
  try {
    const data = await window.petya.jiraChoices(project);
    if (revision !== jiraChoicesRevision) return;
    jiraOptions('jiraIssueType', data.issueTypes, selected.jiraIssueType || (data.issueTypes.length === 1 ? String(data.issueTypes[0].id) : ''), 'Выберите тип задачи');
    jiraOptions('jiraBoardId', data.boards, selected.jiraBoardId, 'Выбрать при подготовке задач');
    jiraOptions('jiraVersionId', data.versions, selected.jiraVersionId, 'Выбрать при подготовке задач');
    $('jira-choices-status').textContent = data.warnings.length ? data.warnings.join(' · ') : 'Выберите настройки и нажмите «Сохранить и проверить».';
  } catch (e) { if (revision === jiraChoicesRevision) $('jira-choices-status').textContent = 'Не удалось загрузить проект: ' + e.message + ' Повторите через «Обновить список проектов».'; }
}
async function refreshJiraChoices() {
  const revision = ++jiraChoicesRevision;
  $('jira-choices-status').textContent = 'Загружаю проекты Jira…';
  try {
    const data = await window.petya.jiraChoices();
    if (revision !== jiraChoicesRevision) return;
    jiraProjectsAvailable = data.projects; renderJiraProjects();
    if (!data.projects.length) { $('jira-choices-status').textContent = 'Нет доступных проектов. Проверьте права доступа в Jira и обновите список.'; return; }
    $('jira-choices-status').textContent = 'Отметьте доступные проекты и сохраните. Петя определит нужный проект по контексту задачи.';
  } catch (e) { if (revision === jiraChoicesRevision) $('jira-choices-status').textContent = 'Не удалось загрузить проекты: ' + e.message + ' Проверьте подключение и повторите загрузку.'; }
}
jiraField('jiraProject').addEventListener('change', () => loadJiraDetails());
$('jira-refresh').onclick = refreshJiraChoices;
for (const key of ['jiraUrl', 'jiraEmail', 'jiraToken', 'clear_jiraToken']) jiraField(key).addEventListener('input', () => {
  ++jiraChoicesRevision;
  $('jira-choices-status').textContent = 'Сохраните и проверьте подключение, затем обновите список проектов.';
});
connectionsReady.then(async () => {
  const s = await window.petya.settings();
  if (s.hasJiraToken && s.module_jira !== 'false') await refreshJiraChoices();
}).catch(e => { $('jira-choices-status').textContent = e.message; });

document.addEventListener('petya-settings-displayed', renderJiraProjects);

for (const key of ["jiraProject", "jiraIssueType", "jiraBoardId", "jiraVersionId"]) jiraField(key).closest("label").hidden = true;
