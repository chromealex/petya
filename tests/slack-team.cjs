const assert=require('node:assert/strict');
const {SlackTeam,requestKind}=require('../src/slack-team.cjs');
const {TeamFill}=require('../src/team-fill.cjs');
(async()=>{
 assert(requestKind('Петя, заполни команду').generic);assert(requestKind('заполни команду из Слака').explicit);
 assert(!requestKind('Заполни команду: Полина — тестирование').generic);assert(!requestKind('Заполни команду не из Slack').explicit);assert(!requestKind('Заполни команду без Слака').explicit);
 let settings={slackToken:'test',slackChannels:'CONE',teamMembers:'[]'},enabled=true,calls=[],fail='',loop=false;
 const people=[{id:'UONE',real_name:'Анна',profile:{display_name:'Аня',title:'QA',email:'anna@example.org'}},{id:'UTWO',real_name:'Иван',profile:{}},{id:'UBOT',is_bot:true},{id:'UOLD',deleted:true},{id:'UOUT',real_name:'Посторонний'}];
 const request=async(url,options)=>{assert.equal(options.method,undefined);const u=new URL(url),method=u.pathname.split('/').at(-1);calls.push(method);if(fail===method)return {ok:false,error:'missing_scope'};
  if(method==='conversations.members')return {ok:true,members:u.searchParams.get('channel')==='CONE'?['UONE','UBOT','UOLD']:['UTWO','UONE']};
  if(method==='users.list')return u.searchParams.has('cursor')?{ok:true,members:loop?[]:people.slice(2),response_metadata:{next_cursor:loop?'page2':''}}:{ok:true,members:people.slice(0,2),response_metadata:{next_cursor:'page2'}};
  if(method==='conversations.list')return {ok:true,channels:[{id:'CONE',name:'разработка'},{id:'CTWO',name:'support'}]};
  throw Error(method);
 };
 const service=new SlackTeam({settings:()=>settings,request,enabled:()=>enabled});
 let rows=await service.collect('Заполни команду');assert.equal(rows.length,1);assert.equal(rows[0].member.role,'QA');assert.equal(rows[0].member.projects,'');assert(!rows.some(r=>r.member.slackId==='UOUT'));
 rows=await service.collect('Заполни команду из Slack #разработка #support');assert.equal(rows.length,2);assert.equal(rows[1].member.role,'');
 calls=[];await service.collect('Заполни команду: Анна — QA');assert.equal(calls.length,0);
 rows=await service.collect('Заполни команду из Slack #разработка');assert.equal(rows.length,1);
 rows=await service.collect('Заполни команду из Slack разработка');assert.equal(rows.length,1);
 enabled=false;assert.equal(await service.collect('Заполни команду'),null);await assert.rejects(()=>service.collect('Заполни команду из Slack'),/Подключите/);enabled=true;
 fail='users.list';await assert.rejects(()=>service.collect('Заполни команду'),/users:read/);fail='';loop=true;await assert.rejects(()=>service.collect('Заполни команду'),/повторил/);loop=false;
 let saved=0;const fill=new TeamFill({settings:()=>settings,save:members=>{settings.teamMembers=JSON.stringify(members);saved++;},sources:()=>{throw Error('Roster must not depend on text extraction');},roster:c=>service.collect(c),scope:()=>settings.slackToken});
 let result=await fill.turn('Заполни команду');assert(result.teamUpdated);assert.equal(saved,1);await fill.turn('Заполни команду');assert.equal(saved,1);
 settings.slackChannels='CONE,CTWO';result=await fill.turn('Заполни команду');assert(result.teamFillReply);assert.match(result.text,/несколько каналов/);const beforeChoice=saved;result=await fill.turn('второй',true);assert(!result.error);assert.equal(JSON.parse(settings.teamMembers).length,2);assert.equal(saved,beforeChoice+1);settings.slackChannels='CONE';
 fail='users.list';result=await fill.turn('Заполни команду');assert(result.error);assert.equal(saved,beforeChoice+1);fail='';
 settings.slackChannels='';result=await fill.turn('Заполни команду');assert(result.teamFillReply);result=await fill.turn('разработка',true);assert(!result.error);assert(!result.question);
 let changed=false;const stale=new SlackTeam({settings:()=>settings,enabled:()=>true,request:async(...args)=>{const data=await request(...args);if(!changed){settings.slackToken='changed';changed=true;}return data;}});await assert.rejects(()=>stale.collect('Заполни команду из Slack #разработка'),/изменилось/);
 // A partial channel directory must request an address, then resume without listing it all again.
 let directoryCalls=0,writes=0;const scoped={slackToken:'token',slackChannels:'*',teamMembers:'[]'};
 const large=new SlackTeam({settings:()=>scoped,enabled:()=>true,request:async url=>{
  const u=new URL(url),method=u.pathname.split('/').at(-1);
  if(method==='conversations.list'){directoryCalls++;return {ok:true,channels:[{id:'CEXACT',name:'exact'}],response_metadata:{next_cursor:'page-'+directoryCalls}};}
  if(method==='conversations.info'){assert.equal(u.searchParams.get('channel'),'CEXACT');return {ok:true,channel:{id:'CEXACT',name:'exact'}};}
  if(method==='conversations.members')return {ok:true,members:['UONE']};
  if(method==='users.list')return {ok:true,members:[people[0]]};
  throw Error(method);
 }});
 let scope='company/project/chat';const resume=new TeamFill({settings:()=>scoped,save:members=>{scoped.teamMembers=JSON.stringify(members);writes++;},sources:()=>[],roster:c=>large.collect(c),scope:()=>scope});
 result=await resume.turn('Заполни команду');assert(result.question&&result.clarificationInput&&result.teamFillReply);assert(!result.error);assert.equal(writes,0);assert.equal(directoryCalls,50);
 result=await resume.turn('https://example.slack.com/archives/CEXACT',true);assert(result.teamUpdated);assert.equal(writes,1);assert.equal(directoryCalls,50);
 scoped.teamMembers='[]';result=await resume.turn('Заполни команду');const beforeExact=directoryCalls;result=await resume.turn('exact',true);assert(result.teamUpdated);assert.equal(directoryCalls,beforeExact+1);
 result=await resume.turn('Заполни команду');scope='another-project';result=await resume.turn('https://example.slack.com/archives/CEXACT',true);assert.match(result.text,/устарело/);assert.equal(writes,2);
 console.log('Slack team: selected channels, pagination, profiles, bots, dedupe, voice channel choice, missing scopes and stale connection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
