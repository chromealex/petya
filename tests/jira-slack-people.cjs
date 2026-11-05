const assert=require('node:assert/strict');
const {matches,turn}=require('../src/features/jira-slack-people.cjs');
(async()=>{
 const command='Пойди в жиру и возьми все имена, потом пойди в слак и возьми по этим именам их должности';
 assert(matches(command));assert(!matches('Покажи задачи Jira'));assert(!matches('Отправь сообщение Slack'));
 const topic={id:'a',messages:[]},calls=[];
 const s={settings:{slackToken:'test'},workspace:{settings:()=>({}),api:async path=>{calls.push(path);return [{accountId:'1',accountType:'atlassian',displayName:'Анна'},{accountId:'2',accountType:'atlassian',displayName:'Олег'},{accountId:'3',accountType:'atlassian',displayName:'Иван'},{accountId:'4',accountType:'atlassian',displayName:'Мария'}];}},serviceAccess:{offer:async()=>null},request:async url=>{calls.push(url);return {ok:true,members:[{id:'s1',real_name:'Анна',profile:{title:'QA'}},{id:'s2',real_name:'Олег',profile:{}},{id:'s3',real_name:'Иван',profile:{title:'Dev'}},{id:'s4',real_name:'Иван',profile:{title:'PM'}}]};},dialogue:{active:()=>topic,rememberAction:(text,answer)=>topic.messages.push({role:'user',text},{role:'assistant',text:answer})}};
 const r=await turn(command,s);assert.match(r.text,/Анна — QA/);assert.match(r.text,/Олег — должность в профиле не указана/);assert.match(r.text,/Иван — несколько совпадений/);assert.match(r.text,/Мария — профиль Slack не найден/);assert.equal(topic.messages[0].text,command);assert(calls[0].includes('/users/search'));assert(calls[1].includes('users.list'));assert(!calls.some(x=>x.includes('search/jql')));
 s.serviceAccess.offer=async()=>({question:true,text:'Подключить Slack?'});calls.length=0;assert((await turn(command,s)).question);assert.equal(calls.length,0);
 console.log('Jira people → Slack titles: original request, ordered reads, ambiguous/missing/empty profiles and access gate passed');
})().catch(e=>{console.error(e);process.exit(1);});
