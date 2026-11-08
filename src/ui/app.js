const $ = id => document.getElementById(id);
let commandSnapshot = '', commandAt = 0, currentDraft = null, draftBusy = false, meetingId = '', planning = false, micStarting = false;
let noticePinTimer = null, chromeProgress = null;
function updateChromeStatus(){
 const button=$('chrome-status');button.hidden=document.body.dataset.view==='home';
 const active=chromeProgress&&['working','waiting','error'].includes(chromeProgress.state);
 const message=active?chromeProgress.label:!$('notice').hidden?$('notice').textContent:$('status').textContent;
 const state=active?chromeProgress.state:!$('notice').hidden&&$('notice').classList.contains('error')?'error':'idle';
 // A short label fits the top bar; the full text opens on click.
 const full=message.replace(/\s+/g,' ').trim(),short=state==='error'?'Ошибка · подробнее':state==='waiting'?'Ждёт ответа':state==='working'?(full.length>34?full.slice(0,32)+'…':full||'Петя работает…'):(full.length>34?full.slice(0,32)+'…':full);
 $('chrome-status-text').textContent=short;button.dataset.full=full;
 button.dataset.state=state;button.title=full;
 button.setAttribute('aria-label',button.title);
}
document.body.dataset.view='home';
$('chrome-status').onclick=()=>{const button=$('chrome-status');let pop=document.getElementById('chrome-status-details');if(pop){pop.remove();button.setAttribute('aria-expanded','false');return;}
 pop=document.createElement('div');pop.id='chrome-status-details';pop.className='chrome-status-details';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Подробности статуса');
 const text=document.createElement('p');text.textContent=button.dataset.full||'';const open=document.createElement('button');open.type='button';open.textContent='Открыть в Ассистенте';open.onclick=()=>{pop.remove();view('home');document.querySelector('main').scrollIntoView({block:'start'});};
 pop.append(text,open);document.body.append(pop);const box=button.getBoundingClientRect();pop.style.top=(box.bottom+8)+'px';pop.style.right=Math.max(8,innerWidth-box.right)+'px';button.setAttribute('aria-expanded','true');open.focus();
 const dismiss=event=>{if(event.type==='keydown'&&event.key!=='Escape')return;if(event.type==='pointerdown'&&(pop.contains(event.target)||button.contains(event.target)))return;pop.remove();button.setAttribute('aria-expanded','false');document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',dismiss);};
 document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',dismiss);};

// Messages pop up at the top of the window and go away by themselves; a pointer over one keeps it.
// notice(text, error, {action:{label, run}}) adds a button, e.g. «Откатить».
function notice(message, error = false, options = {}) {
 document.dispatchEvent(new CustomEvent('petya-notice',{detail:{message,error}}));
 const panel=$('notice');panel.hidden=false;panel.replaceChildren(document.createTextNode(message));panel.classList.toggle('error',error);panel.classList.add('notice-toast');
 if(options.action){const b=document.createElement('button');b.type='button';b.className='notice-action';b.textContent=options.action.label;b.onclick=async()=>{hide();try{await options.action.run();}catch(e){notice(e.message,true);}};panel.append(b);}
 const close=document.createElement('button');close.type='button';close.className='notice-close';close.setAttribute('aria-label','Закрыть');close.onclick=()=>hide();panel.append(close);
 const hide=()=>{clearTimeout(noticePinTimer);noticePinTimer=null;panel.hidden=true;updateChromeStatus();};
 const arm=()=>{clearTimeout(noticePinTimer);noticePinTimer=setTimeout(hide,(options.action?8000:error?7000:4000));};
 panel.onmouseenter=()=>clearTimeout(noticePinTimer);panel.onmouseleave=arm;
 updateChromeStatus();arm();
}
function run(fn) { return async event => {
 if(event)event.preventDefault();const b=event?.currentTarget;const feedback=b?.tagName==='BUTTON'&&/^(Обновить|Проверить|Загрузить|Синхронизировать)/.test(b.textContent.trim());
 let label,output,failed=false;const onNotice=e=>{if(e.detail.error)failed=true;};
 if(feedback){if(b.dataset.pending)return;label=b.textContent;b.dataset.pending='true';b.disabled=true;b.setAttribute('aria-busy','true');b.textContent=/^Проверить/.test(label)?'Проверяю…':'Обновляю…';output=b.nextElementSibling;if(!output?.classList.contains('action-feedback')){output=document.createElement('span');output.className='action-feedback';output.setAttribute('role','status');b.after(output);}output.textContent=b.textContent;output.classList.remove('error');document.addEventListener('petya-notice',onNotice);}
 try {await fn(event);if(output&&!failed)output.textContent='Обновлено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
 catch(error){if(b?.closest('.chat-question'))throw error;failed=true;if(output)output.textContent=error.message;notice(error.message,true);}
 finally{if(feedback){document.removeEventListener('petya-notice',onNotice);if(failed){output.classList.add('error');if(/Обновляю|Проверяю/.test(output.textContent))output.textContent='Не удалось обновить. См. сообщение об ошибке.';}b.textContent=label;b.disabled=false;b.removeAttribute('aria-busy');delete b.dataset.pending;}}
}; }
function view(name) { window.scrollTo(0,0);document.body.dataset.view=name;document.dispatchEvent(new CustomEvent('petya-view',{detail:name}));updateChromeStatus();document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== name); document.querySelectorAll('.nav').forEach(e => e.classList.toggle('active', e.dataset.view === name)); }
document.querySelectorAll('.nav').forEach(button => button.onclick = () => view(button.dataset.view));
function updateAudio() {
  micDiagnostics.hidden=!mic.active;
  $('mic').disabled = micStarting || !!window.petyaAutoMeetingActive;
  $('mic-action').textContent = window.petyaAutoMeetingActive ? 'Микрофон занят записью встречи' : mic.active ? 'Микрофон включён' : 'Микрофон выключен';
  renderMicrophoneChoices();
  $('meeting').textContent = !!window.petyaAutoMeetingActive ? '■  Остановить встречу' : 'Записывать системный звук';
  $('status').textContent = mic.active ? (mic.deviceLabel || 'Микрофон включён') + ' · в активном окне — без обращения, в фоне — «Петя»' : !!window.petyaAutoMeetingActive ? 'Записываю встречу' : 'Микрофон выключен';
  $('status').classList.toggle('live', mic.active || !!window.petyaAutoMeetingActive);
  $('meeting-status').textContent = !!window.petyaAutoMeetingActive ? 'Записываю встречу · обработка после завершения' : 'Встреча выключена · захват всего системного звука, не только Zoom';
  updateChromeStatus();
  window.petya.listening(mic.active,!!window.petyaAutoMeetingActive||!!window.petyaAutoMeetingActive).catch(e => notice(e.message, true));
}
function audioError(error) { updateAudio(); notice(error.message, true); }
const progressPanel = document.createElement('section');
progressPanel.className = 'card command-progress'; progressPanel.hidden = true;
progressPanel.setAttribute('aria-label', 'Выполнение команды');
const progressText = document.createElement('p'); progressText.setAttribute('role', 'status');
const progressTime = document.createElement('span'); progressTime.className = 'small';
const retryCommand = document.createElement('button'); retryCommand.type = 'button'; retryCommand.textContent = 'Повторить запрос';
let progressSteps = null, progressStepsOpen = false;
progressPanel.append(progressText, progressTime, retryCommand); $('notice').after(progressPanel);
let progressTimer = null;
window.petyaEvents.onRequestProgress?.(label=>{if(commandProgress.busy)commandProgress.update('working',label);});
const commandProgress = new CommandProgress({ change: state => {
  progressPanel.hidden = state.state === 'done' || state.state === 'idle'; progressText.textContent = state.label;
  progressPanel.dataset.state = state.state;
  // Live steps: what is done and what Petya is doing now; stays expanded if the user opened it.
  if (progressSteps) { progressStepsOpen = progressSteps.open; progressSteps.remove(); progressSteps = null; }
  if (state.busy && state.steps?.length) { const now = Date.now(); progressSteps = window.renderSteps(state.steps.map(s => ({ label: s.label, ms: (s.done || now) - s.at })), { live: true, open: progressStepsOpen }); progressTime.after(progressSteps); }
  if (!state.busy) progressStepsOpen = false;
  chromeProgress={state:state.state,label:state.label};updateChromeStatus();
  retryCommand.hidden = !state.failed; retryCommand.disabled = state.busy;
  clearInterval(progressTimer); progressTimer = null;
  const clock = () => { progressTime.hidden = !state.startedAt; progressTime.textContent = Math.floor((Date.now() - state.startedAt) / 1000) + ' с'; progressTime.title = 'Время выполнения'; };
  clock(); if (state.busy) progressTimer = setInterval(clock, 1000);
}});
async function repeatCommand(spoken = false) {
  if (commandProgress.busy) { notice('Запрос ещё выполняется.'); return; }
  if (!commandProgress.failed && voiceReply && commandProgress.state==='error') { const reply=voiceReply;voiceReply=null;await commandProgress.start('повтори',()=>reply('повтори'));return; }
  if (!commandProgress.failed) { const message = 'Нет запроса для безопасного повтора.'; notice(message); if (spoken) await speakReply(message); return; }
  await commandProgress.retry();
  if (commandProgress.state === 'error' && spoken) await speakReply(commandProgress.label);
}
retryCommand.onclick = run(() => repeatCommand(false));
let automaticVoiceCommand = false, voiceReply = null, automaticBatchQuestions = [];
function askVoiceQuestion(message, reply, choices=[]) {
  if (!automaticVoiceCommand) return;
  voiceReply = async answer=>{if(/^(?:отмена|стоп|не надо)[.!]?$/iu.test(answer.trim())){automaticVoiceCommand=false;voiceReply=null;await showDialogueReply({handled:true,text:'Запрос отменён.'});return;}await reply(answer);};
  dialogueChoices.replaceChildren();window.renderClarification?.({question:true,text:message,clarificationOptions:choices,clarificationInput:{choicesOnly:choices.length>0}},null,true);commandProgress.update('waiting', 'Жду уточнения');
  speakReply(message).catch(e => notice(e.message, true));
  window.petya.requestAttention().catch(e => notice(e.message, true));
  window.petya.notify(message).catch(e => notice(e.message, true));
}
function askVoiceChoices(message, options) {
  askVoiceQuestion(message + ' ' + options.map((o, i) => (i + 1) + ' — ' + o.label).join('; '), async spoken => {
    const value = spoken.toLocaleLowerCase().replace(/[.,!?]/g, '').trim();
    const ordinal = {первый:0, первая:0, первое:0, второй:1, вторая:1, второе:1, третий:2, третья:2, третье:2};
    const number = /^\d+$/.test(value) ? Number(value)-1 : ordinal[value];
    const matches = Number.isInteger(number) ? options[number] ? [options[number]] : [] : options.filter(o => (o.names || [o.label]).some(n => n && value === String(n).toLocaleLowerCase().trim()));
    if (matches.length !== 1) { askVoiceChoices(message + ' Назовите вариант или его номер.', options); return; }
    await matches[0].run();
  },options.map(o=>o.label));
}
const voiceInputLocks=new Set();
document.addEventListener('petya-voice-input-lock',event=>{
 const {id,locked}=event.detail||{};if(typeof id!=='string')return;
 if(locked)voiceInputLocks.add(id);else voiceInputLocks.delete(id);
 if(voiceInputLocks.size)mic.stop();
 updateAudio();
});
const voiceTurn = new VoiceTurn({
  pending: () => ({capturing:mic.active && mic.voiced && Date.now()-mic.lastSpeechAt<250,buffered:mic.active && mic.voiced,transcribing:mic.active && (mic.busy || mic.queue?.length)}),
  onTimeout: () => { mic.stop(); voiceReply=null; automaticVoiceCommand=false; updateAudio(); },
  status: (message, error) => { if(commandProgress.busy&&!error)return; notice(message, error); if(!commandProgress.busy)commandProgress.update(error?'error':voiceTurn.active?'listening':'idle', message); if (error) { window.petya.notify(message).catch(()=>{}); window.petya.requestAttention().catch(()=>{}); } },
  dispatch: async (command, at) => {
    if(window.petyaAutoMeetingActive||voiceInputLocks.size)return;
    window.streamSpeechEnabled=true;
    if (CommandProgress.isRetry(command) && commandProgress.failed) { await repeatCommand(true); return; }
    if (voiceReply && !VoiceTurn.isNewQuestion(command)) { const reply = voiceReply; voiceReply = null; await reply(command); }
    else await processCommand(command, at, true);
  }
});
const micDiagnostics=document.createElement('div');micDiagnostics.className='small mic-diagnostics';micDiagnostics.hidden=true;micDiagnostics.style.gridColumn='1 / -1';
const micLevel=document.createElement('meter');micLevel.min=0;micLevel.max=1;micLevel.value=0;micLevel.setAttribute('aria-label','Уровень микрофона');
const micState=document.createElement('span');micState.textContent='Микрофон выключен';micDiagnostics.append(micLevel,document.createTextNode(' '),micState,$('heard'));$('command-form').append(micDiagnostics);
let micLevelAt=0;
const mic = new AudioListener(async (speech, at, endedAt, direct) => {
  if(window.petyaSpeaking||window.petyaAutoMeetingActive||voiceInputLocks.size)return;
  const turn = voiceTurn.feed(speech, at, endedAt, direct);
  $('heard').textContent = turn.consumed && voiceTurn.parts.length ? voiceTurn.parts.join(' ') : speech;
  if(turn.consumed&&!turn.cancelled&&voiceTurn.parts.length)window.petya.prepareVoice(voiceTurn.parts.join(' ')).catch(()=>{});
  if (turn.cancelled) { window.petya.prepareVoice(null).catch(()=>{}); voiceReply = null; automaticVoiceCommand = false; }
}, audioError, { segmentSeconds:2.5, allowDirect:()=>document.hasFocus()&&document.visibilityState==='visible', onLevel:level=>{if(Date.now()-micLevelAt>150){micLevelAt=Date.now();micLevel.value=Math.min(1,level*20);}},onState:state=>{const label=state+' · '+(mic.engine||'Whisper');if(micState.textContent!==label)micState.textContent=label;}, onUnrecognized: () => { $('heard').textContent='Не удалось распознать фразу. Повтори её или напиши запрос.'; if(voiceTurn.active){voiceTurn.reset();notice('Не расслышал слова. Повторите фразу или напишите её.');speakReply('Не расслышал. Пожалуйста, повторите фразу.');} }, onSpeech: at => voiceTurn.activity(at), onStop: () => { window.petya.prepareVoice(null).catch(()=>{}); micLevel.value=0;micState.textContent='Микрофон выключен';voiceTurn.reset(); voiceReply = null; automaticVoiceCommand = false; } });
const recordMeetingSegment = source => async item => { await window.petya.feature('meetingMemory','append',meetingId,source,item); return null; };
const meetingCaptureFailed = error => { audioError(error); window.petyaStopAutomaticMeeting(true).catch(audioError); window.petya.pauseAutoMeeting().catch(audioError); };
const meeting = new AudioListener(()=>{}, meetingCaptureFailed, {recordSegment:recordMeetingSegment('Zoom')});
const meetingMic = new AudioListener(()=>{}, meetingCaptureFailed, {recordSegment:recordMeetingSegment('Микрофон')});
async function startSelectedMicrophone(){
 if(voiceInputLocks.size)throw Error('Во время встречи голосовой ввод в чаты приостановлен. Можно писать текстом.');
 if(window.petyaAutoMeetingActive||meeting.active)throw Error('Во время встречи микрофон записывает только встречу. В чаты можно писать текстом.');
 const choice=selectedMicrophone();
 try{await mic.start(false,choice.id);}
 catch(error){if(['NotFoundError','OverconstrainedError'].includes(error.name))throw new Error('Выбранный микрофон недоступен. Нажмите стрелку рядом с кнопкой и выберите другой или системный.');throw error;}
 if(mic.active){await refreshMicrophones().catch(()=>{});mic.deviceLabel=mic.stream?.getAudioTracks()[0]?.label||selectedMicrophone().label;}
}
async function toggleMic(){
 if(micStarting)return;micStarting=true;$('mic').disabled=true;microphoneSelect.disabled=true;
 try{if(mic.active)mic.stop();else await startSelectedMicrophone();}
 finally{micStarting=false;$('mic').disabled=false;microphoneSelect.disabled=false;updateAudio();}
}
document.addEventListener('petya-microphone-changed',run(async()=>{
 if(micStarting)return;
 if(!mic.active){updateAudio();return;}
 micStarting=true;$('mic').disabled=true;microphoneSelect.disabled=true;
 try{mic.stop();await startSelectedMicrophone();}
 finally{micStarting=false;$('mic').disabled=false;microphoneSelect.disabled=false;updateAudio();}
}));
$('mic').onclick = run(toggleMic);
$('meeting').onclick = run(async () => { $('meeting').disabled = true; try { if (window.petyaAutoMeetingActive) { await window.petyaStopAutomaticMeeting(true); await window.petya.pauseAutoMeeting(); } else { await window.petyaStartMeetingRecording(); } } finally { $('meeting').disabled = false; updateAudio(); } });
window.petyaEvents.onNavigate(page => [...document.querySelectorAll('.nav')].find(button => button.dataset.view === page)?.click());
window.petyaEvents.onToggle(run(toggleMic));
window.petyaEvents.onPause(run(async () => { await window.petya.pauseAutoMeeting(); mic.stop(); await window.petyaStopAutomaticMeeting(true); updateAudio(); }));
// The materials page is drawn by materials.js from the grouped list; until it is loaded the data waits for it.
async function refreshContexts() {
  const value = await window.petya.feature('materials', 'list');
  window.materialsData = value; window.renderMaterials?.(value);
}
async function makeDraft(context, route = null, { reviewOnly = false } = {}) {
  activeContext = context;
  if (currentIntent === 'asana') { await prepareSpokenAsana(context); return; }
  if (currentIntent === 'agent') { await prepareAgent(context); return; }
  if (!route && currentIntent !== 'docs') {
    route = await selectJiraRoute(context, selected => makeDraft(context, selected, { reviewOnly }));
    if (!route) return;
  }
  activeJiraRoute = route;
  if (currentIntent === 'jira-agent') { await openWorkspace(context, route); return; }
  if (currentIntent !== 'do' && (currentIntent === 'docs' || currentDecompose || /(декомпоз|разбей|несколько|задачи|таски|найди.*док|найди.*спек|покажи.*док)/iu.test(commandSnapshot))) { await openWorkspace(context, route); return; }
  if (draftBusy) return; draftBusy = true;
  document.querySelectorAll('.choice').forEach(b => b.disabled = true);
  try { commandProgress.update('working', 'Готовлю черновик'); notice('Готовлю черновик по выбранному обсуждению…'); currentDraft = await window.petya.draft(commandSnapshot, context.id, route.id); $('draft-summary').value = currentDraft.summary; $('draft-description').value = currentDraft.description; $('draft-card').hidden = false; $('resolution').hidden = true; $('send').disabled = false; $('send').textContent = 'Создать задачу в '+currentDraft.project; $('issue-result').textContent = [currentDraft.project,currentDraft.issueType,'Исполнитель — по умолчанию в Jira'].filter(Boolean).join(' · '); notice(`Контекст: ${context.source} — ${context.title}. Проверьте задачу перед отправкой.`); await window.petya.notify('Черновик Jira готов. Откройте Петю для проверки.'); commandProgress.update('waiting', 'Черновик готов'); }
  finally { draftBusy = false; document.querySelectorAll('.choice').forEach(b => b.disabled = false); }
  if (!reviewOnly && automaticVoiceCommand && currentDraft) {
    if (currentDraft.questions?.length) askVoiceQuestion(currentDraft.questions.join(' '), async answer => { commandSnapshot += '\nУточнение пользователя: ' + answer; currentDraft = null; await makeDraft(context, route); });
    else { voiceReply = null; await sendCurrentDraft(); }
  }
}
async function processCommand(command, at = Date.now(), automatic = false) {
  if (CommandProgress.isRetry(command)) { await repeatCommand(automatic); return; }
  if (commandProgress.busy || planning || draftBusy || workspaceBusy || agentBusy || asanaVoiceBusy) {
    notice('Текущий запрос ещё выполняется.'); return;
  }
  const filesOnly=!command.trim() && !!window.pendingChatFiles?.length;
  if (!command.trim() && !filesOnly) return;
  $('notice').hidden=true;window.appendChatRequest?.(command);
  const completed = await commandProgress.start(filesOnly?'Разобрать вложения':command, () => executeCommand(command, at, automatic));
  if (!completed && commandProgress.state === 'error') {
    if(!$('command').value)$('command').value=command;
    if(window.showChatRequestError)window.showChatRequestError(command,commandProgress.label);else notice(commandProgress.label,true);
    if (automatic) await speakReply(commandProgress.label);
  }
}
async function executeCommand(command, at = Date.now(), automatic = false) {
  if (planning || draftBusy || workspaceBusy || agentBusy || asanaVoiceBusy) { notice('Сначала завершите или закройте текущий черновик.'); return; }
  window.stopStreamedVoice?.();window.streamSpeechEnabled=automatic;
  automaticVoiceCommand = automatic; voiceReply = null;
  planning = true;
  try {
  ++routeRevision; routePanel.hidden = true; activeJiraRoute = null;
  commandSnapshot = command.replace(/^петя(?=$|[\s,:.!?—-])[\s,:.!?—-]*/iu, '').trim(); commandAt = at;
  if($('command').value.trim()===command.trim()||$('command').value.trim()===commandSnapshot)$('command').value=''; view('home');
  if(!window.pendingChatFiles?.length && (ConversationInput.presenceReply(commandSnapshot)||ConversationInput.isProjectCatalogQuestion(commandSnapshot))){const reply=await commandProgress.step('reply','Отвечаю',()=>window.petya.converse(commandSnapshot),true);automaticVoiceCommand=false;await showDialogueReply(reply,automatic);return;}
  if (meeting.active) { notice('Дослушиваю последние реплики встречи…'); await meeting.flushContext(); commandAt = Date.now(); }
  const files=await commandProgress.step('files', 'Проверяю вложения', () => window.petya.attachmentList(), true);
  const reply=await commandProgress.step('reply', 'Обрабатываю запрос', () => files.length ? window.petya.attachmentInspect(files.map(f=>f.id),commandSnapshot) : window.petya.converse(commandSnapshot));
  if(typeof refreshAttachments==='function')await refreshAttachments();
  if(reply.handled){automaticVoiceCommand=false;await showDialogueReply(reply,automatic);if(reply.error)commandProgress.update('error',reply.text);else if(voiceReply||reply.question)commandProgress.update('waiting','Жду уточнения');return;}
  if(reply.resolvedCommand){commandSnapshot=reply.resolvedCommand;}
  if(currentDraft){notice('Сначала завершите или закройте текущий черновик.');return;}
  const result = await commandProgress.step('plan', 'Выбираю контекст и действие', () => window.petya.plan(commandSnapshot, commandAt, meeting.active ? meetingId : ''), true); currentIntent = result.intent; currentDecompose = !!result.decompose; if (currentIntent === 'do') automaticVoiceCommand = true;
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
async function submitChatCommand(command) {$('notice').hidden=true;if(window.chatSwitchPending||window.chatNavigationPending){notice('Переключаю чат. Повторите отправку через секунду.');return;} if(window.pendingChatFiles?.length&&!voiceReply){await processCommand(command);return;}if(!voiceReply&&await window.tryBackgroundChat?.(command))return;window.streamSpeechEnabled=false; if(voiceReply&&(dialogueChoices.dataset.selected||!VoiceTurn.isNewQuestion(command))){const reply=voiceReply;voiceReply=null;window.appendChatRequest?.(command);if($('command').value===command)$('command').value='';await reply(command);}else await processCommand(command); }
$('command-form').onsubmit=run(()=>window.sendChatNow?window.sendChatNow():submitChatCommand($('command').value));
$('context-form').onsubmit = run(async () => { await window.petya.addContext({ title: $('context-title').value, text: $('context-text').value, source: $('context-source').value }); $('context-form').reset(); await refreshContexts(); notice('Материал сохранён. Перейдите в «Ассистент» и задайте вопрос по нему.'); });
$('import').onchange = run(async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 100000) throw new Error('Файл слишком большой. Выберите фрагмент до 100 КБ.'); const content = await file.text(); $('context-text').value = content.slice(0, 50000); $('context-title').value = file.name.replace(/\.(txt|vtt)$/i, ''); notice(content.length > 50000 ? 'Загружены первые 50 000 символов. Проверьте текст и нажмите «Сохранить материал».' : 'Текст загружен в форму. Проверьте его и нажмите «Сохранить материал».'); });
$('clear-contexts').onclick = run(async () => { if (workspaceBusy) throw new Error('Дождитесь завершения работы с планом.'); $('workspace-card').hidden = true; $('batch-tasks').replaceChildren(); $('docs-list').replaceChildren(); activeContext = null; await window.petya.clearContexts(); if(typeof selectDialogueTopic==='function')await selectDialogueTopic(''); currentDraft = null; $('draft-card').hidden = true; $('resolution').hidden = true; await refreshContexts(); notice('Память и черновики очищены.'); });
$('sync-slack').onclick = run(async () => { $('sync-slack').disabled = true; try { const count = await window.petya.syncSlack(); await refreshContexts(); notice(count.message); } finally { $('sync-slack').disabled = false; } });
function displaySettings(settings) { for (const element of $('settings-form').elements) { if (element.name in settings && element.type !== 'checkbox') { if (element.tagName === 'SELECT' && settings[element.name] && ![...element.options].some(o => o.value === settings[element.name])) element.add(new Option('Сохранённый выбор · ' + settings[element.name], settings[element.name])); element.value = settings[element.name]; } if (element.type === 'checkbox' && element.name) element.checked = settings[element.name] === 'true'; } $('connection-state').textContent = `Slack: ${settings.hasSlackToken ? 'настроен' : 'не подключён'} · Jira: ${settings.hasJiraToken ? 'настроен' : 'не подключён'} · Notion: ${settings.hasNotionToken ? 'настроен' : 'не подключён'}`; document.dispatchEvent(new Event('petya-settings-displayed')); }
function collectSettings(){const form=$('settings-form');const data=Object.fromEntries(new FormData(form));for(const key of ['semanticTools','smartNotifications','interpretationEnabled','slackAutoSync','zoomAutoRecord','zoomCaptureMic'])if(form.elements[key])data[key]=String(form.elements[key].checked);for(const key of ['clear_slackToken','clear_jiraToken','clear_notionToken'])if(form.elements[key])data[key]=form.elements[key].checked;return data;}
// Settings save themselves: a change of a named field is saved shortly after, and a toast offers «Откатить».
(()=>{const form=$('settings-form');let timer=null,saving=Promise.resolve(),shown=null;
 document.addEventListener('petya-settings-displayed',()=>{try{shown=collectSettings();}catch{}});
 const save=()=>{clearTimeout(timer);timer=null;const previous=shown,data=collectSettings();saving=saving.then(async()=>{try{displaySettings(await window.petya.saveSettings(data));
   notice('Настройки сохранены',false,previous?{action:{label:'Откатить',run:async()=>{displaySettings(await window.petya.saveSettings({...previous,clear_slackToken:false,clear_jiraToken:false,clear_notionToken:false}));notice('Изменение отменено');}}}:{});}
  catch(error){notice('Не удалось сохранить: '+error.message,true);}});return saving;};
 const changed=event=>{const t=event.target;if(!t?.name||t.type==='search'||t.closest('[data-manual-save]'))return;clearTimeout(timer);timer=setTimeout(save,t.type==='checkbox'||t.tagName==='SELECT'?150:700);};
 form.addEventListener('change',changed);
 window.flushSettings=()=>timer?save():saving;
})();
$('settings-form').onsubmit = async event => {
 event.preventDefault();
 const form=$('settings-form'),button=form.querySelector('[type="submit"]');
 if(button.disabled)return;
 let feedback=form.querySelector('.settings-save-feedback');
 if(!feedback){feedback=document.createElement('p');feedback.className='small settings-save-feedback';feedback.setAttribute('role','status');button.after(feedback);}
 button.disabled=true;button.setAttribute('aria-busy','true');feedback.classList.remove('error');feedback.textContent='Сохраняю подключения…';
 try { displaySettings(await window.petya.saveSettings(collectSettings())); document.querySelectorAll('.connection-status').forEach(e => { e.textContent = 'Настройки сохранены · проверьте доступ заново'; e.className = 'connection-status'; }); feedback.textContent='Подключения сохранены.'; }
 catch(error){feedback.classList.add('error');feedback.textContent='Не удалось сохранить подключения: '+error.message;}
 finally{button.disabled=false;button.removeAttribute('aria-busy');}
};
$('cancel-draft').onclick = () => { automaticVoiceCommand = false; voiceReply = null; voiceTurn.reset(); currentDraft = null; $('draft-card').hidden = true; };
async function sendCurrentDraft() { if (!currentDraft) return; commandProgress.update('working', 'Создаю задачу в Jira'); $('send').disabled = true; $('cancel-draft').disabled = true; try { const issue = await window.petya.createIssue({ id: currentDraft.id, summary: $('draft-summary').value, description: $('draft-description').value }); $('issue-result').textContent = `${issue.key} · ${issue.url}`; notice(`Готово: задача ${issue.key} создана.`); commandProgress.update('done', `Задача ${issue.key} создана`); currentDraft = null; automaticVoiceCommand = false; await window.petya.notify(`Создана задача ${issue.key}`); if (issue.handoff) await handleDoHandoff(issue.handoff); if (issue.handoffError) { notice('Задача создана, но передача не подготовлена: '+issue.handoffError,true); await window.petya.requestAttention(); } } catch (error) { commandProgress.update('error', error.message); automaticVoiceCommand = false; voiceReply = null; if(currentDraft)window.offerJiraSubmissionCheck?.(currentDraft.id); throw error; } finally { $('cancel-draft').disabled = false; await refreshHistory(); } }
$('draft-form').onsubmit = run(sendCurrentDraft);
run(async () => { displaySettings(await window.petya.settings()); await refreshContexts(); })();
