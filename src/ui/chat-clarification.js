(()=>{
 window.renderClarification=(result,message,spoken)=>{
  const keys=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices'];
  delete dialogueChoices.dataset.selected;
  const modelChoices=Array.isArray(result.clarificationOptions)?result.clarificationOptions:[];
  const selectable=modelChoices.length>=2||keys.some(key=>result[key]?.length>0);
  dialogueChoices.classList.toggle('clarification-list',selectable);dialogueChoices.removeAttribute('aria-label');dialogueChoices.removeAttribute('role');dialogueChoices.onkeydown=null;
  if(result.clarificationId)voiceReply=async answer=>showDialogueReply(await window.petya.feature('clarifications','answer',result.clarificationId,answer),spoken);
  if(result.question&&!selectable&&!result.computerApproval&&!result.gitDiscovery){voiceReply ||= async answer=>showDialogueReply(await window.petya.converse(answer),spoken);result.clarificationInput ||= {label:'Ваш ответ',placeholder:'Уточните здесь…',submit:'Продолжить'};}
  if(result.clarificationInput&&typeof voiceReply==='function'){
   const reply=voiceReply,owner=topicSelect.value,form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),submit=document.createElement('button'),status=document.createElement('p');
   form.className='clarification-input';label.textContent=result.clarificationInput.label;input.placeholder=result.clarificationInput.placeholder;input.required=true;input.maxLength=4000;input.autocomplete='off';submit.type='submit';submit.textContent=result.clarificationInput.submit||'Продолжить';status.setAttribute('role','status');label.append(input);form.append(label,submit,status);dialogueChoices.append(form);document.querySelector('.chat-composer')?.prepend(dialogueChoices);
   form.onsubmit=async event=>{event.preventDefault();if(submit.disabled||owner!==topicSelect.value||voiceReply!==reply)return;submit.disabled=true;input.disabled=true;status.textContent='Продолжаю запрос…';try{window.appendChatRequest?.(input.value);await reply(input.value);}catch(e){status.textContent=e.message;}finally{submit.disabled=false;input.disabled=false;}};
   for(const option of result.clarificationId?modelChoices:[]){const button=document.createElement('button');button.type='button';button.textContent=option;button.onclick=()=>{input.value=option;form.requestSubmit();};form.insertBefore(button,label);}
   if(result.clarificationInput.files){const pick=document.createElement('button');pick.type='button';pick.textContent='Прикрепить файл';pick.onclick=async()=>{try{await window.petya.attachmentPick();await refreshAttachments();if(!(await window.petya.attachmentList()).length)return;input.value='Файл прикреплён';form.requestSubmit();}catch(e){status.textContent=e.message;}};form.append(pick);}
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';cancel.onclick=()=>{input.value='отмена';form.requestSubmit();};form.append(cancel);
   requestAnimationFrame(()=>{if(form.isConnected)input.focus({preventScroll:true});});return;
  }
  if(!selectable){document.querySelector('.chat-feed')?.append(dialogueChoices);return;}
  if(modelChoices.length>=2){voiceReply=async answer=>showDialogueReply(await window.petya.converse(answer),spoken);for(const label of modelChoices){const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-pressed','false');button.onclick=()=>{
   const input=$('command'),previous=dialogueChoices.dataset.selected||'';
   const detail=previous && input.value.startsWith(previous)?input.value.slice(previous.length).replace(/^\s*—\s*/,'').trim():input.value.trim();
   dialogueChoices.dataset.selected=label;
   for(const option of dialogueChoices.querySelectorAll('[aria-pressed]'))option.setAttribute('aria-pressed',String(option===button));
   input.value=label+(detail?' — '+detail:'');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.setSelectionRange(input.value.length,input.value.length);
  };dialogueChoices.append(button);}}
  dialogueChoices.setAttribute('role','group');dialogueChoices.setAttribute('aria-label','Уточните вариант');const composer=document.querySelector('.chat-composer');composer?.prepend(dialogueChoices);const prompt=document.createElement('p');prompt.className='clarification-prompt';prompt.textContent=result.text||'Уточните вариант';dialogueChoices.prepend(prompt);
  let busy=false;for(const button of dialogueChoices.querySelectorAll(':scope>button')){button.classList.add('clarification-option');const choose=button.onclick;button.onclick=async event=>{if(busy)return;busy=true;const siblings=[...dialogueChoices.querySelectorAll('button')];siblings.forEach(b=>b.disabled=true);try{await choose?.call(button,event);}catch(e){notice(e.message,true);}finally{busy=false;siblings.forEach(b=>b.disabled=false);}};}
  const custom=document.createElement('button');custom.type='button';custom.className='clarification-custom';custom.textContent='Свой вариант';custom.onclick=()=>{const input=$('command'),selected=dialogueChoices.dataset.selected;if(selected && input.value.startsWith(selected))input.value=input.value.slice(selected.length).replace(/^\s*—\s*/,'');delete dialogueChoices.dataset.selected;for(const option of dialogueChoices.querySelectorAll('[aria-pressed]'))option.setAttribute('aria-pressed','false');input.dispatchEvent(new Event('input'));input.placeholder='Напишите свой вариант…';delete input.dataset.suggestion;input.focus();};dialogueChoices.append(custom);
  dialogueChoices.onkeydown=event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const buttons=[...dialogueChoices.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();};
 };
 document.addEventListener('petya-chat-opened',async()=>{const owner=topicSelect.value;try{const pending=await window.petya.feature('clarifications','latest');if(pending&&owner===topicSelect.value){dialogueChoices.replaceChildren();window.renderClarification(pending,null,false);}}catch(error){console.warn('Clarification unavailable',error.message);}});
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;dialogueChoices.replaceChildren();dialogueChoices.classList.remove('clarification-list');document.querySelector('.chat-feed')?.append(dialogueChoices);});
})();
