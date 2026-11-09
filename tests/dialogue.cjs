const assert=require('node:assert/strict');
const {Dialogue,actionRequest,intent,selectChoice}=require('../src/dialogue.cjs');
const {JiraInsights}=require('../src/jira-insights.cjs');
const {GooglePlay}=require('../src/extensions/google-play/client.cjs');
(async()=>{
 for(const text of ['Петя, посмотри сколько там багов по последней версии','посмотри anr в гугл плее','что думаешь о том, чтобы создать задачу?','не создавай задачу','если создай задачу','«создай задачу»'])assert(!actionRequest(text));
 for(const text of ['делай','создай задачу','передай клоду','найди документацию'])assert(actionRequest(text),text);
 assert.equal(intent('посмотри сколько там багов по последней версии'),'bugs');assert.equal(intent('посмотри anr в гугл плее'),'anr');
 assert.equal(selectChoice('в проекте Alpha',[{id:'A',label:'Alpha (A)'}])[0].id,'A');assert.equal(selectChoice('первый',[{id:'A',label:'Alpha'}])[0].id,'A');
 const {routingRequest,parseRoute}=require('../src/intent-router.cjs');
 const request=routingRequest('local','Проверь дефекты');assert(request.format.required.includes('kind'));assert.equal(request.think,false);
 assert.equal(parseRoute({message:{content:JSON.stringify({command:'Проверь дефекты'})}}),null);
 const route={kind:'bugs',topicId:'',newTopic:false,title:'Дефекты',confidence:0.95};
 assert.equal(parseRoute({message:{content:JSON.stringify(route)}}).kind,'bugs');
 assert.equal(parseRoute({message:{content:JSON.stringify({...route,kind:'createIssue'})}}),null);
 assert.equal(parseRoute({message:{content:JSON.stringify({...route,topicId:'unknown'})}}),null);
 let saved,reads=0;const d=new Dialogue({save:s=>saved=structuredClone(s),answer:async()=> 'Моё мнение',readers:{bugs:async(text,t)=>{reads++;if(!t.jiraProject)return {question:'Проект?',field:'jiraProject',options:[{id:'A',label:'Alpha'}]};return {text:'Багов: 4',title:'Баги · Alpha',data:{total:4}};},anr:async()=>({text:'ANR 0.1',title:'ANR · Game',data:{rate:0.1}})}});
 let r=await d.turn('сколько багов по последней версии');assert.equal(r.options[0].id,'A');r=await d.turn('Alpha','A');assert.equal(r.data.total,4);const bugsId=r.topicId;
 d.select('');await d.turn('посмотри ANR');assert.equal(d.list().topics.length,2);r=await d.turn('вернёмся к багам');assert.notEqual(r.topicId,bugsId);assert.equal(r.chatOffer.topicId,bugsId);assert.match(r.text,/Перейти/);d.select(bugsId);assert.equal(reads,2);
 r=await d.turn('что думаешь?');assert.equal(r.text,'Моё мнение');assert.equal(reads,2);assert.equal((await d.turn('делай')).handled,false);
 const restored=new Dialogue({state:saved,answer:async()=>'',readers:{}});assert.equal(restored.active().id,bugsId);assert(restored.actionContext().text.includes('Багов: 4'));
 restored.clear();assert.equal(restored.list().topics.length,0);
 const semantic=new Dialogue({answer:async()=>'обсудим',routeTopic:async text=>({kind:text.includes('дефектов')?'bugs':'chat'}),readers:{bugs:async()=>({text:'Проверено'})}});
 assert.equal((await semantic.turn('Сколько дефектов осталось в свежем релизе?')).text,'Проверено');
 assert.equal((await semantic.turn('Я думаю над решением')).text,'обсудим');
 assert.equal((await semantic.turn('создай задачу')).handled,false);
 let queries=[];const w={settings:()=>({module_jira:'true',jiraProjects:'A,B',jiraUrl:'https://test.atlassian.net'}),pages:async()=>[{key:'A',name:'Alpha'},{key:'B',name:'Beta'}],api:async(route,options)=>{
  if(route.endsWith('/versions'))return [{id:'1',name:'1.0',released:true,releaseDate:'2025-01-01'},{id:'2',name:'2.0',released:true,releaseDate:'2025-02-01'},{id:'3',name:'3.0',released:false}];
  if(route.includes('/project/'))return {issueTypes:[{id:'7',name:'Bug'},{id:'8',name:'Task'}]};
  const q=JSON.parse(options.body);queries.push(q);return q.nextPageToken?{issues:[{id:'2',key:'A-2',fields:{status:{statusCategory:{key:'done'}}}}],isLast:true}:{issues:[{id:'1',key:'A-1',fields:{status:{statusCategory:{key:'new'}}}}],nextPageToken:'next'};
 }};
 const jira=new JiraInsights(w),topic={};r=await jira.read('посмотри баги последней версии',topic);assert.equal(r.field,'jiraProject');
 topic.jiraProject='A';r=await jira.read('посмотри баги последней версии',topic);assert.equal(r.data.total,2);assert.equal(r.data.open,1);assert.equal(r.data.version,'2.0');assert(queries[0].jql.includes('affectedVersion = "2"'));assert.equal(queries.length,2);
 r=await jira.read('посмотри Alpha и Beta',topic);assert.equal(r.field,'jiraProject');
 const play=new GooglePlay({settings:()=>({}),request:async()=>{throw Error('unexpected network')}});let requests=[];play.apps=async()=>[{id:'apps/com.game',packageName:'com.game',label:'Game'}];
 play.api=async(route,body)=>{requests.push({route,body});return body?{rows:[{startTime:{year:2026,month:11,day:1},metrics:[{metric:'anrRate',decimalValue:{value:'0.2'}},{metric:'userPerceivedAnrRate',decimalValue:{value:'0.1'}}]}]}:{freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:{year:2026,month:11,day:2}}]}};};
 r=await play.read('посмотри ANR',{});assert.equal(r.data.rate,0.2);assert(r.text.includes('20%'));assert(r.text.includes('нет данных'));assert.equal(requests[1].body.timelineSpec.endTime.day,2);assert.equal(requests[1].body.timelineSpec.startTime.timeZone.id,'America/Los_Angeles');
 play.api=async(route,body)=>body?{rows:[]}:{freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:{year:2026,month:11,day:2}}]}};
 r=await play.read('ANR',{});assert(r.text.includes('не означает'));await assert.rejects(play.read('ANR версии 1.2',{}),/versionCode/);
 const {VoiceTurn}=require('../src/ui/voice-turn.js');assert(VoiceTurn.isNewQuestion('посмотри сколько багов'));assert(VoiceTurn.isNewQuestion('а что думаешь?'));assert(!VoiceTurn.isNewQuestion('первый'));assert(!VoiceTurn.isNewQuestion('Добавить поиск по имени'));
 const {generateKeyPairSync}=require('node:crypto');const privateKey=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'});
 let requestsAuth=0;const googleSettings={module_googleplay:'true',googlePlayCredential:JSON.stringify({type:'service_account',client_email:'petya@test.iam.gserviceaccount.com',private_key:privateKey,token_uri:'https://untrusted.invalid/'})};
 const authenticated=new GooglePlay({settings:()=>googleSettings,request:async(url,options)=>{requestsAuth++;assert.equal(url,'https://oauth2.googleapis.com/token');const assertion=new URLSearchParams(options.body).get('assertion');const claims=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url'));assert.equal(claims.scope,'https://www.googleapis.com/auth/playdeveloperreporting');return {access_token:'fixture',expires_in:3600};}});
 assert.equal(await authenticated.token(),'fixture');assert.equal(await authenticated.token(),'fixture');assert.equal(requestsAuth,1);googleSettings.module_googleplay='false';await assert.rejects(authenticated.token(),/Включите/);assert.equal(requestsAuth,1);
 // «Какие таски на мне в new» in an open chat is answered in that chat, even with an older «Задачи в Jira» chat around.
 for(const auto of [true,false]){const now=Date.now(),g=new Dialogue({autoTopics:()=>auto,answer:async()=>'ok',readers:{tasks:async()=>({text:'В New: 2'})}});
  g.state.topics.push({id:'old-tasks',projectId:g.state.activeProjectId,title:'Задачи в Jira',kind:'tasks',messages:[{role:'assistant',text:'старый список',at:now}],at:now},{id:'open',projectId:g.state.activeProjectId,title:'Разговор',kind:'chat',messages:[{role:'user',text:'привет',at:now},{role:'assistant',text:'привет',at:now}],at:now});g.state.activeId='open';
  const answer=await g.turn('какие таски на мне в new');assert.equal(answer.topicId,'open');assert.equal(g.state.topics.find(t=>t.id==='open').messages.at(-1).text,'В New: 2');assert.equal(g.state.topics.find(t=>t.id==='old-tasks').messages.length,1);assert.equal(g.state.activeId,'open');assert.deepEqual(answer.chatOffer,{topicId:'old-tasks',title:'Задачи в Jira'});assert.equal(g.state.topics.find(t=>t.id==='open').messages.at(-1).chatOffer.topicId,'old-tasks');}
 // «Новая тема: …» does not open a new chat by itself: the answer comes here with an offer to start one.
 {const now=Date.now(),g=new Dialogue({autoTopics:()=>false,answer:async()=>'ok'});g.state.topics.push({id:'open',projectId:g.state.activeProjectId,title:'Разговор',kind:'chat',messages:[{role:'user',text:'привет',at:now},{role:'assistant',text:'привет',at:now}],at:now});g.state.activeId='open';
  const r=await g.turn('Новая тема: план релиза');assert.equal(r.topicId,'open');assert.equal(g.state.topics.length,1);assert.deepEqual(r.chatOffer,{newChat:true,command:'план релиза'});}
 console.log('Dialogue: read vs action, topic switching/persistence, clarification, Jira released versions/pagination, ANR freshness/missing data passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
