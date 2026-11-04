// Keep the existing dialogue, forms and handlers; arrange them as one conversation.
(() => {
 const home=$('home'), hero=home.querySelector('.hero'), grid=home.querySelector('.grid');
 const composer=$('command-form').closest('article'), materials=$('source-stats').closest('article');
 const shell=document.createElement('section');shell.className='chat-shell';shell.setAttribute('aria-label','Чат с Петей');
 home.prepend(shell);
 const heading=document.createElement('div');heading.className='chat-heading';
 heading.append(dialogueTitle,topicControls);shell.append(heading);
 const welcome=document.createElement('div');welcome.className='chat-welcome';
 welcome.innerHTML='<h2>Чем помочь?</h2><p>Задайте вопрос, опишите задачу или прикрепите файл.</p>';
 const feed=document.createElement('div');feed.className='chat-feed';
 dialogueMessages.setAttribute('role','log');dialogueMessages.setAttribute('aria-label','Сообщения');
 const header=document.createElement('div');header.className='chat-sticky-header';header.append(heading);
 new ResizeObserver(()=>shell.style.setProperty('--chat-header-height',header.offsetHeight+'px')).observe(header);
 feed.append(header,welcome,dialogueMessages,dialogueChoices,$('notice'),progressPanel);shell.append(feed);
 composer.classList.add('chat-composer');
 composer.querySelector(':scope>h2')?.remove();composer.querySelector(':scope>p')?.remove();
 $('command').rows=2;window.applyChatPlaceholder($('command'),chatHistory);
 $('command-help').textContent='Enter — отправить · Shift + Enter — новая строка. Голосом в активном окне — сразу просьба; в фоне — «Петя», затем просьба.';
 composer.append(hero.querySelector('.actions'),$('meeting-status'));
 shell.append(composer);
 // The scroll viewport spans the entire chat; the composer floats above it.
 const composerSize=new ResizeObserver(()=>{const bottom=feed.scrollHeight-feed.clientHeight-feed.scrollTop<70;const inset=Math.ceil(composer.getBoundingClientRect().height)+40;shell.style.setProperty('--composer-inset',inset+'px');if(bottom)feed.scrollTop=feed.scrollHeight;});composerSize.observe(composer);
 const extras=document.createElement('div');extras.className='chat-extras';shell.after(extras);
 function fold(node,title){const d=document.createElement('details'),s=document.createElement('summary');d.className='chat-extra';s.textContent=title;d.append(s,node);extras.append(d);}
 fold(attachmentCard,'Прикрепить файл или скриншот');fold(materials,'Материалы из Slack и встреч');
 fold($('command-shortcuts'),'Быстрые действия');
 // Compact full-window chat: only the topic and new-chat action stay in the header.
 const menu=document.createElement('details');menu.className='chat-tools';
 const toggle=document.createElement('summary');toggle.textContent='＋';toggle.title='Вложения и действия';toggle.setAttribute('aria-label','Вложения и действия');
 const tools=document.createElement('div');tools.className='chat-tools-panel';
 const options=document.createElement('dialog');options.className='chat-options';
 const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.className='chat-options-close';close.onclick=()=>options.close();
 const optionsTitle=document.createElement('h2');optionsTitle.textContent='Вложения и команды';optionsTitle.id='chat-options-title';options.setAttribute('aria-labelledby',optionsTitle.id);options.append(close,optionsTitle,extras);document.body.append(options);$('settings').append(previewVoice);heading.append(stopSpeech);stopSpeech.classList.add('quiet');stopSpeech.textContent='Остановить озвучивание';const syncSpeech=()=>stopSpeech.hidden=!window.petyaSpeaking;document.addEventListener('petya-speaking',syncSpeech);syncSpeech();tools.append($('meeting-status'));
 function openOptions(kind){for(const d of extras.children)d.hidden=kind==='files'?!d.contains(attachmentCard):!d.contains($('command-shortcuts'));optionsTitle.textContent=kind==='files'?'Файлы этой темы':'Быстрые команды';options.showModal();}
 function action(label,fn){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{menu.open=false;fn();};tools.append(b);}
 action('Прикрепить файл…',()=>$('attachment-pick').click());
 action('Файлы из Slack / Telegram…',()=>{openOptions('files');attachmentCard.closest('details').open=true;$('attachment-sources').click();});
 action('Сохранённые материалы',()=>view('sources'));
 $('meeting').addEventListener('click',()=>menu.open=false);
 tools.append($('meeting'));
 action('Вложения и файлы…',()=>{openOptions('files');attachmentCard.closest('details').open=true;});
 action('Быстрые команды…',()=>{openOptions('commands');$('command-shortcuts').closest('details').open=true;});
 menu.append(toggle,tools);
 const toolbar=composer.querySelector(':scope>.actions');toolbar.prepend(menu);
 dialogueTitle.hidden=true;newTopic.textContent='＋';newTopic.title='Новый чат';newTopic.setAttribute('aria-label','Новый чат');
 const send=$('command-form').querySelector('button[type="submit"]');send.textContent='↑';send.title='Отправить сообщение';send.setAttribute('aria-label','Отправить сообщение');
 send.setAttribute('form','command-form');toolbar.append(send);send.classList.add('chat-send');
 function icon(node,path){node.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';}
 icon(toggle,'M12 5v14M5 12h14');icon(newTopic,'M12 5v14M5 12h14');icon(send,'M12 19V5M5 12l7-7 7 7');
 icon(document.querySelector('.mic-device-arrow>span'),'M7 10l5 5 5-5');
 const activity=document.createElement('div');activity.className='chat-activity';
 activity.append(progressPanel,micDiagnostics);toolbar.insertBefore(activity,send);
 const syncActivity=()=>{activity.title=[progressText.textContent,progressTime.textContent,micDiagnostics.textContent].filter(Boolean).join(' · ');activity.classList.toggle('has-command',!progressPanel.hidden);};
 new MutationObserver(syncActivity).observe(activity,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});syncActivity();
 const micIcon=document.createElement('span');micIcon.className='chat-mic-icon';icon(micIcon,'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0zM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8');$('mic').prepend(micIcon);
 const micState=()=>{$('mic').setAttribute('aria-label',$('mic-action').textContent+' · '+$('mic-device-name').textContent);const active=$('mic-action').textContent==='Микрофон включён';$('mic').classList.toggle('is-listening',active);$('mic').setAttribute('aria-pressed',String(active));};
 new MutationObserver(micState).observe($('mic-action'),{childList:true});micState();
 $('command-help').hidden=true;$('command').setAttribute('aria-label','Сообщение Пете');
 document.addEventListener('click',event=>{if(!menu.contains(event.target))menu.open=false;});
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){menu.open=false;toggle.focus();}});
 // Remove only the old empty containers after moving their live children.
 dialogueCard.remove();hero.remove();grid.remove();
 // Draft approvals and clarification cards remain reachable in the message area.
 for(const node of [...home.children])if(node!==shell)feed.append(node);
 const latest=document.createElement('button');latest.type='button';latest.className='chat-latest';latest.textContent='↓ Новый ответ';latest.hidden=true;composer.before(latest);
 let follow=true,restoring=false;
 const positions=new Map();
 window.saveChatPosition=id=>{
   if(!id || !feed.clientHeight)return;
   if(feed.scrollHeight-feed.scrollTop-feed.clientHeight<70){positions.delete(id);return;}
   const top=feed.getBoundingClientRect().top;
   const anchor=[...dialogueMessages.querySelectorAll('[data-message-index]')].find(n=>n.getBoundingClientRect().bottom>top);
   if(anchor){const index=Number(anchor.dataset.messageIndex);positions.set(id,{index,at:chatHistory[index]?.at,offset:anchor.getBoundingClientRect().top-top,last:chatHistory.at(-1)?.at});}
 };
 window.restoreChatPosition=async id=>{
   const saved=positions.get(id);
   if(!saved){window.chatScrollToLatest();return;}
   let index=saved.index;
   if(chatHistory[index]?.at!==saved.at)index=chatHistory.findIndex(m=>m.at===saved.at);
   if(index<0){window.chatScrollToLatest();return;}
   restoring=true;follow=false;
   try{
     if(index<chatHistoryStart){chatHistoryStart=index;showDialogueMessages(chatHistory);}
     await new Promise(r=>requestAnimationFrame(r));
     const node=dialogueMessages.querySelector('[data-message-index="'+index+'"]');
     if(node)feed.scrollTop+=node.getBoundingClientRect().top-feed.getBoundingClientRect().top-saved.offset;
     latest.hidden=saved.last===chatHistory.at(-1)?.at || chatHistory.at(-1)?.role!=='assistant';
   }finally{restoring=false;}
 };
 feed.addEventListener('scroll',()=>{follow=feed.scrollHeight-feed.clientHeight-feed.scrollTop<70;if(follow)latest.hidden=true;if(!restoring && feed.scrollTop<80)loadOlderChatMessages();});
 window.chatScrollToLatest=()=>{feed.scrollTop=feed.scrollHeight;follow=true;latest.hidden=true;};latest.onclick=window.chatScrollToLatest;
 let historyPrepended=false;document.addEventListener('petya-history-prepended',()=>{historyPrepended=true;});
 let previousLast;
 // A message without a timestamp is still new: compare the last message by time, text and history length.
 const sync=()=>{const last=chatHistory.at(-1),key=last?[last.at??'',chatHistory.length,String(last.text||'').slice(0,60)].join('|'):'',newAnswer=last?.role==='assistant'&&previousLast!==key;previousLast=key;welcome.hidden=dialogueMessages.childElementCount>0;if(historyPrepended){historyPrepended=false;return;}if(restoring)return;if(follow)window.chatScrollToLatest();else if(newAnswer)latest.hidden=false;};
 new MutationObserver(sync).observe(dialogueMessages,{childList:true});sync();
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;follow=true;requestAnimationFrame(window.chatScrollToLatest);});
 window.placeChatProgress=panel=>{
  const user=[...dialogueMessages.querySelectorAll(':scope>.message-user')].at(-1);
  if(!user){if(panel.parentElement!==dialogueMessages)dialogueMessages.append(panel);return;}
  let anchor=user;while(anchor.nextElementSibling?.classList.contains('chat-running-reply')&&anchor.nextElementSibling!==panel)anchor=anchor.nextElementSibling;
  if(anchor.nextElementSibling!==panel)anchor.after(panel);
 };
 window.appendChatRequest=text=>{
  dialogueMessages.append(window.renderMessage({role:'user',text,at:Date.now(),attachments:window.pendingChatFiles||[]}));window.chatScrollToLatest?.();
 };
 $('command').addEventListener('keydown',event=>{
  if(event.key==='Tab'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing&&!$('command').value&&$('command').dataset.suggestion){event.preventDefault();$('command').value=$('command').dataset.suggestion;$('command').dispatchEvent(new Event('input',{bubbles:true}));$('command').setSelectionRange($('command').value.length,$('command').value.length);return;}

  if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(event.ctrlKey||event.metaKey)window.enqueueChatRequest?.();else $('command-form').requestSubmit();}
 });
})();
