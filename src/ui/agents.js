let agentBusy = false, agentDraftId = '';
function agentStatus(row) {
  const states = { submitted:'Задача отправлена в чат', submitting:'Отправка началась; проверьте чат перед повтором', 'project-required':'Нужно уточнить проект', routing: 'Задача создана · нужно выбрать агента', expired: 'Контекст удалён по сроку хранения', ready: 'Запрос готов к передаче', opening: 'Открытие началось; проверьте приложение перед повтором', 'send-required': 'Новый чат открыт. Нажмите отправку в приложении агента.', 'paste-required': 'Новый чат открыт. Полный запрос в буфере: вставьте его и нажмите отправку.', unknown: 'Результат открытия неизвестен. Проверьте приложение агента.', failed: 'Не удалось открыть приложение' };
  return `${row.target === 'auto' ? 'Выбор агента' : row.target === 'claude' ? 'Claude' : 'Codex'} · ${({completed:'Работа завершена',failed:'Ошибка выполнения',interrupted:'Работа прервана',inProgress:'В работе'})[row.executionState] || states[row.state] || row.state}${row.project ? ' · '+row.project.name : ''}${row.error ? ': ' + row.error : ''}`;
}
function showAgentDraft(row) { agentDraftId = row.id; $('agent-title').textContent = row.target === 'claude' ? 'Передать Claude' : 'Передать Codex'; $('agent-prompt').value = row.prompt; $('agent-draft').hidden = false; view('agents'); }
async function prepareAgent(context) {
  if (agentBusy) return; agentBusy = true;
  try { notice('Собираю обсуждение и документацию для агента…'); const row = await window.petya.prepareAgent(commandSnapshot, context.id); $('resolution').hidden = true; await handleDoHandoff({record:await window.petya.openAgent(row.id,row.prompt),ready:true}); }
  finally { agentBusy = false; }
}
async function refreshAgents() {
  const rows = await window.petya.agentHistory(); $('agent-history').replaceChildren();if(!rows.length)$('agent-history').textContent='Пока нет переданных задач. Нажмите «Передать задачу», чтобы подготовить запрос Claude или Codex.';
  for (const row of rows) {
    const card = document.createElement('article'); card.className = 'card';
    const title = document.createElement('h2'); title.textContent = agentStatus(row);
    const meta = document.createElement('p'); meta.textContent = window.relativeTime(row.at) + ' · ' + (row.keys.join(', ') || 'По обсуждению');
    const details = document.createElement('details'), summary = document.createElement('summary'), body = document.createElement('textarea'); summary.textContent = 'Переданный контекст'; body.readOnly = true; body.rows = 10; body.value = row.prompt; details.append(summary, body); card.append(title, meta, details);
    if(row.state!=='expired'){const check=document.createElement('button');check.textContent='Проверить результат';check.onclick=run(async()=>{check.disabled=true;try{const result=await window.petya.taskProgress(row.id);view('home');await showDialogueReply(result);await refreshAgents();}finally{check.disabled=false;}});card.append(check);}
    if(row.url){const open=document.createElement('button');open.textContent='Открыть чат';open.onclick=run(()=>window.petya.agentChat(row.id));card.append(open);}
    if (row.state === 'project-required') { const choose=document.createElement('button');choose.textContent='Выбрать проект';choose.onclick=run(()=>handleDoHandoff({record:row,ready:true}));card.append(choose); }
    if (row.state === 'routing') { const resume = document.createElement('button'); resume.textContent = 'Продолжить передачу'; resume.onclick = run(async()=>handleDoHandoff(await window.petya.routeAgent(row.id))); card.append(resume); }
    if (['ready', 'failed'].includes(row.state)) { const edit = document.createElement('button'); edit.textContent = 'Продолжить передачу'; edit.onclick = () => showAgentDraft(row); card.append(edit); }
    $('agent-history').append(card);
  }
}
$('launch-agent').onclick = run(async () => {
  if (agentBusy) return; agentBusy = true; $('launch-agent').disabled = true;
  try { const row = await window.petya.openAgent(agentDraftId, $('agent-prompt').value); $('agent-draft').hidden = true; await handleDoHandoff({record:row,ready:true}); }
  finally { agentBusy = false; $('launch-agent').disabled = false; await refreshAgents(); }
});
$('close-agent').onclick = () => { if (!agentBusy) $('agent-draft').hidden = true; };
$('refresh-agents').onclick = run(refreshAgents);
const aiCard = document.createElement('article'); aiCard.className = 'card'; aiCard.dataset.service = 'ai';
const aiTitle = document.createElement('h2'); aiTitle.textContent = 'ИИ';
const aiHelp = document.createElement('p'); aiHelp.textContent = 'Передача задач в приложения Claude и Codex. Вход выполняется в самих приложениях.';
const aiStatus = document.createElement('p'); aiStatus.className = 'connection-status'; aiStatus.textContent = 'Приложения не проверены';
aiCard.append(aiTitle, aiHelp, aiStatus);
const smartSetting=document.createElement('label');smartSetting.className='check';smartSetting.innerHTML='<input type="checkbox" name="smartNotifications">Сообщать об изменениях поручений: готово, ошибка или требуется решение';aiCard.append(smartSetting);window.petya.settings().then(s=>smartSetting.querySelector('input').checked=s.smartNotifications!=='false');

const interpretationSettings=document.createElement('div');interpretationSettings.innerHTML='<label class="check"><input type="checkbox" name="interpretationEnabled">Спрашивать Claude/Codex, если Петя не понял</label><label>Помощник для разъяснений<select name="interpretationProvider"><option value="auto">Автоматически</option><option value="claude">Claude</option><option value="codex">Codex</option></select></label><p class="small">Помощник получает неясную фразу и до четырёх последних реплик текущей темы (до 3000 символов). Возвращается только объяснение, без выполнения задач. Требуется CLI с выполненным входом; одного приложения Claude недостаточно.</p>';aiCard.append(interpretationSettings);
window.petya.settings().then(s=>{interpretationSettings.querySelector('input').checked=s.interpretationEnabled!=='false';interpretationSettings.querySelector('select').value=s.interpretationProvider||'auto';});

if(window.petyaPlatform==='darwin'){const access=document.createElement('button');access.type='button';access.textContent='Разрешить отправку в Claude';access.onclick=run(()=>window.petya.agentAccess());aiCard.append(access);}

for (const target of ['claude', 'codex']) {
  const section = document.createElement('div'); section.dataset.aiProvider = target;
  const title = document.createElement('h3'); title.textContent = target === 'claude' ? 'Claude' : 'Codex';
  const status = document.createElement('p'); status.className = 'connection-status'; status.textContent = 'Приложение не проверено';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Проверить ' + title.textContent;
  button.onclick = run(async () => { button.disabled = true; status.textContent = 'Проверяю приложение…'; status.className = 'connection-status'; try { const result = await window.petya.checkSavedConnection(target); status.textContent = result.message; status.className = 'connection-status ' + result.state; } catch (e) { status.textContent = e.message; status.className = 'connection-status error'; } finally { button.disabled = false; updateAIStatus(); } });
  section.append(title, status, button); aiCard.append(section);
}
function updateAIStatus() {
  const states = [...aiCard.querySelectorAll('[data-ai-provider] .connection-status')];
  const ready = states.filter(s => s.classList.contains('connected')).length;
  aiStatus.textContent = ready ? `Доступно приложений: ${ready} из 2` : states.some(s => /Проверяю|Checking/.test(s.textContent)) ? 'Проверяю приложения…' : 'Приложения не подключены';
  aiStatus.className = 'connection-status ' + (ready ? 'connected' : states.some(s => s.classList.contains('error')) ? 'error' : 'disconnected');
}
$('settings-form').insertBefore(aiCard, $('settings-form').querySelector(':scope > button'));

async function handleDoHandoff(result) {
  const row=result.record;
  if (row.state==='project-required') {
    routePanel.replaceChildren();routePanel.hidden=false;
    const title=document.createElement('h2');title.textContent='В какой проект передать задачу?';routePanel.append(title);
    const reason=document.createElement('p');reason.textContent=row.error;routePanel.append(reason);
    const choices=(row.projectOptions||[]).map(p=>({label:p.name,names:[p.name],run:async()=>handleDoHandoff(await window.petya.agentProject(row.id,p.id))}));
    for(const choice of choices){const b=document.createElement('button');b.textContent=choice.label;b.onclick=run(choice.run);routePanel.append(b);}
    const retry=document.createElement('button');retry.textContent='Обновить проекты';retry.onclick=run(async()=>handleDoHandoff({record:await window.petya.openAgent(row.id),ready:true}));routePanel.append(retry);
    const defer=document.createElement('button');defer.textContent='Отложить';defer.onclick=()=>{routePanel.hidden=true;voiceReply=null;automaticVoiceCommand=false;notice('Задача сохранена. Продолжить можно в разделе «Агенты».');};routePanel.append(defer);
    if(choices.length)askVoiceChoices(reason.textContent,choices);
    await window.petya.requestAttention();await window.petya.notify('Нужно уточнить проект для '+(row.target==='claude'?'Claude':'Codex'));await refreshAgents();return;
  }
  if (result.ready) {voiceReply=null;automaticVoiceCommand=false;routePanel.hidden=true;notice(agentStatus(row));await window.petya.notify(agentStatus(row));await refreshAgents();return;}
  if (result.deferred) {voiceReply=null;automaticVoiceCommand=false;routePanel.hidden=true;notice('Передача отложена. Задача сохранена; продолжить можно в разделе «Агенты».');await refreshAgents();return;}
  routePanel.replaceChildren();routePanel.hidden=false;
  const title=document.createElement('h2');title.textContent='Задача '+row.keys.join(', ')+' создана. Кому передать?';
  const reason=document.createElement('p');reason.textContent=result.reason||'Не удалось определить лимиты агента.';routePanel.append(title,reason);
  const choices=(result.options||[]).map(option=>({label:option.label,names:[option.label,option.id,option.id==='claude'?'Клоду':option.id==='codex'?'Кодексу':'Отложить'],run:async()=>{routePanel.querySelectorAll('button').forEach(b=>b.disabled=true);try{await handleDoHandoff(await window.petya.routeAgent(row.id,option.id));}finally{routePanel.querySelectorAll('button').forEach(b=>b.disabled=false);}}}));
  for(const choice of choices){const b=document.createElement('button');b.type='button';b.textContent=choice.label;b.onclick=run(choice.run);routePanel.append(b);}
  if(!result.options?.some(o=>o.id==='claude'||o.id==='codex')){const settings=document.createElement('button');settings.type='button';settings.textContent='Подключить Claude / Codex';settings.onclick=()=>view('settings');routePanel.append(settings);}
  if(!choices.length){const b=document.createElement('button');b.type='button';b.textContent='Открыть историю передачи';b.onclick=()=>view('agents');routePanel.append(b);}
  if (choices.length) {automaticVoiceCommand=true;askVoiceChoices(reason.textContent,choices);} else {automaticVoiceCommand=false;voiceReply=null;await window.petya.requestAttention();await window.petya.notify(reason.textContent);}
  await refreshAgents();
}
