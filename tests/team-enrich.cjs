const assert=require('node:assert/strict');const {slackProfiles,jiraWork,enrich}=require('../src/team-enrich.cjs');const {TeamFill}=require('../src/team-fill.cjs');
(async()=>{
 // Slack profile titles and Jira components/labels fill empty role and responsibilities, never overwrite
 const profiles=await slackProfiles({slackToken:'x'},async url=>{assert.match(url,/users\.list/);return {ok:true,members:[
  {id:'U1',profile:{real_name:'Полина Иванова',title:'QA Lead',email:'p@x.ru'}},{id:'U2',profile:{real_name:'Иван Петров',title:''}},{id:'B1',is_bot:true,profile:{real_name:'Jira'}}]};});
 assert.deepEqual(profiles.map(p=>p.slackId),['U1','U2']);
 const w={settings:()=>({jiraUrl:'https://x',jiraProjects:'BW'}),api:async()=>({issues:[
  {fields:{assignee:{accountId:'a1',displayName:'Полина Иванова'},project:{key:'BW'},components:[{name:'Тесты'}],labels:['release']}},
  {fields:{assignee:{accountId:'a1',displayName:'Полина Иванова'},project:{key:'BW'},components:[{name:'Тесты'}],labels:[]}},
  {fields:{assignee:{accountId:'a2',displayName:'Иван Петров'},project:{key:'BW'},components:[{name:'Сервер'}],labels:['network']}}]})};
 const work=await jiraWork(w,[]);
 const rows=enrich([{member:{name:'Полина Иванова'},evidence:'Slack: личные сообщения · Полина Иванова'},{member:{name:'Иван Петров',role:'Бэкенд'},evidence:'x'},{member:{name:'Мария'},evidence:'y'}],profiles,work);
 assert.equal(rows[0].member.role,'QA Lead');assert.equal(rows[0].member.responsibilities,'Тесты, release');assert.equal(rows[0].member.slackId,'U1');assert.equal(rows[0].member.jiraId,'a1');assert.match(rows[0].evidence,/роль из профиля Slack/);
 assert.equal(rows[1].member.role,'Бэкенд','an existing value is kept');assert.equal(rows[1].member.responsibilities,'Сервер, network');
 assert.equal(rows[2].member.role,'');assert.equal(rows[2].member.responsibilities,'');
 // in team fill: the reply says what was added and who is left without a role
 const settings={teamMembers:'[]',teamRoles:''};let saved;
 const fill=new TeamFill({settings:()=>settings,save:m=>{saved=m;settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>null,scope:()=>'s',extract:async()=>({members:[]}),
  enrich:async r=>enrich(r,profiles,work),screen:async()=>({title:'Экран Slack',text:'Channels\nDirect messages\nПолина Иванова\nМария\nApps'})});
 const r=await fill.fromScreen('Заполни команду');assert.match(r.text,/Добавлено коллег: 2/);assert.match(r.text,/Роли и обязанности добавил для 1/);assert.match(r.text,/Без роли остались: Мария/);
 assert.equal(saved.find(m=>m.name==='Полина Иванова').role,'QA Lead');
 // an existing card without a role gets it on the next run
 const again=await fill.fromScreen('Заполни команду');assert.match(again.text,/Добавлено коллег: 0/);
 console.log('Team enrich: role from the Slack profile title, responsibilities from Jira components and labels, existing values kept, reply names who is left without a role passed');
})().catch(e=>{console.error(e);process.exit(1);});
// cards saved earlier without roles (the previous run) get them now
(async()=>{
 const settings={teamMembers:JSON.stringify([{name:'Полина Иванова'}]),teamRoles:''};
 const fill=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[],roster:async()=>null,scope:()=>'s',extract:async()=>({members:[]}),
  enrich:async r=>enrich(r,[{slackId:'U1',names:['полина иванова'],name:'Полина Иванова',title:'QA Lead',email:''}],new Map()),screen:async()=>({title:'Экран Slack',text:'Direct messages\nПолина Иванова\nApps'})});
 const r=await fill.fromScreen('Заполни команду');assert.match(r.text,/Заполнено полей: [1-9]/);assert.equal(JSON.parse(settings.teamMembers)[0].role,'QA Lead');
 console.log('Team enrich: existing cards without roles are filled on the next run passed');
})().catch(e=>{console.error(e);process.exit(1);});
