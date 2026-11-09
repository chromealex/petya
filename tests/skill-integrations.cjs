const assert=require('node:assert/strict');
const {JiraInsights}=require('../src/extensions/jira/insights.cjs');
const {aggregate,validatedTasks,meetingOwner,WorkSkills}=require('../src/work-skills.cjs');
const {runSkill}=require('../src/instruction-skills.cjs');
const issue=(key='AA-1',extra={})=>({id:key,key,fields:{summary:'Работа',status:{name:'Open',statusCategory:{key:'new'}},issuelinks:[],...extra}});
function fixture(pages){let live={jiraProjects:'AA,BB',jiraUrl:'https://jira.fixture.invalid',jiraToken:'one'},index=0;const calls=[];const reader=new JiraInsights({settings:()=>live,pages:async()=>[{key:'AA',name:'Альфа'},{key:'BB',name:'Бета'}],api:async(url,options)=>{calls.push(url);if(!url.includes('/search/jql'))throw Error('Unnecessary metadata request');const p=pages[index++];return typeof p==='function'?p():p;}});return {reader,calls,change:()=>live={...live,jiraToken:'two'},read:()=>reader.read('AA',{},'','tasks',{wholeProject:true})};}
(async()=>{
 for(const bad of [{},{issues:null},{issues:[],isLast:false},{issues:[],isLast:'true'},{issues:[],nextPageToken:{}},{issues:[null],isLast:true},{issues:[{key:'AA-1'}],isLast:true},{issues:[issue('BB-1')],isLast:true}]){const f=fixture([bad]);await assert.rejects(()=>f.read());}
 let f=fixture([{issues:[],isLast:true}]);assert.equal((await f.read()).data.total,0);assert.equal(f.calls.length,1);
 f=fixture([{issues:[issue()],nextPageToken:'two',isLast:false},{issues:[issue(),issue('AA-2')],isLast:true}]);assert.equal((await f.read()).data.total,2);
 f=fixture([{issues:[issue()],nextPageToken:'two',isLast:false},{issues:[issue('AA-1',{summary:'Изменилось'})],isLast:true}]);await assert.rejects(()=>f.read(),/изменилась/);
 f=fixture([{issues:[issue()],nextPageToken:'loop',isLast:false},{issues:[issue()],nextPageToken:'loop',isLast:false}]);await assert.rejects(()=>f.read(),/повторила/);
 f=fixture([()=>{f.change();return {issues:[],isLast:true};}]);await assert.rejects(()=>f.read(),/изменились/);
 const rows=Array.from({length:30},(_,i)=>issue('AA-'+(i+1)));
 rows[24]=issue('AA-25',{status:{name:'Blocked',statusCategory:{key:'indeterminate'}},issuelinks:[{type:{inward:'is blocked by'},inwardIssue:{key:'AA-26'}}]});
 rows[25]=issue('AA-26',{status:{name:'Done',statusCategory:{key:'done'}},issuelinks:[{type:{outward:'blocks'},outwardIssue:{key:'AA-25'}}]});
 rows[27]=issue('AA-28',{issuelinks:[{type:{outward:'relates to'},outwardIssue:{key:'AA-30'}},{type:{inward:'is blocked by'},inwardIssue:{key:'BB-9'}}]});
 let a=aggregate(rows);assert.equal(a.blockers.statusCount,1);assert.equal(a.blockers.statuses[0].key,'AA-25');assert.equal(a.blockers.relationshipCount,2);assert.deepEqual(a.blockers.relationships.find(r=>r.blocker==='AA-26'),{blocker:'AA-26',blocked:'AA-25',blockerStatus:'done',blockedStatus:'indeterminate'});assert.equal(a.blockers.relationships.find(r=>r.blocker==='BB-9').blockerStatus,'unknown');assert.equal(a.blockers.absenceConfirmed,false);
 assert.equal(aggregate([issue('AA-1')]).byAssignee[0].name,'Исполнитель не получен');assert.equal(aggregate([issue('AA-1',{assignee:null})]).byAssignee[0].name,'Не назначен');
 const sameNames=[issue('AA-1',{assignee:{displayName:'Алексей'}}),issue('AA-2',{assignee:{displayName:'Алексей'}})];assert.equal(aggregate(sameNames).byAssignee.length,2);
 assert.equal(aggregate([issue('AA-1',{duedate:'2025-02-30'})],Date.parse('2026-01-01')).overdue,0);
 f=fixture([{issues:rows.slice(0,20),nextPageToken:'next',isLast:false},{issues:rows.slice(20),isLast:true}]);const report=await f.read();assert.equal(report.data.issues.length,20);assert.equal(report.data.aggregate.blockers.statusCount,1);assert.equal(report.data.scope.atomicSnapshot,false);
 assert.equal(meetingOwner('[00:12] Борис Иванов: проверю выгрузку завтра.',''),'Борис Иванов');
 assert.equal(meetingOwner('Борис Иванов: проверю выгрузку завтра.','Борис'),'Борис Иванов');
 assert.equal(meetingOwner('Анна Петрова: Борис Иванов проверит выгрузку завтра.','Анна Петрова'),'');
 assert.equal(meetingOwner('Анна Петрова: Борис Иванов проверит выгрузку завтра.','Борис Иванов'),'Борис Иванов');
 assert.equal(meetingOwner('Жанна Петрова подготовит отчёт.','Анна Петрова'),'');
 assert.equal(meetingOwner('На встрече упоминали Бориса.','Борис'),'');
 assert.equal(meetingOwner('Ответственный: Борис Иванов.','Борис Иванов'),'Борис Иванов');
 const quote='Анна Петрова: подготовлю отчёт и проверю выгрузку к пятнице.';const sources=[{name:'Встреча',text:quote}];
 const tasks=[{summary:'Отчёт',source:0,quote,owner:'Анна',due:'к пятнице'},{summary:'Выгрузка',source:0,quote,owner:'Анна',due:'к пятнице'}];assert.equal(validatedTasks({tasks},sources).length,2);assert.equal(validatedTasks({tasks:[tasks[0],tasks[0]]},sources).length,1);assert.equal(validatedTasks({tasks},sources)[0].owner,'Анна Петрова');assert.throws(()=>validatedTasks({tasks:[null]},sources),/подтвердить/);
 const selected={skill:{id:'s',enabled:true,workflow:'project-status',name:'status',body:'Status'},question:'unknown'};let connection='one';const topic={id:'topic',jiraProject:'AA'};const dialogue={state:{topics:[topic]},active:()=>topic,prune(){},persist(){}};
 const controller=new WorkSkills({dialogue,skills:{list:()=>[selected.skill]},connection:()=>connection,read:async()=>({question:true,field:'jiraProject',options:[{id:'AA',label:'Альфа'}]}),answer:()=>assert.fail('Should not answer stale selection')});
 let q=await controller.turn(selected,'/status');connection='two';await assert.rejects(()=>controller.choose(q.skillChoices[0].id),/устарел/);
 q=await controller.turn(selected,'/status');topic.jiraProject='BB';await assert.rejects(()=>controller.choose(q.skillChoices[0].id),/устарел/);
 const state={topics:[]};await assert.rejects(()=>runSkill({selected,command:'/status',dialogue:{state,active(){},prune(){},persist(){}},settings:{model:'test',ollamaUrl:'http://127.0.0.1:11434/api/chat'},request:async()=>({message:{content:'{"answer":"Готово"}'}}),evidence:report,assertCurrent:()=>{throw Error('stale');}}),/stale/);assert.equal(state.topics[0].messages.length,1);assert(!state.topics[0].workReport);
 console.log('Skill integrations: incomplete Jira pages, metadata independence, consistency, connection changes, all-page blockers, direction/completed dependencies, grounded owners, multiple commitments and stale report publication passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
