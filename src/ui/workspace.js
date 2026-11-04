let activeJiraRoute = null, routeRevision = 0;
const routePanel = document.createElement('article'); routePanel.className = 'card'; routePanel.hidden = true;
$('resolution').after(routePanel);
async function selectJiraRoute(context, resume, project = '', issueType = '') {
  const revision = ++routeRevision;
  notice('Определяю проект Jira по обсуждению…');
  const result = await window.petya.routeJira(commandSnapshot, context.id, project, issueType);
  if (revision !== routeRevision) return null;
  routePanel.replaceChildren();
  if (result.ready) {
    routePanel.hidden = true; voiceReply = null;
    notice(`Проект ${result.project} · ${result.name}. ${result.reason}`);
    return result;
  }
  routePanel.hidden = false; $('resolution').hidden = true;
  const title = document.createElement('h2'); title.textContent = result.issueTypes ? 'Какой тип задачи нужен?' : 'К какому проекту относится обсуждение?';
  const reason = document.createElement('p'); reason.textContent = result.reason;
  routePanel.append(title, reason);
  const options = result.issueTypes || result.projects;
  for (const option of options) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = result.issueTypes ? option.name : `${option.name} (${option.key})`;
    button.onclick = run(async () => {
      routePanel.querySelectorAll('button').forEach(b => b.disabled = true);
      try {
        const route = await selectJiraRoute(context, resume, result.issueTypes ? result.project : option.key, result.issueTypes ? option.id : '');
        if (route) await resume(route);
      } finally { routePanel.querySelectorAll('button').forEach(b => b.disabled = false); }
    });
    routePanel.append(button);
  }
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отмена';
  cancel.onclick = () => { automaticVoiceCommand = false; voiceReply = null; voiceTurn.reset(); ++routeRevision; routePanel.hidden = true; }; routePanel.append(cancel);
  if (automaticVoiceCommand) askVoiceChoices(result.reason, options.map(option => ({label:option.name, names:[option.name, option.key || option.id], run:async () => { const route = await selectJiraRoute(context, resume, result.issueTypes ? result.project : option.key, result.issueTypes ? option.id : ''); if (route) await resume(route); }})));
  routePanel.scrollIntoView({block:'nearest'});
  return null;
}
let currentIntent = '', activeContext = null, workspaceBusy = false, batchId = '', frozenBatch = null, selectedPeople = [], batchTarget = {};
const states = { ready: 'Ещё не отправлена', sending: 'Результат создания неизвестен — проверьте Jira', uncertain: 'Результат создания неизвестен — повтор заблокирован', created: 'Создана, ещё не в спринте', scheduling: 'Создана; проверьте спринт', 'schedule-failed': 'Создана, не удалось добавить в спринт', rejected: 'Jira отклонила создание', done: 'Создана и добавлена в спринт' };
function selectOptions(element, values, selected, placeholder, label = v => v.name) {
  element.replaceChildren(new Option(placeholder, ''));
  for (const value of values) element.add(new Option(label(value), String(value.id)));
  element.value = selected || '';
}
function lockPlan(locked) {
  $('workspace-controls').querySelectorAll('input,select,button').forEach(e => e.disabled = locked);
  $('batch-tasks').querySelectorAll('input,select,textarea,button').forEach(e => e.disabled = locked);
}
function renderMetadata(data, preserve = false) {
  batchTarget = { project: data.project, siteUrl: data.siteUrl, routeId: activeJiraRoute?.id };
  if (preserve) {
    const sprint = $('batch-sprint').value, version = $('batch-version').value;
    if (data.sprints.some(v => String(v.id) === sprint)) data.sprintId = sprint;
    if (data.versions.some(v => String(v.id) === version)) data.versionId = version;
  }
  selectOptions($('batch-board'), data.boards, data.boardId, 'Выберите доску');
  selectOptions($('batch-sprint'), data.sprints, data.sprintId, 'Выберите спринт', v => `${v.name} (${v.state === 'active' ? 'активный' : 'будущий'})`);
  selectOptions($('batch-version'), data.versions, data.versionId, 'Уточните текущую версию');
  $('metadata-status').textContent = `Проект ${data.project} · ${data.siteUrl}. ${activeJiraRoute?.reason || ''}. Если текущая версия или спринт неоднозначны, выберите их вручную.`;
}
async function refreshMetadata() {
  if (!activeJiraRoute) {
    const route = await selectJiraRoute(activeContext, async selected => { activeJiraRoute = selected; await refreshMetadata(); });
    if (!route) return;
    activeJiraRoute = route;
  }
  $('metadata-status').textContent = 'Загружаю доски, спринты и версии…';
  const [meta, people] = await Promise.all([window.petya.jiraMetadata($('batch-board').value, activeJiraRoute.id), window.petya.jiraPeople('', activeJiraRoute.id)]);
  renderMetadata(meta); mergePeople(people);
}
function mergePeople(people) {
  selectedPeople = [...new Map([...selectedPeople, ...people].map(p => [p.id, p])).values()];
  document.querySelectorAll('.task-assignee').forEach(select => selectOptions(select, selectedPeople, select.value, 'Выберите исполнителя', p => `${p.name} · ${p.id}`));
}
async function findDocs() {
  if (!activeContext) throw new Error('Сначала выберите обсуждение.');
  $('docs-status').textContent = 'Ищу документацию…';
  const result = await window.petya.searchDocs(activeContext.id, $('docs-query').value);
  $('docs-list').replaceChildren();
  for (const doc of result.docs) {
    const article = document.createElement('div'); article.className = 'context-item';
    const label = document.createElement('label'); label.className = 'check';
    const check = document.createElement('input'); check.type = 'checkbox'; check.value = doc.id; check.className = 'doc-check';
    label.append(check, document.createTextNode(`${doc.source || 'Документ'} · ${doc.title}${doc.truncated ? ' (фрагмент)' : ''}`));
    const excerpt = document.createElement('p'); excerpt.textContent = doc.text.slice(0, 350) || 'Текст страницы недоступен.';
    const open = document.createElement('button'); open.textContent = 'Открыть источник ↗'; open.onclick = run(() => window.petya.openDocument(doc.id));
    article.append(label, excerpt, open); $('docs-list').append(article);
  }
  $('docs-status').textContent = `${result.docs.length ? 'Отметьте до 5 документов для плана.' : 'Ничего не найдено. Уточните поисковую фразу.'} Запрос: ${result.terms.join(', ')}. ${(result.warnings || []).join(' ')}`;
}
async function openWorkspace(context, route = activeJiraRoute) {
  activeJiraRoute = route;
  activeContext = context; currentDraft = null; frozenBatch = null; batchId = context.skillDraftId || crypto.randomUUID(); selectedPeople = [];
  $('draft-card').hidden = true; $('resolution').hidden = true; $('workspace-card').hidden = false;
  $('workspace-title').textContent = context.title + (currentIntent === 'jira-agent' ? ' · Jira → агент (отправка в приложении)' : ''); $('batch-tasks').replaceChildren(); $('batch-results').replaceChildren(); $('docs-list').replaceChildren(); $('plan-questions').textContent = ''; $('docs-query').value = '';
  for (const name of ['board', 'sprint', 'version']) selectOptions($('batch-' + name), [], '', 'Выберите значение');
  lockPlan(false); $('submit-batch').disabled = false; $('submit-batch').textContent = 'Создать задачи и добавить в спринт';
  const outcomes = await Promise.allSettled([context.skillDraftId?Promise.resolve():findDocs(), currentIntent === 'docs' && !activeJiraRoute ? Promise.resolve() : refreshMetadata()]);
  outcomes.forEach((result, i) => { if (result.status === 'rejected') $(i === 0 ? 'docs-status' : 'metadata-status').textContent = result.reason.message; });
  $('workspace-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if ((automaticVoiceCommand || context.skillDraftId) && currentIntent !== 'docs' && activeJiraRoute) await decompose();
}
function taskEditor(task = { summary: '', description: '', assigneeId: '', dependsOn: [] }) {
  const article = document.createElement('article'); article.className = 'card task-editor';
  const heading = document.createElement('h2'); heading.textContent = `Задача ${$('batch-tasks').children.length + 1}`;
  function field(caption, tag, className, value) { const label = document.createElement('label'); label.append(document.createTextNode(caption)); const input = document.createElement(tag); input.className = className; input.value = value; label.append(input); article.append(label); return input; }
  article.append(heading);
  field('Название', 'input', 'task-summary', task.summary).maxLength = 200;
  field('Описание и критерии приёмки', 'textarea', 'task-description', task.description).rows = 5;
  const assignee = field('Исполнитель', 'select', 'task-assignee', ''); selectOptions(assignee, selectedPeople, task.assigneeId, 'Уточните исполнителя', p => `${p.name} · ${p.id}`);
  assignee.onchange = run(continueAutomaticBatch);
  const reason = document.createElement('p'); reason.className = 'small'; reason.textContent = task.assignmentReason || 'Выберите человека, который отвечает за эту работу.'; article.append(reason);
  field('Зависит от задач № (через запятую)', 'input', 'task-deps', (task.dependsOn || []).map(n => n + 1).join(', '));
  const remove = document.createElement('button'); remove.textContent = 'Удалить из плана'; remove.className = 'quiet';
  remove.onclick = () => {
    const index = [...$('batch-tasks').children].indexOf(article);
    const remaining = readTasks().filter((_, i) => i !== index).map(t => ({ ...t, dependsOn: t.dependsOn.filter(n => n !== index).map(n => n > index ? n - 1 : n) }));
    $('batch-tasks').replaceChildren(); remaining.forEach(taskEditor); notice('Задача удалена. Проверьте зависимости оставшихся задач.');
  };
  article.append(remove);
  $('batch-tasks').append(article);
}
function readTasks() { return [...document.querySelectorAll('.task-editor')].map(article => ({ summary: article.querySelector('.task-summary').value, description: article.querySelector('.task-description').value, assigneeId: article.querySelector('.task-assignee').value, dependsOn: article.querySelector('.task-deps').value.split(',').map(v => v.trim()).filter(Boolean).map(v => Number(v) - 1) })); }
async function decompose() {
  if (!activeJiraRoute) {
    const route = await selectJiraRoute(activeContext, async selected => { activeJiraRoute = selected; await decompose(); });
    if (!route) return;
    activeJiraRoute = route;
  }
  if (workspaceBusy) return; workspaceBusy = true; lockPlan(true);
  try {
    const docs = [...document.querySelectorAll('.doc-check:checked')].map(c => c.value);
    if (docs.length > 5) throw new Error('Выберите не больше пяти документов.');
    notice('Разбиваю обсуждение на задачи. Это может занять некоторое время…');
    const result = await window.petya.prepareBatch(commandSnapshot, activeContext.id, docs, $('batch-board').value, activeJiraRoute.id);
    automaticBatchQuestions = result.questions;
    renderMetadata(result.metadata, true); mergePeople(result.people); $('batch-tasks').replaceChildren(); result.tasks.forEach(taskEditor);
    $('plan-questions').textContent = result.questions.length ? 'Уточнить: ' + result.questions.join(' • ') : 'Проверьте объём задач и назначения перед отправкой.';
    notice(`Подготовлено задач: ${result.tasks.length}. Проверьте спринт, версию и исполнителей.`);
  } finally { workspaceBusy = false; lockPlan(false); }
  if (automaticVoiceCommand) await continueAutomaticBatch();
}
function renderResult(target, record) {
  const card=document.createElement('div');card.className='context-item';
  const completed=record.rows.filter(row=>row.state==='done'),pending=record.rows.filter(row=>row.state!=='done');
  const heading=document.createElement('strong');heading.textContent=record.project+' · Создано: '+completed.length+' из '+record.rows.length;card.append(heading);
  for(const [title,rows]of [['Созданные задачи',completed],['Требуют внимания',pending]]){if(!rows.length)continue;const h=document.createElement('h3');h.textContent=title;card.append(h);for(const row of rows){const p=document.createElement('p');p.textContent=(row.key||'Без ключа')+' — '+row.title+': '+(states[row.state]||row.state)+(row.error?'. '+row.error:'');if(row.key){const a=document.createElement('a');a.textContent='Открыть задачу';a.href=record.url+'/browse/'+row.key;a.target='_blank';a.rel='noopener';p.append(document.createTextNode(' · '),a);}card.append(p);}}
  target.append(card);
}
async function refreshHistory() { renderHistory(await window.petya.batchHistory()); }
async function sendBatch() {
  if (workspaceBusy) return;
  workspaceBusy = true; lockPlan(true); $('submit-batch').disabled = true; $('close-workspace').disabled = true;
  const payload = frozenBatch || { id: batchId, ...batchTarget, boardId: $('batch-board').value, sprintId: $('batch-sprint').value, versionId: $('batch-version').value, tasks: readTasks() };
  try {
    if (currentIntent === 'jira-agent') await window.petya.bindAgentBatch(batchId, commandSnapshot, activeContext.id, [...document.querySelectorAll('.doc-check:checked')].map(c => c.value));
    const result = await window.petya.submitBatch(payload); frozenBatch = payload;
    $('batch-results').replaceChildren(); renderResult($('batch-results'), result);
    const done = result.rows.filter(r => r.state === 'done').length;
    notice(`В спринте: ${done} из ${result.rows.length}. Результат каждой задачи показан ниже.`);
    if (currentIntent === 'jira-agent') { const transfer = await window.petya.handoffBatch(batchId); if(transfer.record)await handleDoHandoff({record:transfer.record,ready:true});else notice(transfer.message); await refreshAgents(); }
    await window.petya.notify(`Jira: ${done} из ${result.rows.length} задач добавлены в спринт.`);
  } catch (error) {
    const record = (await window.petya.batchHistory()).find(r => r.id === batchId);
    if (record) { frozenBatch = payload; $('batch-results').replaceChildren(); renderResult($('batch-results'), record); }
    notice(error.message, true);
  } finally { workspaceBusy = false; lockPlan(!!frozenBatch); $('submit-batch').disabled = false; $('submit-batch').textContent = frozenBatch ? 'Повторить только незавершённые действия' : 'Создать задачи и добавить в спринт'; $('close-workspace').disabled = false; await refreshHistory(); }
}
$('find-docs').onclick = run(findDocs); $('load-metadata').onclick = run(refreshMetadata); $('batch-board').onchange = run(refreshMetadata);
$('find-people').onclick = run(async () => { const people = await window.petya.jiraPeople($('people-query').value, activeJiraRoute?.id); mergePeople(people); notice(`Найдено исполнителей: ${people.length}. Выберите их в задачах.`); });
$('decompose').onclick = run(decompose); $('add-task').onclick = () => { if ($('batch-tasks').children.length < 12) taskEditor(); else notice('Максимум 12 задач в пакете.'); };
$('submit-batch').onclick = run(sendBatch); $('refresh-history').onclick = run(refreshHistory);
$('close-workspace').onclick = () => { if (!workspaceBusy) { $('workspace-card').hidden = true; frozenBatch = null; } };
$('expand-draft').onclick = run(() => openWorkspace(activeContext));


async function continueAutomaticBatch() {
  if (!automaticVoiceCommand || workspaceBusy || frozenBatch) return;
  if (automaticBatchQuestions.length) {
    askVoiceQuestion(automaticBatchQuestions.join(' '), async answer => { commandSnapshot += '\nУточнение пользователя: ' + answer; await decompose(); }); return;
  }
  for (const [id, title] of [['batch-board','доску'], ['batch-sprint','спринт'], ['batch-version','версию']]) {
    const select = $(id);
    if (!select.value) {
      const options = [...select.options].filter(o=>o.value);
      if (!options.length) { notice('В Jira нет доступных вариантов: ' + title + '. Заполните обязательные данные проекта.',true); await window.petya.requestAttention(); return; }
      askVoiceChoices('Уточните ' + title + ': ' + options.map((o,i)=>(i+1)+'. '+o.text).join('; '), options.map(o=>({label:o.text, names:[o.text,o.value],run:async()=>{select.value=o.value;if(id==='batch-board')await refreshMetadata();await continueAutomaticBatch();}}))); return;
    }
  }
  const missing = [...document.querySelectorAll('.task-assignee')].find(s=>!s.value);
  if (missing) {
    const options = selectedPeople;
    if (!options.length) {notice('Нет доступных исполнителей. Уточните права в Jira.',true);await window.petya.requestAttention();return;}
    askVoiceChoices('Кому назначить задачу «'+missing.closest('.task-editor').querySelector('.task-summary').value+'»?', options.map(p=>({label:p.name,names:[p.name,p.id],run:async()=>{missing.value=p.id;await continueAutomaticBatch();}}))); return;
  }
  voiceReply = null; automaticVoiceCommand = false;
  await sendBatch();
}

for (const id of ['batch-sprint', 'batch-version']) $(id).addEventListener('change', run(continueAutomaticBatch));
