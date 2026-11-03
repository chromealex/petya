const $ = id => document.getElementById(id);
let commandSnapshot = '', commandAt = 0, currentDraft = null, draftBusy = false, meetingId = '', planning = false, micStarting = false;
function notice(message, error = false) { $('notice').hidden = false; $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function run(fn) { return async event => { if (event) event.preventDefault(); try { await fn(event); } catch (error) { notice(error.message, true); } }; }
function view(name) { document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== name); document.querySelectorAll('.nav').forEach(e => e.classList.toggle('active', e.dataset.view === name)); }
document.querySelectorAll('.nav').forEach(button => button.onclick = () => view(button.dataset.view));
function updateAudio() {
  $('mic').textContent = mic.active ? '■  Выключить микрофон' : '◉  Включить микрофон';
  $('meeting').textContent = meeting.active ? '■  Остановить встречу' : 'Слушать встречу Zoom';
  $('status').textContent = mic.active ? 'Микрофон включён · скажите «Петя»' : meeting.active ? 'Слушаю системный звук' : 'Микрофон выключен';
  $('status').classList.toggle('live', mic.active || meeting.active);
  $('meeting-status').textContent = meeting.active ? 'Встреча включена · весь системный звук попадает в контекст' : 'Встреча выключена · захват всего системного звука, не только Zoom';
  window.petya.listening(mic.active).catch(e => notice(e.message, true));
}
function audioError(error) { updateAudio(); notice(error.message, true); }
let automaticVoiceCommand = false, voiceReply = null, automaticBatchQuestions = [];
function askVoiceQuestion(message, reply) {
  if (!automaticVoiceCommand) return;
  voiceReply = reply; voiceTurn.arm(); notice(message);
  window.petya.requestAttention().catch(e => notice(e.message, true));
  window.petya.notify(message).catch(e => notice(e.message, true));
}
function askVoiceChoices(message, options) {
  askVoiceQuestion(message, async spoken => {
    const value = spoken.toLocaleLowerCase().replace(/[.,!?]/g, '').trim();
    const ordinal = {первый:0, первая:0, первое:0, второй:1, вторая:1, второе:1, третий:2, третья:2, третье:2};
    const number = /^\d+$/.test(value) ? Number(value)-1 : ordinal[value];
    const matches = Number.isInteger(number) ? options[number] ? [options[number]] : [] : options.filter(o => (o.names || [o.label]).some(n => n && value === String(n).toLocaleLowerCase().trim()));
    if (matches.length !== 1) { askVoiceChoices(message + ' Назовите вариант или его номер.', options); return; }
    await matches[0].run();
  });
}
const voiceTurn = new VoiceTurn({
  pending: () => mic.active && (mic.voiced || mic.busy || mic.queue?.length),
  status: (message, error) => { notice(message, error); if (error) { window.petya.notify(message).catch(()=>{}); window.petya.requestAttention().catch(()=>{}); } },
  dispatch: async (command, at) => {
    if (voiceReply && !VoiceTurn.isNewQuestion(command)) { const reply = voiceReply; voiceReply = null; await reply(command); }
    else await processCommand(command, at, true);
  }
});
const mic = new AudioListener(async (speech, at, endedAt) => {
  if(window.petyaSpeaking)return;
  const turn = voiceTurn.feed(speech, at, endedAt);
  $('heard').textContent = turn.consumed && voiceTurn.parts.length ? voiceTurn.parts.join(' ') : speech;
  if (turn.cancelled) { voiceReply = null; automaticVoiceCommand = false; }
  if (turn.preceding && meeting.active) await window.petya.addContext({ source: 'Микрофон', title: turn.preceding.slice(0, 100), text: turn.preceding, at, sessionId: meetingId });
  if (!turn.consumed && (meeting.active || window.petyaAutoMeetingActive)) { await window.petya.addContext({ source: 'Микрофон', title: speech.slice(0, 100), text: speech, at: endedAt, sessionId: meetingId }); await refreshContexts(); }
}, audioError, { onUnrecognized: () => { if(voiceTurn.active){voiceTurn.reset();notice('Не расслышал слова. Повторите фразу или напишите её.');speakReply('Не расслышал. Пожалуйста, повторите фразу.');} }, onSpeech: at => voiceTurn.activity(at), onStop: () => { voiceTurn.reset(); voiceReply = null; automaticVoiceCommand = false; } });
const meeting = new AudioListener(async (speech, at, endedAt) => { if(window.petyaSpeaking)return; await window.petya.addContext({ source: 'Zoom', title: speech.slice(0, 100), text: speech, at: endedAt, sessionId: meetingId }); await refreshContexts(); }, audioError);
async function toggleMic() { if (micStarting) return; micStarting = true; $('mic').disabled = true; try { if (mic.active) { mic.stop(); } else await mic.start(); } finally { micStarting = false; $('mic').disabled = false; updateAudio(); } }
$('mic').onclick = run(toggleMic);
$('meeting').onclick = run(async () => { $('meeting').disabled = true; try { if (meeting.active) { await window.petyaStopAutomaticMeeting(); await window.petya.pauseAutoMeeting(); meeting.stop(); } else { meetingId = crypto.randomUUID(); await meeting.start(true); } } finally { $('meeting').disabled = false; updateAudio(); } });
window.petyaEvents.onToggle(run(toggleMic));
window.petyaEvents.onPause(() => { window.petyaStopAutomaticMeeting(); window.petya.pauseAutoMeeting(); mic.stop(); meeting.stop(); updateAudio(); });
async function refreshContexts() {
  const contexts = await window.petya.contexts(); $('source-stats').replaceChildren(document.createTextNode(String(contexts.length)), Object.assign(document.createElement('span'), { textContent: 'фрагментов контекста' }));
  $('context-list').replaceChildren();
  if (!contexts.length) $('context-list').textContent = 'Пока пусто. Подключите Slack, включите встречу или добавьте заметки.';
  for (const context of [...contexts].reverse().slice(0, 500)) { const card = document.createElement('article'); card.className = 'context-item'; const title = document.createElement('strong'); title.textContent = context.title; const meta = document.createElement('p'); meta.className = 'small'; meta.textContent = `${context.source} · ${new Date(context.at).toLocaleString('ru-RU')}`; const body = document.createElement('p'); body.textContent = context.text.slice(0, 350); card.append(title, meta, body); $('context-list').append(card); }
}
async function makeDraft(context, route = null) {
  activeContext = context;
  if (currentIntent === 'asana') { await prepareSpokenAsana(context); return; }
  if (currentIntent === 'agent') { await prepareAgent(context); return; }
  if (!route && currentIntent !== 'docs') {
    route = await selectJiraRoute(context, selected => makeDraft(context, selected));
    if (!route) return;
  }
  activeJiraRoute = route;
  if (currentIntent === 'jira-agent') { await openWorkspace(context, route); return; }
  if (currentIntent !== 'do' && (currentIntent === 'docs' || /(декомпоз|разбей|несколько|задачи|таски|найди.*док|найди.*спек|покажи.*док)/iu.test(commandSnapshot))) { await openWorkspace(context, route); return; }
  if (draftBusy) return; draftBusy = true;
  document.querySelectorAll('.choice').forEach(b => b.disabled = true);
  try { notice('Готовлю черновик по выбранному обсуждению…'); currentDraft = await window.petya.draft(commandSnapshot, context.id, route.id); $('draft-summary').value = currentDraft.summary; $('draft-description').value = currentDraft.description; $('draft-card').hidden = false; $('resolution').hidden = true; $('send').disabled = false; $('issue-result').textContent = `Проект: ${route.project} · ${route.name}. ${route.reason}`; notice(`Контекст: ${context.source} — ${context.title}. Проверьте задачу перед отправкой.`); await window.petya.notify('Черновик Jira готов. Откройте Петю для проверки.'); }
  finally { draftBusy = false; document.querySelectorAll('.choice').forEach(b => b.disabled = false); }
  if (automaticVoiceCommand && currentDraft) {
    if (currentDraft.questions?.length) askVoiceQuestion(currentDraft.questions.join(' '), async answer => { commandSnapshot += '\nУточнение пользователя: ' + answer; currentDraft = null; await makeDraft(context, route); });
    else { voiceReply = null; await sendCurrentDraft(); }
  }
}
async function processCommand(command, at = Date.now(), automatic = false) {
  if (planning || draftBusy || workspaceBusy || agentBusy || asanaVoiceBusy) { notice('Сначала завершите или закройте текущий черновик.'); return; }
  automaticVoiceCommand = automatic; voiceReply = null;
  planning = true;
  try {
  ++routeRevision; routePanel.hidden = true; activeJiraRoute = null;
  commandSnapshot = command.replace(/^петя(?=$|[\s,:.!?—-])[\s,:.!?—-]*/iu, '').trim(); commandAt = at;
  $('command').value = commandSnapshot; view('home');
  if (meeting.active) { notice('Дослушиваю последние реплики встречи…'); await meeting.flushContext(); commandAt = Date.now(); }
  const files=await window.petya.attachmentList();
  const reply=files.length?await window.petya.attachmentInspect(files.map(f=>f.id),commandSnapshot):await window.petya.converse(commandSnapshot);
  if(typeof refreshAttachments==='function')await refreshAttachments();
  if(reply.handled){automaticVoiceCommand=false;await showDialogueReply(reply,automatic);return;}
  if(reply.resolvedCommand){commandSnapshot=reply.resolvedCommand;$('command').value=commandSnapshot;}
  if(currentDraft){notice('Сначала завершите или закройте текущий черновик.');return;}
  const result = await window.petya.plan(commandSnapshot, commandAt, meeting.active ? meetingId : ''); currentIntent = result.intent; if (currentIntent === 'do') automaticVoiceCommand = true;
  $('draft-card').hidden = true; $('resolution').hidden = true; $('choices').replaceChildren(); $('workspace-card').hidden = true;
  if (result.kind === 'unsupported') { notice('Можно создать задачи Jira, найти документацию или передать работу Claude / Codex.'); return; }
  if (result.kind === 'selected') { await makeDraft(result.context); return; }
  $('resolution').hidden = false;
  $('resolution-title').textContent = result.kind === 'missing' ? 'Не хватает контекста' : 'О какой фиче речь?';
  for (const context of result.options) { const button = document.createElement('button'); button.className = 'choice'; const title = document.createElement('strong'); title.textContent = context.title; const body = document.createElement('span'); body.textContent = `${context.source} · ${new Date(context.at).toLocaleTimeString('ru-RU')} · ${context.text.slice(0, 180)}`; button.append(title, body); button.onclick = run(() => makeDraft(context)); $('choices').append(button); }
  const add = document.createElement('button'); add.textContent = 'Другое обсуждение / добавить контекст'; add.onclick = () => view('sources'); $('choices').append(add);
  if (currentIntent === 'do') {
    for (const [label, action] of [
      ['Рассказать, что нужно сделать', () => { automaticVoiceCommand=true; askVoiceQuestion('Расскажите задачу: что нужно изменить и какой результат получить?', async answer=>{await window.petya.addContext({source:'Уточнение',title:answer.slice(0,100),text:answer});await processCommand(commandSnapshot,Date.now(),true);}); }],
      ['Добавить текст или ссылку', () => view('sources')],
      ['Обновить контекст Slack', async () => {await window.petya.syncSlack();await processCommand(commandSnapshot,Date.now(),true);}],
      ['Отложить', () => {voiceReply=null;voiceTurn.reset();automaticVoiceCommand=false;$('resolution').hidden=true;notice('Отложено. Когда контекст будет готов, скажите «Петя, делай».');}]
    ]) { const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(action);if(label.includes('Slack')&&!moduleEnabled('slack'))b.hidden=true;$('choices').append(b); }
    await window.petya.requestAttention();
  }
  notice(result.kind === 'missing' ? 'Добавьте обсуждение, затем повторите команду.' : 'Нашёл несколько обсуждений. Выберите нужное.');
  if (automaticVoiceCommand) {
    if (result.kind === 'missing') askVoiceQuestion('О чём задача? Расскажите, что нужно сделать.', async answer => { await window.petya.addContext({source:'Голосовая команда',title:answer.slice(0,100),text:answer}); await processCommand(commandSnapshot, Date.now(), true); });
    else askVoiceChoices('О каком обсуждении речь? Назовите номер варианта.', result.options.map((context, i) => ({label:context.title, names:[context.title],run:()=>makeDraft(context)})));
  }
  $('resolution').scrollIntoView({ behavior: 'smooth', block: 'center' });
  await window.petya.notify(result.kind === 'missing' ? 'Для задачи не хватает контекста.' : 'Уточните, какое обсуждение использовать для задачи.');
  } finally { planning = false; }
}
$('command-form').onsubmit = run(() => processCommand($('command').value));
$('context-form').onsubmit = run(async () => { await window.petya.addContext({ title: $('context-title').value, text: $('context-text').value, source: $('context-source').value }); $('context-form').reset(); await refreshContexts(); notice('Обсуждение добавлено. Можно повторить команду.'); });
$('import').onchange = run(async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 100000) throw new Error('Файл слишком большой. Выберите фрагмент до 100 КБ.'); const content = await file.text(); $('context-text').value = content.slice(0, 50000); $('context-title').value = file.name.replace(/\.(txt|vtt)$/i, ''); if (content.length > 50000) notice('Импортированы первые 50 000 символов. Проверьте фрагмент.'); });
$('clear-contexts').onclick = run(async () => { if (workspaceBusy) throw new Error('Дождитесь завершения работы с планом.'); $('workspace-card').hidden = true; $('batch-tasks').replaceChildren(); $('docs-list').replaceChildren(); activeContext = null; await window.petya.clearContexts(); if(typeof selectDialogueTopic==='function')await selectDialogueTopic(''); currentDraft = null; $('draft-card').hidden = true; $('resolution').hidden = true; await refreshContexts(); notice('Память и черновики очищены.'); });
$('sync-slack').onclick = run(async () => { $('sync-slack').disabled = true; try { const count = await window.petya.syncSlack(); await refreshContexts(); notice(count.message); } finally { $('sync-slack').disabled = false; } });
function displaySettings(settings) { for (const element of $('settings-form').elements) { if (element.name in settings && element.type !== 'checkbox') { if (element.tagName === 'SELECT' && settings[element.name] && ![...element.options].some(o => o.value === settings[element.name])) element.add(new Option('Сохранённый выбор · ' + settings[element.name], settings[element.name])); element.value = settings[element.name]; } if (element.type === 'checkbox' && element.name) element.checked = settings[element.name] === 'true'; } $('connection-state').textContent = `Slack: ${settings.hasSlackToken ? 'настроен' : 'не подключён'} · Jira: ${settings.hasJiraToken ? 'настроен' : 'не подключён'} · Notion: ${settings.hasNotionToken ? 'настроен' : 'не подключён'}`; document.dispatchEvent(new Event('petya-settings-displayed')); }
$('settings-form').onsubmit = run(async () => { const data = Object.fromEntries(new FormData($('settings-form'))); for (const key of ['smartNotifications', 'interpretationEnabled', 'slackAutoSync', 'zoomAutoRecord', 'zoomCaptureMic']) data[key] = String($('settings-form').elements[key].checked); for (const key of ['clear_slackToken', 'clear_jiraToken', 'clear_notionToken']) data[key] = $('settings-form').elements[key].checked; displaySettings(await window.petya.saveSettings(data)); document.querySelectorAll('.connection-status').forEach(e => { e.textContent = 'Настройки сохранены · проверьте доступ заново'; e.className = 'connection-status'; }); notice('Подключения сохранены.'); });
$('cancel-draft').onclick = () => { automaticVoiceCommand = false; voiceReply = null; voiceTurn.reset(); currentDraft = null; $('draft-card').hidden = true; };
async function sendCurrentDraft() { if (!currentDraft) return; $('send').disabled = true; $('cancel-draft').disabled = true; try { const issue = await window.petya.createIssue({ id: currentDraft.id, summary: $('draft-summary').value, description: $('draft-description').value }); $('issue-result').textContent = `${issue.key} · ${issue.url}`; notice(`Готово: задача ${issue.key} создана.`); currentDraft = null; automaticVoiceCommand = false; await window.petya.notify(`Создана задача ${issue.key}`); if (issue.handoff) await handleDoHandoff(issue.handoff); if (issue.handoffError) { notice('Задача создана, но передача не подготовлена: '+issue.handoffError,true); await window.petya.requestAttention(); } } catch (error) { automaticVoiceCommand = false; voiceReply = null; $('issue-result').textContent = 'Проверьте Jira перед повтором. Затем закройте черновик и повторите команду.'; throw error; } finally { $('cancel-draft').disabled = false; await refreshHistory(); } }
$('draft-form').onsubmit = run(sendCurrentDraft);
run(async () => { displaySettings(await window.petya.settings()); await refreshContexts(); })();
