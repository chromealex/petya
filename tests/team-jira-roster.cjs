const assert=require('node:assert/strict');const {roster}=require('../src/extensions/jira/team-roster.cjs');const {TeamFill}=require('../src/team-fill.cjs');
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
// Screen text: numeric source ids and doubled spaces/line breaks no longer drop every member; the request is the user's.
(async()=>{
 const {grounded}=require('../src/team-fill.cjs');
 const src=[{id:'0',text:'Полина  Иванова   10:32\nтестирование релиза 1.19\nИван Петров  11:05'}];
 const rows=grounded({members:[{name:'Полина Иванова',source:0,evidence:'Полина Иванова 10:32'},{name:'Иван Петров',source:'0',evidence:'Иван  Петров'},{name:'Выдуманный',source:0,evidence:'Выдуманный — сервер'}]},src,{});
 assert.deepEqual(rows.map(r=>r.member.name),['Полина Иванова','Иван Петров']);
 let request='';const settings={teamMembers:'[]',teamRoles:''};
 const screen=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>null,scope:()=>'s',
  extract:async(sources,command)=>{request=command;return {members:[{name:'Полина Иванова',source:0,evidence:'Полина Иванова'}]};},
  screen:async()=>({title:'Экран Slack · #jw-bw-dev',text:'Полина  Иванова 10:32 привет'})});
 let r=await screen.fromScreen('Заполни команду');assert.equal(request,'Заполни команду','the model gets the user request, not the screen text');assert.match(r.text,/Добавлено коллег: 1/);
 // nothing confirmed: the reply says what was read and why nothing was saved
 settings.teamMembers='[]';const empty=new TeamFill({settings:()=>settings,save:()=>{},sources:()=>[],roster:async()=>null,scope:()=>'s',
  extract:async()=>({members:[{name:'Кто-то',source:0,evidence:'нет такой строки'}]}),screen:async()=>({title:'Экран Slack · #general',text:'Обсуждение релиза без имён'})});
 r=await empty.fromScreen('Заполни команду');assert.match(r.text,/Прочитал Экран Slack · #general \(\d+ символов\)/);assert.match(r.text,/не смогла подтвердить никого точной цитатой/);assert.match(r.text,/список участников/);
 console.log('Team from the Slack window: request passed to the model, numeric source ids and loose whitespace accepted, an empty result says what was read and why passed');
})().catch(e=>{console.error(e);process.exit(1);});
// Slack sidebar: people from «Личные сообщения / Direct messages» become the team when the window has no roles.
(async()=>{
 const {directMessages}=require('../src/team-fill.cjs');
 assert.deepEqual(directMessages('Azur Games\nChannels\njw-random\nDirect messages\nПолина Иванова\nIvan Petrov\nSlackbot\nJira\nАлександр Феер (you)\nМария, Олег\nApps\nGitHub'),['Полина Иванова','Ivan Petrov','Мария','Олег']);
 assert.deepEqual(directMessages('Каналы\nобщий\nЛичные сообщения\nПолина\nЗаметки\nПриложения\nAsana'),['Полина']);
 assert.deepEqual(directMessages('Каналы\nобщий'),[]);
 const settings={teamMembers:'[]',teamRoles:''};let saved=null;
 const fill=new TeamFill({settings:()=>settings,save:m=>{saved=m;settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>null,scope:()=>'s',extract:async()=>({members:[]}),
  screen:async()=>({title:'Экран Slack · Jira (DM)',text:'Channels\njw-random\nDirect messages\nПолина Иванова\nИван Петров\nApps\nJira\nJira: BW-4350 updated'})});
 const r=await fill.fromScreen('Заполни команду');assert.match(r.text,/Добавлено коллег: 2/);assert.match(r.text,/из личных сообщений Slack/);assert.deepEqual(saved.map(m=>m.name),['Полина Иванова','Иван Петров']);
 console.log('Team from the Slack sidebar: direct-message people (group DMs split; apps, bots, notes and you skipped) when the window has no roles passed');
})().catch(e=>{console.error(e);process.exit(1);});
