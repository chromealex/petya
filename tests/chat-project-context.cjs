const assert=require('node:assert/strict');const {snapshot}=require('../src/chat-project-context.cjs');const {Dialogue}=require('../src/dialogue.cjs');
const d=new Dialogue({});d.projectCreate('Работа');d.state.projects.find(p=>p.id===d.state.activeProjectId).memoryId='work';d.rememberAction('Привет','Ответ');assert.equal(d.active().projectMemoryId,'work');
const memory={id:'work',name:'Проект',jira:{key:'APP',site:'https://example.atlassian.net'},slack:{dev:{name:'app-dev',account:'current'},qa:{name:'old-channel',account:'old'}},localFolder:'/private/path'};
const deps={dialogue:d,projectMemory:{state:{projects:[memory]},get:id=>id==='work'?memory:null},settings:{jiraUrl:'https://example.atlassian.net',jiraProjects:'APP'},slackAccount:'current'};
let r=snapshot(deps);assert.equal(r.jira,'APP');assert.deepEqual(r.channels,[{name:'app-dev',role:undefined}]);assert(!JSON.stringify(r).includes('/private/path'));assert(!JSON.stringify(r).includes('old-channel'));
r=snapshot({...deps,settings:{jiraUrl:'https://other.atlassian.net',jiraProjects:'OTHER'}});assert.equal(r.jira,'');
const old=d.active();delete old.projectMemoryId;d.persist();assert.equal(old.projectMemoryId,undefined);assert.equal(snapshot(deps).effectiveName,'');
d.select('');assert.equal(snapshot(deps).effectiveName,'Проект');
console.log('Context: new-chat inheritance, unchanged old chats and account scope passed');
