// The Jira connection card (window.addConnectionCard, src/ui/connections.js) and its project selection.
// The Atlassian browser sign-in is shared with Confluence (src/extensions/confluence/settings.js uses
// window.petyaAtlassian): one sign-in gives Petya both services on the chosen site.
let atlassianLoginActive = false, atlassianConnected = false;
async function connectAtlassian(status, button, form) {
  if (atlassianLoginActive) return;
  atlassianLoginActive = true; button.disabled = true;
  const choices = document.createElement('div'); status.after(choices);
  let cancelled = false;
  const cancel = connectionNode('button', 'Отменить'); cancel.type='button'; cancel.onclick=()=>{cancelled=true;}; choices.append(cancel);
  try {
    const login=await window.petya.atlassianStart();
    status.textContent='Сверьте код '+login.code+' в браузере и разрешите доступ Atlassian.';
    const deadline=Date.now()+600000;
    while(!cancelled && Date.now()<deadline) {
      await new Promise(r=>setTimeout(r,2000)); if(cancelled) break;
      const state=await window.petya.atlassianPoll();
      if(state.status==='failed') throw new Error('Вход отменён или Atlassian не выдал доступ. Повторите подключение.');
      if(state.status!=='ready') continue;
      let siteId;
      if(state.sites.length===1) siteId=state.sites[0].id;
      else {
        status.textContent='Выберите сайт Atlassian для Пети.';
        const select=document.createElement('select');state.sites.forEach(site=>select.add(new Option(site.name+' — '+site.url,site.id)));
        const apply=connectionNode('button','Подключить сайт');apply.type='button';choices.prepend(select,apply);
        siteId=await new Promise(resolve=>{apply.onclick=()=>resolve(select.value);cancel.onclick=()=>{cancelled=true;resolve(null);};});
      }
      if(!siteId || cancelled) break;
      const saved=await window.petya.atlassianClaim(siteId);
      displaySettings(saved); form.elements.jiraUrl.value=saved.jiraUrl;form.elements.jiraToken.value='';atlassianConnected=true;
      status.textContent='Atlassian подключён · '+saved.jiraUrl+'. Выберите проект Jira в настройках.';status.className='connection-status connected';
      connectionCards.get('jira').content.open = true;
      if (moduleEnabled('jira')) await refreshJiraChoices();
      const confluenceCard = document.querySelector('[data-service="confluence"]');
      if (confluenceCard && moduleEnabled('confluence')) {
        const result = await window.petya.checkSavedConnection('confluence');
        confluenceCard.dataset.reconnect = String(result.action === 'reconnect');
        const label = confluenceCard.querySelector('.connection-status');
        label.textContent = result.message; label.className = 'connection-status ' + result.state;
      }
      return;
    }
    status.textContent=cancelled?'Подключение отменено.':'Время входа истекло. Повторите подключение.';
  } catch(e) { status.textContent=e.message;status.className='connection-status error'; }
  finally {choices.remove();button.disabled=false;atlassianLoginActive=false;}
}
// For Confluence's card: the same sign-in and whether it is connected.
window.petyaAtlassian = { connect: (status, button, form) => connectAtlassian(status, button, form), connected: () => atlassianConnected };
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

// The card itself: fields from settings.html, the Atlassian sign-in instead of «Подключить», the manual token folded.
window.addConnectionCard?.({ id: 'jira', title: 'Jira', description: 'Задачи, спринты и версии', field: 'jiraToken', flag: 'hasJiraToken',
  fields: ['jiraUrl', 'jiraEmail', 'jiraToken', 'jiraProjects', 'jiraProject', 'jiraIssueType', 'jiraBoardId', 'jiraVersionId', 'confluenceSpace'],
  login: { label: 'Подключить Jira и Confluence', run: connectAtlassian },
  logout: { label: 'Отключить Atlassian', run: async status => { await window.petya.atlassianDisconnect(); atlassianConnected = false; status.textContent = 'Atlassian отключён'; status.className = 'connection-status'; } },
  hint: 'При входе разрешите доступ к Jira и Confluence на нужном сайте. Доступ к каждому сервису проверяется отдельно. Токены обновляются автоматически.',
  manual: ['jiraEmail', 'jiraToken', 'clear_jiraToken'],
  status: settings => { atlassianConnected = !!settings.hasAtlassianOAuth; },
  checked: async result => { if (result.ready) await refreshJiraChoices(); } });
