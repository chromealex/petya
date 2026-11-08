let activeJiraRoute = null, routeRevision = 0;
const routePanel = document.createElement('article'); routePanel.className = 'card'; routePanel.hidden = true;
$('resolution').after(routePanel);
async function selectJiraRoute(context, resume, project = '', issueType = '') {
  const revision = ++routeRevision,owner=topicSelect.value;
  routePanel.hidden=true;$('notice').hidden=true;
  commandProgress.update('working','Определяю проект Jira по обсуждению…');
  const result = await window.petya.routeJira(commandSnapshot, context.id, project, issueType);
  if (revision !== routeRevision||owner!==topicSelect.value) return null;
  if (result.ready) {voiceReply=null;return result;}
  $('resolution').hidden=true;
  const options=result.issueTypes||result.projects||[];
  const labels=options.map(option=>result.issueTypes?option.name:`${option.name} (${option.key})`);
  const question=result.issueTypes?'Какой тип задачи нужен?':'К какому проекту относится обсуждение?';
  const present=()=>{
    dialogueChoices.replaceChildren();
    voiceReply=async answer=>{
      if(revision!==routeRevision||owner!==topicSelect.value)return;
      if(/^(?:отмена|стоп|не надо)[.!]?$/iu.test(answer.trim())){
        automaticVoiceCommand=false;voiceReply=null;voiceTurn.reset();++routeRevision;
        await showDialogueReply({handled:true,text:'Выбор проекта Jira отменён.'});return;
      }
      const value=answer.trim().toLocaleLowerCase();
      const index=labels.findIndex((label,i)=>[label,options[i].name,options[i].key,options[i].id,String(i+1)].some(v=>v&&String(v).toLocaleLowerCase()===value));
      if(index<0){present();return;}
      const option=options[index];
      const route=await selectJiraRoute(context,resume,result.issueTypes?result.project:option.key,result.issueTypes?option.id:'');
      if(route)await resume(route);
    };
    window.renderClarification({question:true,text:question,clarificationOptions:labels,clarificationInput:{choicesOnly:true}},null,automaticVoiceCommand);
    commandProgress.update('waiting','Жду выбора проекта Jira');
  };
  present();
  if(automaticVoiceCommand)speakReply(question+' '+labels.map((label,i)=>(i+1)+' — '+label).join('; ')).catch(e=>notice(e.message,true));
  return null;
}
let automaticCoverage = null, coverageConfirmed = false;
let planTargets = { jira: false, asana: false }, planTarget = '', assignment = null, assignBusy = false, jiraPeople = [];
const personLabel = p => p.name + (p.open != null ? ` · открыто ${p.open}` : '');
let currentIntent = '', currentDecompose = false, activeContext = null, workspaceBusy = false, batchId = '', frozenBatch = null, selectedPeople = [], batchTarget = {};
const states = { ready: 'Ещё не отправлена', sending: 'Результат создания неизвестен — проверьте Jira', uncertain: 'Результат создания неизвестен — повтор заблокирован', created: 'Создана, ещё не в спринте', scheduling: 'Создана; проверьте спринт', 'schedule-failed': 'Создана, не удалось добавить в спринт', rejected: 'Jira отклонила создание', done: 'Создана и добавлена в спринт' };
function selectOptions(element, values, selected, placeholder, label = v => v.name) {
  element.replaceChildren(new Option(placeholder, ''));
  for (const value of values) element.add(new Option(label(value), String(value.id)));
  element.value = selected || '';
}
function lockPlan(locked) {
  $('workspace-controls').querySelectorAll('input,select,button').forEach(e => e.disabled = locked);
  $('batch-tasks').querySelectorAll('input,select,textarea,button').forEach(e => e.disabled = locked);
  $('assign-summary').querySelectorAll('select,#reassign,#assign-target button').forEach(e => e.disabled = locked || (e.closest('#assign-target') && $('assign-target').children.length < 2));
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
  jiraVersions = data.versions; document.querySelectorAll('.task-version').forEach(fillVersion);
  $('metadata-status').textContent = `Проект ${data.project} · ${data.siteUrl}. ${activeJiraRoute?.reason || ''}. ${data.versionNamed ? 'Версию взял из обсуждения: ' + (data.versions.find(v => String(v.id) === String(data.versionId))?.name || '') + '.' : 'Если текущая версия или спринт неоднозначны, выберите их вручную.'}`;
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
  jiraPeople = [...new Map([...jiraPeople, ...people].map(p => [p.id, p])).values()];
  if (planTarget === 'asana') return;
  selectedPeople = [...new Map([...selectedPeople, ...people].map(p => [p.id, p])).values()];
  document.querySelectorAll('.task-assignee').forEach(select => selectOptions(select, selectedPeople, select.value, 'Выберите исполнителя', personLabel));
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
  activeContext = context; currentDraft = null; frozenBatch = null; batchId = context.skillDraftId || crypto.randomUUID(); selectedPeople = []; jiraPeople = []; assignment = null;
  await loadTargets(); planTarget = chooseTarget(); renderAssignSummary(); showTargetControls();
  $('draft-card').hidden = true; $('resolution').hidden = true; $('workspace-card').hidden = false;
  $('workspace-title').textContent = context.title + (currentIntent === 'jira-agent' ? ' · Jira → агент (отправка в приложении)' : ''); $('batch-tasks').replaceChildren(); $('batch-results').replaceChildren(); $('docs-list').replaceChildren(); $('plan-questions').textContent = ''; automaticCoverage = null; coverageConfirmed = false; renderCoverage(null); window.petya.decomposeStatus().then(state => renderDecomposeProgress(state?.busy ? state : null)).catch(() => renderDecomposeProgress(null)); $('docs-query').value = '';
  for (const name of ['board', 'sprint', 'version']) selectOptions($('batch-' + name), [], '', 'Выберите значение');
  lockPlan(false); $('submit-batch').disabled = false;
  const outcomes = await Promise.allSettled([context.skillDraftId?Promise.resolve():findDocs(), currentIntent === 'docs' && !activeJiraRoute || !planTargets.jira ? Promise.resolve() : refreshMetadata()]);
  outcomes.forEach((result, i) => { if (result.status === 'rejected') $(i === 0 ? 'docs-status' : 'metadata-status').textContent = result.reason.message; });
  $('workspace-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if ((automaticVoiceCommand || context.skillDraftId) && currentIntent !== 'docs' && (activeJiraRoute || !planTargets.jira)) await decompose();
}
function taskEditor(task = { summary: '', description: '', assigneeId: '', dependsOn: [] }) {
  const article = document.createElement('article'); article.className = 'card task-editor';
  const heading = document.createElement('h2'); heading.textContent = `Задача ${$('batch-tasks').children.length + 1}`;
  function field(caption, tag, className, value) { const label = document.createElement('label'); label.append(document.createTextNode(caption)); const input = document.createElement(tag); input.className = className; input.value = value; label.append(input); article.append(label); return input; }
  article.append(heading);
  field('Название', 'input', 'task-summary', task.summary).maxLength = 200;
  field('Описание и критерии приёмки', 'textarea', 'task-description', task.description).rows = 5;
  const assignee = field('Исполнитель', 'select', 'task-assignee', ''); selectOptions(assignee, selectedPeople, task.assigneeId, 'Уточните исполнителя', personLabel);
  assignee.onchange = run(async () => { renderAssignSummary(); await continueAutomaticBatch(); });
  const reason = document.createElement('p'); reason.className = 'small task-reason'; reason.textContent = task.assignmentReason || 'Выберите человека, который отвечает за эту работу.'; article.append(reason);
  const version = field('Версия (Fix Version)', 'select', 'task-version', ''); version.dataset.value = task.versionId || ''; fillVersion(version); version.onchange = () => { version.dataset.value = version.value; renderAssignSummary(); }; version.closest('label').classList.add('jira-only'); version.closest('label').hidden = planTarget === 'asana';
  field('Зависит от задач № (через запятую)', 'input', 'task-deps', (task.dependsOn || []).map(n => n + 1).join(', '));
  const remove = window.deleteButton('Удалить из плана');
  remove.onclick = () => {
    const index = [...$('batch-tasks').children].indexOf(article);
    const remaining = readTasks().filter((_, i) => i !== index).map(t => ({ ...t, dependsOn: t.dependsOn.filter(n => n !== index).map(n => n > index ? n - 1 : n) }));
    $('batch-tasks').replaceChildren(); remaining.forEach(taskEditor); notice('Задача удалена. Проверьте зависимости оставшихся задач.');
  };
  article.append(remove);
  $('batch-tasks').append(article);
}
function readTasks() { return [...document.querySelectorAll('.task-editor')].map(article => { const versionId = planTarget === 'asana' ? '' : article.querySelector('.task-version')?.value || ''; return { summary: article.querySelector('.task-summary').value, description: article.querySelector('.task-description').value, assigneeId: article.querySelector('.task-assignee').value, dependsOn: article.querySelector('.task-deps').value.split(',').map(v => v.trim()).filter(Boolean).map(v => Number(v) - 1), ...(versionId ? { versionId } : {}) }; }); }
// A task's version: «как у пакета» (the batch version) or one of the open versions of the project.
let jiraVersions = [];
function fillVersion(select) {
  const batch = $('batch-version').selectedOptions[0], keep = select.dataset.value || '';
  select.replaceChildren(new Option(batch?.value ? 'Как у пакета: ' + batch.text : 'Как у пакета', ''));
  for (const v of jiraVersions) select.add(new Option(v.name, String(v.id)));
  select.value = jiraVersions.some(v => String(v.id) === keep) ? keep : '';
}
// Decomposition progress: the overall bar and one line per agent with the part of the material it reads.
function decomposeStageText(state) {
  const count = state.total ? ` (${state.done} из ${state.total})` : '';
  return ({
    starting: 'Готовлю декомпозицию',
    fetching: 'Читаю «' + (state.label || 'документ') + '» целиком',
    reading: 'Читаю материал по частям',
    merging: 'Сжимаю требования, чтобы они уместились в модель' + count,
    planning: 'Составляю задачи',
    assigning: 'Подбираю исполнителей по ролям и загрузке',
    done: 'План готов' + (state.warnings ? ' — есть предупреждения' : ''),
    error: 'Декомпозиция остановилась: ' + (state.error || 'ошибка')
  })[state.stage] || 'Декомпозиция';
}
window.decomposeStageText = decomposeStageText;
const AGENT_STATE = { waiting: 'ждёт', reading: 'читает', done: 'готово', failed: 'ошибка', stopped: 'остановлен' };
let lastDecompose = null, stageSwap = 0, swapState = null;
const STAGE_FADE = 150;
// A new stage fades the old sign and text out, then the new ones in; the bar keeps moving meanwhile.
function renderDecomposeProgress(state) {
  const box = $('decompose-progress'), shown = box.hidden ? '' : box.dataset.stage, calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  lastDecompose = state;
  if (state && shown && (stageSwap || state.stage !== shown) && !calm) {
    swapState = state;
    if (state.busy && Number.isFinite(state.percent) && state.percent > 0) $('decompose-bar').value = state.percent;
    if (!stageSwap) { box.classList.add('stage-out'); stageSwap = setTimeout(() => { stageSwap = 0; const next = swapState; swapState = null; paintDecomposeProgress(next); box.classList.remove('stage-out'); }, STAGE_FADE); }
    return;
  }
  clearTimeout(stageSwap); stageSwap = 0; swapState = null; box.classList.remove('stage-out');
  paintDecomposeProgress(state);
}
function paintDecomposeProgress(state) {
  const box = $('decompose-progress');
  $('decompose-bar').hidden = !state?.busy;
  if (!state) { box.hidden = true; return; }
  // The same line as the chat's «Думаю…»: what Petya does now and for how long; the agents open on click.
  if (state.stage === 'starting') box.open = false;
  box.hidden = false; box.dataset.stage = state.stage; box.classList.toggle('live', !!state.busy);
  const agents = state.agents || [], reading = agents.filter(a => a.state === 'reading').length;
  const measured = state.busy && Number.isFinite(state.percent) && (state.percent > 0 || ['reading', 'merging'].includes(state.stage)) && !['starting', 'fetching'].includes(state.stage);
  let text = decomposeStageText(state);
  if (agents.length && state.busy) text += ` · ${agents.reduce((n, a) => n + a.done, 0)} из ${agents.reduce((n, a) => n + a.total, 0)}, агентов: ${reading || agents.length}`;
  if (measured) text += ` · ${state.percent}%`;
  $('decompose-stage').textContent = text;
  // Under the line: the overall share of the work once it is measured; until then it only shows that work goes on.
  const bar = $('decompose-bar');
  if (measured) bar.value = state.percent; else bar.removeAttribute('value');
  const time = $('decompose-time'), started = Number(state.startedAt) || Date.now();
  if (state.busy) { time.dataset.started = String(started); time.textContent = window.formatDuration?.(Date.now() - started) || ''; }
  else { delete time.dataset.started; time.textContent = state.startedAt ? window.formatDuration?.((Number(state.at) || Date.now()) - started) || '' : ''; }
  const list = $('decompose-agents'); list.replaceChildren();
  for (const agent of agents) {
    const item = document.createElement('li'); item.className = agent.state === 'reading' ? 'current' : 'done'; item.dataset.state = agent.state;
    const line = document.createElement('span'); line.textContent = `Агент ${agent.n} · ${agent.done} из ${agent.total} · ${agent.current ? 'читает: ' + agent.current : (AGENT_STATE[agent.state] || agent.state) + ' — ' + agent.range}`;
    const own = document.createElement('progress'); own.max = Math.max(1, agent.total); own.value = agent.done; own.setAttribute('aria-label', `Агент ${agent.n}: ${agent.done} из ${agent.total}`);
    item.append(line, own); list.append(item);
  }
  list.hidden = !agents.length;
  box.classList.toggle('single', list.hidden); if (list.hidden) box.open = false;
}
$('decompose-progress').addEventListener('click', event => { if (event.target.closest('summary') && $('decompose-progress').classList.contains('single')) event.preventDefault(); });
window.petyaEvents.onDecompose(state => { if (!$('workspace-card').hidden || state.busy) renderDecomposeProgress(state); });
window.petya.decomposeStatus().then(state => { if (state?.busy) renderDecomposeProgress(state); }).catch(() => {});
// What of the material reached the plan; losses are highlighted.
function renderCoverage(coverage) {
  const box = $('plan-coverage'); box.replaceChildren();
  const warnings = coverage?.warnings || [];
  box.hidden = !warnings.length; box.classList.toggle('loss', !!coverage?.loss);
  for (const warning of warnings) { const p = document.createElement('p'); p.textContent = warning; box.append(p); }
}
async function decompose() {
  if (!activeJiraRoute && planTargets.jira) {
    const route = await selectJiraRoute(activeContext, async selected => { activeJiraRoute = selected; await decompose(); });
    if (!route) return;
    activeJiraRoute = route;
  }
  if (workspaceBusy) return; workspaceBusy = true; lockPlan(true);
  try {
    const docs = [...document.querySelectorAll('.doc-check:checked')].map(c => c.value);
    if (docs.length > 5) throw new Error('Выберите не больше пяти документов.');
    notice('Разбиваю обсуждение на задачи. Это может занять некоторое время…');
    renderCoverage(null); renderDecomposeProgress({ stage: 'starting', busy: true });
    const result = await window.petya.prepareBatch(commandSnapshot, activeContext.id, docs, $('batch-board').value, activeJiraRoute?.id || '');
    automaticBatchQuestions = result.questions; automaticCoverage = result.coverage || null; coverageConfirmed = false; renderCoverage(result.coverage);
    // The finished state, whether or not the last progress event arrived before the answer.
    renderDecomposeProgress({ ...(lastDecompose || {}), stage: 'done', busy: false, percent: 100, warnings: result.coverage?.warnings?.length || 0 });
    if (result.metadata) renderMetadata(result.metadata, true); mergePeople(result.people || []); $('batch-tasks').replaceChildren(); result.tasks.forEach(taskEditor);
    $('plan-questions').textContent = result.questions.length ? 'Уточнить: ' + result.questions.join(' • ') : 'Проверьте объём задач и назначения перед отправкой.';
    notice(`Подготовлено задач: ${result.tasks.length}. ${result.coverage?.loss ? 'Часть материала не вошла в план — смотрите предупреждения.' : 'Проверьте спринт, версию и исполнителей.'}`, !!result.coverage?.loss);
  } catch (error) { if (lastDecompose?.busy) renderDecomposeProgress({ ...lastDecompose, stage: 'error', busy: false, error: error.message }); throw error; }
  finally { workspaceBusy = false; lockPlan(false); }
  // Who takes what: suggested at once, shown in the summary before anything is sent.
  await assignPeople().catch(error => notice('Исполнителей не удалось подобрать: ' + error.message, true));
  if (automaticVoiceCommand) await continueAutomaticBatch();
}
function renderResult(target, record) {
  const card=document.createElement('div');card.className='context-item';
  const completed=record.rows.filter(row=>row.state==='done'),pending=record.rows.filter(row=>row.state!=='done');
  const heading=document.createElement('strong');heading.textContent=record.project+' · Создано: '+completed.length+' из '+record.rows.length;card.append(heading);
  for(const [title,rows]of [['Созданные задачи',completed],['Требуют внимания',pending]]){if(!rows.length)continue;const h=document.createElement('h3');h.textContent=title;card.append(h);for(const row of rows){const p=document.createElement('p');p.textContent=(row.key||'Без ключа')+' — '+row.title+': '+(states[row.state]||row.state)+(row.error?'. '+row.error:'')+(row.blockedBy?.length?(row.linkError?'. '+row.linkError:row.linked?.length===row.blockedBy.length?'. Блокируется: '+row.blockedBy.join(', '):'. Связи ещё не проставлены'):'');if(row.key){const a=document.createElement('a');a.textContent='Открыть задачу';a.href=record.url+'/browse/'+row.key;a.target='_blank';a.rel='noopener';p.append(document.createTextNode(' · '),a);}card.append(p);}}
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
  } finally { workspaceBusy = false; lockPlan(!!frozenBatch); $('submit-batch').disabled = false; renderAssignSummary(); $('close-workspace').disabled = false; await refreshHistory(); }
}
// Where the plan goes (Jira or Asana, whichever is connected; a choice when both are) and who takes what.
const TARGET_NAME = { jira: 'Jira', asana: 'Asana' };
const taskWord = n => n % 10 === 1 && n % 100 !== 11 ? 'задачу' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'задачи' : 'задач';
const tasksWord = n => n % 10 === 1 && n % 100 !== 11 ? 'задача' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'задачи' : 'задач';
async function loadTargets() {
  try { planTargets = await window.petya.feature('assignment', 'targets'); } catch { planTargets = { jira: false, asana: false }; }
  window.plannerTargets = planTargets; return planTargets;
}
loadTargets();
function chooseTarget() {
  if (planTargets[planTarget]) return planTarget;
  let saved = ''; try { saved = localStorage.getItem('petya-plan-target') || ''; } catch {}
  return planTargets[saved] ? saved : planTargets.jira ? 'jira' : planTargets.asana ? 'asana' : '';
}
// Boards, sprints, versions and the Jira people search matter only when the plan goes to Jira.
const jiraControls = [$('load-metadata'), $('metadata-status'), $('batch-board').closest('.row'), $('people-query').closest('label'), $('find-people'), $('load-metadata').previousElementSibling].filter(Boolean);
function showTargetControls() { jiraControls.forEach(e => { e.hidden = planTarget === 'asana' || !planTargets.jira; }); document.querySelectorAll('#batch-tasks .jira-only').forEach(e => { e.hidden = planTarget === 'asana'; }); $('assign-asana').hidden = planTarget !== 'asana'; }
function renderTargets() {
  const box = $('assign-target'); box.replaceChildren();
  const available = ['jira', 'asana'].filter(t => planTargets[t]);
  for (const t of available) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = TARGET_NAME[t]; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(t === planTarget));
    b.disabled = available.length < 2 || !!frozenBatch || workspaceBusy || assignBusy;
    b.onclick = run(async () => {
      if (t === planTarget) return;
      planTarget = t; try { localStorage.setItem('petya-plan-target', t); } catch {}
      showTargetControls(); if (t === 'asana') await loadAsanaProjects(); else if (activeJiraRoute && !$('batch-board').options.length) await refreshMetadata();
      await assignPeople();
    });
    box.append(b);
  }
}
async function loadAsanaProjects() {
  const select = $('asana-project'); if (select.options.length > 1) return;
  const projects = await window.petya.feature('assignment', 'asanaProjects');
  let saved = ''; try { saved = localStorage.getItem('petya-asana-project') || ''; } catch {}
  selectOptions(select, projects, projects.some(p => p.id === saved) ? saved : projects.length === 1 ? projects[0].id : '', 'Выберите проект');
}
async function assignPeople(force = false) {
  const tasks = readTasks();
  if (!tasks.length || !planTarget) { renderAssignSummary(); return; }
  if (assignBusy) return; assignBusy = true;
  const finished = lastDecompose && !lastDecompose.busy ? lastDecompose : null, started = Date.now();
  renderDecomposeProgress({ stage: 'assigning', busy: true, startedAt: started });
  try {
    if (planTarget === 'asana') await loadAsanaProjects();
    const result = await window.petya.feature('assignment', 'assign', { planId: batchId, command: commandSnapshot, tasks, target: planTarget, force });
    assignment = result;
    selectedPeople = [...new Map([...result.candidates, ...(planTarget === 'jira' ? jiraPeople.filter(p => !result.candidates.some(c => c.id === p.id)) : [])].map(p => [p.id, p])).values()];
    [...document.querySelectorAll('.task-editor')].forEach((article, i) => {
      const own = result.tasks[i] || {}, select = article.querySelector('.task-assignee');
      selectOptions(select, selectedPeople, own.assigneeId || tasks[i].assigneeId || '', 'Выберите исполнителя', personLabel);
      article.querySelector('.task-reason').textContent = own.assigneeId ? 'Почему ' + own.name.split(' ')[0] + ': ' + own.reason + (own.effort ? ` · размер ${own.effort}` : '') : own.reason || 'Выберите исполнителя.';
    });
  } finally {
    assignBusy = false;
    renderDecomposeProgress(finished || null);
    renderAssignSummary();
  }
}
// The summary is read from the task editors, so a hand change of an assignee shows at once.
function renderAssignSummary() {
  const box = $('assign-summary'), tasks = readTasks();
  box.hidden = !tasks.length || !planTarget;
  const button = $('submit-batch');
  if (box.hidden) return;
  renderTargets(); showTargetControls();
  const byId = new Map(selectedPeople.map(p => [p.id, p])), groups = new Map(), unassigned = [];
  tasks.forEach((t, i) => { if (!t.assigneeId) { unassigned.push(i); return; } if (!groups.has(t.assigneeId)) groups.set(t.assigneeId, []); groups.get(t.assigneeId).push(i); });
  $('assign-overview').textContent = `${tasks.length} ${tasksWord(tasks.length)} · ${groups.size} ${groups.size % 10 === 1 && groups.size % 100 !== 11 ? 'человек' : groups.size % 10 >= 2 && groups.size % 10 <= 4 && (groups.size % 100 < 10 || groups.size % 100 >= 20) ? 'человека' : 'человек'}` + (unassigned.length ? ` · без исполнителя: ${unassigned.length}` : '') + (assignBusy ? ' · подбираю исполнителей…' : '');
  const list = $('assign-people'); list.replaceChildren();
  for (const [id, own] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const person = byId.get(id) || { name: id }, [name, role] = String(person.name).split(' · ');
    const item = document.createElement('li'); item.className = 'assign-person';
    const head = document.createElement('div'); head.className = 'assign-person-head';
    const who = document.createElement('strong'); who.textContent = name;
    const what = document.createElement('span'); what.className = 'small'; what.textContent = role || '';
    const load = document.createElement('span'); load.className = 'assign-load';
    load.textContent = person.open != null ? `открыто ${person.open} → ${person.open + own.length}` : `+${own.length}`;
    load.title = person.open != null ? 'Открытых задач сейчас и после этого плана' : 'Текущая загрузка неизвестна';
    head.append(who, what, load);
    const names = document.createElement('ol'); for (const i of own) { const li = document.createElement('li'); li.value = i + 1; li.textContent = tasks[i].summary || 'Без названия'; names.append(li); }
    item.append(head, names); list.append(item);
  }
  const open = $('assign-unassigned'); open.replaceChildren(); open.hidden = !unassigned.length;
  if (unassigned.length) {
    const title = document.createElement('strong'); title.textContent = 'Без исполнителя — выберите в задаче ниже:';
    const rows = document.createElement('ol'); for (const i of unassigned) { const li = document.createElement('li'); li.value = i + 1; li.textContent = (tasks[i].summary || 'Без названия') + (assignment?.tasks[i]?.reason ? ' — ' + assignment.tasks[i].reason.replace(/ — выберите вручную$/, '') : ''); rows.append(li); }
    open.append(title, rows);
  }
  const warnings = $('assign-warnings'); warnings.replaceChildren();
  for (const w of assignment?.target === planTarget ? assignment.warnings : []) { const p = document.createElement('p'); p.textContent = w; warnings.append(p); }
  // Where it goes and what is still missing before the single send.
  const missing = [];
  let where = '';
  if (planTarget === 'jira') {
    const sprint = $('batch-sprint').selectedOptions[0], version = $('batch-version').selectedOptions[0];
    const own = new Map(); for (const t of tasks) { const name = t.versionId ? jiraVersions.find(v => String(v.id) === t.versionId)?.name : version?.value ? version.text : ''; if (name) own.set(name, (own.get(name) || 0) + 1); }
    const versions = own.size > 1 ? 'версии ' + [...own].map(([n, c]) => `${n} (${c})`).join(', ') : version?.value || own.size ? 'версия ' + ([...own.keys()][0] || version.text) : 'версия не выбрана';
    where = `Jira · ${batchTarget.project || 'проект не выбран'} · ${sprint?.value ? sprint.text : 'спринт не выбран'} · ${versions} · связи «блокирует» по зависимостям`;
    if (!batchTarget.project) missing.push('проект Jira'); if (!sprint?.value) missing.push('спринт'); if (!version?.value && tasks.some(t => !t.versionId)) missing.push('версию');
  } else {
    const project = $('asana-project').selectedOptions[0];
    where = `Asana · ${project?.value ? project.text : 'проект не выбран'}`; if (!project?.value) missing.push('проект Asana');
  }
  if (unassigned.length) missing.push('исполнителей для ' + unassigned.length + ' ' + taskWord(unassigned.length).replace('задачу', 'задачи'));
  $('assign-where').textContent = where + (missing.length && !frozenBatch ? ' · выберите ' + missing.join(', ') : '');
  button.textContent = frozenBatch ? 'Повторить только незавершённые действия' : `Отправить ${tasks.length} ${taskWord(tasks.length)} в ${TARGET_NAME[planTarget]}`;
  button.disabled = workspaceBusy || assignBusy || (!frozenBatch && missing.length > 0);
}
async function sendPlan() { return planTarget === 'asana' ? sendAsana() : sendBatch(); }
const ASANA_STATES = { ready: 'Ещё не отправлена', sending: 'Результат неизвестен — проверьте Asana', uncertain: 'Результат неизвестен — повтор заблокирован', created: 'Создана, зависимости не проставлены', rejected: 'Asana отклонила создание', done: 'Создана' };
async function sendAsana() {
  if (workspaceBusy) return;
  workspaceBusy = true; lockPlan(true); $('submit-batch').disabled = true; $('close-workspace').disabled = true;
  const payload = frozenBatch || { id: batchId, project: $('asana-project').value, tasks: readTasks() };
  try {
    try { localStorage.setItem('petya-asana-project', payload.project); } catch {}
    const result = await window.petya.feature('assignment', 'asanaSend', payload); frozenBatch = payload;
    const card = document.createElement('div'); card.className = 'context-item';
    const done = result.rows.filter(r => r.state === 'done' || r.state === 'created').length;
    const heading = document.createElement('strong'); heading.textContent = `Asana · ${result.project} · создано ${done} из ${result.rows.length}`; card.append(heading);
    for (const row of result.rows) { const p = document.createElement('p'); p.className = 'small'; p.append(document.createTextNode(`${row.title} — ${ASANA_STATES[row.state] || row.state}${row.error ? ': ' + row.error : ''} `)); if (row.url) { const a = document.createElement('a'); a.href = row.url; a.textContent = 'открыть'; a.target = '_blank'; a.rel = 'noreferrer'; p.append(a); } card.append(p); }
    $('batch-results').replaceChildren(card);
    notice(`Asana: создано ${done} из ${result.rows.length}.`);
    await window.petya.notify(`Asana: создано ${done} из ${result.rows.length} задач.`);
  } catch (error) { notice(error.message, true); }
  finally { workspaceBusy = false; lockPlan(!!frozenBatch); $('close-workspace').disabled = false; renderAssignSummary(); }
}
$('reassign').onclick = run(() => assignPeople(true));
$('asana-project').onchange = () => renderAssignSummary();
$('batch-sprint').addEventListener('change', () => renderAssignSummary()); $('batch-version').addEventListener('change', () => { document.querySelectorAll('.task-version').forEach(fillVersion); renderAssignSummary(); });
$('batch-tasks').addEventListener('input', () => { clearTimeout(window.assignSummaryTimer); window.assignSummaryTimer = setTimeout(renderAssignSummary, 200); });
$('find-docs').onclick = run(findDocs); $('load-metadata').onclick = run(refreshMetadata); $('batch-board').onchange = run(refreshMetadata);
$('find-people').onclick = run(async () => { const people = await window.petya.jiraPeople($('people-query').value, activeJiraRoute?.id); mergePeople(people); notice(`Найдено исполнителей: ${people.length}. Выберите их в задачах.`); });
$('decompose').onclick = run(decompose); $('add-task').onclick = () => { if ($('batch-tasks').children.length < 12) taskEditor(); else notice('Максимум 12 задач в пакете.'); };
$('submit-batch').onclick = run(sendPlan); $('refresh-history').onclick = run(refreshHistory);
// History refreshes itself when opened; the manual button stays only as a fallback in the help section.
document.addEventListener('petya-view', event => { if (event.detail === 'history') refreshHistory().catch(error => notice(error.message, true)); });
$('refresh-history').hidden = true;
$('close-workspace').onclick = () => { if (!workspaceBusy) { $('workspace-card').hidden = true; frozenBatch = null; } };
$('expand-draft').onclick = run(() => openWorkspace(activeContext));


async function continueAutomaticBatch() {
  if (!automaticVoiceCommand || workspaceBusy || frozenBatch) return;
  if (automaticBatchQuestions.length) {
    askVoiceQuestion(automaticBatchQuestions.join(' '), async answer => { commandSnapshot += '\nУточнение пользователя: ' + answer; await decompose(); }); return;
  }
  if (planTarget === 'asana' && !$('asana-project').value) {
    const options = [...$('asana-project').options].filter(o => o.value);
    if (!options.length) { notice('В Asana нет доступных проектов.', true); await window.petya.requestAttention(); return; }
    askVoiceChoices('В какой проект Asana отправить задачи? ' + options.map((o, i) => (i + 1) + '. ' + o.text).join('; '), options.map(o => ({ label: o.text, names: [o.text], run: async () => { $('asana-project').value = o.value; renderAssignSummary(); await continueAutomaticBatch(); } }))); return;
  }
  for (const [id, title] of planTarget === 'asana' ? [] : [['batch-board','доску'], ['batch-sprint','спринт'], ['batch-version','версию']]) {
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
  // A plan that misses part of the material is not sent by voice without an explicit yes.
  if (automaticCoverage?.loss && !coverageConfirmed) {
    const first = automaticCoverage.warnings.find(w => !w.startsWith('Материал больше окна')) || '';
    askVoiceChoices('Часть материала не вошла в план. ' + first + ' Всё равно создать задачи?', [
      { label: 'Создать', names: ['да', 'создать', 'создавай', 'создай'], run: async () => { coverageConfirmed = true; await continueAutomaticBatch(); } },
      { label: 'Не создавать', names: ['нет', 'не надо', 'не создавай', 'стоп'], run: async () => { automaticVoiceCommand = false; voiceReply = null; notice('Задачи не созданы. Проверьте план и предупреждения.'); } }
    ]); return;
  }
  voiceReply = null; automaticVoiceCommand = false;
  await sendPlan();
}

for (const id of ['batch-sprint', 'batch-version']) $(id).addEventListener('change', run(continueAutomaticBatch));
