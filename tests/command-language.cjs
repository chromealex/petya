// Requests in another language are routed as a Russian rewrite; Russian, identifiers and failed
// rewrites go on unchanged. The wake word is also recognised in Latin letters.
const assert=require('node:assert/strict');
const {foreign,toRussian,request}=require('../src/command-language.cjs');
(async()=>{
 for(const text of ['create a task in Jira','Petya, show my tasks','stop','what is ANR?','Erstelle eine Aufgabe','summarize https://example.com/a'])assert.equal(foreign(text),true,text);
 for(const text of ['Создай задачу в Jira','Jira','feature/test','DEV-42','https://example.com','ok','x = 5;',''])assert.equal(foreign(text),false,text);
 const reply=(request,language='en')=>async()=>({message:{content:JSON.stringify({language,request})}});
 assert.deepEqual(await toRussian('create a task in Jira',{model:'m',ask:reply('Создай задачу в Jira')}),{text:'Создай задачу в Jira',original:'create a task in Jira',language:'en'});
 assert.equal((await toRussian('show my tasks',{model:'m',ask:reply('«Покажи мои задачи»')})).text,'Покажи мои задачи');
 assert.equal((await toRussian('Erstelle eine Aufgabe',{model:'m',ask:reply('Создай задачу','de')})).language,'de');
 assert.equal((await toRussian('make a task',{model:'m',ask:reply('Создай задачу','??')})).language,'en');
 assert.equal(await toRussian('show my tasks',{model:'m',ask:async()=>({message:{content:'not json'}})}),null);
 // Russian text is not sent to the model at all.
 let asked=0;assert.equal(await toRussian('Покажи задачи',{model:'m',ask:async()=>{asked++;}}),null);assert.equal(asked,0);
 // No model, a non-Russian answer, an error or a slow model: route as it is.
 assert.equal(await toRussian('show my tasks',{ask:reply('Покажи')}),null);
 assert.equal(await toRussian('show my tasks',{model:'m',ask:reply('Show my tasks')}),null);
 assert.equal(await toRussian('show my tasks',{model:'m',ask:async()=>{throw Error('down');}}),null);
 assert.equal(await toRussian('show my tasks',{model:'m',timeoutMs:20,ask:()=>new Promise(()=>{})}),null);
 const body=request('m','show my tasks');assert.equal(body.stream,false);assert.equal(body.messages.at(-1).content,'show my tasks');
 // «Язык ответов»: fixed, or the language of the question carried through the request.
 const q=require('../src/question-language.cjs');
 assert.equal(q.replyLanguage('en','Покажи задачи'),'en');
 assert.equal(q.replyLanguage('auto','Покажи задачи'),'ru');
 assert.equal(q.replyLanguage('auto','show tasks'),'same');
 assert.equal(await q.run('de',async()=>{await new Promise(r=>setTimeout(r,5));return q.replyLanguage('auto','Покажи задачи');}),'de');
 assert.equal(q.current(),'');
 assert.equal(q.voiceLanguage('auto','Готово.'),'ru');assert.equal(q.voiceLanguage('auto','Done.'),'en');assert.equal(q.voiceLanguage('ru','Done.'),'ru');
 const rules=require('../src/dialogue-request.cjs').dialogueRequest({model:'m',command:'Покажи задачи',topic:{messages:[]},company:'A',communicationLanguage:'auto'}).messages[0].content;
 assert.match(await q.run('en',async()=>require('../src/dialogue-request.cjs').dialogueRequest({model:'m',command:'Покажи задачи',topic:{messages:[]},company:'A',communicationLanguage:'auto'}).messages[0].content),/по-английски/);
 assert.match(rules,/по-русски/);
 // «Язык речи»: interface language by default, an older fixed non-Russian reply language kept, or automatic.
 assert.equal(q.speechLanguage({},'en'),'en');
 assert.equal(q.speechLanguage({communicationLanguage:'de'},'ru'),'de');
 assert.equal(q.speechLanguage({communicationLanguage:'auto'},'ru'),'ru');
 assert.equal(q.speechLanguage({speechLanguage:'auto',communicationLanguage:'de'},'ru'),'');
 assert.equal(q.speechLanguage({speechLanguage:'en'},'ru'),'en');
 const {wake}=require('../src/core.cjs');
 assert.equal(wake('Petya, create a task'),'create a task');
 assert.equal(wake('Петя, создай задачу'),'создай задачу');
 assert.equal(wake('Peterson said hi'),null);
 console.log('Command language: foreign requests are rewritten for routing, the rest pass unchanged');
})().catch(error=>{console.error(error);process.exit(1);});
