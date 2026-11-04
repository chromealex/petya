window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));
const dialogueCard=document.createElement('article');dialogueCard.className='card dialogue-card';
const dialogueTitle=document.createElement('h2');dialogueTitle.textContent='Диалог с Петей';
const topicSelect=document.createElement('select');topicSelect.setAttribute('aria-label','Тема разговора');
const newTopic=document.createElement('button');newTopic.type='button';newTopic.textContent='Новая тема';
const stopSpeech=document.createElement('button');stopSpeech.type='button';stopSpeech.textContent='Остановить ответ';
const topicControls=document.createElement('div');topicControls.className='actions topic-controls';topicControls.append(topicSelect,newTopic,stopSpeech);
const dialogueMessages=document.createElement('div');dialogueMessages.setAttribute('aria-live','polite');dialogueMessages.className='dialogue-messages';
const dialogueChoices=document.createElement('div');dialogueChoices.className='actions';
dialogueCard.append(dialogueTitle,topicControls,dialogueMessages,dialogueChoices);$('command-help').after(dialogueCard);
window.replyVoicePaused=false;
window.pauseReplyVoice=()=>{const audio=replyAudioSource||streamingAudio;if(!audio||audio.ended)return null;audio.pause();window.replyVoicePaused=true;window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));return async()=>{if(audio!==(replyAudioSource||streamingAudio))return;window.replyVoicePaused=false;window.petyaSpeaking=true;document.dispatchEvent(new Event('petya-speaking'));await audio.play();};};
let streamingAudio=null,streamingURL=null,streamingWatch=null,streamingReject=null,spokenStreamId='';
function cancelStreamingAudio(){
 if(streamingWatch){clearInterval(streamingWatch);streamingWatch=null;}
 if(streamingAudio){streamingAudio.onended=null;streamingAudio.onerror=null;streamingAudio.pause();streamingAudio.removeAttribute('src');streamingAudio.load();streamingAudio=null;}
 if(streamingURL){URL.revokeObjectURL(streamingURL);streamingURL=null;}
 const reject=streamingReject;streamingReject=null;reject?.(Error('Озвучивание остановлено.'));
}
function releaseStreamingMic(){window.answerVoiceEnd?.();window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));if(mic.active)voiceTurn.arm();}
const streamedVoice=new window.StreamingSpeech({
 cancel:()=>{cancelStreamingAudio();window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));},
 onIdle:()=>{const id=spokenStreamId,epoch=streamedVoice.epoch;setTimeout(()=>{if(epoch===streamedVoice.epoch&&id===spokenStreamId&&streamedVoice.stopped)releaseStreamingMic();},500);},
 onError:error=>{releaseStreamingMic();notice('Потоковое озвучивание прервалось: '+error.message);},
 speak:async text=>{
  const epoch=streamedVoice.epoch;window.petyaSpeaking=true;document.dispatchEvent(new Event('petya-speaking'));voiceTurn.reset();
  const encoded=await window.petya.synthesizeVoice(text);if(epoch!==streamedVoice.epoch)throw Error('Отменено');if(encoded?.languageRequired){window.offerVoiceLanguage?.(text,encoded.languageRequired);stopStreamedVoice();releaseStreamingMic();return;}if(!encoded)return;
  await new Promise((resolve,reject)=>{
   streamingURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'audio/wav'}));
   const audio=new Audio(streamingURL);window.answerVoiceSegment?.(audio,text);streamingAudio=audio;streamingReject=reject;audio.preservesPitch=true;audio.defaultPlaybackRate=1.0;audio.playbackRate=window.chatSpeechRate?.()||1;
   const finish=error=>{if(streamingAudio!==audio)return;streamingReject=null;cancelStreamingAudio();if(error)reject(error);else resolve();};
   audio.onended=()=>{window.answerVoiceSegmentEnd?.();finish();};audio.onerror=()=>finish(Error('Не удалось воспроизвести фрагмент.'));
   let lastPosition=0,lastProgress=Date.now();streamingWatch=setInterval(()=>{if(window.replyVoicePaused){lastProgress=Date.now();return;}if(audio.currentTime>lastPosition){lastPosition=audio.currentTime;lastProgress=Date.now();}if(audio.ended||Number.isFinite(audio.duration)&&audio.duration>0&&audio.currentTime>=audio.duration)finish();else if(Date.now()-lastProgress>5000)finish(Error('Воспроизведение остановилось.'));},250);
   Promise.resolve(audio.play()).catch(finish);
  });
 }
});
function stopStreamedVoice(){window.replyVoicePaused=false;window.answerVoiceEnd?.();streamedVoice.stop();window.petya.stopVoice().catch(()=>{});window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));}
window.stopStreamedVoice=stopStreamedVoice;


// Transient preview; only the final response enters history. Speech uses complete sentences.
let answerPreview=null,answerStreamId='',answerStreamHidden=false,answerPace=null,answerShown=0;
window.petyaEvents.onAnswerChunk?.(chunk=>{
 // Background chats tag their stream with the chat: show only the open chat's stream, never speak it,
 // and pick it up mid-way when the user opens that chat while the answer is being written.
 if(chunk.topicId){
  if(chunk.topicId!==topicSelect.value)return;
  if(chunk.start||((chunk.id!==answerStreamId||answerStreamHidden)&&!chunk.end&&typeof chunk.text==='string')){answerPace?.stop();answerPace=null;answerShown=0;answerPreview?.remove();answerPreview=null;answerStreamId=chunk.id;answerStreamHidden=false;if(chunk.start)return;}
 }
 else if(chunk.start){answerPace?.stop();answerPace=null;answerShown=0;if(window.shouldSpeakChat?.(window.streamSpeechEnabled)??window.streamSpeechEnabled){++speechEpoch;releaseReplyAudio();spokenStreamId=chunk.id;streamedVoice.start();window.answerVoiceBegin?.();}answerPreview?.remove();answerPreview=null;answerStreamId=chunk.id;answerStreamHidden=false;return;}
 if(chunk.id!==answerStreamId)return;
 if(chunk.end){answerShown=answerPace?.shown||0;if(chunk.topicId)window.lastStreamShown={topicId:chunk.topicId,length:answerShown};answerPace?.stop();if(chunk.id===spokenStreamId)streamedVoice.generationEnded();answerPreview?.remove();answerPreview=null;answerStreamId='';return;}
 if(answerStreamHidden||typeof chunk.text!=='string')return;
 if(chunk.id===spokenStreamId)streamedVoice.feed(chunk.text);
 if(!chunk.text){answerPreview?.remove();answerPreview=null;return;}
 if(!answerPreview){answerPreview=document.createElement('p');answerPreview.className='message assistant';answerPreview.setAttribute('aria-label','Петя отвечает');dialogueMessages.append(answerPreview);}
 if(!answerPace)answerPace=window.createAnswerPace(part=>{if(answerPreview)answerPreview.textContent=part;},{spoken:chunk.id===spokenStreamId});answerPace.update(chunk.text);
});
document.addEventListener('petya-topic-changed',()=>{answerStreamHidden=true;answerPace?.stop();answerPace=null;answerPreview?.remove();answerPreview=null;});
let speechEpoch=0, replyAudioSource=null, replyAudioURL=null, replyAudioWatch=null;
function releaseReplyAudio(){
 if(replyAudioWatch){clearInterval(replyAudioWatch);replyAudioWatch=null;}
 if(replyAudioSource){replyAudioSource.onended=null;replyAudioSource.onerror=null;replyAudioSource.pause();replyAudioSource.removeAttribute('src');replyAudioSource.load();replyAudioSource=null;}
 if(replyAudioURL){URL.revokeObjectURL(replyAudioURL);replyAudioURL=null;}
}
async function speakReply(text,{continueConversation=false}={}){
 if(window.chatVoiceOff?.())return;
 window.stopStreamedVoice?.();
 const epoch=++speechEpoch;releaseReplyAudio();window.answerVoiceBegin?.();
 window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));voiceTurn.reset();
 let finished=false;
 const done=()=>{if(epoch!==speechEpoch||finished)return;finished=true;releaseReplyAudio();window.answerVoiceEnd?.();setTimeout(()=>{if(epoch!==speechEpoch)return;window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));if(mic.active&&(voiceReply||continueConversation))voiceTurn.arm();},500);};
 try {
  const encoded=await window.petya.synthesizeVoice(text);
  if(epoch!==speechEpoch)return;
  if(encoded?.languageRequired){window.offerVoiceLanguage?.(text,encoded.languageRequired);done();return;}
  if(!encoded){done();return;}
  const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
  replyAudioURL=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
  const source=new Audio(replyAudioURL);window.answerVoiceSegment?.(source,text);replyAudioSource=source;
  // Preserve the synthesized cadence without browser time compression.
  source.preservesPitch=true;source.defaultPlaybackRate=1.0;source.playbackRate=window.chatSpeechRate?.()||1;
  source.onended=done;
  source.onerror=()=>{if(epoch!==speechEpoch)return;done();notice(text+'\nНе удалось воспроизвести ответ.');};
  // Media events may be lost when the output device changes or playback stalls.
  // Check progress independently so a finished/broken answer cannot mute capture forever.
  let lastPosition=0,lastProgress=Date.now();
  replyAudioWatch=setInterval(()=>{
   if(epoch!==speechEpoch)return;
   if(window.replyVoicePaused){lastProgress=Date.now();return;}
   if(source.currentTime>lastPosition){lastPosition=source.currentTime;lastProgress=Date.now();}
   if(source.ended||(Number.isFinite(source.duration)&&source.duration>0&&source.currentTime>=source.duration)){done();return;}
   if(Date.now()-lastProgress>=5000){done();notice('Озвучивание прервалось. Микрофон снова слушает.');}
  },250);
  window.petyaSpeaking=true;document.dispatchEvent(new Event('petya-speaking'));
  // Do not hold command execution on a play() promise that never settles.
  Promise.resolve(source.play()).catch(error=>{if(epoch!==speechEpoch||finished)return;done();notice(text+'\n'+error.message);});
 } catch(error){if(epoch!==speechEpoch)return;done();notice(text+'\n'+error.message);}
}
stopSpeech.onclick=()=>{window.stopStreamedVoice?.();++speechEpoch;releaseReplyAudio();window.petya.stopVoice().catch(()=>{});window.petyaSpeaking=false;document.dispatchEvent(new Event('petya-speaking'));voiceTurn.reset();};
const previewVoice=document.createElement('button');previewVoice.type='button';previewVoice.textContent='Послушать голос';previewVoice.onclick=()=>speakReply('Привет! Я Петя. Давай спокойно разберёмся. Я посмотрю, что уже готово, и помогу со следующим шагом. С чего начнём?');topicControls.append(previewVoice);
const CHAT_PAGE_SIZE=30;
let chatHistory=[],chatHistoryStart=0,chatHistoryLoading=false;
const olderMessages=document.createElement('button');olderMessages.type='button';olderMessages.className='chat-history-more';olderMessages.textContent='Показать предыдущие сообщения';
function renderDialogueMessage(m){const p=window.renderMessage(m);if(m.generatedImage&&typeof m.generatedImage.png==='string'&&m.generatedImage.png.length<8*1024*1024&&/^[A-Za-z0-9+/]+={0,2}$/.test(m.generatedImage.png)){const box=document.createElement('div'),image=document.createElement('img'),save=document.createElement('button');box.className='generated-image';image.src='data:image/png;base64,'+m.generatedImage.png;image.alt='Созданное изображение';image.style.cssText='display:block;max-width:100%;width:512px;border-radius:12px';save.type='button';save.textContent='Сохранить PNG';const owner=m.topicId;save.onclick=run(async()=>{await window.petya.imageSave(owner,m.id);});box.append(image,save);p.querySelector('.message-content').append(box);}p.dataset.messageIndex=chatHistory.indexOf(m);return p;}
function updateHistoryButton(){olderMessages.remove();if(chatHistoryStart>0)dialogueMessages.prepend(olderMessages);}
function showDialogueMessages(messages){
 const sameHistory=chatHistory.length&&messages.length>=chatHistory.length&&messages[0]?.text===chatHistory[0]?.text&&messages[0]?.at===chatHistory[0]?.at;
 chatHistoryStart=sameHistory?chatHistoryStart:Math.max(0,messages.length-CHAT_PAGE_SIZE);
 chatHistory=messages.slice();window.applyChatPlaceholder($('command'),chatHistory);dialogueMessages.replaceChildren(...chatHistory.slice(chatHistoryStart).map(renderDialogueMessage));updateHistoryButton();
}
async function loadOlderChatMessages(){
 if(chatHistoryLoading||!chatHistoryStart)return;
 chatHistoryLoading=true;olderMessages.disabled=true;
 const feed=document.querySelector('.chat-feed'),history=chatHistory;
 try{
  await new Promise(resolve=>requestAnimationFrame(resolve));
  if(history!==chatHistory)return;
  const anchor=olderMessages.nextElementSibling,top=anchor?.getBoundingClientRect().top;
  const start=Math.max(0,chatHistoryStart-CHAT_PAGE_SIZE);
  const fragment=document.createDocumentFragment();for(const m of chatHistory.slice(start,chatHistoryStart))fragment.append(renderDialogueMessage(m));
  olderMessages.remove();dialogueMessages.prepend(fragment);chatHistoryStart=start;updateHistoryButton();
  if(feed&&anchor)feed.scrollTop+=anchor.getBoundingClientRect().top-top;
  document.dispatchEvent(new Event('petya-history-prepended'));
 }finally{chatHistoryLoading=false;olderMessages.disabled=false;}
}
olderMessages.onclick=loadOlderChatMessages;

async function refreshTopics(){const state=await window.petya.dialogueTopics();topicSelect.replaceChildren(new Option('Новая тема',''));for(const t of state.topics)topicSelect.add(new Option(t.title,t.id));topicSelect.value=state.activeId;topicSelect.dataset.projectId=state.activeProjectId;topicSelect.dataset.projectName=state.projects?.find(p=>p.id===state.activeProjectId)?.name||'Общее';document.dispatchEvent(new CustomEvent('petya-dialogue-state',{detail:state}));}
async function selectDialogueTopic(id,{internal=false}={}){if(!internal&&(window.chatStartPending||commandProgress.busy||planning||workspaceBusy))throw Error('Дождитесь завершения текущего действия.');window.chatSwitchPending=true;try{window.leaveBackgroundChat?.();window.stopStreamedVoice?.();if(window.chatQueue?.active){window.chatQueue.paused=true;throw Error('В очереди остались запросы этой темы. Выполните или удалите их перед сменой темы.');}document.dispatchEvent(new Event('petya-topic-changed'));const topic=await window.petya.dialogueSelect(id);chatHistory=[];showDialogueMessages(topic?.messages||[]);dialogueChoices.replaceChildren();dialogueTitle.textContent=topic?.title||'Диалог с Петей';window.offerReportShare?.(topic?.workReport?.id,dialogueChoices);await refreshTopics();window.activateChatQueue?.(id,topicSelect.dataset.projectId);if(typeof refreshAttachments==='function')await refreshAttachments();await window.restoreChatJob?.(id);}finally{window.chatSwitchPending=false;}}
topicSelect.onchange=run(()=>selectDialogueTopic(topicSelect.value));newTopic.onclick=run(()=>selectDialogueTopic(''));
async function showDialogueReply(result,spoken=false){
 spoken=window.shouldSpeakChat?.(spoken)??spoken;
 voiceReply=null;
 document.dispatchEvent(new CustomEvent('petya-topic-changed',{detail:{preserveScroll:!result.topicId||result.topicId===topicSelect.value}}));
 if(result.projectChanged){voiceReply=null;voiceTurn.reset();await refreshTopics();await selectDialogueTopic(topicSelect.value,{internal:true});}
 if(result.projectMemoryReply)voiceReply=async answer=>showDialogueReply(await window.petya.projectMemoryReply(answer),spoken);
 if(result.teamUpdated)document.dispatchEvent(new Event('petya-team-updated'));
 if(result.teamFillReply)voiceReply=async answer=>showDialogueReply(await window.petya.teamFillReply(answer),spoken);
 if(result.error&&result.messages?.at(-1)?.role==='assistant')result.messages.at(-1).error=true;
 if(result.messages)showDialogueMessages(result.messages);else {const message={role:'assistant',text:result.text,at:Date.now(),error:!!result.error,sources:result.sources||[],usedMaterials:result.usedMaterials||[],evidence:result.evidence||[]};chatHistory.push(message);dialogueMessages.append(renderDialogueMessage(message));}
 const newest=[...dialogueMessages.querySelectorAll('.message-assistant')].filter(n=>n.querySelector('.message-content')).at(-1);if(!result.error&&!result.computerApproval)window.revealAnswer?.(newest,result.text,{spoken,initial:result.answerStreamId===spokenStreamId||result.answerStreamId?answerShown:0});
 if(result.text)window.checkVoiceLanguages?.(result.text,newest);
 window.applyChatPlaceholder($('command'),chatHistory,result);
 dialogueTitle.textContent=result.topicTitle||'Диалог с Петей';dialogueChoices.replaceChildren();window.offerReportShare?.(result.reportShareId,dialogueChoices);if(result.computerApproval)window.showComputerApproval(result.computerApproval,newest,spoken);
 if(result.gitDiscovery){const found=result.gitDiscovery;for(const root of found.repositories){const b=document.createElement('button');b.type='button';b.textContent='Работать с '+root;b.onclick=run(async()=>{await window.petya.gitSelect(root,found.projectId);await processCommand(result.gitCommand||'статус гита');});dialogueChoices.append(b);}if(!found.repositories.length&&!found.partial&&!found.warnings.length)for(const folder of found.missing){const b=document.createElement('button');b.type='button';b.textContent='Создать Git в '+folder;b.onclick=run(async()=>{b.disabled=true;try{const created=await window.petya.gitInit(folder,found.projectId);await showDialogueReply({handled:true,text:created.text},spoken);}finally{b.disabled=false;}});dialogueChoices.append(b);}}


 for(const option of result.skillChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=option.label;b.onclick=run(async()=>{b.disabled=true;try{await showDialogueReply(await window.petya.skillsContinue(option.id),spoken);}finally{b.disabled=false;}});dialogueChoices.append(b);}
 if(result.skillChoices?.length)voiceReply=async text=>{const option=result.skillChoices[Number(text.trim())-1]||result.skillChoices.find(o=>o.label.toLocaleLowerCase()===text.trim().toLocaleLowerCase());if(option){voiceReply=null;await showDialogueReply(await window.petya.skillsContinue(option.id),spoken);}else await processCommand(text,Date.now(),spoken);};
 if(result.skillDraftId){const b=document.createElement('button');b.type='button';b.textContent='Открыть план задач Jira';b.onclick=run(async()=>{b.disabled=true;try{if(workspaceBusy||currentDraft||frozenBatch)throw Error('Сначала завершите текущий план.');const context=await window.petya.skillsDraft(result.skillDraftId);commandSnapshot='Подготовь задачи по выбранной встрече';currentIntent='jira';automaticVoiceCommand=false;const resume=route=>openWorkspace(context,route);const route=await selectJiraRoute(context,resume);if(route)await resume(route);}finally{b.disabled=false;}});dialogueChoices.append(b);}
 for(const offer of result.integrationOffers||[]){for(const [choice,label] of [['api','Подключить '+offer.name],['browser','Без интеграции: браузер '+offer.name]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(async()=>showDialogueReply(await window.petya.integrationChoice(offer.id,choice),spoken));dialogueChoices.append(b);}}
 if(result.integrationOffers?.length)voiceReply=async text=>{const offer=result.integrationOffers.length===1?result.integrationOffers[0]:result.integrationOffers.find(o=>text.toLowerCase().includes(o.name.toLowerCase()));if(!offer){await showDialogueReply(result,spoken);return;}const choice=/(?:не надо|не хочу|откаж|отказ|(?:^|\s)нет(?:$|[\s,.!?])|без интеграции|браузер)/iu.test(text)?'browser':/(?:подключ|^да(?:$|[\s,.!?])|интеграци)/iu.test(text)?'api':'';if(choice)await showDialogueReply(await window.petya.integrationChoice(offer.id,choice),spoken);else await showDialogueReply(result,spoken);};
 if(result.integrationSettings){await modulesReady;renderModules(await window.petya.settings());view('settings');const card=document.querySelector('[data-service="'+result.integrationSettings+'"]');if(card){window.revealSettings?.(card);card.scrollIntoView({block:'start'});}}
 if(result.integrationRetry){const b=document.createElement('button');b.type='button';b.textContent='Повторить запрос';b.onclick=run(()=>processCommand(result.integrationRetry,Date.now(),spoken));dialogueChoices.append(b);}
 if(result.serviceBrowser){const read=async()=>showDialogueReply(await window.petya.serviceBrowserRead(result.serviceBrowser.id),spoken);for(const [label,action] of [['Открыть окно сервиса',()=>window.petya.serviceBrowserOpen(result.serviceBrowser.id)],['Прочитать открытую страницу',read]]){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run(async()=>{b.disabled=true;try{await action();}finally{b.disabled=false;}});if(action===read)b.dataset.browserService=result.serviceBrowser.service;dialogueChoices.append(b);}voiceReply=async text=>{if(/^(?:готово|прочитай|продолжи|читай)/iu.test(text))await read();else await processCommand(text,Date.now(),spoken);};}
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
 for(const item of result.slackRequestChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.slackRequestReply(item.id),spoken));dialogueChoices.append(b);}
 if(result.slackRequestChoices?.length)voiceReply=async text=>{const next=/^(?:петя[\s,:.!?—-]*)?(?:(?:теперь\s+)?работаем|переключись|выбери проект|попроси)(?=$|[\s,.!?])/iu.test(text);await showDialogueReply(await (next?window.petya.converse(text):window.petya.slackRequestReply(text)),spoken);};
 for(const item of result.buildQuestionChoices||[]){const b=document.createElement('button');b.type='button';b.textContent=item.label;b.onclick=run(async()=>showDialogueReply(await window.petya.buildQuestionSelect(item.id),spoken));dialogueChoices.append(b);}
 if(result.buildQuestionChoices?.length||result.buildQuestionRetry)voiceReply=async text=>showDialogueReply(await window.petya.converse(text),spoken);
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
 window.renderClarification?.(result,newest,spoken);
 commandProgress.update(result.error?'error':voiceReply||result.question?'waiting':'done', result.error?result.text:voiceReply||result.question?'Жду уточнения':'Готово');
 notice(result.text,!!result.error);$('notice').hidden=true;updateChromeStatus();await refreshTopics();
 if(result.question||result.topicChoices||result.interpretChoices?.length||result.error){await window.petya.requestAttention();await window.petya.notify(result.text);}
 if(result.interpretChoices?.length){voiceReply=async reply=>{
   if(/отлож|потом/iu.test(reply)){voiceReply=null;dialogueChoices.replaceChildren();notice('Разъяснение отложено.');return;}
   const target=/(?:codex|кодекс)/iu.test(reply)?'codex':/(?:claude|клод|клауд)/iu.test(reply)?'claude':/^1[.!?]?$/.test(reply.trim())?result.interpretChoices[0]:/^2[.!?]?$/.test(reply.trim())?result.interpretChoices[1]:'';
   if(!result.interpretChoices.includes(target)){await showDialogueReply(result,spoken);return;}
   await showDialogueReply(await window.petya.interpret(result.interpretCommand,target),spoken);
 };}
 const options=(result.clarificationOptions?.map(label=>({label}))||result.skillChoices||result.slackRequestChoices||result.options||result.topicChoices||result.mediaChoices||result.repairChoices||result.buildQuestionChoices||result.reviewChoices||result.trackingChoices||result.interpretChoices?.map(id=>({label:id}))||[]).slice(0,8).map((o,i)=>(i+1)+' — '+(o.label||o.title));
 const voiceText=result.text+(options.length?' Варианты: '+options.join('; '):'');
 if(spoken&&result.answerStreamId===spokenStreamId){if(result.error){if(!streamedVoice.stopped){stopStreamedVoice();await speakReply(voiceText,{continueConversation:true});}}else streamedVoice.finish(voiceText);}
 else if(spoken)await speakReply(voiceText,{continueConversation:true});else if(mic.active&&voiceReply)voiceTurn.arm();
 await window.finishForegroundChat?.(result);
 if(result.repairHandoff)await handleDoHandoff(result.repairHandoff);
}
refreshTopics().then(async()=>{if(topicSelect.value&&!dialogueMessages.childElementCount&&!commandProgress.busy)await selectDialogueTopic(topicSelect.value);}).catch(e=>notice(e.message,true));
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

const interpretButton=document.createElement('button');interpretButton.type='button';interpretButton.textContent='Петя не понял — спросить помощника';$('command-shortcuts').append(interpretButton);interpretButton.onclick=run(async()=>{interpretButton.disabled=true;try{notice('Запрашиваю разъяснение…');await showDialogueReply(await window.petya.interpret($('command').value||commandSnapshot,''),false);}finally{interpretButton.disabled=false;}});

const dailyButton=document.createElement('button');dailyButton.type='button';dailyButton.textContent='Что у нас сегодня?';$('command-shortcuts').prepend(dailyButton);dailyButton.onclick=run(async()=>showDialogueReply(await window.petya.dailyBrief()));

window.jumpToChatMessage=async index=>{if(!Number.isInteger(index)||index<0||index>=chatHistory.length)return;chatHistoryStart=Math.min(chatHistoryStart,index);showDialogueMessages(chatHistory);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const node=dialogueMessages.querySelector('[data-message-index="'+index+'"]');if(node){node.scrollIntoView({block:'center'});document.querySelector('.chat-feed')?.dispatchEvent(new Event('scroll'));node.classList.add('chat-search-match');setTimeout(()=>node.classList.remove('chat-search-match'),2500);}};

const cancelImage=document.createElement('button');cancelImage.type='button';cancelImage.textContent='Остановить генерацию';cancelImage.onclick=run(async()=>{await window.petya.imageCancel();});topicControls.append(cancelImage);
