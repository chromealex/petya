const fs = require('fs');
module.exports = async (win, workspace) => {
  await require('./local-project-ui.cjs')(win);
  await require('./microphone-picker-ui.cjs')(win);
  await require('./slack-help-ui.cjs')(win);
  win.webContents.send('navigate','sources');
  for(let attempt=0;attempt<50;attempt++){
    if(await win.webContents.executeJavaScript("!document.getElementById('sources').hidden"))break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  if(!await win.webContents.executeJavaScript("!document.getElementById('sources').hidden"))throw Error('Tray navigation failed');
  await win.webContents.executeJavaScript("view('home')");

  await require('./team-fill-ui.cjs')(win);
  await require('./slack-request-ui.cjs')(win);
  await require('./ux-review-ui.cjs')(win);
  await require('./ui-layout.cjs')(win);
  await require('./command-progress-ui.cjs')(win);
  await require('./voice-diagnostics-ui.cjs')(win);
  await require('./current-question-ui.cjs')(win);
  await require('./project-catalog-ui.cjs')(win);
  await win.webContents.executeJavaScript(`(async () => {
    await modulesReady;
    if(!$('microsoft-start')||!$('mail-cancel')||!$('tg-connect')||!$('tg-phone-step').hidden)throw Error('Missing simplified connection UI');
    if((await window.petya.settings()).microsoftCredential)throw Error('Microsoft tokens exposed');
    const mailStatus=await window.petya.gmailStatus();if(!mailStatus.microsoft||mailStatus.microsoft.connected)throw Error('Unexpected fresh mail provider state');
    const previousWeb=(await window.petya.settings()).module_web;await window.petya.saveSettings({module_web:'false'});
    try{await window.petya.attachmentAdd('private.abc',new TextEncoder().encode('sample').buffer);throw Error('Unknown format should request web access');}catch(e){if(!e.message.includes('поиск'))throw e;}
    await refreshFormats();if(!$('format-pending').textContent.includes('Включить поиск'))throw Error('Missing format learning retry');
    await window.petya.formatCancel();if((await window.petya.formatStatus()).pending)throw Error('Pending format not cleared');await window.petya.saveSettings({module_web:previousWeb});

    const accessOffer=await window.petya.converse('Прочитай Telegram');if(!accessOffer.integrationOffers?.length)throw Error('Missing integration proposal');
    const browserChoice=await window.petya.integrationChoice(accessOffer.integrationOffers[0].id,'browser');if(!browserChoice.serviceBrowser)throw Error('Missing browser fallback');
    if(JSON.parse((await window.petya.settings()).integrationChoices).telegram!=='browser')throw Error('Browser refusal not persisted');
    const rememberedBrowser=await window.petya.converse('Прочитай Telegram');if(rememberedBrowser.integrationOffers||!rememberedBrowser.serviceBrowser)throw Error('Refused integration offered again');
    await window.petya.integrationReset('telegram');

    if(!document.getElementById('attachment-sources'))throw Error('Media sources picker missing');
    if((await window.petya.attachmentSources()).length)throw Error('Fresh company should not expose media');
    if(!document.getElementById('tg-start'))throw Error('Telegram UI missing');
    const tgStatus=await window.petya.telegramStatus();if(tgStatus.connected)throw Error('Telegram should be disconnected in fresh profile');
    try{await window.petya.telegramSync();throw Error('Disabled Telegram accessed');}catch(e){if(!e.message.includes('Включите'))throw e;}
    if((await window.petya.settings()).telegramCredential)throw Error('Telegram credential exposed');
    const initialCompanies=await window.petya.companies();if(initialCompanies.activeId!=='default')throw Error('Missing default company');
    const companySettings=await window.petya.settings();if(companySettings.companyId!==initialCompanies.activeId||companySettings.companyName!==initialCompanies.companies[0].name)throw Error('Settings company scope missing');
    if(document.querySelector('#company-tabs [aria-current]')?.dataset.companyId!==initialCompanies.activeId)throw Error('Active company tab missing');
    $('company-new-name').value='Smoke company';$('company-create-form').requestSubmit();
    for(let i=0;i<100&&!document.querySelectorAll('#company-tabs button')[1];i++)await new Promise(r=>setTimeout(r,20));
    const otherCompany=(await window.petya.companies()).companies.find(c=>c.name==='Smoke company');
    if(!otherCompany||![...document.querySelectorAll('#company-tabs button')].some(b=>b.dataset.companyId===otherCompany.id))throw Error('New company tab missing');
    $('settings-form').dispatchEvent(new Event('input',{bubbles:true}));
    [...document.querySelectorAll('#company-tabs button')].find(b=>b.dataset.companyId===otherCompany.id).click();
    await new Promise(r=>setTimeout(r,20));
    if(!document.getElementById('notice').textContent.includes('Сохраните изменения'))throw Error('Company tab lost unsaved changes guard');
    if((await window.petya.companies()).activeId!==initialCompanies.activeId)throw Error('Blocked tab changed company');
    document.dispatchEvent(new Event('petya-settings-displayed'));
    await window.petya.companyRename(otherCompany.id,'Second company');
    if(!(await window.petya.companies()).companies.some(c=>c.name==='Second company'))throw Error('Company rename failed');
    let switchCheck;for(let attempt=0;attempt<300;attempt++){try{switchCheck=await window.petya.companySwitch(otherCompany.id);break;}catch(error){if(!error.message.includes('завершает текущую операцию')||attempt===299)throw error;await new Promise(resolve=>setTimeout(resolve,100));}}if(!switchCheck.testOnly)throw Error('Smoke must not restart the real app');
    if((await window.petya.companies()).activeId!=='default')throw Error('Smoke changed actual company');
    document.getElementById('company-manage').click();if(document.getElementById('companies').hidden)throw Error('Company UI missing');

    document.querySelector('[data-view="team"]').click();
    for(let i=0;i<100&&document.getElementById('team-add').disabled;i++)await new Promise(r=>setTimeout(r,20));
    if(document.getElementById('team').hidden||document.getElementById('team-add').disabled)throw Error('Team tab failed to load');
    document.getElementById('team-add').click();
    const teamCard=document.querySelector('#team-list article');
    teamCard.querySelector('[data-field="name"]').value='Полина';
    teamCard.querySelector('[data-field="responsibilities"]').value='Релизные сборки Android';
    document.getElementById('team-form').requestSubmit();
    for(let i=0;i<100&&!document.getElementById('team-status').textContent.includes('Команда сохранена');i++)await new Promise(r=>setTimeout(r,20));
    if((await window.petya.teamList()).members[0]?.name!=='Полина')throw Error('Team UI did not save');
    await window.petya.saveSettings({model:''});
    if((await window.petya.teamList()).members[0]?.responsibilities!=='Релизные сборки Android')throw Error('Unrelated settings overwrote team');
    await window.petya.teamSave({members:[],notes:''});
    if((await window.petya.teamList()).members.length)throw Error('Team removal failed');
    view('home');

    if (document.querySelectorAll('[data-module]').length !== 10) throw new Error('Missing module selection');
    const repairDisabled=await window.petya.converse('Почини падающую сборку');if(!repairDisabled.text.includes('Включите модуль Claude'))throw Error('Repair must require an enabled executor');
    const buildQuestionDisabled=await window.petya.converse('Петя, что с билдом');if(!buildQuestionDisabled.integrationOffers?.some(o=>o.service==='slack'))throw Error('Build question should offer Slack connection or browser');
    if (!document.getElementById('attachment-pick')) throw new Error('Missing attachments UI');
    const attachment = await window.petya.attachmentAdd('smoke.txt',new TextEncoder().encode('Проверочный документ: версия 42.').buffer);
    const previous = await window.petya.settings();await window.petya.saveSettings({model:''});
    const attachmentReply = await window.petya.attachmentInspect([attachment.id],'Что в файле?');
    const attachmentTopic = await window.petya.attachmentTopic();if(!attachmentReply.messages?.[0]?.attachments?.some(f=>f.name==='smoke.txt'))throw Error('Sent message lost its attachment');if(!attachmentTopic?.files.some(f=>f.name==='smoke.txt')) throw new Error('Attachment topic not saved');
    const reviewFile=await window.petya.attachmentAdd('build.log',new TextEncoder().encode('Android build 123\\nError: Cannot find module ./modules.cjs').buffer);
    const reviewTopic=await window.petya.attachmentInspect([reviewFile.id],'Почему падает?');
    const proof=await window.petya.converse('Покажи, откуда ты это взял');await showDialogueReply(proof);
    if(!dialogueMessages.querySelector('mark')?.textContent.includes('Cannot find module'))throw Error('Evidence highlight missing');
    const lesson=await window.petya.converse('Запомни: у нас это чинится вот так — добавить модуль в сборку');if(!lesson.text.includes('Для какого проекта'))throw Error('Lesson scope not requested');
    await window.petya.converse('для проекта Smoke');
    const lessons=await window.petya.converse('покажи сохранённые решения');if(!lessons.text.includes('Smoke'))throw Error('Lesson was not persisted');
    await window.petya.converse('забудь решение 1');
    const watch=await window.petya.converse('следи за этим билдом');if(!watch.text.includes('точная ссылка'))throw Error('Watch must require an actual thread');
    await window.petya.attachmentForget(reviewTopic.topicId);
    await window.petya.attachmentForget(attachmentReply.topicId);if(await window.petya.attachmentTopic()) throw new Error('Attachment deletion failed');
    await window.petya.saveSettings({model:previous.model});

    if (!document.getElementById('mail-skill-form') || !document.getElementById('gmail-start')) throw new Error('Missing Gmail teaching UI');
    const mailSkill = await window.petya.mailSkillSave({name:'Smoke Gmail',phrases:['smoke mail']});
    if (!(await window.petya.mailSkills()).recipes.some(r=>r.id===mailSkill.id)) throw new Error('Mail skill not persisted');
    await window.petya.mailSkillDelete(mailSkill.id);
    if ((await window.petya.settings()).gmailCredential) throw new Error('Gmail credential exposed');

    if (!document.querySelector('[data-service=asana]').hidden) throw new Error('Optional module visible by default');
    const disabled = await window.petya.checkSavedConnection('jira');
    if (disabled.state !== 'disabled') throw new Error('Disabled module checked');
    renderModules(await window.petya.saveSettings({module_asana:'true'}));
    if (document.querySelector('[data-service=asana]').hidden) throw new Error('Enabled module hidden');
    renderModules(await window.petya.saveSettings({module_asana:'false'}));
    if (document.querySelector('aside nav [data-view=asana]')) throw new Error('Asana must not appear in main navigation');
    renderModules(await window.petya.saveSettings(Object.fromEntries(optionalModules.map(([id]) => ['module_'+id, 'true']))));
  })()`);
  await win.webContents.executeJavaScript(`(async()=>{
    const r=await window.petya.dictionarySave({from:'проверка отката',to:'проверочное значение'});
    const info=await window.petya.undoInfo();const undone=await window.petya.undoLast(info.id);
    if(!undone.text.includes('Отменено'))throw new Error('Undo not applied');
    if((await window.petya.learningList()).dictionary.some(v=>v.id===r.id))throw new Error('Undo did not remove rule');
    const brief=await window.petya.converse('Что у нас сегодня?');if(!brief.text.includes('сохранённым данным'))throw new Error('Daily brief missing');
    if(!$('settings-form').elements.smartNotifications)throw new Error('Notification setting missing');
  })()`);
  await require('./ollama-install-ui.cjs')(win);
  let created = 0, tick = 0; const issues = new Map();
  workspace.settings = () => ({ jiraUrl: 'https://test.atlassian.net', jiraEmail: 'test@example.com', jiraToken: 'fixture', jiraProject: 'TEST', jiraIssueType: '10001', notionToken: 'notion-fixture', model: 'fixture', ollamaUrl: 'http://localhost:11434/api/chat' });
  workspace.request = async (address, options = {}) => {
    const url = new URL(address);
    if (url.hostname === 'api.notion.com') {
      if (url.pathname === '/v1/search') return { results: [{ id: 'abc-123', object: 'page', properties: { Name: { type: 'title', title: [{ plain_text: 'Требования к входу' }] } } }] };
      return { results: [{ id: 'b1', type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'После пяти ошибок заблокировать код.' }] } }] };
    }
    if (url.pathname === '/rest/api/3/search/jql') return {issues:[],isLast:true};
    if (url.pathname === '/rest/api/3/project/search') return { values: [{key:'TEST',name:'Тестовый проект'}, {key:'OTHER',name:'Другой проект'}], isLast:true };
    if (['/rest/api/3/project/TEST', '/rest/api/3/project/OTHER'].includes(url.pathname)) return { issueTypes: [{id:'10001',name:'Task'}] };
    if (url.pathname === '/rest/api/3/myself') return { accountId: 'user-1', displayName: 'Иван Петров' };
    if (url.pathname === '/rest/agile/1.0/board') return { values: [{ id: 1, name: 'Команда продукта' }], isLast: true };
    if (url.pathname.endsWith('/versions')) return [{ id: '7', name: '1.2.0', released: false }];
    if (url.pathname.endsWith('/sprint')) return { values: [{ id: 11, name: 'Sprint 11', state: 'active' }], isLast: true };
    if (url.pathname.endsWith('/user/assignable/search')) return [{ accountId: 'user-1', displayName: 'Иван Петров', active: true }];
    if (url.pathname.includes('/wiki/')) return { results: [{ id: '5', title: 'Авторизация по email', body: { storage: { value: '<p>Код действует 10 минут. Повторная отправка через 60 секунд.</p>' } } }] };
    if (url.pathname === '/api/chat' && JSON.parse(options.body).messages[0].content.includes('Исправь задачи')) return { message: { content: JSON.stringify({ changes: [{ key: 'TEST-1', summary: 'API кода с защитой от перебора' }], questions: [] }) } };
    if (url.pathname === '/api/chat') return { message: { content: JSON.stringify({ tasks: [{ summary: 'API одноразового кода', description: 'Реализовать проверку кода и срока жизни.', assigneeId: 'user-1', dependsOn: [] }, { summary: 'Экран ввода кода', description: 'Показать таймер повторной отправки.', assigneeId: 'user-1', dependsOn: [0] }], questions: [] }) } };
    if (url.pathname === '/rest/api/3/issue') { const key = 'TEST-' + ++created; const fields = JSON.parse(options.body).fields; issues.set(key, { fields: { ...fields, project: { key: 'TEST' }, updated: String(++tick), subtasks: [], status: { id: '1' } }, sprint: null }); return { key }; }
    if (url.pathname === '/rest/agile/1.0/sprint/11/issue') { for (const key of JSON.parse(options.body).issues) { issues.get(key).sprint = { id: 11, name: 'Sprint 11', state: 'active' }; issues.get(key).fields.updated = String(++tick); } return null; }
    if (url.pathname.includes('/issue/TEST-')) { const issue = issues.get(url.pathname.split('/').pop()); if (options.method === 'PUT') { Object.assign(issue.fields, JSON.parse(options.body).fields); issue.fields.updated = String(++tick); return null; } return JSON.parse(JSON.stringify(url.pathname.includes('/agile/') ? { fields: { sprint: issue.sprint } } : issue)); }
    throw new Error('Unexpected smoke URL ' + address);
  };
  const originalSettings = workspace.settings;
  workspace.settings = () => ({...originalSettings(), jiraProjects:'TEST,OTHER'});
  await win.webContents.executeJavaScript(`(async () => {
    await window.petya.addContext({source:'Заметка',title:'Форма входа',text:'Исправить форму входа и проверку пароля'});
    const plan = await window.petya.plan('Создай задачу про форму входа', Date.now());
    commandSnapshot = 'Создай задачу про форму входа'; currentIntent = 'jira';
    await makeDraft(plan.options[0]);
    if (routePanel.hidden || currentDraft) throw new Error('Ambiguous project was silently selected');
    const other = [...routePanel.querySelectorAll('button')].find(b => b.textContent.includes('(OTHER)'));
    if (!other) throw new Error('Missing contextual project clarification');
    other.click();
    for (let i=0; i<150 && !currentDraft; i++) await new Promise(r => setTimeout(r,20));
    if (currentDraft?.project !== 'OTHER' || !$('issue-result').textContent.includes('OTHER')) throw new Error('Clarified project not bound to preview');
    if (!$('settings-form').elements.jiraProject.closest('label').hidden) throw new Error('Global project still visible');
    $('cancel-draft').click(); await window.petya.clearContexts();
  })()`);
  workspace.settings = originalSettings;
  const result = await win.webContents.executeJavaScript(`(async () => {
    await startupConnectionCheck;
    if (!document.querySelector('[data-service=ai]') || document.querySelectorAll('[data-ai-provider]').length !== 2) throw new Error('Missing unified AI connection');
    if (document.querySelector('[data-service=slack] .connection-status').textContent.includes('проверка не выполнена')) throw new Error('Startup check not run');
    const preferences = await window.petya.settings();
    if (preferences.contextDays !== '7' || preferences.zoomAutoRecord !== 'false') throw new Error('Unsafe monitoring defaults');
    displaySettings(preferences);
    if ($('settings-form').elements.contextDays.value !== '7' || !$('settings-form').elements.zoomCaptureMic.checked) throw new Error('Monitoring preferences not rendered');
    await window.petya.saveSettings({ contextDays: '3', slackAutoSync: 'false', zoomAutoRecord: 'false' });
    if ((await window.petya.settings()).contextDays !== '3') throw new Error('Retention not saved');
    await window.petya.addContext({ source: 'Zoom', title: 'Вход по одноразовому коду', text: 'Обсудили вход по email. Код действует 10 минут. Нужна защита от повторной отправки.' });
    await window.petya.addContext({ source: 'Slack', title: 'Поиск в списке проектов', text: 'Добавить поиск по названию и фильтрацию архивных проектов.' });
    await refreshContexts();
    await processCommand('Петя, заведи таску в Jira для реализации этой фичи');
    if (document.querySelectorAll('.choice').length !== 2) throw new Error('Expected clarification choices');
    const plan = await window.petya.plan('создай задачу', Date.now());
    await makeDraft(plan.options[0]);
    const explanation=await window.petya.converse('Почему выбрал этот проект?');if(!explanation.text.includes('Источник контекста'))throw new Error('Routing explanation missing');
    if ($('draft-card').hidden || !$('draft-summary').value || !$('draft-description').value) throw new Error('Missing editable draft');
    $('cancel-draft').click();
    if (!$('draft-card').hidden) throw new Error('Cancel failed');
    await processCommand('Петя, заведи таску для этой фичи');
    await openWorkspace(plan.options[0]);
    if (document.querySelectorAll('.doc-check').length !== 2) throw new Error('Missing documents');
    document.querySelectorAll('.doc-check').forEach(c => c.checked = true);
    if (!$('docs-list').textContent.includes('Notion')) throw new Error('Missing Notion source');
    await decompose();
    if (document.querySelectorAll('.task-editor').length !== 2) throw new Error('Missing task editors');
    if (!$('batch-version').value || !$('batch-sprint').value) throw new Error('Missing planning metadata');
    await sendBatch();
    const history = await window.petya.batchHistory();
    if (!history[0].rows.every(r => r.state === 'done')) throw new Error('Batch did not complete');
    view('settings');
    for(const service of [...optionalModules.map(([id])=>id),'zoom','localproject'])if(!document.querySelector('[data-service="'+service+'"]'))throw new Error('Missing connection card: '+service);
    if (document.querySelector('aside nav [data-view=asana]') || !$('asana')) throw new Error('Unexpected Asana navigation or missing workspace');
    const notionCard = document.querySelector('[data-service="notion"]');
    if (notionCard.querySelector('.actions .primary').textContent !== 'Подключить Notion') throw new Error('Missing browser sign-in');
    if (notionCard.querySelector('.connection-options details').open) throw new Error('Manual credentials should be collapsed');
    notionCard.querySelector('.settings-disclosure').open = true;
    notionCard.querySelector('.connection-options').open = true;
    await window.petya.saveSettings({slackCredential:'forged', notionCredential:'forged',atlassianCredential:'forged'});
    const guarded=await window.petya.settings();
    if(guarded.slackCredential || guarded.notionCredential || guarded.atlassianCredential || guarded.hasSlackOAuth || guarded.hasNotionOAuth || guarded.hasAtlassianOAuth) throw new Error('Renderer injected OAuth credentials');
    $('settings-form').elements.notionToken.value = 'fixture-secret';
    notionCard.querySelector('.connection-options > button.primary').click();
    for (let i = 0; i < 150 && notionCard.querySelector('.connection-options > button.primary').disabled; i++) await new Promise(r => setTimeout(r, 20));
    if (!notionCard.querySelector('.connection-status').textContent.startsWith('Подключено')) throw new Error('Connection check failed');
    const publicSettings = await window.petya.settings();
    if (publicSettings.notionToken || !publicSettings.hasNotionToken) throw new Error('Token storage failed or secret exposed');
    view('history');
    let card = document.querySelector('.history-entry');
    card.querySelector('.history-editor').open = true;
    card.querySelector('textarea').value = 'Добавь защиту от перебора в название первой задачи';
    card.querySelector('.actions .primary').click();
    for (let i = 0; i < 150 && (workspaceBusy || !card.querySelector('.history-preview .primary')); i++) await new Promise(r => setTimeout(r, 20));
    if (!card.querySelector('.history-preview').textContent.includes('API кода с защитой')) throw new Error('Missing edit preview');
    card.querySelector('.history-preview .primary').click();
    for (let i = 0; i < 150 && workspaceBusy; i++) await new Promise(r => setTimeout(r, 20));
    const edited = (await window.petya.batchHistory())[0];
    if (edited.operations[0].rows[0].state !== 'done') throw new Error('History edit failed');
    card = document.querySelector('.history-entry');
    card.querySelector('.history-operation').open = true;
    card.querySelector('.history-operation button').click();
    for (let i = 0; i < 150 && (workspaceBusy || !card.querySelector('.history-preview .primary')); i++) await new Promise(r => setTimeout(r, 20));
    card.querySelector('.history-preview .primary').click();
    for (let i = 0; i < 150 && workspaceBusy; i++) await new Promise(r => setTimeout(r, 20));
    const reverted = (await window.petya.batchHistory())[0];
    if (!reverted.operations[0].rows[0].undone || reverted.rows[0].title !== 'API одноразового кода') throw new Error('History undo failed');
    document.querySelector('.history-entry details').open = true;
    const agentPlan = await window.petya.plan('заведи клоду задачу для этой фичи', Date.now());
    if (agentPlan.intent !== 'agent') throw new Error('Agent routed to Jira');
    const prepared = await window.petya.prepareAgent('заведи клоду задачу для этой фичи', agentPlan.options[0].id);
    if (!prepared.prompt.includes('Notion') || !prepared.prompt.includes('Обсуждение')) throw new Error('Agent missing context');
    showAgentDraft(prepared); await refreshAgents();
    if ($('agent-draft').hidden || !$('agent-prompt').value) throw new Error('Agent preview missing');
    const opened = await window.petya.openAgent(prepared.id, prepared.prompt);
    if (opened.state!=='submitted') throw new Error('Incorrect handoff state');
    await window.petya.bindAgentBatch(history[0].id, 'заведи таски в жира, все которые на меня отдай кодексу', agentPlan.options[0].id, []);
    const transfer = await window.petya.handoffBatch(history[0].id);
    if (transfer.record.keys.length !== 2 || !transfer.record.prompt.includes('TEST-1')) throw new Error('Compound handoff missing tasks');
    const retried = await window.petya.handoffBatch(history[0].id);
    if (retried.record.id !== transfer.record.id) throw new Error('Duplicate handoff');
    view('history');
    return { title: document.title, choices: document.querySelectorAll('.choice').length };
  })()`);
  if (result.title !== 'Петя' || result.choices !== 2) throw new Error(JSON.stringify(result));
  await win.webContents.executeJavaScript(`new Promise(resolve => { $('history').scrollIntoView({ behavior: 'instant', block: 'start' }); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`);
  const beforeDo = created;
  await win.webContents.executeJavaScript(`(async()=>{
    currentDraft=null;frozenBatch=null;workspaceBusy=false;planning=false;agentBusy=false;
    await window.petya.saveSettings({jiraUrl:'https://test.atlassian.net',jiraEmail:'test@example.com',jiraToken:'fixture',module_jira:'true',module_ai:'true'});
    const plan=await window.petya.plan('делай',Date.now());
    if(plan.intent!=='do')throw new Error('Do shortcut not recognized');
    commandSnapshot='делай';currentIntent='do';automaticVoiceCommand=true;
    await makeDraft(plan.options[0]);
    const records=await window.petya.agentHistory();const handoff=records.find(r=>r.target==='auto'&&r.state==='routing');
    if(!handoff || !handoff.keys.length || !handoff.prompt.includes(handoff.keys[0]))throw new Error('Task was not bound to durable handoff');
    if(routePanel.hidden || !routePanel.textContent.includes('Codex'))throw new Error('Unknown quota did not offer choices');
    const routed=await window.petya.routeAgent(handoff.id,'codex');await handleDoHandoff(routed);
    if(routed.record.target!=='codex'||routed.record.state!=='submitted')throw new Error('Codex handoff failed');
    await window.petya.routeAgent(handoff.id,'claude');
    if((await window.petya.agentHistory()).find(r=>r.id===handoff.id).target!=='codex')throw new Error('Duplicate cross-agent handoff');
  })()`);
  if(created!==beforeDo+1)throw new Error('Do command created duplicate tasks');
  const beforeExplicit = created;
  await win.webContents.executeJavaScript(`(async()=>{
    currentDraft=null;frozenBatch=null;workspaceBusy=false;planning=false;agentBusy=false;
    const plan=await window.petya.plan('делай через Claude',Date.now());
    if(plan.intent!=='do')throw new Error('Explicit executor lost do intent');
    commandSnapshot='делай через Claude';currentIntent='do';automaticVoiceCommand=true;
    await makeDraft(plan.options[0]);
    const record=(await window.petya.agentHistory())[0];
    if(record.target!=='claude'||record.state!=='submitted')throw new Error('Explicit Claude was not selected');
  })()`);
  if(created!==beforeExplicit+1)throw new Error('Explicit executor task count');
  const previousCreated = created;
  await win.webContents.executeJavaScript(`(async()=>{
    currentDraft=null;frozenBatch=null;workspaceBusy=false;planning=false;agentBusy=false;
    await window.petya.saveSettings({jiraUrl:'https://test.atlassian.net',jiraEmail:'test@example.com',jiraToken:'fixture',module_jira:'true'});
    const plan=await window.petya.plan('создай задачу: одноразовый код входа',Date.now());
    commandSnapshot='создай задачу: одноразовый код входа';currentIntent='work';automaticVoiceCommand=true;
    await makeDraft(plan.options[0]);
    if(currentDraft || !$('issue-result').textContent.includes('TEST-')) throw new Error('Voice command did not create a task automatically');
    automaticVoiceCommand=false;
  })()`);
  if (created !== previousCreated + 1) throw new Error('Automatic task duplicated or not created');
  await win.webContents.executeJavaScript(`(async()=>{
    if(!$('settings-form').elements.interpretationEnabled)throw new Error('Missing interpreter setting');
    const saved=await window.petya.saveSettings({interpretationEnabled:'false'});
    if(saved.interpretationEnabled!=='false')throw new Error('Interpreter setting not saved');
    const result=await window.petya.interpret('Неясная фраза','');
    if(!result.text.includes('Переформулируйте'))throw new Error('Disabled interpreter invoked');
    await window.petya.saveSettings({interpretationEnabled:'true'});
    const unavailable=await window.petya.interpret('Неясная фраза','');
    if(!unavailable.text.includes('CLI'))throw new Error('Missing CLI not explained');
  })()`);
  const beforeDialogue=created;
  await win.webContents.executeJavaScript(`(async()=>{
    currentDraft=null;frozenBatch=null;workspaceBusy=false;planning=false;agentBusy=false;
    await processCommand('Как думаешь, стоит ли создавать задачу?');
    const conversationTopic=(await window.petya.dialogueTopics()).activeId;
    if(!dialogueMessages.textContent.includes('Петя:'))throw new Error('No conversational reply');
    await processCommand('посмотри anr в гугл плее');
    const state=await window.petya.dialogueTopics();
    if(!state.topics.length)throw new Error('Conversation topic lost');
    if(!dialogueMessages.textContent.includes('Google Play Console не подключён')||!dialogueChoices.textContent.includes('Без интеграции: браузер'))throw new Error('Missing access must offer integration or browser, not invent ANR');
    await selectDialogueTopic(conversationTopic);
    if(!dialogueMessages.textContent.includes('Как думаешь'))throw new Error('Topic history not restored');
    await selectDialogueTopic('');
    if(typeof releaseReplyAudio==='function'){
      const speaking=speakReply('Silent smoke test');
      if(window.petyaSpeaking)throw Error('Synthesis muted capture before playback');
      stopSpeech.onclick();await speaking;
      if(window.petyaSpeaking)throw Error('Speech cancellation did not restore capture');
    }else if(typeof replyAudioContext!=='undefined'){
      const previousContext=replyAudioContext;let resume;
      replyAudioContext={resume:()=>new Promise(resolve=>resume=resolve)};
      try{const speaking=speakReply('Silent smoke test');if(!window.petyaSpeaking)throw Error('Speech did not mute capture');stopSpeech.onclick();resume();await speaking;if(window.petyaSpeaking)throw Error('Speech cancellation did not restore capture');}
      finally{replyAudioContext=previousContext;}
    }else{
    const originalSpeak=speechSynthesis.speak.bind(speechSynthesis);const originalCancel=speechSynthesis.cancel.bind(speechSynthesis);let utterance;
    speechSynthesis.speak=value=>{utterance=value;};speechSynthesis.cancel=()=>{};
    try{await speakReply('Тест без звука');if(!window.petyaSpeaking||utterance.lang!=='ru-RU')throw new Error('Speech did not mute capture');utterance.onend();await new Promise(r=>setTimeout(r,550));if(window.petyaSpeaking)throw new Error('Speech capture stayed muted');}
    finally{speechSynthesis.speak=originalSpeak;speechSynthesis.cancel=originalCancel;}
    }
  })()`);
  if(created!==beforeDialogue)throw new Error('Question created a task');
  await win.webContents.executeJavaScript(`(async()=>{
    await learningNav.onclick();
    if($('learning').hidden)throw new Error('Learning navigation unavailable');
    editLearning();$('learn-name').value='Проверочный таймер';$('learn-patterns').value='через {delay} сообщи: {message}';$('learn-example').value='через 2 минуты сообщи: проверить почту';
    await $('learn-test').onclick();
    if(!$('learn-result').textContent.includes('120'))throw new Error('Training preview failed');
    if((await window.petya.learningList()).reminders.length)throw new Error('Preview created reminder');
    await $('learn-form').onsubmit({preventDefault(){}});
    if(!(await window.petya.learningList()).skills.length)throw new Error('Training not saved');
    await processCommand('через 2 минуты сообщи: проверить почту');
    const learned=await window.petya.learningList();
    if(learned.reminders.length!==1||!dialogueMessages.textContent.includes('Напомню'))throw new Error('Trained phrase not executed');
    await window.petya.reminderCancel(learned.reminders[0].id);await refreshLearning();
    if(!$('learn-reminders').textContent.includes('нет'))throw new Error('Cancel failed');
    await window.petya.learningDelete(learned.skills[0].id);
  })()`);

  await win.webContents.executeJavaScript(`(async()=>{
    await selectDialogueTopic('');await window.petya.converse('Обсудим тестовую тему');
    const correction=await window.petya.converse('Ты неправильно понял — я имел в виду тестовую проверку');
    if(!correction.dictionaryProposal)throw new Error('Correction proposal missing');
    if((await window.petya.learningList()).dictionary.length)throw new Error('Correction saved without choice');
    await showDialogueReply(correction);if(!dialogueChoices.textContent.includes('Запомнить'))throw new Error('Correction choice missing');
    await window.petya.dictionarySave(correction.dictionaryProposal);
    const alias=await window.petya.dictionarySave({from:'мобилка',to:'TEST',scope:'',kind:'alias'});
    const routed=await window.petya.converse('создай задачу для мобилка');
    if(routed.handled||!routed.resolvedCommand.includes('TEST'))throw new Error('Alias not passed to planner');
    const dangerous=await window.petya.dictionarySave({from:'условная фраза',to:'создай задачу',kind:'correction'});
    const guarded=await window.petya.converse('условная фраза');if(!guarded.handled||!guarded.text.includes('целиком'))throw new Error('Correction silently launched action');
    view('learning');await refreshDictionary();if(!$('dictionary-list').textContent.includes('мобилка'))throw new Error('Dictionary editor empty');
    await window.petya.dictionaryDelete(alias.id);await window.petya.dictionaryDelete(dangerous.id);await window.petya.dictionaryDelete(correction.dictionaryProposal.id);
    const records=await window.petya.agentHistory();const submitted=records.find(r=>r.state==='submitted');
    if(submitted){const progress=await window.petya.taskProgress(submitted.id);if(!progress.text.includes('Проверено сейчас'))throw new Error('Progress not fetched');}
  })()`);
  const { app, safeStorage } = require('electron');
  const path = require('node:path');
  const learningRaw=fs.readFileSync(path.join(app.getPath('userData'),'learned-skills.json'),'utf8');
  if(learningRaw.includes('проверить почту'))throw new Error('Learning stored in plaintext');
  const dialogueRaw=fs.readFileSync(path.join(app.getPath('userData'),'dialogue-memory.json'),'utf8');
  if(dialogueRaw.includes('Как думаешь'))throw new Error('Dialogue history stored in plaintext');
  const dialogueSaved=JSON.parse(safeStorage.decryptString(Buffer.from(JSON.parse(dialogueRaw).encrypted,'base64')));
  if(dialogueSaved.topics.length<2)throw new Error('Dialogue topics not persisted');
  const persisted = fs.readFileSync(path.join(app.getPath('userData'), 'context-memory.json'), 'utf8');
  if (persisted.includes('одноразовому')) throw new Error('Context persisted in plaintext');
  const restored = JSON.parse(safeStorage.decryptString(Buffer.from(JSON.parse(persisted).encrypted, 'base64')));
  if (restored.length !== 2) throw new Error('Persistent context missing');
  workspace.history[0].at = Date.now() - 8 * 86400000;
  await win.webContents.executeJavaScript('window.petya.saveSettings({ contextDays: "3" })');
  if (!workspace.history[0].retentionExpired || workspace.history[0].rows.some(r => r.snapshot) || !workspace.history[0].sealed) throw new Error('Expired history retained sensitive snapshots or lost duplicate guard');
  await win.webContents.executeJavaScript("view('learning'); refreshLearning()");
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-learning.png'),(await win.webContents.capturePage()).toPNG());
  const screenshot = await win.webContents.capturePage();
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-smoke.png'), screenshot.toPNG());
  await win.webContents.executeJavaScript(`new Promise(resolve => { view('settings'); document.querySelector('[data-service="notion"] details').open = false; window.scrollTo(0, 0); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`);
  fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-connections.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{
    const first=await window.petya.converse('Работаем над проектом Проверочный');
    if(!first.projectChanged)throw Error('Project switch failed');
    await showDialogueReply(first);
    const state=await window.petya.dialogueTopics();
    if(!state.activeId)throw Error('Project topic missing');
    const question=await window.petya.converse('Работаем над другим проектом');
    if(!question.projectMemoryReply)throw Error('Project voice clarification missing');
    const invalid=await window.petya.projectMemoryReply('9');if(!invalid.question)throw Error('Invalid project option was accepted');
    const second=await window.petya.projectMemoryReply('Бета');
    if(!second.projectChanged)throw Error('Project voice reply failed');
    await showDialogueReply(second);
    if(!dialogueTitle.textContent.includes('Бета'))throw Error('Project title missing');
  })()`);

  await require('./chat-jobs-ui.cjs')(win);

};
