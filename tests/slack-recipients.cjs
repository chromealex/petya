const assert=require('node:assert/strict');
const {parse,SlackRequest}=require('../src/slack-request.cjs');
const {roles}=require('../src/team-roles.cjs');
const {resolveRecipients}=require('../src/slack-recipients.cjs');
function fixture(){
 const users=[
  {id:'U1',real_name:'Client One',profile:{title:'Client developer'}},
  {id:'U2',real_name:'Server',profile:{title:'Backend developer'}},
  {id:'U3',real_name:'QA',profile:{title:'QA automation engineer'}},
  {id:'U4',real_name:'Other Project',profile:{title:'Unity developer'}},
  {id:'U5',real_name:'Client Two',profile:{title:'Frontend engineer',email:'two@example.test'}},
  {id:'U6',deleted:true,profile:{title:'Unity developer'}},
  {id:'U7',is_bot:true,profile:{title:'Client developer'}},
  {id:'U8',real_name:'Manual QA',profile:{title:'Тестировщик'}}
 ];
 const members=users.map(u=>u.id),posts=[],state={};let hook;
 const settings={slackToken:'secret',teamMembers:JSON.stringify([{name:'Other Project',slackId:'U4',role:'Unity developer',projects:'Beta'}])};
 const topic={id:'t',projectMemoryId:'p',projectName:'Alpha',projectChannels:[{id:'C1',role:'dev'},{id:'C1',role:'qa'}],hasSavedChannels:true};
 const request=async(url,options)=>{
  const u=new URL(url);if(hook)await hook(u);
  if(u.pathname.endsWith('conversations.list'))return {ok:true,channels:[{id:'C1',name:'arbitrary-project-channel'}]};
  if(u.pathname.endsWith('conversations.members'))return {ok:true,members:u.searchParams.has('cursor')?members.slice(3):members.slice(0,3),response_metadata:{next_cursor:u.searchParams.has('cursor')?'':'members-next'}};
  if(u.pathname.endsWith('users.list'))return {ok:true,members:u.searchParams.has('cursor')?users.slice(4):users.slice(0,4),response_metadata:{next_cursor:u.searchParams.has('cursor')?'':'users-next'}};
  if(u.pathname.endsWith('chat.postMessage')){posts.push(JSON.parse(options.body));return {ok:true,channel:'C1',ts:'1234567890.123456'};}
  throw Error('Unexpected request '+url);
 };
 const args={state,save:()=>{},settings:()=>settings,enabled:()=>true,context:()=>topic,request,reply:(text,extra)=>({text,...extra})};
 return {users,members,posts,settings,topic,request,p:new SlackRequest(args),hook:fn=>hook=fn};
}
(async()=>{
 for(const word of ['клиентских разрабов','клиенских разрабов','клиентских разработчиков','всех клиентских разрабов','фронтенд разрабов'])assert.equal(parse('Попроси '+word+' посмотреть свои задачи в жире').recipientRole,'client-dev',word);
 for(const word of ['куашников','куашники','QA','тестировщиков'])assert.equal(parse('Попроси '+word+' проверить релиз').recipientRole,'qa');
 assert.equal(parse('Попроси разрабов проверить задачи').recipientRole,'dev');
 assert.ok(roles('QA automation engineer').has('qa'));assert.ok(!roles('QA automation engineer').has('dev'));
 assert.ok(!roles('DevOps engineer').has('dev'));
 let f=fixture(),r=await f.p.turn('Попроси клиентских разрабов посмотреть свои задачи в жире');assert.equal(f.posts.length,1,r.text);assert.match(f.posts[0].text,/^<@U1> <@U5>\n/);assert.ok(f.posts[0].mrkdwn);assert.ok(f.posts[0].text.endsWith('в Jira'));assert.match(r.text,/Client One, Client Two/);
 await f.p.turn('Попроси клиентских разработчиков посмотреть свои задачи в Jira');assert.equal(f.posts.length,1);
 await f.p.turn('Попроси куашников посмотреть свои задачи в жире');assert.equal(f.posts.length,2);assert.match(f.posts[1].text,/^<@U3> <@U8>\n/);
 f=fixture();f.settings.teamMembers=JSON.stringify([{name:'Unmapped',role:'Клиентский разработчик',projects:'Alpha'}]);r=await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,0);assert.match(r.text,/Unmapped/);
 f=fixture();f.settings.teamMembers=JSON.stringify([{name:'Email match',email:'two@example.test',role:'Клиентский разработчик',projects:'Alpha'},{name:'Other Project',slackId:'U4',role:'Unity developer',projects:'Beta'}]);r=await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,1,r.text);
 f=fixture();f.users.push({id:'U9',real_name:'Absent',profile:{title:'Client developer'}});f.settings.teamMembers=JSON.stringify([{name:'Absent',slackId:'U9',role:'Client developer',projects:'Alpha'}]);r=await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,0);assert.match(r.text,/нет в выбранном канале/);
 f=fixture();f.hook(u=>{if(u.pathname.endsWith('users.list'))f.topic.id='changed';});await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,0);
 f=fixture();f.members.push('U404');r=await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,0);assert.match(r.text,/не все профили/);
 f=fixture();f.users.forEach(u=>u.profile.title='');r=await f.p.turn('Попроси клиентских разрабов проверить задачи');assert.equal(f.posts.length,0);assert.match(r.text,/Не нашёл/);
 f=fixture();r=await f.p.turn('Попроси клиентских разрабов проверить <@U2> и <!channel>');assert.equal(f.posts.length,1);assert.ok(f.posts[0].text.includes('&lt;@U2&gt;'));assert.ok(f.posts[0].text.includes('&lt;!channel&gt;'));
 f=fixture();const bad=async(url,options)=>url.includes('users.list')?{ok:false,error:'missing_scope'}:f.request(url,options);await assert.rejects(resolveRecipients({role:'client-dev',channel:{id:'C1'},topic:f.topic,settings:f.settings,request:bad,token:'secret'}),/missing_scope/);
 console.log('Recipient roles: colloquial forms, client/server/QA separation, live paginated roster, project isolation, all mentions, missing identities, stale state and duplicate protection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
