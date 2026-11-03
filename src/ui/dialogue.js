window.petyaSpeaking=false;
const dialogueCard=document.createElement('article');dialogueCard.className='card';
const dialogueTitle=document.createElement('h2');dialogueTitle.textContent='Диалог с Петей';
const topicSelect=document.createElement('select');topicSelect.setAttribute('aria-label','Тема разговора');
const newTopic=document.createElement('button');newTopic.type='button';newTopic.textContent='Новая тема';
const stopSpeech=document.createElement('button');stopSpeech.type='button';stopSpeech.textContent='Остановить ответ';
const topicControls=document.createElement('div');topicControls.className='actions';topicControls.append(topicSelect,newTopic,stopSpeech);
const dialogueMessages=document.createElement('div');dialogueMessages.setAttribute('aria-live','polite');
const dialogueChoices=document.createElement('div');dialogueChoices.className='actions';
dialogueCard.append(dialogueTitle,topicControls,dialogueMessages,dialogueChoices);$('command-form').after(dialogueCard);
let speechEpoch=0;
async function speakReply(text){
 if(!window.speechSynthesis){notice(text+'\nОзвучивание недоступно.');return;}
 const epoch=++speechEpoch;window.speechSynthesis.cancel();window.petyaSpeaking=true;voiceTurn.reset();
 const done=()=>{if(epoch!==speechEpoch)return;setTimeout(()=>{if(epoch!==speechEpoch)return;window.petyaSpeaking=false;if(mic.active)voiceTurn.arm();},500);};
 const utterance=new SpeechSynthesisUtterance(text);utterance.lang='ru-RU';
 const voices=speechSynthesis.getVoices();utterance.voice=voices.find(v=>v.localService&&v.lang.startsWith('ru'))||null;
 utterance.onend=done;utterance.onerror=()=>{done();notice(text+'\nНе удалось озвучить ответ.');};
 speechSynthesis.speak(utterance);
}
stopSpeech.onclick=()=>{++speechEpoch;speechSynthesis.cancel();window.petyaSpeaking=false;voiceTurn.reset();};
function showDialogueMessages(messages){dialogueMessages.replaceChildren();for(const m of messages.slice(-12)){const p=document.createElement('p');p.style.whiteSpace='pre-wrap';p.textContent=(m.role==='user'?'Вы: ':'Петя: ')+m.text;dialogueMessages.append(p);for(const item of m.evidence||[]){const block=document.createElement('blockquote'),label=document.createElement('div'),mark=document.createElement('mark');label.textContent=item.name+' · строка '+item.line+' сохранённого фрагмента';mark.textContent=item.text;block.append(label,mark);dialogueMessages.append(block);}for(const source of m.sources||[]){if(!/^https:\/\//.test(source.url))continue;const a=document.createElement('a');a.textContent=source.title;a.href=source.url;a.target='_blank';a.rel='noopener';dialogueMessages.append(a);}}}
async function refreshTopics(){const state=await window.petya.dialogueTopics();topicSelect.replaceChildren(new Option('Новая тема',''));for(const t of state.topics)topicSelect.add(new Option(t.title,t.id));topicSelect.value=state.activeId;}
async function selectDialogueTopic(id){const topic=await window.petya.dialogueSelect(id);showDialogueMessages(topic?.messages||[]);dialogueChoices.replaceChildren();dialogueTitle.textContent=topic?.title||'Диалог с Петей';await refreshTopics();if(typeof refreshAttachments==='function')await refreshAttachments();}
topicSelect.onchange=run(()=>selectDialogueTopic(topicSelect.value));newTopic.onclick=run(()=>selectDialogueTopic(''));
async function showDialogueReply(result,spoken=false){
 if(result.messages)showDialogueMessages(result.messages);else showDialogueMessages([{role:'assistant',text:result.text}]);
 dialogueTitle.textContent=result.topicTitle||'Диалог с Петей';dialogueChoices.replaceChildren();

 for(const offer of result.integrationOffers||[]){for(const [choice,label] of [['api','Подключить '+offer.name],['browser','Без интеграции: браузер '+offer.name]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(async()=>showDialogueReply(await window.petya.integrationChoice(offer.id,choice),spoken));dialogueChoices.append(b);}}
 if(result.integrationOffers?.length)voiceReply=async text=>{const offer=result.integrationOffers.length===1?result.integrationOffers[0]:result.integrationOffers.find(o=>text.toLowerCase().includes(o.name.toLowerCase()));if(!offer){await showDialogueReply(result,spoken);return;}const choice=/(?:не надо|не хочу|откаж|отказ|(?:^|\s)нет(?:$|[\s,.!?])|без интеграции|браузер)/iu.test(text)?'browser':/(?:подключ|^да(?:$|[\s,.!?])|интеграци)/iu.test(text)?'api':'';if(choice)await showDialogueReply(await window.petya.integrationChoice(offer.id,choice),spoken);else await showDialogueReply(result,spoken);};
 if(result.integrationSettings){await modulesReady;renderModules(await window.petya.settings());view('settings');document.querySelector('[data-service="'+result.integrationSettings+'"]')?.scrollIntoView({block:'start'});}
 if(result.integrationRetry){const b=document.createElement('button');b.type='button';b.textContent='Повторить запрос';b.onclick=run(()=>processCommand(result.integrationRetry,Date.now(),spoken));dialogueChoices.append(b);}
 if(result.serviceBrowser){const read=async()=>showDialogueReply(await window.petya.serviceBrowserRead(result.serviceBrowser.id),spoken);for(const [label,action] of [['Открыть окно сервиса',()=>window.petya.serviceBrowserOpen(result.serviceBrowser.id)],['Прочитать открытую страницу',read]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(async()=>{b.disabled=true;try{await action();}finally{b.disabled=false;}});dialogueChoices.append(b);}voiceReply=async text=>{if(/^(?:готово|прочитай|продолжи|читай)/iu.test(text))await read();else await processCommand(text,Date.now(),spoken);};}
 if(result.dictionaryProposal){
  const save=async()=>{await window.petya.dictionarySave(result.dictionaryProposal);dialogueChoices.replaceChildren();voiceReply=null;notice('Исправление сохранено.');if(spoken)await speakReply('Запомнил исправление.');};
  const b=document.createElement('button');b.type='button';b.textContent='Запомнить исправление';b.onclick=run(save);dialogueChoices.append(b);
  const edit=document.createElement('button');edit.type='button';edit.textContent='Изменить правило';edit.onclick=()=>{view('learning');editDictionary({...result.dictionaryProposal,id:''});};dialogueChoices.append(edit);
  const skip=document.createElement('button');skip.type='button';skip.textContent='Только для этого разговора';skip.onclick=()=>{dialogueChoices.replaceChildren();voiceReply=null;notice('Уточнение осталось в контексте разговора.');};dialogueChoices.append(skip);
  voiceReply=async text=>{if(/^(?:да|запомни|сохрани)(?=$|[\s,.!])/iu.test(text))await save();else if(/нет|не надо|только|не сохраняй/iu.test(text))skip.click();else await processCommand(text,Date.now(),spoken);};
 }
 for(const item of result.mediaChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(()=>inspectSourceMedia(item.id,result.mediaQuestion,spoken));dialogueChoices.append(b);}
 if(result.mediaChoices?.length)voiceReply=async text=>{const item=result.mediaChoices[Number(text.trim())-1]||result.mediaChoices.find(r=>r.label.toLowerCase()===text.trim().toLowerCase());if(item)await inspectSourceMedia(item.id,result.mediaQuestion,spoken);else await showDialogueReply(result,spoken);};
 for(const item of result.repairChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.repairSelect(item.id),spoken));dialogueChoices.append(b);}
 if(result.repairChoices?.length)voiceReply=async text=>{const item=result.repairChoices[Number(text.trim())-1]||result.repairChoices.find(r=>r.label.toLowerCase()===text.trim().toLowerCase());if(item)await showDialogueReply(await window.petya.repairSelect(item.id),spoken);else await processCommand(text,Date.now(),spoken);};
 for(const item of result.buildQuestionChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.buildQuestionSelect(item.id),spoken));dialogueChoices.append(b);}
 if(result.buildQuestionChoices?.length)voiceReply=async text=>showDialogueReply(await window.petya.converse(text),spoken);
 for(const item of result.reviewChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.reviewSelect(item.id),spoken));dialogueChoices.append(b);}
 if(result.reviewChoices?.length)voiceReply=async text=>showDialogueReply(await window.petya.converse(text),spoken);
 for(const item of result.trackingChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.taskProgress(item.id),spoken));dialogueChoices.append(b);}
 if(result.trackingChoices?.length)voiceReply=async text=>{const i=Number(text.trim())-1;const match=Number.isInteger(i)?result.trackingChoices[i]:result.trackingChoices.find(v=>text.includes(v.label.split(' · ')[0]));if(match)await showDialogueReply(await window.petya.taskProgress(match.id),spoken);else await showDialogueReply(result,spoken);};
 if(result.appliedRules?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Как Петя понял фразу';details.append(summary);for(const r of result.appliedRules){const p=document.createElement('p');p.textContent=r.from+' → '+r.to+' ('+(r.scope||'общее правило')+')';details.append(p);}dialogueChoices.append(details);}
 if(result.webPending){const b=document.createElement('button');b.type='button';b.textContent='Продолжить поиск';b.onclick=run(async()=>showDialogueReply(await window.petya.webSearchContinue(),spoken));dialogueChoices.append(b);}
 if(result.openHistory){const b=document.createElement('button');b.type='button';b.textContent='Открыть историю изменений';b.onclick=()=>view('history');dialogueChoices.append(b);}
 for(const target of result.interpretChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=target==='claude'?'Спросить Claude':'Спросить Codex';b.onclick=run(async()=>{b.disabled=true;try{await showDialogueReply(await window.petya.interpret(result.interpretCommand,target),spoken);}finally{b.disabled=false;}});dialogueChoices.append(b);}
 if(result.interpretChoices?.length){const b=document.createElement('button');b.type='button';b.textContent='Отложить';b.onclick=()=>{dialogueChoices.replaceChildren();notice('Повторите фразу, когда будете готовы.');};dialogueChoices.append(b);}
 for(const option of result.options||[]){const b=document.createElement('button');b.type='button';b.textContent=option.label;b.onclick=run(async()=>showDialogueReply(await window.petya.converse(option.label,option.id),spoken));dialogueChoices.append(b);}
 for(const topic of result.topicChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=topic.title;b.onclick=run(()=>selectDialogueTopic(topic.id));dialogueChoices.append(b);}
 notice(result.text,!!result.error);await refreshTopics();
 if(result.question||result.topicChoices||result.interpretChoices?.length||result.error){await window.petya.requestAttention();await window.petya.notify(result.text);}
 if(result.interpretChoices?.length){voiceReply=async reply=>{
   if(/отлож|потом/iu.test(reply)){voiceReply=null;dialogueChoices.replaceChildren();notice('Разъяснение отложено.');return;}
   const target=/(?:codex|кодекс)/iu.test(reply)?'codex':/(?:claude|клод|клауд)/iu.test(reply)?'claude':/^1[.!?]?$/.test(reply.trim())?result.interpretChoices[0]:/^2[.!?]?$/.test(reply.trim())?result.interpretChoices[1]:'';
   if(!result.interpretChoices.includes(target)){await showDialogueReply(result,spoken);return;}
   await showDialogueReply(await window.petya.interpret(result.interpretCommand,target),spoken);
 };}
 const options=(result.options||result.topicChoices||result.mediaChoices||result.repairChoices||result.buildQuestionChoices||result.reviewChoices||result.trackingChoices||result.interpretChoices?.map(id=>({label:id}))||[]).slice(0,8).map((o,i)=>(i+1)+' — '+(o.label||o.title));
 if(spoken)await speakReply(result.text+(options.length?' Варианты: '+options.join('; '):''));else if(mic.active)voiceTurn.arm();
 if(result.repairHandoff)await handleDoHandoff(result.repairHandoff);
}
refreshTopics().catch(e=>notice(e.message,true));
const playCard=document.createElement('article');playCard.className='card';playCard.dataset.service='googleplay';
const playTitle=document.createElement('h2');playTitle.textContent='Google Play Console';
const playHelp=document.createElement('p');playHelp.textContent='Петя читает ANR из Android vitals. Включите Play Developer Reporting API в Google Cloud и дайте сервисному аккаунту право просмотра информации о приложениях в Play Console. Затем импортируйте JSON-ключ. Ключ хранится зашифрованным на этом компьютере.';
const playStatus=document.createElement('p');playStatus.className='connection-status';playStatus.textContent='Не подключено';
const playImport=document.createElement('button');playImport.type='button';playImport.textContent='Импортировать ключ Google';
playImport.onclick=run(async()=>{const settings=await window.petya.googlePlayImport();renderModules(settings);playStatus.textContent=settings.hasGooglePlay?'Ключ сохранён. Проверьте доступ.':'Не подключено';});
const playCheck=document.createElement('button');playCheck.type='button';playCheck.textContent='Проверить доступ';playCheck.onclick=run(async()=>{playCheck.disabled=true;try{const r=await window.petya.googlePlayCheck();playStatus.textContent='Доступно приложений: '+r.apps.length;playStatus.className='connection-status connected';}catch(e){playStatus.textContent=e.message;playStatus.className='connection-status error';}finally{playCheck.disabled=false;}});
const playDisconnect=document.createElement('button');playDisconnect.type='button';playDisconnect.textContent='Отключить';playDisconnect.onclick=run(async()=>{await window.petya.googlePlayDisconnect();playStatus.textContent='Не подключено';playStatus.className='connection-status';});
playCard.append(playTitle,playHelp,playStatus,playImport,playCheck,playDisconnect);$('settings-form').insertBefore(playCard,$('settings-form').querySelector(':scope > button'));
window.petya.settings().then(s=>{playCard.hidden=s.module_googleplay==='false';playStatus.textContent=s.hasGooglePlay?'Ключ сохранён · проверьте доступ':'Не подключено';});

const interpretButton=document.createElement('button');interpretButton.type='button';interpretButton.textContent='Петя не понял — спросить помощника';$('command-form').after(interpretButton);interpretButton.onclick=run(async()=>{interpretButton.disabled=true;try{notice('Запрашиваю разъяснение…');await showDialogueReply(await window.petya.interpret($('command').value,''),false);}finally{interpretButton.disabled=false;}});

const dailyButton=document.createElement('button');dailyButton.type='button';dailyButton.textContent='Что у нас сегодня?';$('command-form').after(dailyButton);dailyButton.onclick=run(async()=>showDialogueReply(await window.petya.dailyBrief()));
