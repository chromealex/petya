const assert=require('node:assert/strict');const {reply}=require('../src/capabilities-reply.cjs');
const settings={jiraUrl:'https://fixture.invalid',jiraEmail:'me@example.invalid',jiraToken:'fixture',jiraProjects:'BW,MW2'};const topic={messages:[]};
for(const [i,q]of ['Что ты умеешь?','А еще что?','Что ещё?','А ещё?'].entries()){const r=reply(q,topic,settings,[{name:'project-status',enabled:true}]);assert(r);assert.equal(r.capabilityPage,i);assert.notEqual(r.text,topic.capabilityReply);assert(!/BW|MW2/.test(r.text));topic.capabilityReply=r.text;topic.capabilityPage=r.capabilityPage;topic.messages.push({role:'assistant',text:r.text});}
assert.equal(reply('А еще что?',{messages:[]},settings),null);assert.equal(reply('Что ты умеешь делать в Jira, проверь мои задачи',topic,settings),null);assert.equal(reply('Не рассказывай что ты умеешь',topic,settings),null);
assert(reply('Что ты умеешь?',null,settings).text.includes('Jira подключён'));assert(reply('Что ты умеешь?',null,{}).text.includes('Jira нужно подключить'));topic.messages.push({role:'assistant',text:'Другая тема'});assert.equal(reply('А еще что?',topic,settings),null);
console.log('Capabilities: grounded feature list, connection state, non-repeating follow-ups, enabled skills and unrelated context passed');

assert.match(reply('Покажи',{messages:[{role:'user',text:'Что ты умеешь?'},{role:'assistant',text:'Старый неверный ответ'},{role:'user',text:'Это все?'},{role:'assistant',text:'Нет'},{role:'user',text:'Что нет?'},{role:'assistant',text:'Не могу рисовать'}]},{}).text,/примеры/);
