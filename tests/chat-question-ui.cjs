// All chat question adapters share layout, ownership and one-shot dismissal.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict'),fs=require('node:fs');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{console.error(code);throw e;}),sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const wait=async code=>{for(let i=0;i<120;i++){if(await js(code))return;await sleep(50);}throw Error('Timeout '+code);};
 await js('window.chatNavigationReady');win.setContentSize(1100,820);win.show();
 await js("view('home');window.answers=[]");
 // Strict choices contain no free-text form and dismiss before the response completes.
 await js(`dialogueChoices.replaceChildren();voiceReply=async text=>{answers.push(text);await new Promise(r=>window.releaseQuestion=r);};renderClarification({question:true,text:'Посмотреть в Slack?',clarificationOptions:['Посмотреть в Slack','Не сейчас'],clarificationInput:{choicesOnly:true,cancelLabel:'Не сейчас'}},null,false)`);
 assert.equal(await js("document.querySelectorAll('.chat-question button').length"),2);
 assert.equal(await js("document.querySelectorAll('.chat-question input').length"),0);
 await js("window.oldChoice=document.querySelector('.chat-question button');oldChoice.click();oldChoice.click()");
 assert.equal(await js('answers.length'),1);assert.equal(await js("!!document.querySelector('.chat-question')"),false);await js('releaseQuestion()');
 // Existing callback adapters: selectors and service prerequisites keep their behavior.
 for(const key of ['options','topicChoices','skillChoices','mediaChoices','repairChoices','slackRequestChoices','buildQuestionChoices','reviewChoices','trackingChoices','interpretChoices','integrationOffers','gitDiscovery','serviceBrowser']){
  await js(`voiceReply=null;dialogueChoices.replaceChildren();var choiceButton=document.createElement('button');choiceButton.textContent='Выбрать';choiceButton.onclick=async()=>{answers.push(${JSON.stringify(key)});};dialogueChoices.append(choiceButton);renderClarification({text:'Выберите вариант',${key}:['fixture']},null,false)`);
  assert(await js("!!document.querySelector('.chat-composer .chat-question .approval-question')"),key);
  await js("document.querySelector('.chat-question button').click()");assert.equal(await js('answers.at(-1)'),key);assert.equal(await js("!!document.querySelector('.chat-question')"),false);
 }
 // A follow-up question replaces, rather than resurrects, the previous question.
 await js(`dialogueChoices.replaceChildren();voiceReply=async()=>{dialogueChoices.replaceChildren();voiceReply=async text=>{answers.push(text);};renderClarification({question:true,text:'Какой канал?',clarificationOptions:['dev','qa'],clarificationInput:{choicesOnly:true}},null,false);};renderClarification({question:true,text:'Какой проект?',clarificationOptions:['BW','MW2'],clarificationInput:{choicesOnly:true}},null,false);document.querySelector('.chat-question button').click()`);
 await wait("document.querySelector('.chat-question')?.textContent.includes('Какой канал?')");assert.equal(await js("document.querySelectorAll('.chat-question').length"),1);
 await js("document.querySelector('.chat-question button').click()");assert.equal(await js('answers.at(-1)'),'dev');
 // Genuine failures are messages, not stuck forms.
 await js(`dialogueChoices.replaceChildren();voiceReply=async()=>{throw Error('Проверка ошибки');};renderClarification({question:true,text:'Продолжить?',clarificationOptions:['Да','Нет'],clarificationInput:{choicesOnly:true}},null,false);document.querySelector('.chat-question button').click()`);
 await wait("!document.querySelector('.chat-question') && dialogueMessages.textContent.includes('Проверка ошибки')");
 // Legacy run() callbacks also report failures in the conversation.
 await js(`voiceReply=null;dialogueChoices.replaceChildren();var failedChoice=document.createElement('button');failedChoice.textContent='Выбрать';failedChoice.onclick=run(async()=>{throw Error('Ошибка сервиса');});dialogueChoices.append(failedChoice);renderClarification({text:'Выберите сервис',integrationOffers:['fixture']},null,false);failedChoice.click()`);
 await wait("!document.querySelector('.chat-question') && dialogueMessages.textContent.includes('Ошибка сервиса')");
 // Voice questions expose the same choices and retain the original continuation.
 await js(`window.savedSpeakReply=speakReply;speakReply=async()=>{};automaticVoiceCommand=true;askVoiceChoices('Выберите проект',[{label:'BW',run:async()=>answers.push('voice-BW')},{label:'MW2',run:async()=>answers.push('voice-MW2')}]);document.querySelector('.chat-question button').click()`);
 await wait("answers.at(-1)==='voice-BW' && !document.querySelector('.chat-question')");await js('speakReply=savedSpeakReply;automaticVoiceCommand=false');
 // A detached question cannot act in another chat.
 await js(`dialogueChoices.replaceChildren();voiceReply=async text=>answers.push('stale');renderClarification({question:true,text:'Уточните',clarificationOptions:['Да','Нет'],clarificationInput:{choicesOnly:true}},null,false);window.staleButton=document.querySelector('.chat-question button');document.dispatchEvent(new Event('petya-topic-changed'));staleButton.click()`);
 assert.notEqual(await js('answers.at(-1)'),'stale');
 await js(`dialogueChoices.replaceChildren();voiceReply=async()=>{};renderClarification({question:true,text:'Выберите канал команды',clarificationOptions:['jw-bw-dev','jw-mw-dev'],clarificationInput:{choicesOnly:true}},null,false)`);
 await sleep(300);fs.writeFileSync('/private/tmp/petya-question-unified.png',(await win.webContents.capturePage()).toPNG());
 const bounds=await js(`(()=>{const q=document.querySelector('.chat-question').getBoundingClientRect(),c=document.querySelector('.chat-composer').getBoundingClientRect();return {left:q.left-c.left,right:c.right-q.right};})()`);assert(bounds.left<2&&bounds.right<2);
 console.log('Chat questions: 13 adapters, strict choices, immediate dismissal, duplicates, follow-up, failure and chat switch passed');
}};
require('../src/main.cjs');
