// Task questions in everyday word order (and misheard «Jira») reach the Jira reader, not the model.
const assert=require('node:assert/strict');
const {Dialogue,intent,jiraHeard}=require('../src/dialogue.cjs');const {dialogueRequest}=require('../src/dialogue-request.cjs');
(async()=>{
 const tasks=['Покажи мои задачи','Посмотри задачи','Задачи посмотри','Посмотри задачи в Jira','В Jira задачи посмотри','В жизни задачи посмотри','В джире задачи посмотри','Посмотри мои таски','Какие таски на мне?','Покажи список задач','Список задач','Какие задачи открыты?','Сколько у меня задач?','Глянь джиру','Посмотри джиру','Что в Jira?','Какие задачи в проекте?','Покажи задачи проекта BW','Что по задачам?','Ты видишь мои задачи?'];
 for(const q of tasks)assert.equal(intent(q,null),'tasks',q);
 for(const q of ['Какие баги открыты?','Покажи баги','Сколько багов в версии 1.19?'])assert.equal(intent(q,null),'bugs',q);
 for(const q of ['Создай задачу в Jira','Как создать задачу в Jira?','Не смотри задачи','Закрой задачу BW-12','Что такое задача?','Объясни, что такое тикет','В жизни всякое бывает','Напиши в Slack про задачи','Назначь задачу на Анну','«покажи задачи»','Почему задачи не грузятся?'])assert.notEqual(intent(q,null),'tasks',q);
 assert.equal(jiraHeard('В жизни задачи посмотри'),'в jira задачи посмотри');assert.equal(jiraHeard('В жизни всякое бывает'),'в жизни всякое бывает');
 // «Мои задачи» in any word order is the user's own open list, not the tasks of the current topic.
 const {details}=require('../src/personal-tasks.cjs');
 for(const q of ['А какие задачи открытые на мне?','Какие задачи открытые на мне?','А мои задачи?','Сколько задач на мне?','Покажи задачи, которые на мне висят','А какие задачи открыты у меня?'])assert.deepEqual(details(q),{status:'open',overdue:false},q);
 assert.equal(details('Посмотри мои закрытые задачи').status,'done');for(const q of ['Закрой мои задачи','Создай мне задачу','Какие задачи у Ани?','Покажи мои задачи и отправь в Slack','Не показывай мои задачи'])assert.equal(details(q),null,q);
 // A named Jira status narrows the personal list: «из todo», «в работе», «в статусе Owner Review».
 {const {JiraInsights}=require('../src/extensions/jira/insights.cjs');let jql='',statuses=[];const w={settings:()=>({jiraUrl:'https://fixture.invalid',jiraProjects:'BW',jiraToken:'t'}),pages:async()=>[{key:'BW',name:'Bunker Wars'}],api:async(route,o)=>{if(route.endsWith('/myself'))return {accountId:'me',displayName:'Я'};jql=JSON.parse(o.body).jql;return {isLast:true,issues:statuses.map((st,i)=>({key:'BW-'+(i+1),fields:{summary:'Задача '+i,status:st,assignee:{accountId:'me'}}}))};}};
  const reader=new JiraInsights(w);statuses=[{name:'To Do',statusCategory:{key:'new'}}];let r=await reader.read('Покажи мои задачи из todo',{jiraProject:'BW'},'','tasks');assert.match(jql,/statusCategory = "To Do"/);assert.match(r.text,/в статусе «To Do»: 1/);
  const topic={jiraProject:'BW',taskAssignee:'currentUser'};statuses=[{name:'Owner Review',statusCategory:{key:'indeterminate'}}];r=await reader.read('А какие в статусе Owner Review?',topic,'','tasks');assert.match(jql,/status = "Owner Review"/);
  statuses=[{name:'Done',statusCategory:{key:'done'}}];await assert.rejects(()=>reader.read('А из todo?',topic,'','tasks'),/неподходящего статуса/);}
 for(const q of ['А из todo?','Только в работе','А какие в статусе Owner Review?'])assert.equal(intent(q,{kind:'tasks',taskAssignee:'currentUser',messages:[]}),'tasks',q);assert.equal(intent('А что такое todo?',{kind:'tasks',taskAssignee:'currentUser',messages:[]}),'chat');
 let read=0,asked=0;const d=new Dialogue({answer:async()=>{asked++;return 'модель';},readers:{tasks:async()=>{read++;return {text:'Задачи: BW-1, BW-2'};}}});
 const r=await d.turn('В жизни задачи посмотри');assert.equal(read,1);assert.equal(asked,0);assert.match(r.text,/BW-1/);assert.equal(d.active().messages.at(-1).by,'Jira: задачи');
 // The model knows which services are connected and must not claim there is no access.
 const req=dialogueRequest({model:'q',command:'У тебя есть доступ к Jira?',topic:{title:'T',messages:[]},services:['Jira','Slack']});
 assert.deepEqual(JSON.parse(req.messages[1].content.slice(req.messages[1].content.indexOf('{'))).connectedServices,['Jira','Slack']);assert.match(req.messages[0].content,/не говори, что доступа нет/);
 console.log('Task phrases: word order, misheard Jira, bugs, negatives, reader dispatch and connected services passed');
})().catch(e=>{console.error(e);process.exit(1);});
