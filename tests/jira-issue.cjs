// A request that names one Jira issue (a browse link or a key) reads that issue, not the project's task list.
const assert=require('node:assert/strict');
const issue=require('../src/jira-issue.cjs');
(async()=>{
 assert.deepEqual(issue.named('https://jetwhales.atlassian.net/browse/BW-4569\nПосмотри эту таску'),{key:'BW-4569',host:'jetwhales.atlassian.net'});
 assert.deepEqual(issue.named('посмотри задачу BW-12'),{key:'BW-12'});
 assert.deepEqual(issue.named('https://x.atlassian.net/browse/BW-1 и BW-1 тоже'),{key:'BW-1',host:'x.atlassian.net'},'the same key twice is one issue');
 assert.equal(issue.named('сравни BW-1 и BW-2'),null,'two issues: not this reader');
 assert.equal(issue.named('Какие задачи в BW?'),null);
 assert.equal(issue.plain({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Шаги:'},{type:'hardBreak'},{type:'text',text:'1. Открыть'}]},{type:'paragraph',content:[{type:'mention',attrs:{text:'@Аня'}}]}]}),'Шаги:\n1. Открыть\n@Аня');
 const calls=[];
 const workspace=(settings={jiraUrl:'https://jetwhales.atlassian.net',jiraProjects:'BW,MW'})=>({settings:()=>settings,api:async(route)=>{calls.push(route);return {id:'1',key:'BW-4569',fields:{summary:'Краш при выходе из боя',status:{name:'In Progress',statusCategory:{key:'indeterminate'}},priority:{name:'High'},issuetype:{name:'Bug'},assignee:{accountId:'a',displayName:'Анна Смирнова'},duedate:'2026-11-20',fixVersions:[{name:'1.19.3'}],
  description:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Игра падает после нажатия «Сдаться».'}]}]},
  comment:{total:3,comments:[{author:{displayName:'Иван'},body:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Воспроизвёл на Android 14'}]}]}}]},
  issuelinks:[{type:{outward:'blocks',inward:'is blocked by'},outwardIssue:{key:'BW-4570'}}],parent:{key:'BW-4000',fields:{summary:'Стабильность боя'}}}};}});
 const r=await issue.read(workspace(),{key:'BW-4569',host:'jetwhales.atlassian.net'});
 assert.match(calls[0],/^\/rest\/api\/3\/issue\/BW-4569\?fields=/);
 assert.match(r.text,/^BW-4569 — Краш при выходе из боя\nBug · In Progress · приоритет High · исполнитель: Анна Смирнова · срок 2026-11-20 · версия 1\.19\.3/);
 assert.match(r.text,/Родитель: BW-4000 — Стабильность боя/);assert.match(r.text,/Описание: Игра падает после нажатия «Сдаться»\./);
 assert.match(r.text,/Последние комментарии \(3 всего\):\nИван: Воспроизвёл на Android 14/);assert.match(r.text,/Связи: blocks BW-4570\./);
 assert.equal(r.sources[0].url,'https://jetwhales.atlassian.net/browse/BW-4569');
 assert.deepEqual(r.data.issues.map(i=>[i.key,i.fields.status.name,i.fields.assignee.displayName]),[['BW-4569','In Progress','Анна Смирнова']],'one card for the issue');
 await assert.rejects(issue.read(workspace(),{key:'BW-4569',host:'other.atlassian.net'}),/другой сайт Jira \(other\.atlassian\.net\)/);
 await assert.rejects(issue.read(workspace(),{key:'XX-1'}),/Проект XX не отмечен в подключении Jira/);
 await assert.rejects(issue.read(workspace({jiraProjects:'BW'}),{key:'BW-1'}),/Подключите Jira/);
 // Routing: the link with «посмотри эту таску» goes to the Jira tasks reader, which reads the one issue.
 const {JiraInsights}=require('../src/jira-insights.cjs');
 calls.length=0;const one=await new JiraInsights(workspace()).read('https://jetwhales.atlassian.net/browse/BW-4569\nПосмотри эту таску',{},'','tasks');
 assert.match(one.text,/^BW-4569 — /);assert.equal(calls.length,1,'one request for the issue, no project listing');
 // A key-like word from a project that is not connected («UTF-8») is not taken for an issue.
 calls.length=0;await assert.rejects(new JiraInsights(workspace({jiraUrl:'https://jetwhales.atlassian.net',jiraProjects:'BW'})).read('посмотри задачи с ошибкой UTF-8',{},'','tasks'));assert.ok(!calls.some(c=>/\/issue\/UTF-8/.test(c)),'no issue request for UTF-8');
 const {intent}=require('../src/dialogue.cjs');
 assert.equal(intent('https://jetwhales.atlassian.net/browse/BW-4569\nПосмотри эту таску',null),'tasks');assert.equal(intent('https://jetwhales.atlassian.net/browse/BW-4569',null),'tasks','a bare link');
 assert.notEqual(intent('Закрой https://jetwhales.atlassian.net/browse/BW-4569',null),'tasks','changes are not reads');
 console.log('Jira issue: a link or key reads that issue (facts, description, comments, links, one card), other sites and projects refused passed');
})().catch(e=>{console.error(e);process.exit(1);});
