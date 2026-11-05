const assert=require('node:assert/strict');const {roster}=require('../src/team-jira-roster.cjs');const {TeamFill}=require('../src/team-fill.cjs');
(async()=>{
 const issues=[
  {fields:{project:{key:'BW'},assignee:{accountId:'a1',displayName:'Полина Иванова',active:true,accountType:'atlassian',emailAddress:'p@x.ru'}}},
  {fields:{project:{key:'BW'},assignee:{accountId:'a1',displayName:'Полина Иванова',active:true,accountType:'atlassian'}}},
  {fields:{project:{key:'MW2'},assignee:{accountId:'a1',displayName:'Полина Иванова',active:true,accountType:'atlassian'}}},
  {fields:{project:{key:'MW2'},assignee:{accountId:'a2',displayName:'Иван Петров',active:true,accountType:'atlassian'}}},
  {fields:{project:{key:'BW'},assignee:{accountId:'bot',displayName:'Automation',active:true,accountType:'app'}}},
  {fields:{project:{key:'BW'},assignee:{accountId:'old',displayName:'Ушедший',active:false,accountType:'atlassian'}}}];
 let jql='';const w={settings:()=>({jiraUrl:'https://x.atlassian.net',jiraProjects:'BW,MW2'}),api:async(route,o)=>{jql=JSON.parse(o.body).jql;return {isLast:true,issues};}};
 const rows=await roster(w);
 assert.match(jql,/project IN \("BW","MW2"\) AND assignee IS NOT EMPTY AND updated >= -90d/);
 assert.deepEqual(rows.map(r=>[r.member.name,r.member.jiraId,r.member.projects]),[['Полина Иванова','a1','BW, MW2'],['Иван Петров','a2','MW2']]);
 assert.equal(rows[0].member.email,'p@x.ru');assert.match(rows[0].evidence,/3 задач/);
 assert.equal(await roster({settings:()=>({jiraUrl:'',jiraProjects:'BW'}),api:async()=>{throw Error('no');}}),null);
 // «Заполни команду» with nothing in Slack or memory takes the Jira assignees
 let saved=null;const settings={teamMembers:'[]',teamRoles:''};
 const fill=new TeamFill({settings:()=>settings,save:m=>{saved=m;settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>null,jiraRoster:()=>roster(w),scope:()=>'s'});
 let r=await fill.turn('Заполни команду');assert.match(r.text,/Добавлено коллег: 2/);assert.match(r.text,/из Jira/);assert.deepEqual(saved.map(m=>m.name),['Полина Иванова','Иван Петров']);
 // Slack rate-limited: Jira first, before asking to read the Slack window
 settings.teamMembers='[]';const limited=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>{const e=Error('Slack: HTTP 429');e.status=429;throw e;},jiraRoster:()=>roster(w),screen:async()=>{throw Error('screen must not be used');},scope:()=>'s'});
 r=await limited.turn('Заполни команду');assert.match(r.text,/Добавлено коллег: 2/);
 console.log('Team from Jira: assignees of the last 90 days with accounts and projects (no bots or deactivated users), used when Slack and memory give nothing or Slack is rate-limited passed');
})().catch(e=>{console.error(e);process.exit(1);});
