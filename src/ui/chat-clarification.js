(()=>{
 let revision=0;
 window.createChatQuestion=(text,host=dialogueChoices)=>{
  const box=document.createElement('div'),prompt=document.createElement('p'),buttons=document.createElement('div');
  box.className='chat-question clarification-input';box.setAttribute('role','group');box.setAttribute('aria-label','Уточнение запроса');
  prompt.className='approval-question';prompt.textContent=text||'Уточните запрос';buttons.className='approval-buttons';box.append(prompt,buttons);host.append(box);
  document.querySelector('.chat-composer')?.prepend(host);
  return {box,prompt,buttons};
 };
 window.renderClarification=(result,message,spoken)=>{
  revision++;
  delete dialogueChoices.dataset.selected;
  dialogueChoices.classList.remove('clarification-list');dialogueChoices.removeAttribute('aria-label');dialogueChoices.removeAttribute('role');dialogueChoices.onkeydown=null;
  if(result.computerApproval){window.showComputerApproval(result.computerApproval,dialogueChoices,spoken,result.text);return;}
  const keys=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices','interpretChoices','integrationOffers'];
  const modelChoices=Array.isArray(result.clarificationOptions)?result.clarificationOptions:[];
  const selectable=modelChoices.length>0||keys.some(key=>result[key]?.length>0)||!!result.gitDiscovery||!!result.serviceBrowser;
  if(!result.question&&!selectable&&!result.clarificationInput&&!result.recoveryRequired){document.querySelector('.chat-feed')?.append(dialogueChoices);return;}
  const existing=[...dialogueChoices.children],owner=result.topicId||topicSelect.value;
  const {box,buttons}=window.createChatQuestion(result.recoveryRequired?'Вопрос сохранён. После перезапуска нужно проверить запрос перед продолжением.':result.text);
  let busy=false;
  const perform=async action=>{
   if(busy||owner!==topicSelect.value||!box.isConnected)return;
   busy=true;revision++;box.remove();delete dialogueChoices.dataset.selected;voiceReply=null;window.chatStartPending=true;
   try{await action();}catch(error){if(owner===topicSelect.value)await showDialogueReply({handled:true,error:true,text:error.message});}
   finally{window.chatStartPending=false;}
  };
  const button=(label,action,primary=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;if(primary)b.className='primary';b.onclick=()=>perform(action);buttons.append(b);return b;};
  if(result.recoveryRequired){
   voiceReply=null;button('Вернуть запрос в черновик',()=>{const input=$('command');if(input.value.trim())throw Error('Сначала сохраните или отправьте текущий черновик.');input.value=result.originalRequest;input.dispatchEvent(new Event('input'));input.focus();},true);return;
  }
  // Keep extension/service callbacks intact; only their presentation and lifecycle are shared.
  for(const node of existing){if(node.tagName==='BUTTON'){const action=node.onclick;node.onclick=event=>perform(()=>action?.call(node,event));buttons.append(node);}else box.append(node);}
  let reply=voiceReply;
  if(result.clarificationId)reply=async answer=>{const next=await window.petya.feature('clarifications','answer',result.clarificationId,answer);if(owner===topicSelect.value)await showDialogueReply(next,spoken);};
  else if(!reply&&(modelChoices.length||result.question))reply=async answer=>{const next=await window.petya.converse(answer);if(owner===topicSelect.value)await showDialogueReply(next,spoken);};
  const answer=text=>perform(async()=>{window.appendChatRequest?.(text);await reply(text);});
  const choicesOnly=!!result.clarificationInput?.choicesOnly&&modelChoices.length>0;
  if(reply){
   for(const option of modelChoices)button(option,async()=>{window.appendChatRequest?.(option);await reply(option);},buttons.childElementCount===0);
   voiceReply=text=>perform(()=>reply(text));dialogueChoices.dataset.selected='clarification';
   if(!choicesOnly){
    box.classList.add('text-clarification');
    button(result.clarificationInput?.submit||'Продолжить',()=>{},!buttons.childElementCount).onclick=()=>{
     const input=$('command'),text=input.value.trim();if(!text){input.focus();return;}
     if(busy||owner!==topicSelect.value)return;input.value='';input.dispatchEvent(new Event('input'));answer(text);
    };
    const input=$('command');input.placeholder=result.clarificationInput?.placeholder||'Напишите ответ…';delete input.dataset.suggestion;
    requestAnimationFrame(()=>{if(box.isConnected)input.focus({preventScroll:true});});
   }
   if(result.clarificationInput?.files)button('Прикрепить файл',async()=>{await window.petya.attachmentPick();await refreshAttachments();if((await window.petya.attachmentList()).length)await reply('Файл прикреплён');else if(owner===topicSelect.value){dialogueChoices.replaceChildren();voiceReply=reply;window.renderClarification(result,null,spoken);}});
   const cancelLabel=result.clarificationInput?.cancelLabel||'Отмена';
   if(!modelChoices.some(v=>v.toLocaleLowerCase()===cancelLabel.toLocaleLowerCase()))button(cancelLabel,()=>reply(result.clarificationInput?.cancelLabel||'отмена'));
  }
  if(selectable)box.classList.add('choice-list');
  buttons.onkeydown=event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const options=[...buttons.querySelectorAll('button:not(:disabled)')],index=options.indexOf(document.activeElement);if(index<0)return;event.preventDefault();options[(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();};
 };
 const history=document.createElement('details'),summary=document.createElement('summary'),rows=document.createElement('div');history.className='clarification-history';summary.textContent='Продолжения';history.append(summary,rows);document.querySelector('.chat-heading')?.append(history);
 async function refreshHistory(){if(!history.isConnected)document.querySelector('.chat-heading')?.append(history);const owner=topicSelect.value;const items=owner?await window.petya.feature('clarifications','history',owner):[];if(owner!==topicSelect.value)return;history.hidden=!items.length;summary.textContent='Продолжения · '+items.length;rows.replaceChildren();const labels={running:'В работе',waiting:'Ждёт уточнения',completed:'Готово',cancelled:'Остановлено',error:'Ошибка',interrupted:'Прервано перезапуском'};for(const item of items.slice().reverse()){const row=document.createElement('p');row.textContent=new Date(item.startedAt).toLocaleString('ru-RU')+' · '+item.actor+' · '+(labels[item.state]||item.state)+'\n'+item.summary;rows.append(row);}}
 document.addEventListener('petya-chat-opened',()=>refreshHistory().catch(()=>{}));window.petyaEvents.onChatJob(()=>refreshHistory().catch(()=>{}));
 document.addEventListener('petya-chat-opened',async()=>{const owner=topicSelect.value,expected=revision;try{const pending=await window.petya.feature('clarifications','latest');if(pending&&owner===topicSelect.value&&expected===revision){dialogueChoices.replaceChildren();window.renderClarification(pending,null,false);}}catch(error){console.warn('Clarification unavailable',error.message);}});
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;revision++;delete dialogueChoices.dataset.selected;dialogueChoices.replaceChildren();dialogueChoices.classList.remove('clarification-list');document.querySelector('.chat-feed')?.append(dialogueChoices);});
})();
