const assert = require('node:assert/strict');
const m = require('../src/modules.cjs');
const { Workspace } = require('../src/workspace.cjs');
(async () => {
 const fresh = {...m.defaults};
 for (const name of m.optional) assert.equal(m.enabled(fresh,name),false);
 assert.equal(m.enabled(fresh,'whisper'),true);
 const s = {...fresh, jiraToken:'saved', slackCredential:'saved'};
 m.migrate(s,{}); assert.equal(s.module_jira,'true'); assert.equal(s.module_confluence,'true'); assert.equal(s.module_slack,'true');
 s.module_jira = 'false'; m.migrate(s,{module_jira:'false'}); assert.equal(s.module_jira,'false'); // Explicit selections are not migrated.
 const off = {...s,module_jira:'false',module_confluence:'true'};
 assert.throws(()=>m.assertEnabled(off,'jira'),/выключен/); m.assertEnabled(off,'confluence');
 assert.equal(m.serviceForURL('https://test.atlassian.net/wiki/rest/api/content'),'confluence');
 assert.equal(m.serviceForURL('https://test.atlassian.net/rest/api/3/issue'),'jira');
 let calls=0;
 const w = new Workspace({settings:()=>({...fresh,jiraUrl:'https://test.atlassian.net',jiraToken:'saved',jiraEmail:'a@b.c',notionToken:'saved'}),request:async()=>{calls++;throw Error('Unexpected request');}});
 assert.deepEqual((await w.searchDocs({title:'Вход',text:'Обсуждение входа'})).docs,[]); assert.equal(calls,0);
 console.log('Optional modules: defaults, migration, service isolation and offline docs passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
