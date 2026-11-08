(()=>{
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const action=(label,fn)=>{const b=el('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();}catch(error){checkStatus.textContent=error.message;}finally{b.disabled=false;}};return b;};
 const bell=el('button',null,'notification-bell');bell.type='button';bell.title='Уведомления';bell.setAttribute('aria-label','Уведомления');bell.setAttribute('aria-expanded','false');bell.setAttribute('aria-controls','notification-center');bell.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
 const badge=el('span',null,'notification-count');badge.hidden=true;bell.append(badge);$('company-manage').before(bell);
 const panel=el('section',null,'notification-center');panel.id='notification-center';panel.hidden=true;panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Уведомления');
 const head=el('div',null,'notification-head'),list=el('div',null,'notification-list'),checkStatus=el('p',null,'notification-check-status');checkStatus.setAttribute('role','status');
 const clear=action('Очистить',()=>{for(const [id,item] of items)if(!item.busy){dismissed.set(id,item.version);items.delete(id);}draw();});const close=action('×',()=>setOpen(false));close.setAttribute('aria-label','Закрыть уведомления');head.append(el('strong','Уведомления'),clear,close);
 const refresh=action('↻',()=>checkUpdates(true));refresh.className='notification-refresh';refresh.title='Проверить обновления моделей';refresh.setAttribute('aria-label',refresh.title);head.insertBefore(refresh,clear);panel.append(head,checkStatus,list);document.body.append(panel);
 const items=new Map(),dismissed=new Map();let installBusy=false;
 function put(id,data){if(data.busy)dismissed.delete(id);const old=items.get(id),version=data.version||data.text;if(dismissed.get(id)===version&&!data.busy)return;items.set(id,{...data,version,at:old?.version===version?old.at:Date.now(),read:!panel.hidden||old?.version===version&&old.read});if(items.size>50)items.delete(items.keys().next().value);draw();}
 function draw(){const focused=document.activeElement,owner=focused?.closest('.notification-item'),focusId=owner?.dataset.notificationId,focusIndex=owner?[...owner.querySelectorAll('button')].indexOf(focused):-1;list.replaceChildren();const rows=[...items.entries()].sort((a,b)=>Number(!!b[1].busy)-Number(!!a[1].busy)||b[1].at-a[1].at);for(const [id,item]of rows){const card=el('article',null,'notification-item');card.dataset.kind=item.kind||'info';card.dataset.notificationId=id;const top=el('div',null,'notification-item-title');top.append(el('strong',item.title));const time=el('time',new Date(item.at).toLocaleTimeString(window.petyaLocale||'ru-RU',{hour:'2-digit',minute:'2-digit'}));top.append(time);if(!item.busy){const remove=action('×',()=>{dismissed.set(id,item.version);items.delete(id);draw();});remove.setAttribute('aria-label','Убрать уведомление');top.append(remove);}card.append(top,el('p',item.text));if(item.busy){const progress=el('progress');progress.setAttribute('aria-label',item.title);progress.max=100;if(Number.isFinite(item.percent))progress.value=item.percent;card.append(progress);}const controls=el('div',null,'notification-actions');for(const [label,fn]of item.actions||[])controls.append(action(label,fn));if(controls.children.length)card.append(controls);list.append(card);}if(!rows.length)list.append(el('p','Новых уведомлений нет.','notification-empty'));const unread=[...items.values()].filter(item=>!item.read).length;badge.hidden=!unread;badge.textContent=unread>9?'9+':String(unread);bell.setAttribute('aria-label',unread?'Уведомления: '+unread+' непрочитанных':'Уведомления');bell.classList.toggle('is-working',[...items.values()].some(i=>i.busy));if(!panel.hidden){place();if(focusId&&focusIndex>=0)[...list.children].find(n=>n.dataset.notificationId===focusId)?.querySelectorAll('button')[focusIndex]?.focus({preventScroll:true});}}
 function place(){const r=bell.getBoundingClientRect();panel.style.maxHeight=Math.max(120,innerHeight-r.bottom-16)+'px';panel.style.top=Math.min(r.bottom+8,Math.max(8,innerHeight-panel.offsetHeight-8))+'px';panel.style.left=Math.max(8,Math.min(r.right-panel.offsetWidth,innerWidth-panel.offsetWidth-8))+'px';}
 function setOpen(open){panel.hidden=!open;bell.setAttribute('aria-expanded',String(open));if(open){for(const item of items.values())item.read=true;draw();refresh.focus();checkUpdates(false);}else bell.focus();}
 bell.onclick=()=>setOpen(panel.hidden);document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!bell.contains(event.target)){panel.hidden=true;bell.setAttribute('aria-expanded','false');}});panel.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});window.addEventListener('resize',()=>{if(!panel.hidden)place();});
 const size=bytes=>(bytes/1e9).toLocaleString(window.petyaLocale||'ru-RU',{maximumFractionDigits:2})+' ГБ';
 function installation(state){if(!state||state.phase==='idle')return;installBusy=!!state.busy;refresh.disabled=installBusy;if(installBusy)checkStatus.textContent='Идёт подготовка модели.';const percent=state.total?Math.min(100,Math.floor(state.received*100/state.total)):undefined;put(state.optional?'model-install:'+state.model:'model-install',{title:(state.busy?'Подготовка модели':state.ready?'Модель готова':state.phase==='error'?'Не удалось подготовить модель':'Загрузка отменена')+(state.optional?' · '+state.model:''),text:state.message+(state.total?' · '+percent+'% · '+size(state.received)+' из '+size(state.total):''),busy:state.busy,percent,kind:state.phase==='error'?'error':'model',version:state.phase,actions:state.busy?[['Отменить',()=>state.optional?window.petya.feature('optional-models','cancel'):window.petya.cancelOllamaInstall()]]:[['Подключения',()=>{setOpen(false);view('settings');window.revealSettings?.(document.querySelector('[data-service="ollama"]'));}]]});if(state.busy){for(const id of [...items.keys()])if(id.startsWith('model-update:'))items.delete(id);draw();}if(state.ready)checkUpdates(true);}
 let checking=false,lastCheck=0;
 async function checkUpdates(force){if(checking||installBusy)return;if(!force&&Date.now()-lastCheck<6*3600000)return;checking=true;refresh.disabled=true;checkStatus.textContent='Проверяю обновления моделей…';try{const state=await window.petya.modelUpdates(force);lastCheck=Date.now();if(installBusy)return;checkStatus.textContent=state.error?'Не удалось проверить обновления: '+state.error:state.items.length?'Доступные модели показаны ниже.':state.unavailable?.length?'Для этой модели нет данных об обновлениях в реестре.':'Установленная модель актуальна.';const found=new Set(state.items.map(item=>'model-update:'+item.model));if(!state.error)for(const id of [...items.keys()])if(id.startsWith('model-update:')&&!found.has(id))items.delete(id);for(const item of state.items)put('model-update:'+item.model,{title:item.kind==='update'?'Обновление модели':'Доступна модель',text:item.model+' · размер модели '+size(item.size)+(item.current?'':' · после подготовки станет основной'),kind:'model',version:item.digest,actions:[[item.kind==='update'?'Обновить':'Загрузить',async()=>{if(installBusy)return;installBusy=true;try{installation(await window.petya.modelUpdateInstall(item.model));}finally{installBusy=false;}}]]});draw();}catch(error){checkStatus.textContent='Проверка недоступна: '+error.message;}finally{checking=false;refresh.disabled=installBusy;}}
 window.petyaEvents.onOllamaInstall(installation);window.petya.ollamaInstallStatus().then(installation).catch(()=>{});
 Promise.all([connectionsReady,modulesReady]).then(()=>{for(const card of document.querySelectorAll('[data-service]')){const status=card.querySelector('.connection-status');if(!status)continue;const id='connection:'+card.dataset.service,title=card.querySelector('h2')?.textContent||card.dataset.service;let failed=false;const update=()=>{if(status.classList.contains('error')){failed=true;put(id,{title:title+' · нужно внимание',text:status.textContent,kind:'error',actions:[['Настроить',()=>{setOpen(false);view('settings');window.revealSettings?.(card);}]]});}else if(failed&&status.classList.contains('connected')){failed=false;put(id,{title:title,text:'Подключение восстановлено.',kind:'success'});}};new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class']});update();}}).catch(()=>{});
 function chatNotification(topic){
  const job=topic.job,id='chat:'+topic.id,waiting=job?.state==='attention',busy=job?.state==='running';
  if(topic.archived || job?.acknowledged || (topicSelect.value===topic.id && !$('home').hidden))return;
  const question=waiting && topic.needsReply;
  const open=async()=>{
    if(window.chatStartPending || window.chatSwitchPending || commandProgress.busy || planning || workspaceBusy || window.chatQueue?.active || (voiceReply&&!window.backgroundClarification))throw Error('Завершите текущее действие перед переходом.');
    if(topic.projectId!==topicSelect.dataset.projectId)await window.petya.chatProjectSelect(topic.projectId);
    await selectDialogueTopic(topic.id);view('home');setOpen(false);
    if(question)$('command').focus();
    items.delete(id);draw();
  };
  put(id,{title:topic.title,text:busy||waiting||job.state==='cancelled'?(topic.attention||job.label):'Ответ готов.',busy,kind:waiting?'attention':busy?'info':'success',version:busy?'running:'+job.startedAt:String(job.at),actions:[[question?'Ответить':'Открыть чат',open],...(busy?[['Остановить',()=>window.petya.chatAnswerStop(topic.id)]]:[])]});
 }
 window.petyaEvents.onChatJob(async event=>{
   if(!['attention','done'].includes(event.job.state)&&!(event.job.clarification&&['running','cancelled'].includes(event.job.state))){if(items.delete('chat:'+event.topicId))draw();return;}
   try{
     const state=await window.petya.chatNavigation(''),topic=state.topics.find(t=>t.id===event.topicId);
     if(topic?.job?.at===event.job.at && state.projects.some(p=>p.id===topic.projectId&&!p.archived))chatNotification(topic);
   }catch(error){console.warn('Chat notification unavailable',error.message);}
 });
 window.chatNavigationReady?.then(async()=>{
   const state=await window.petya.chatNavigation('');
   for(const topic of state.topics)if((topic.job?.state==='attention'||topic.job?.clarification&&['running','done','cancelled'].includes(topic.job.state)) && state.projects.some(p=>p.id===topic.projectId&&!p.archived))chatNotification(topic);
 }).catch(error=>console.warn('Chat notifications unavailable',error.message));
 function meetingProgress(state){put('meeting:'+state.id,{title:'Запись встречи',text:state.message,busy:['recording','processing'].includes(state.phase),percent:state.percent,version:state.phase,kind:state.phase==='error'?'error':state.phase==='done'?'success':'info',actions:state.phase==='error'?[['Повторить обработку',()=>window.petya.feature('meetingMemory','retry',state.id)]]:[]});if(state.phase==='done')refreshContexts().catch(()=>{});}
 window.petyaEvents.onMeetingMemory(meetingProgress);
 // The recorder itself: a meeting seen by a meeting app, recording, errors — with start/stop actions.
 function captureProgress(state){if(!state||state.phase==='idle')return;const actions=state.busy?[['Остановить и обработать',()=>window.petya.feature('meetingMemory','stopCapture')]]:state.canStart||state.canRetry?[['Записать встречу',()=>window.petya.feature('meetingMemory','startCapture')]]:[];put('local-meeting',{title:'Запись встречи',text:state.message,busy:state.busy,version:state.id+':'+state.phase,kind:state.phase==='error'?'error':'info',actions});}
 window.petyaEvents.onLocalMeeting(captureProgress);window.petya.feature('meetingMemory','captureStatus').then(captureProgress).catch(()=>{});
 window.petya.feature('meetingMemory','status').then(states=>states.forEach(meetingProgress)).catch(()=>{});
 window.petyaEvents.onBackground(state=>{if(state.error)put('background',{title:'Фоновое обновление',text:state.error,kind:'error',actions:[['Подключения',()=>{setOpen(false);view('settings');}]]});});
 document.addEventListener('petya-image-install',event=>{const state=event.detail;if(!state.busy&&!items.has('image-install'))return;put('image-install',{title:'Модель изображений',text:state.message||(state.ready?'Готова к работе':'Подготовка…'),busy:state.busy,version:state.phase,kind:state.phase==='error'?'error':'model',actions:state.busy?[['Отменить',()=>window.petya.imageInstallCancel()]]:[]});});
 function languageProgress(state){
  const percent=state.total>0?Math.min(100,Math.floor(state.received*100/state.total)):undefined;
  put('voice-language:'+state.code,{title:state.title||state.label+' · язык',text:state.message+(Number.isFinite(percent)?' '+percent+'%':''),busy:state.busy,percent,version:state.phase,kind:state.phase==='error'?'error':state.phase==='done'?'success':'info',actions:state.phase==='error'?[['Повторить',()=>window.petya.voiceLanguageInstall(state.code)]]:state.busy||state.code==='speech-model'?[]:[['Языки',()=>{setOpen(false);view('settings');window.revealSettings?.($('voice-languages'));}]]});
 }
 // Decomposition: one card per run, updated in place with the overall percentage.
 function decomposeProgress(state){
  if(!state?.id)return;
  const busy=!!state.busy,percent=busy&&state.percent>0&&!['starting','fetching'].includes(state.stage)?state.percent:undefined;
  const agents=(state.agents||[]).filter(a=>a.state==='reading').length;
  put('decompose',{title:'Декомпозиция · '+state.title,text:(window.decomposeStageText?.(state)||'Декомпозиция')+(agents>1?' · агентов: '+agents:'')+(Number.isFinite(percent)?' '+percent+'%':''),busy,percent,version:busy?'running:'+state.id:state.stage+':'+state.id,kind:state.stage==='error'?'error':state.stage==='done'?(state.warnings?'attention':'success'):'info',actions:busy?[]:[['Открыть план',()=>{setOpen(false);view('home');$('workspace-card').scrollIntoView({behavior:'smooth',block:'start'});}]]});
 }
 window.petyaEvents.onDecompose(decomposeProgress);
 window.petya.decomposeStatus().then(decomposeProgress).catch(()=>{});
 window.petyaEvents.onVoiceLanguageProgress(languageProgress);
 window.petya.voiceLanguageStatus().then(states=>states.forEach(languageProgress)).catch(()=>{});
 const installProgress = item => put(item.id,item);
 window.petyaEvents.onExtensionInstall(installProgress);
 window.petya.feature('extensionReplies','progress').then(items=>items.forEach(installProgress)).catch(()=>{});
 const unityProgress = item => { if(item)put(item.id,item); };
 window.petyaEvents.onUnityProgress(unityProgress);
 window.petya.feature('unity','status').then(unityProgress).catch(()=>{});
 const reportShareProgress = item => {if(item)put(item.id,item);};
 window.petyaEvents.onReportShareProgress(reportShareProgress);
 window.petya.reportShareProgress().then(items=>items.forEach(reportShareProgress)).catch(()=>{});
 const slackScreenProgress = item => {if(item)put(item.id,item);};
 window.petyaEvents.onSlackScreenProgress(slackScreenProgress);
 window.petya.feature('slackScreen','status').then(slackScreenProgress).catch(()=>{});
 const changeProgress = item => {if(item)put(item.id,item);};
 window.petyaEvents.onChatChange(changeProgress);
 window.petya.feature('chatChanges','progress').then(items=>items.forEach(changeProgress)).catch(()=>{});
 window.petya.feature('actionResults','progress').then(items=>items.forEach(changeProgress)).catch(()=>{});
 const motionProgress = item => { if (item) put(item.id,item); };
 window.petyaEvents.onMotionProgress(motionProgress);
 window.petya.feature('blenderMotion','status').then(motionProgress).catch(()=>{});
 document.addEventListener('petya-ui-notification',event=>{const {id,...data}=event.detail;put(id,data);});
 window.petyaEvents.onWindowShown(()=>checkUpdates(false));setTimeout(()=>checkUpdates(false),2000);draw();
})();
