(()=>{
 let revision=0;
 const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text||'';return n;};
 async function refresh(){const version=++revision,owner=topicSelect.value;let state;try{state=await window.petya.feature('actionResults','snapshot');}catch{return;}if(version!==revision||owner!==topicSelect.value)return;
  document.querySelectorAll('.action-result-card').forEach(n=>n.remove());
  for(const row of state.items){const message=dialogueMessages.querySelector('[data-message-index="'+row.index+'"]');if(!message)continue;const card=el('section');card.className='action-result-card';card.dataset.state=row.status;
   card.append(el('strong',row.status==='confirmed'?(row.verifiedAt?'Результат проверен':'Сервис подтвердил выполнение'):row.status==='rejected'?'Сервис отклонил действие':'Результат пока не подтверждён'));
   card.append(el('small',row.service+(row.channelName?' · #'+row.channelName:'')+' · '+new Date(row.verifiedAt||row.at).toLocaleString('ru-RU')));
   if(row.summary){const details=el('details');details.append(el('summary','Что отправлено'),el('p',row.summary));card.append(details);}
   if(row.verificationText)card.append(el('p',row.verificationText));
   if(row.status!=='confirmed')card.append(el('p','Повторная отправка отключена. Проверьте результат в сервисе.'));
   const actions=el('div');actions.className='actions';card.append(actions);
   if(row.url){try{const url=new URL(row.url);if(['https:','http:'].includes(url.protocol)){const link=el('a','Открыть результат');link.href=url.href;link.target='_blank';link.rel='noopener';actions.append(link);}}catch{}}
   if(row.canVerify){const button=el('button','Проверить результат'),status=el('p');status.setAttribute('role','status');button.type='button';button.onclick=async()=>{button.disabled=true;status.textContent='Проверяю в сервисе…';try{const result=await window.petya.feature('actionResults','verify',state.scope,row.id);if(owner!==topicSelect.value)return;status.textContent=result.text;await refresh();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};actions.append(button);card.append(status);}
   message.append(card);
  }
 }
 for(const event of ['petya-chat-opened','petya-dialogue-state'])document.addEventListener(event,refresh);
 window.petyaEvents.onChatJob(refresh);window.petyaEvents.onMcpChatChanged(refresh);
})();
