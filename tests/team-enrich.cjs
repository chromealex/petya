const assert=require('node:assert/strict');const {slackProfiles,jiraWork,enrich}=require('../src/team-enrich.cjs');const {TeamFill}=require('../src/team-fill.cjs');
(async()=>{
 // Slack profile titles and Jira components/labels fill empty role and responsibilities, never overwrite
 const profiles=(await slackProfiles({slackToken:'x'},async url=>{assert.match(url,/users\.list/);return {ok:true,members:[
  {id:'U1',profile:{real_name:'Полина Иванова',title:'QA Lead',email:'p@x.ru'}},{id:'U2',profile:{real_name:'Иван Петров',title:''}}, {id:'B1',is_bot:true,profile:{real_name:'Jira'}}]};})).profiles;
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
 // Large workspaces: the walk goes on until everyone wanted is found, waits once on a Slack limit, looks up by e-mail
 {let page=0,waited=0;const pages=[[{id:'U9',profile:{real_name:'Кто-то'}}],[{id:'U10',profile:{real_name:'Polina Samarina',title:'Project Manager, Jet Whales'}}],[{id:'U11',profile:{real_name:'Лишний'}}]];
  const req=async url=>{if(/profile\.get/.test(url))return {ok:false};if(/lookupByEmail/.test(url))return {ok:true,user:{id:'U12',profile:{real_name:'Ivan S',title:'QA',email:'ivan@x.ru'}}};const i=page++;if(i===1&&!waited){waited++;page--;const e=Error('Slack 429');e.status=429;e.retryAfter=1;throw e;}return {ok:true,members:pages[i],response_metadata:{next_cursor:i<2?'c'+i:''}};};
  const r=await slackProfiles({slackToken:'x'},req,[{name:'Polina Samarina'},{name:'Ivan Shapovalov',email:'ivan@x.ru'}],{wait:async()=>{}});
  assert(r.limited);assert(r.complete);assert.equal(page,3,'Ivan is not in the list, so the walk goes to the end');
  assert.equal(r.profiles.find(p=>p.slackId==='U10').title,'Project Manager, Jet Whales');assert(r.profiles.some(p=>p.slackId==='U12'),'found by e-mail');}
 // the reply tells «profile not found» from «no job title»
 {const settings={teamMembers:JSON.stringify([{name:'Мария'},{name:'Олег'}]),teamRoles:''};
  const f=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[],scope:()=>'s',
   enrich:async rows=>{const out=enrich(rows,{profiles:[{slackId:'U1',names:['олег'],name:'Олег',title:'',email:''}],complete:false,limited:true},new Map());out.slack={complete:false,limited:true};return out;}});
  const r=await f.turn('Добавь команде роли');assert.match(r.text,/Slack ограничил запросы, поэтому профили не найдены у: Мария/);assert.match(r.text,/не указана должность у: Олег/);assert.doesNotMatch(r.text,/у них не указана должность/);}
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
// «Можешь команде добавить роли?» adds roles to the saved team instead of a Jira workload report
(async()=>{
 const {isTeamFill,rolesRequest}=require('../src/team-fill.cjs');const route=require('../src/work-query-route.cjs');
 for(const q of ['Можешь команде добавить роли?','Проставь роли в команде','Заполни обязанности коллег'])assert(isTeamFill(q)&&rolesRequest(q),q);
 for(const q of ['Какие задачи у команды?','Добавь роли в задачи Jira','Покажи роли в Jira'])assert(!rolesRequest(q),q);
 const settings={teamMembers:JSON.stringify([{name:'Полина Иванова'},{name:'Мария'}]),teamRoles:''};let read=0;
 const fill=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>{read++;return [];},roster:async()=>{read++;return null;},scope:()=>'s',
  enrich:async r=>enrich(r,[{slackId:'U1',names:['полина иванова'],name:'Полина Иванова',title:'QA Lead',email:''}],new Map())});
 const r=await fill.turn('Можешь команде добавить роли?');assert.equal(read,0,'the saved team is used, Slack is not read again');
 assert.match(r.text,/Заполнено полей: [1-9]/);assert.match(r.text,/Без роли остались: Мария/);assert.equal(JSON.parse(settings.teamMembers)[0].role,'QA Lead');
 const empty=new TeamFill({settings:()=>({teamMembers:'[]'}),save:()=>{},sources:()=>[],scope:()=>'s'});assert.match((await empty.turn('Добавь роли команде')).text,/пока никого нет/);
 console.log('Team roles: «добавь команде роли» enriches the saved team (no Slack re-read), empty team asks to fill it first passed');
})().catch(e=>{console.error(e);process.exit(1);});
// Deactivated accounts are reported apart; an empty title is looked up in the custom «Должность» field.
(async()=>{const calls=[];const r=await slackProfiles({slackToken:'x'},async url=>{calls.push(url);
  if(url.includes('users.list'))return {ok:true,members:[{id:'U1',profile:{real_name:'Lev Silaev'}},{id:'U9',deleted:true,profile:{real_name:'Old Colleague'}}],response_metadata:{next_cursor:''}};
  if(url.includes('team.profile.get'))return {ok:true,profile:{fields:[{id:'Xf1',label:'Должность'},{id:'Xf2',label:'Хобби'},{id:'Xf3',label:'День рождения'},{id:'Xf4',label:'Telegram'}]}};
  if(url.includes('users.profile.get'))return {ok:true,profile:{fields:{Xf2:{value:'Шахматы'},Xf1:{value:'Unity-разработчик'},Xf3:{value:'12.05'},Xf4:{value:'@lev_s'}}}};
  return {ok:false};},[{name:'Lev Silaev'},{name:'Old Colleague'}],{wait:async()=>{}});
 assert.equal(r.profiles.find(p=>p.slackId==='U1').title,'Unity-разработчик');assert.equal(r.profiles.find(p=>p.slackId==='U1').birthday,'--05-12');assert.deepEqual(r.profiles.find(p=>p.slackId==='U1').contacts,{telegram:'@lev_s'});
 const lev=enrich([{member:{name:'Lev Silaev'},evidence:'x'}],r,new Map())[0].member;assert.equal(lev.birthday,'--05-12');assert.equal(lev.accounts.telegram.handle,'@lev_s');assert.deepEqual(r.deleted.map(d=>d.slackId),['U9']);assert(!r.profiles.some(p=>p.slackId==='U9'));
 console.log('Team enrich: deactivated Slack accounts apart, role, birthday and Telegram from custom profile fields passed');})().catch(e=>{console.error(e);process.exit(1);});
// early stop: once everyone wanted is found, no more pages
(async()=>{let page=0;const r=await slackProfiles({slackToken:'x'},async url=>{if(!url.includes('users.list'))return {ok:false};const i=page++;return {ok:true,members:[{id:'U'+i,profile:{real_name:i===1?'Polina Samarina':'X'+i}}],response_metadata:{next_cursor:'c'+i}};},[{name:'Polina Samarina'}],{wait:async()=>{}});
 assert.equal(page,2);assert(r.complete);console.log('Team enrich: Slack walk stops once everyone is found passed');})().catch(e=>{console.error(e);process.exit(1);});
// «Сходи в жиру, возьми все имена, потом в слаке по ним должности и заполни команду»: people from Jira, roles from Slack.
(async()=>{const {jiraPeople}=require('../src/team-fill.cjs'),{complexRequest,agentRequest,dependentSteps}=require('../src/agent-team.cjs');
 const command='Сходи в жиру, возьми оттуда все имена, потом пойди в слак и по этим именам возьми их должности, а потом заполни команду';
 assert(jiraPeople(command));assert(!jiraPeople('Заполни команду'));assert(!jiraPeople('Добавь команде роли из Jira'));
 assert(dependentSteps(command));assert(!complexRequest(command),'dependent steps are not split into parallel parts');
 assert(!agentRequest('1. Найди все имена людей в Jira\n2. Потом по этим именам забери должности из Slack'));
 assert(agentRequest('1. Какие баги открыты в BW\n2. Что нового в Slack'));assert(complexRequest('Покажи мои задачи и что нового в слаке'));
 const settings={teamMembers:'[]'};let slackRoster=0;
 const fill=new TeamFill({settings:()=>settings,save:m=>{settings.teamMembers=JSON.stringify(m);},sources:()=>[{title:'Команда',text:command,direct:true}],scope:()=>'s',
  roster:async()=>{slackRoster++;return null;},extract:async()=>({members:[]}),
  jiraRoster:async()=>[{member:{name:'Polina Samarina',jiraId:'a1'},evidence:'Jira · Polina Samarina',source:'Jira'},{member:{name:'Oleg Petrov',jiraId:'a2'},evidence:'Jira · Oleg Petrov',source:'Jira'}],
  enrich:async r=>enrich(r,[{slackId:'U1',names:['polina samarina'],name:'Polina Samarina',title:'Project Manager, Jet Whales',email:''},{slackId:'U2',names:['oleg petrov'],name:'Oleg Petrov',title:'Backend',email:''}],new Map())});
 const r=await fill.turn(command,false,null,null,{force:true});
 const saved=JSON.parse(settings.teamMembers);assert.equal(saved.length,2,r.text);assert.equal(slackRoster,0,'the Slack roster is not where the people come from');
 const polina=saved.find(m=>m.name==='Полина Самарина');assert.equal(polina.role,'Project Manager, Jet Whales');assert.match(polina.aliases,/Polina Samarina/,'the Latin spelling stays for Slack and Jira');assert.match(r.text,/из Jira/);
 console.log('Team fill: names from Jira, roles from Slack profiles, not split into agent parts passed');
})().catch(e=>{console.error(e);process.exit(1);});
