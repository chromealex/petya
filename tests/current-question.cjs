const assert=require('node:assert/strict');
const {ConversationInput}=require('../src/ui/conversation-input.js');
const {VoiceTurn}=require('../src/ui/voice-turn.js');
const {routingRequest}=require('../src/semantic-tools.cjs');
for(const text of ['Ты тут?','ты тут','Петя, ты здесь?','Ты на связи?','Слышишь меня?','Петя! Ты меня слышишь?']){
 const reply=ConversationInput.presenceReply(text);assert.equal(reply.text,'Да, я здесь. Чем помочь?');assert.equal(reply.messages[0].text,text);assert.equal(VoiceTurn.isNewQuestion(text),true);
}
for(const text of ['Где Костя?','Ты тут создай задачу','Объясни «ты тут?»','Если ты тут, проверь Jira','Он спросил: ты тут?','не проверяй','первый','да'])assert.equal(ConversationInput.presenceReply(text),null,text);
assert.equal(VoiceTurn.isNewQuestion('первый'),false);
const request=routingRequest('local','Ты тут?',{topic:{title:'кгдер',messages:[{role:'user',text:'кгдер'},{role:'assistant',text:'Костя где?'}]}});
assert.equal(request.messages.at(-1).content,'Текущая реплика пользователя: Ты тут?');
console.log('Current question: presence check bypasses stale clarification, punctuation-free voice input, exact match and explicit latest prompt passed');
