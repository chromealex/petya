(()=>{
 const composer=document.querySelector('.chat-composer'),panel=document.createElement('section');panel.className='chat-queue';panel.setAttribute('aria-label','Очередь запросов');panel.hidden=true;
 const header=document.createElement('div'),label=document.createElement('span'),pause=document.createElement('button'),list=document.createElement('div');header.className='chat-queue-heading';pause.type='button';header.append(label,pause);panel.append(header,list);composer.before(panel);
 let editing=null,direct=false,lastLabel='';
 const working=()=>window.chatSwitchPending||window.chatNavigationPending||window.chatJobBusy?.(topicSelect.value)||direct||commandProgress.busy||planning||draftBusy||workspaceBusy||agentBusy||asanaVoiceBusy;
 const approval=()=>!!voiceReply||!$('draft-card').hidden||!$('resolution').hidden||!$('workspace-card').hidden||!$('agent-draft').hidden||['waiting','error'].includes(commandProgress.state);
 const queues=new Map(),drafts=new Map();let queueTopic=topicSelect.value||'draft:'+(topicSelect.dataset.projectId||'general');
 const makeQueue=id=>{const q=new RequestQueue({execute:async (text,item)=>{if(item?.quote)await window.petya.chatQuote(q.owner,item.quote);if(q===queue){if(!await window.tryBackgroundChat?.(text))await processCommand(text);}else if(!await window.runQueuedChat?.(q.owner,text)){await window.petya.chatJobFinish(q.owner,'attention');throw Error('Откройте чат, чтобы продолжить действие из очереди.');}},blocked:()=>q===queue?working()||!!editing||approval():!q.owner||window.chatSwitchPending||window.chatNavigationPending||commandProgress.busy||planning||workspaceBusy||window.chatJobBusy?.(q.owner),change:()=>{if(q===queue)render();}});q.owner=id;return q;};
 let draftsLoaded=false;
 function saveDraft(key,value){
  if(!draftsLoaded || (drafts.get(key)||'')===value)return;
  drafts.set(key,value);
  window.petya.chatDraftSet(key,value).catch(e=>notice(e.message,true));
 }
 window.petya.chatDrafts().then(saved=>{
  for(const [key,value] of Object.entries(saved))drafts.set(key,value);
  draftsLoaded=true;
  if(!$('command').value)$('command').value=drafts.get(queueTopic)||'';
 }).catch(e=>notice(e.message,true));
 const flushDraft=()=>saveDraft(queueTopic,$('command').value);
 let saveTimer;
 $('command').addEventListener('input',()=>{clearTimeout(saveTimer);saveTimer=setTimeout(flushDraft,120);});
 window.addEventListener('beforeunload',flushDraft);
 document.addEventListener('petya-dialogue-state',({detail})=>{
  if(detail?.activeProjectId&&!window.chatSwitchPending)window.activateChatQueue(detail.activeId||'',detail.activeProjectId);
 });
 $('command').addEventListener('blur',flushDraft);
 let queue=makeQueue(topicSelect.value);queues.set(queueTopic,queue);
 window.activateChatQueue=(id,projectId)=>{const key=id||'draft:'+projectId;if(key===queueTopic)return;saveDraft(queueTopic,$('command').value);queueTopic=key;queue=queues.get(key)||makeQueue(id);queues.set(key,queue);window.chatQueue=queue;editing=null;$('command').value=drafts.get(key)||'';render();};
 window.adoptChatQueue=id=>{queues.delete(queueTopic);if(queueTopic!==id)saveDraft(queueTopic,'');queueTopic=id;queue.owner=id;queues.set(id,queue);};

 function action(title,text,fn){const b=document.createElement('button');b.type='button';b.textContent=text;const paths={'✎':'M4 20l1-5L16 4a2 2 0 0 1 4 4L9 19z M14 6l4 4','↑':'M12 20V4 M5 11l7-7 7 7','×':'m6 6 12 12 M18 6 6 18'};if(paths[text])b.innerHTML='<svg width=15 height=15 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 aria-hidden=true><path d="'+paths[text]+'"/></svg>';b.title=title;b.setAttribute('aria-label',title);b.onclick=fn;return b;}
 function render(){panel.hidden=!queue.items.length;label.textContent='В очереди: '+queue.items.length;pause.textContent=queue.paused||approval()?'Продолжить':'Пауза';list.replaceChildren();for(const item of queue.items){const row=document.createElement('div');row.className='chat-queue-row';if(editing===item.id){const input=document.createElement('textarea');input.value=item.text;input.rows=2;input.maxLength=4000;input.setAttribute('aria-label','Исправить запрос в очереди');row.append(input,action('Сохранить запрос','Сохранить',()=>{if(!input.value.trim())return;editing=null;queue.edit(item.id,input.value);}),action('Отменить редактирование','Отмена',()=>{editing=null;render();}));}else{const text=document.createElement('span');text.textContent=item.text;text.title=item.text;row.append(text,action('Редактировать запрос','✎',()=>{editing=item.id;render();list.querySelector('textarea')?.focus();}),action('Выполнить следующим','↑',()=>queue.first(item.id)),action('Удалить из очереди','×',()=>queue.remove(item.id)));}list.append(row);}}
 pause.onclick=()=>{if(approval()&&!working()){if(voiceReply||!$('draft-card').hidden||!$('resolution').hidden||!$('workspace-card').hidden||!$('agent-draft').hidden){notice('Сначала ответьте на уточнение или закройте текущий черновик.');return;}commandProgress.update('idle','Продолжаю очередь');queue.paused=false;}else queue.paused=!queue.paused;render();};
 window.chatQueue=queue;
 window.enqueueChatRequest=()=>{try{const item=queue.add($('command').value);if(item)item.quote=window.takeChatQuote?.();$('command').value='';}catch(e){notice(e.message,true);}};
 window.sendChatNow=async()=>{const text=$('command').value.trim();if(!text)return;if(working()||queue.active){queue.paused=false;const item=queue.add(text,true);item.quote=window.takeChatQuote?.();$('command').value='';notice('Петя завершит текущий запрос и выполнит этот следующим.');return;}direct=true;try{const quote=window.takeChatQuote?.();if(quote)await window.petya.chatQuote(topicSelect.value,quote);await submitChatCommand(text);}finally{direct=false;}};
 const hint=document.createElement('p');hint.className='queue-key-hint';hint.textContent='Enter — отправить · Ctrl/⌘ + Enter — в очередь';composer.append(hint);
 setInterval(()=>{flushDraft();const state=queue.paused?'Очередь на паузе':editing?'Редактирование запроса':approval()?'Очередь ждёт уточнения или завершения текущего действия':working()||queue.active?'Выполняется текущий запрос':'В очереди: '+queue.items.length;if(lastLabel!==state){lastLabel=state;label.textContent=state;pause.textContent=queue.paused||approval()?'Продолжить':'Пауза';}for(const candidate of queues.values())candidate.drain().catch(e=>{if(candidate===queue)notice(e.message,true);});},500);
})();
