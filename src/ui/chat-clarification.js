(()=>{
 window.renderClarification=(result,message,spoken)=>{
  const keys=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices'];
  delete dialogueChoices.dataset.selected;
  const modelChoices=Array.isArray(result.clarificationOptions)?result.clarificationOptions:[];
  const selectable=modelChoices.length>=2||keys.some(key=>result[key]?.length>0);
  dialogueChoices.classList.toggle('clarification-list',selectable);dialogueChoices.removeAttribute('aria-label');dialogueChoices.removeAttribute('role');dialogueChoices.onkeydown=null;
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
 document.addEventListener('petya-topic-changed',event=>{if(event.detail?.preserveScroll)return;dialogueChoices.replaceChildren();dialogueChoices.classList.remove('clarification-list');document.querySelector('.chat-feed')?.append(dialogueChoices);});
})();
