(()=>{
 window.renderClarification=(result,message,spoken)=>{
  const keys=['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices'];
  const modelChoices=Array.isArray(result.clarificationOptions)?result.clarificationOptions:[];
  const selectable=modelChoices.length>=2||keys.some(key=>result[key]?.length>0);
  dialogueChoices.classList.toggle('clarification-list',selectable);dialogueChoices.removeAttribute('aria-label');
  if(!selectable){document.querySelector('.chat-feed')?.append(dialogueChoices);return;}
  if(modelChoices.length>=2){voiceReply=async answer=>showDialogueReply(await window.petya.converse(answer),spoken);for(const label of modelChoices){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{window.appendChatRequest?.(label);const reply=voiceReply;voiceReply=null;await reply(label);};dialogueChoices.append(button);}}
  dialogueChoices.setAttribute('role','group');dialogueChoices.setAttribute('aria-label','Уточните вариант');message?.append(dialogueChoices);
  let busy=false;for(const button of dialogueChoices.querySelectorAll(':scope>button')){button.classList.add('clarification-option');const choose=button.onclick;button.onclick=async event=>{if(busy)return;busy=true;const siblings=[...dialogueChoices.querySelectorAll('button')];siblings.forEach(b=>b.disabled=true);try{await choose?.call(button,event);}catch(e){notice(e.message,true);}finally{busy=false;siblings.forEach(b=>b.disabled=false);}};}
  const custom=document.createElement('button');custom.type='button';custom.className='clarification-custom';custom.textContent='Свой вариант';custom.onclick=()=>{const input=$('command');input.placeholder='Напишите свой вариант…';delete input.dataset.suggestion;input.focus();};dialogueChoices.append(custom);
  dialogueChoices.onkeydown=event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;const buttons=[...dialogueChoices.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(index<0)return;event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();};
 };
})();
