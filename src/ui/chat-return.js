(()=>{
 const $el=(tag,txt='')=>Object.assign(document.createElement(tag),{textContent:txt});
 function button(text,fn){
   const b=$el('button',text);b.type='button';
   b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
   return b;
 }
 const heading=document.querySelector('.chat-heading'),feed=document.querySelector('.chat-feed');
 const recap=$el('aside'),summary=$el('span'),origin=$el('div');
 recap.className='chat-return-summary';recap.hidden=true;origin.hidden=true;origin.className='chat-branch-origin';
 recap.append(summary,button('×',()=>recap.hidden=true));recap.lastChild.setAttribute('aria-label','Скрыть сводку');
 heading.after(recap,origin);
 const stack=[];let searchOrigin,goingBack=false;
 const transferKey='petya-return-transfer';
 function transfer(){
   try{const data=JSON.parse(localStorage.getItem(transferKey));return data?.expires>Date.now()?data:null;}catch{return null;}
 }
 window.prepareCompanyReturn=async (target,url)=>{
   const p=position();if(!p||!chatHistory[p.index])return;
   const m=chatHistory[p.index];
   const ref=await window.petya.messageLink(p.id,p.index,m.text,m.at);
   localStorage.setItem(transferKey,JSON.stringify({url,target,origin:{...p,ref},expires:Date.now()+300000}));
 };
 window.clearCompanyReturn=()=>localStorage.removeItem(transferKey);
 window.completeCompanyReturn=url=>{
   const data=transfer();if(data?.url!==url)return false;
   window.clearCompanyReturn();
   if(data.origin)push(data.origin);
   if(Number.isFinite(data.offset)){
     const n=dialogueMessages.querySelector('.chat-search-match');
     if(n)feed.scrollTop+=n.getBoundingClientRect().top-feed.getBoundingClientRect().top-data.offset;
   }
   return true;
 };
 function position(){
   if(!topicSelect.value || $('home').hidden)return null;
   const top=feed.getBoundingClientRect().top;
   const node=[...dialogueMessages.querySelectorAll('[data-message-index]')].find(n=>n.getBoundingClientRect().bottom>top);
   return {id:topicSelect.value,project:topicSelect.dataset.projectId,version:window.chatOpenedTopic?.versionIndex||0,index:Number(node?.dataset.messageIndex)||0,offset:node?node.getBoundingClientRect().top-top:0,at:chatHistory[Number(node?.dataset.messageIndex)]?.at};
 }
 function push(p){
   if(!p||goingBack)return;
   if(JSON.stringify(stack.at(-1))!==JSON.stringify(p)){stack.push(p);if(stack.length>25)stack.shift();}
   back.hidden=false;
 }
 const back=button('← Назад',async()=>{
   const p=stack.at(-1);if(!p)return;
   window.guardChatNavigation?.();goingBack=true;
   try{
     if(p.ref){
       const resolved=await window.petya.resolveMessageLink(p.ref);
       if(resolved.company){
         localStorage.setItem(transferKey,JSON.stringify({url:p.ref,target:resolved.company,offset:p.offset,expires:Date.now()+300000}));
         try{await window.petya.companySwitch(resolved.company,p.ref);}catch(e){window.clearCompanyReturn();throw e;}
         stack.pop();return;
       }
     }
     const state=await window.petya.chatWorkspaceInfo(p.id);
     if(state.index!==p.version)await window.petya.chatVersionSelect(p.id,p.version);
     if(topicSelect.dataset.projectId!==p.project)await window.petya.chatProjectSelect(p.project);
     view('home');await selectDialogueTopic(p.id);
     const index=chatHistory[p.index]?.at===p.at?p.index:chatHistory.findIndex(m=>m.at===p.at);
     if(index>=0){await window.jumpToChatMessage(index);const n=dialogueMessages.querySelector('[data-message-index="'+index+'"]');if(n)feed.scrollTop+=n.getBoundingClientRect().top-feed.getBoundingClientRect().top-p.offset;}
     stack.pop();
   }finally{goingBack=false;back.hidden=!stack.length;}
 });
 back.hidden=true;heading.prepend(back);
 window.rememberChatOrigin=()=>push(position());
 window.captureChatSearchOrigin=()=>{searchOrigin=position();};
 window.commitChatSearchOrigin=()=>{push(searchOrigin);searchOrigin=null;};

 const composer=document.querySelector('.chat-composer');
 const context=button('Контекст',async()=>{
   const snapshot=await contextData();
   const d=$el('dialog'),h=$el('h2','Контекст следующего сообщения');d.className='chat-utility-dialog';
   d.append(h,button('Закрыть',()=>d.close()));
   for(const [label,items] of snapshot)if(items.length){d.append($el('h3',label));const ul=$el('ul');for(const text of items)ul.append($el('li',text));d.append(ul);}
   d.onclose=()=>d.remove();document.body.append(d);d.showModal();
 });
 context.className='chat-context-preview';context.hidden=true;
 (composer.querySelector('.mic-control')||composer.lastElementChild).after(context);
 async function contextData(){
   const id=topicSelect.value;
   const info=id?await window.petya.chatWorkspaceInfo(id):{files:[],excluded:[]};
   const materials=info.excluded.length?await window.petya.contexts():[];
   const quote=window.peekChatQuote?.();
   return [['Прикреплено к сообщению',(window.pendingChatFiles||[]).map(f=>f.name)],['Цитата',quote?[quote.text]:[]],
     ['Файлы в контексте чата',info.files.filter(f=>f.enabled).map(f=>f.name)],['Исключено из контекста',[...info.files.filter(f=>!f.enabled).map(f=>f.name),...info.excluded.map(id=>materials.find(m=>m.id===id)?.title||'Недоступный материал')]]];
 }
 let contextRevision=0;
 async function syncContext(){const rev=++contextRevision;try{const data=await contextData();if(rev===contextRevision)context.hidden=!data.some(([,items])=>items.length);}catch{if(rev===contextRevision)context.hidden=true;}}
 for(const e of ['petya-attachments','petya-context-updated','petya-quote-changed','petya-dialogue-state'])document.addEventListener(e,syncContext);
 window.petyaEvents.onMcpChatChanged(e=>{if(e.name==='set_chat_material_enabled')syncContext();});
 syncContext();

 const enhance=window.enhanceChatMessage;
 window.enhanceChatMessage=(node,message)=>{
   enhance?.(node,message);
   const meta=node.querySelector('.message-meta');
   if(!meta||!message.at||message.pending)return;
   let menu=node.querySelector('.answer-menu-items');
   if(!menu){
     const actions=$el('details'),label=$el('summary','•••');
     actions.className='message-actions-menu';label.setAttribute('aria-label','Действия с сообщением');
     menu=$el('div');menu.className='answer-menu-items';actions.append(label,menu);meta.append(actions);
   }
   menu.append(button('Продолжить в новом чате',async()=>{
     window.guardChatNavigation?.();
     const raw=await window.petya.messageLink(topicSelect.value,Number(node.dataset.messageIndex),message.text,message.at);
     const created=await window.petya.branchChatAt(raw);push(position());await selectDialogueTopic(created.id);$('command').focus();
   }));
   if(message.error && message.retryStep && message===chatHistory.at(-1)){
     const label={bugs:'запрос к Jira',tasks:'запрос к Jira',anr:'запрос к Google Play',files:'анализ файлов'}[message.retryStep];
     if(label)node.append(button('Повторить '+label,async()=>{
       const id=topicSelect.value,info=await window.petya.chatWorkspaceInfo(id);
       const answer=await window.petya.chatRetryStep(id,info.index,message.at);
       if(id===topicSelect.value)await showDialogueReply(answer);
     }));
   }
 };
 window.offerJiraSubmissionCheck=id=>{
   const box=$('issue-result');box.replaceChildren(button('Проверить отправку в Jira',async()=>{
     const result=await window.petya.checkDraftSubmission(id);
     if(!currentDraft||currentDraft.id!==id)return;
     if(result.key){box.textContent='Задача уже создана: '+result.key;currentDraft=null;commandProgress.update('done',box.textContent);}
     else if(result.retry){box.textContent='Jira отклонила отправку. Можно исправить черновик и повторить.';$('send').disabled=false;}
     else notice('Задача пока не найдена. Проверь ещё раз чуть позже.');
   }));
 };

 const pause=4*60*60*1000,marker=$el('div','Новые ответы');marker.className='chat-unread-divider';
 let session=null,generation=0,readTimer,company='',away=false;
 const visible=()=>!away&&!document.hidden&&!$('home').hidden;
 function persist(){if(session)localStorage.setItem(session.key,JSON.stringify(session.record));}
 function touch(){if(session){session.record.visit=Date.now();persist();}}
 function observe(){
   clearTimeout(readTimer);
   if(!session||!visible()||session.id!==topicSelect.value)return;
   const owner=session;
   const unreadIndex=owner.first;
   const target=unreadIndex>=0?dialogueMessages.querySelector('[data-message-index="'+unreadIndex+'"]'):null;
   if(target && marker.nextElementSibling!==target)target.before(marker);
   readTimer=setTimeout(()=>{
     if(session!==owner||!visible())return;
     const rect=feed.getBoundingClientRect(),bottom=Math.min(rect.bottom,composer.getBoundingClientRect().top);
     const near=n=>{const r=n.getBoundingClientRect();return r.bottom>rect.top+10 && r.top<bottom-6;};
     if(owner.first>=0){if(!target?.isConnected||!near(target))return;owner.first=-1;marker.remove();}
     const nodes=[...dialogueMessages.querySelectorAll('[data-message-index]')].filter(near);
     const at=Math.max(0,...nodes.map(n=>chatHistory[Number(n.dataset.messageIndex)]?.at||0));
     if(at>owner.record.read){owner.record.read=at;persist();}
   },900);
 }
 async function enter(t=window.chatOpenedTopic,force=false){
   if(!visible()||!t||t.id!==topicSelect.value){if(!topicSelect.value){session=null;recap.hidden=origin.hidden=true;marker.remove();}return;}
   const version=t.versionIndex||0;
   if(!force && session?.id===t.id && session.version===version){observe();return;}
   const seq=++generation;
   if(!company)company=(await window.petya.companies()).activeId;
   if(seq!==generation||t.id!==topicSelect.value||!visible())return;
   const key='petya-reading:'+company+':'+t.id+':'+version;
   let record;try{record=JSON.parse(localStorage.getItem(key));}catch{}
   const lastVisit=record?.visit||0;
   const first=chatHistory.findIndex(m=>m.role==='assistant'&&m.at>(record?.read??Infinity));
   const lastMessage=chatHistory.at(-1)?.at||0;
   const cutoff=lastVisit||lastMessage;
   record ||= {read:t.chatJob&&!t.chatJob.acknowledged&&t.chatJob.state==='done'?(t.chatJob.startedAt||lastMessage)-1:lastMessage,visit:0};
   session={id:t.id,version,key,record,first:first>=0?first:chatHistory.findIndex(m=>m.role==='assistant'&&m.at>record.read)};
   marker.remove();touch();
   recap.hidden=true;origin.hidden=!t.origin;origin.replaceChildren();
   if(t.origin)origin.append(button('Из чата «'+t.origin.title+'»',()=>window.openPetyaAnswer(t.origin.url)));
   if(cutoff>0&&Date.now()-cutoff>=pause && chatHistory.some(m=>m.role==='assistant')){
     const display=text=>{if(seq!==generation||!text||session?.key!==key)return false;summary.textContent=text;return true;};
     window.petya.chatReturnSummary(t.id,version,cutoff,true).then(text=>{
       if(!display(text))return;
       recap.hidden=false;return window.petya.chatReturnSummary(t.id,version,cutoff).then(display);
     }).catch(()=>{});
   }
   if(session.first>=0 && !window.hasChatPosition?.(t.id) && !force && !goingBack){
     const n=session.first;
     if(n<chatHistoryStart){chatHistoryStart=n;showDialogueMessages(chatHistory);}
     const row=dialogueMessages.querySelector('[data-message-index="'+n+'"]');
     if(row)feed.scrollTop+=row.getBoundingClientRect().top-feed.getBoundingClientRect().top-40;
   }
   observe();
 }
 document.addEventListener('petya-chat-opened',e=>enter(e.detail));
 document.addEventListener('petya-topic-changed',()=>{if(session&&visible())touch();});
 document.addEventListener('petya-view',e=>{if(e.detail!=='home'){if(!away)touch();away=true;}else{const resume=away;away=false;if(resume)setTimeout(()=>enter(undefined,true),0);}});
 function leave(){if(!away)touch();away=true;}
 function resume(){if(!away||document.hidden||$('home').hidden)return;away=false;enter(undefined,true);}
 window.addEventListener('blur',leave);window.addEventListener('focus',resume);
 document.addEventListener('visibilitychange',()=>document.hidden?leave():resume());
 document.addEventListener('petya-dialogue-state',async e=>{
   const id=e.detail?.activeId;
   if(!id||window.chatSwitchPending||!visible()||id===window.chatOpenedTopic?.id)return;
   try{const info=await window.petya.chatWorkspaceInfo(id);
     if(topicSelect.value!==id||window.chatSwitchPending)return;
     window.chatOpenedTopic={id,versionIndex:info.index,origin:info.origin};enter();
   }catch{}
 });
 window.addEventListener('pagehide',()=>{if(visible())touch();});
 const activity=()=>{
   if(!session||!visible()||session.id!==topicSelect.value)return;
   const elapsed=Date.now()-session.record.visit;
   if(elapsed>=pause)enter(undefined,true);else if(elapsed>=60000)touch();
 };
 window.petyaEvents.onWindowShown(()=>{if(away)resume();else activity();});
 for(const event of ['pointerdown','keydown'])document.addEventListener(event,activity,{passive:true});
 feed.addEventListener('scroll',()=>{activity();observe();},{passive:true});
 new MutationObserver(observe).observe(dialogueMessages,{childList:true});
 window.chatNavigationReady.then(()=>enter());showDialogueMessages(chatHistory);
})();
