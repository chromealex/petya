// Misroutes found by the in-app routing audit (natural phrases answered by the wrong handler).
const assert=require('node:assert/strict');
const {direct,candidate}=require('../src/computer-intent.cjs');const {searchCommand}=require('../src/web-search.cjs');
const {detect}=require('../src/service-access.cjs');const {classify}=require('../src/work-query-route.cjs');
// Switching apps and clipboard keys work without the model; tasks, files and Petya's undo are not computer control.
for(const [q,intent] of [['Открой Safari','app_focus'],['Переключись в хром','app_focus'],['Скопируй это','key'],['Вставь','key'],['Выдели всё','key']]){assert.equal(direct(q)?.intent,intent,q);assert(candidate(q),q);}
for(const q of ['Открой задачу BW-1','Открой файл отчёта','Отмени последнее действие','Не открывай Safari','Как открыть Safari?'])assert.equal(direct(q),null,q);
// Current data goes to web search; definitions, work news and recipes do not.
for(const q of ['Какая сейчас погода в Москве?','Что пишут в новостях про Apple?','Какой курс доллара?'])assert.equal(searchCommand(q,null)?.fresh,true,q);
for(const q of ['Что такое курс валют?','Какие новости по проекту?','Есть новости в Slack?','Найди рецепт борща','Объясни, как формируется погода'])assert.equal(searchCommand(q,null),null,q);
// Everyday ways to ask about Slack, mail and Telegram are recognised as service reads.
for(const [q,service] of [['Есть новые письма?','gmail'],['Что пришло на почту?','gmail'],['Кто писал мне в Slack сегодня?','slack'],['Что мне писали в тг?','telegram'],['Есть что-то срочное в слаке?','slack'],['Глянь gmail','gmail'],['Были письма от Иванова?','gmail'],['Что в Notion по проекту?','notion']])assert.deepEqual(detect(q,null),[service],q);
for(const q of ['Напиши в Slack, что сборка готова','Что такое Slack?','Как подключить почту?'])assert.deepEqual(detect(q,null),[],q);
// Notion questions are not answered by the Jira work route; tasks «в Asana» still ask which service.
assert.equal(classify('Что в Notion по проекту?',null),null);assert.equal(classify('Покажи мои задачи в Asana',null)?.kind,'clarify');
// «Запомни, что …» without a log is not a build-fix lesson.
(async()=>{const {ReviewAssistant}=require('../src/review-assistant.cjs');
 const review=new ReviewAssistant({dialogue:{active:()=>({id:'t',messages:[]}),state:{topics:[]},persist(){}},state:{lessons:[],watches:[]},save(){},enabled:()=>true});
 assert.equal(await review.turn('Запомни, что релиз в пятницу'),null,'an ordinary «запомни» is not a build-fix lesson');
 console.log('Routing audit: computer control, fresh web questions, service reads, Notion and «запомни» passed');})().catch(e=>{console.error(e);process.exit(1);});
