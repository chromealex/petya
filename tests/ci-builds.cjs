// «Сборки» (ci-builds): routing and the boundary with build-repair/build-question/Slack, GitHub Actions runs with
// the failing job/step and first error lines from the redirected job log, Unity Build Automation builds,
// history strips, rerun only through the card (ipc) with a notification, errors, the offer and settings.
// No network: s.request and s.fetch are stubs.
const assert=require('node:assert/strict');
const app=require('../src/extensions/ci-builds/feature.cjs');
const src=require('../src/extensions/ci-builds/sources.cjs');
const {errorLines}=require('../src/extensions/ci-builds/log.cjs');
const github=require('../src/extensions/github/client.cjs');
const githubFeature=require('../src/extensions/github/feature.cjs');
const coderIntent=require('../src/extensions/coder/intent.cjs');
const {isRepair}=require('../src/build-repair.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const iso=minAgo=>new Date(Date.now()-minAgo*60000).toISOString();
const run=(id,name,conclusion,minAgo,extra={})=>({id,name,workflow_id:name==='CI'?1:2,run_number:id,run_attempt:1,display_title:'Commit '+id,head_branch:'main',head_sha:'abc'+id,status:conclusion?'completed':'in_progress',conclusion,created_at:iso(minAgo),run_started_at:iso(minAgo),updated_at:iso(minAgo-4),html_url:'https://github.com/acme/game/actions/runs/'+id,event:'push',...extra});
const LOG=['2026-11-08T10:00:00.0000000Z ##[group]Run npm test','2026-11-08T10:00:01.0000000Z > jest','2026-11-08T10:00:02.0000000Z   0 errors in setup','2026-11-08T10:00:03.0000000Z FAIL src/sum.test.js',
 '2026-11-08T10:00:04.0000000Z   ● sum › adds numbers','2026-11-08T10:00:05.0000000Z ##[error]TypeError: Cannot read properties of undefined (reading \'length\')','2026-11-08T10:00:06.0000000Z     at sum (src/sum.js:3:12)','2026-11-08T10:00:07.0000000Z ##[error]Process completed with exit code 1.'].join('\n');

(async()=>{
 // --- Log extraction --------------------------------------------------------------------------------
 assert.deepEqual(errorLines(LOG),['FAIL src/sum.test.js','● sum › adds numbers','TypeError: Cannot read properties of undefined (reading \'length\')','at sum (src/sum.js:3:12)']);
 assert.deepEqual(errorLines('[Unity] Assets/Scripts/Player.cs(10,5): error CS0103: The name \'speed\' does not exist in the current context\n[Unity] Scripts have compiler errors.\n! build of \'android\' failed'),
  ['Assets/Scripts/Player.cs(10,5): error CS0103: The name \'speed\' does not exist in the current context','Scripts have compiler errors.']);
 assert.deepEqual(errorLines('step one\nstep two\n##[error]Process completed with exit code 2.'),['step one','step two','Process completed with exit code 2.'],'no explicit error: the tail and the exit code');
 assert.equal(errorLines('\x1b[31merror:\x1b[0m linker failed')[0],'error: linker failed','ANSI colours are stripped');

 // --- GitHub adapter helpers ------------------------------------------------------------------------
 assert.deepEqual(github.parseRepos('acme/game, https://github.com/acme/tools.git  acme/game'),['acme/game','acme/tools']);
 assert.throws(()=>github.parseRepos('not a repo'),/owner\/repo/);
 assert.equal(github.repoFromRemote('git@github.com:acme/game.git'),'acme/game');
 assert.equal(github.repoFromRemote('https://github.com/acme/game'),'acme/game');
 assert.equal(github.repoFromRemote('https://gitlab.com/acme/game.git'),'');
 const next={githubRepos:' acme/game ,acme/tools '};githubFeature.validate(next);assert.equal(next.githubRepos,'acme/game, acme/tools');
 assert.throws(()=>app.validate({ciUnityKey:'no-colon'}),/Key ID/);app.validate({ciUnityOrg:'my-org',ciUnityProject:'proj_1',ciUnityKey:'id:secret'});

 // --- Routing and the boundary with Petya's build flows ---------------------------------------------
 const kinds={'почему упала сборка?':'why','что с билдом на андроид':'status','последние сборки':'status','статус CI':'status','перезапусти упавшую сборку':'rerun','Покажи последние прогоны GitHub Actions на ветке develop':'status'};
 for(const [text,kind] of Object.entries(kinds))assert.equal(app.route(text)?.kind,kind,text);
 assert.equal(app.route('что с билдом на андроид').platform,'android');
 assert.equal(app.route('Покажи последние прогоны GitHub Actions на ветке develop').branch,'develop');
 assert.equal(app.route('статус CI на main').branch,'main');
 for(const text of ['почини билд','исправь сборку','пофикси падающий билд','что с билдом','как там сборка','что с этим билдом на андроид','спроси, что с билдом на андроид','узнай что с билдом',
  'почему упал билд в слаке','разбери тред со сборкой','следи за билдом 123','статус билдов','статус исправления','отмени исправление','сколько весит билд на андроид','размер сборки iOS',
  'собери билд под андроид','запусти сборку','что такое CI','как настроить github actions','какие PR ждут моего ревью','мои пулл-реквесты','регулярно созваниваемся','обнови зависимости в сборке',
  'Исправь код проекта, чтобы проходила проверка «test», шаг «Run tests». Ошибка: build failed'])
  assert.equal(app.route(text),null,'not ours: '+text);
 assert.equal(app.route('почему упала сборка?',{slackSource:{url:'https://x.slack.com/archives/C1/p1'}}),null,'a Slack thread chat stays with the Slack flows');
 assert.equal(app.route('почему упала сборка?',{attachments:[{name:'build.log'}]}),null,'an attached log stays with build-repair/inspection');
 assert.equal(isRepair('почини билд'),true,'build-repair still owns repair');

 // --- Chat turns -------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[],writes=[],sent=[];
 let routes={};
 const s={settings:{model:'',githubRepos:'acme/game'},companyId:'c1',requestProgress:{report(){}},attachments:{list:()=>[]},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  win:{isDestroyed:()=>false,webContents:{send:(ch,data)=>sent.push([ch,data])}},
  async request(url,options){calls.push({url,options});const key=Object.keys(routes).find(k=>url.includes(k));assert.ok(key,'unexpected request '+url);const v=routes[key];if(v instanceof Error)throw v;return typeof v==='function'?v(url,options):v;},
  async fetch(url,options={}){writes.push({url,options});
   if(url==='https://api.github.com/repos/acme/game/actions/jobs/77/logs'){assert.equal(options.redirect,'manual');assert.match(options.headers.Authorization,/^Bearer /);return {status:302,ok:false,headers:{get:h=>h==='location'?'https://productionresultssa1.blob.core.windows.net/logs/77.txt?sig=x':null}};}
   if(url.startsWith('https://productionresultssa1.blob.core.windows.net/')){assert.equal(options.headers,undefined,'the token is not sent to the signed log URL');return {status:200,ok:true,arrayBuffer:async()=>Buffer.from(LOG)};}
   if(url.endsWith('/rerun-failed-jobs')){assert.equal(options.method,'POST');return {status:201,ok:true,text:async()=>''};}
   if(url.includes('/log?')){assert.match(options.headers.Authorization,/^Basic /);return {status:200,ok:true,arrayBuffer:async()=>Buffer.from('[Unity] Assets/Scripts/Player.cs(10,5): error CS0103: The name \'speed\' does not exist\n')};}
   if(url.endsWith('/buildtargets/default-android/builds')&&options.method==='POST'){assert.deepEqual(JSON.parse(options.body),{clean:false});return {status:202,ok:true,text:async()=>JSON.stringify([{build:13,buildtargetid:'default-android'}])};}
   throw Error('unexpected fetch '+url);}};
 Object.assign(s,(({ipc,...rest})=>(s.ipc=ipc,rest))(app.setup(s)));

 assert.equal(await app.turn(s,'почему упала сборка?'),null,'not added: nothing here');
 s.settings['extension_ci-builds']='true';
 const ask=await app.turn(s,'почему упала сборка?');
 assert.equal(ask.question,true);assert.match(ask.text,/подключите GitHub/);assert.equal(calls.length,0);

 s.settings.githubToken='github_pat_x';
 routes={'/repos/acme/game/actions/runs?':{workflow_runs:[run(105,'CI',null,2),run(104,'CI','failure',30),run(103,'CI','success',90),run(102,'Android build','success',60,{head_branch:'release/1.2'}),run(101,'CI','success',200)]},
  '/actions/runs/104/jobs':{jobs:[{id:76,name:'lint',conclusion:'success',steps:[]},{id:77,name:'test',conclusion:'failure',html_url:'https://github.com/acme/game/actions/runs/104/job/77',steps:[{name:'Checkout',conclusion:'success'},{name:'Run tests',conclusion:'failure'}]}]}};
 const why=await app.turn(s,'почему упала сборка?');
 const card=why.extensionData.ciCard,f=card.failure;
 assert.equal(why.by,'Сборки');
 assert.match(why.text,/^Упал «CI» #104 на main \(30 мин назад\): job «test», шаг «Run tests»\. Первая ошибка: FAIL src\/sum\.test\.js$/);
 assert.equal(f.job,'test');assert.equal(f.step,'Run tests');assert.equal(f.url,'https://github.com/acme/game/actions/runs/104/job/77');
 assert.equal(f.lines[2],'TypeError: Cannot read properties of undefined (reading \'length\')');
 assert.equal(card.runs.length,5);assert.equal(card.runs[0].status,'running');
 assert.deepEqual(card.history.map(g=>[g.name,g.runs.map(r=>r.status).join(',')]),[['CI','success,success,failure,running'],['Android build','success']]);
 const callJobs=calls.find(c=>c.url.includes('/jobs'));assert.match(callJobs.url,/filter=latest/);
 assert.equal(calls[0].options.headers['X-GitHub-Api-Version'],'2022-11-28');assert.equal(calls[0].options.headers.Accept,'application/vnd.github+json');
 // «Отдать Программисту»: a coding request for the coder extension, not a build-repair or CI request.
 assert.equal(coderIntent.isCoding(f.handoff),true,'handoff is taken by «Программист»: '+f.handoff);
 assert.equal(isRepair(f.handoff),false);assert.equal(app.route(f.handoff),null);
 assert.match(f.handoff,/TypeError: Cannot read properties/);
 assert.equal(writes.filter(w=>w.options.method==='POST').length,0,'a chat turn never re-runs');

 // Status: a workflow whose latest finished run is green is not reported as failing.
 routes['/repos/acme/game/actions/runs?']={workflow_runs:[run(106,'CI','success',1),run(104,'CI','failure',30)]};
 const st=await app.turn(s,'статус CI');
 assert.equal(st.extensionData.ciCard.failure,null);assert.match(st.text,/^Последние сборки: 1 успешно, 1 упала\.$/);
 // Platform filter on GitHub workflows.
 routes['/repos/acme/game/actions/runs?']={workflow_runs:[run(102,'Android build','failure',60),run(101,'CI','success',200)]};
 routes['/actions/runs/102/jobs']={jobs:[{id:77,name:'gradle',conclusion:'failure',steps:[{name:'assembleRelease',conclusion:'failure'}]}]};
 const android=await app.turn(s,'что с билдом на андроид');
 assert.deepEqual(android.extensionData.ciCard.runs.map(r=>r.workflow),['Android build']);assert.match(android.text,/«Android build» #102/);
 // Branch filter goes to the API.
 await app.turn(s,'статус CI на ветке develop');assert.match(calls.at(-1).url.includes('/jobs')?calls.at(-2).url:calls.at(-1).url,/branch=develop/);

 // --- Rerun only through the card's ipc, for a run that was shown ---------------------------------------
 await assert.rejects(s.ipc.rerun('gh:acme/game:999'),/устарела/);
 const rr=await s.ipc.rerun(android.extensionData.ciCard.failure.rerun);
 assert.match(rr.text,/Перезапуск «Android build» #102 принят GitHub/);
 assert.equal(writes.at(-1).url,'https://api.github.com/repos/acme/game/actions/runs/102/rerun-failed-jobs');
 assert.deepEqual(sent.map(([ch,d])=>[ch,d.busy,d.kind]),[['extension-install-progress',true,'info'],['extension-install-progress',false,'success']],'rerun is published to notifications');
 await assert.rejects(s.ipc.rerun(android.extensionData.ciCard.failure.rerun),/устарела/,'the same card does not rerun twice');

 // --- Errors -------------------------------------------------------------------------------------------
 routes['/repos/acme/game/actions/runs?']=Object.assign(Error('HTTP 401'),{status:401});
 const denied=await app.turn(s,'последние сборки');
 assert.equal(denied.error,true);assert.match(denied.text,/GitHub не принял токен/);
 routes['/repos/acme/game/actions/runs?']=Object.assign(Error('HTTP 403'),{status:403,detail:'{"message":"Resource not accessible by personal access token"}'});
 assert.match((await app.turn(s,'последние сборки')).text,/Actions: read and write/);

 // --- No repository known: ask through the shared question panel, then continue ---------------------------
 s.settings.githubRepos='';s.gitWorkspace={discover:async()=>({selected:''})};
 let asked;try{await app.turn(s,'последние сборки');}catch(e){asked=e;}
 assert.ok(asked instanceof InputRequired,'missing repository is a clarification');assert.match(asked.spec.text,/owner\/repo/);
 routes['/repos/acme/tools/actions/runs?']={workflow_runs:[run(1,'CI','success',5)]};
 const resumed=await asked.resume('acme/tools');assert.equal(resumed.extensionData.ciCard.runs[0].workflow,'CI');assert.deepEqual(resumed.extensionData.ciCard.repos,['acme/tools']);
 // The project's git remote is used when no repositories are configured.
 s.gitWorkspace={discover:async()=>({selected:'/p'}),git:async()=>'origin\tgit@github.com:acme/tools.git (fetch)\norigin\tgit@github.com:acme/tools.git (push)\n'};
 assert.deepEqual((await app.turn(s,'последние сборки')).extensionData.ciCard.repos,['acme/tools']);

 // --- Unity Build Automation --------------------------------------------------------------------------
 Object.assign(s.settings,{githubToken:'',ciUnityOrg:'my-org',ciUnityProject:'proj-1',ciUnityKey:'key-id:secret'});
 routes={'/buildtargets/default-android/builds?':[{build:12,buildtargetid:'default-android',buildStatus:'failure',platform:'android',created:iso(15),totalTimeInSeconds:612,scmBranch:'main',changeset:[{commitId:'f00',message:'Speed tweak'}],links:{dashboard_url:{href:'https://cloud.unity.com/build/12'}}},{build:11,buildtargetid:'default-android',buildStatus:'success',created:iso(100),totalTimeInSeconds:590}],
  '/buildtargets/default-ios/builds?':[{build:5,buildtargetid:'default-ios',buildStatus:'started',created:iso(3)}],
  '/projects/proj-1/buildtargets':[{buildtargetid:'default-android',name:'Android',platform:'android',enabled:true},{buildtargetid:'default-ios',name:'iOS',platform:'ios',enabled:true}]};
 const unity=await app.turn(s,'что с билдом на андроид');
 const uc=unity.extensionData.ciCard;
 assert.equal(calls.at(-1).url.startsWith(src.UNITY+'/orgs/my-org/projects/proj-1/'),true);
 assert.equal(calls.at(-1).options.headers.Authorization,'Basic '+Buffer.from('key-id:secret').toString('base64'));
 assert.deepEqual(uc.runs.map(r=>r.workflow+' #'+r.number),['Android #12','Android #11'],'only the Android target');
 assert.equal(uc.failure.lines[0],'Assets/Scripts/Player.cs(10,5): error CS0103: The name \'speed\' does not exist');
 assert.equal(uc.failure.url,'https://cloud.unity.com/build/12');assert.equal(uc.runs[0].duration,612);
 const ur=await s.ipc.rerun(uc.failure.rerun);assert.match(ur.text,/поставлена в очередь Unity Build Automation \(#13\)/);
 routes['/projects/proj-1/buildtargets']=Object.assign(Error('HTTP 403'),{status:403});
 assert.match((await app.turn(s,'последние сборки')).text,/роль Automation User/);

 // --- Status for settings, model-free behaviour -------------------------------------------------------------
 const status=await s.ipc.status();assert.deepEqual(status,{github:false,unity:true,org:'my-org',project:'proj-1',keyId:'key-id'});
 assert.equal(JSON.stringify(status).includes('secret'),false,'the secret never reaches the renderer');
 assert.equal(calls.filter(c=>c.url.includes('11434')).length,0,'no model calls');

 // --- Offer: CI names and «последние сборки»; Slack build questions are left to Petya ---------------------------
 const list=offers.load(),pick=text=>offers.candidates(text,{offers:list,settings:{}}).filter(r=>r.direct).map(r=>r.offer.id);
 assert.deepEqual(pick('покажи последние сборки'),['ci-builds']);
 assert.deepEqual(pick('статус CI'),['ci-builds']);
 assert.deepEqual(pick('почему упал CI на main'),['ci-builds']);
 for(const text of ['почему упала сборка?','почему упал билд','что с билдом','почини билд','сколько весит билд','какие PR ждут моего ревью'])assert.equal(pick(text).includes('ci-builds'),false,'no offer: '+text);
 const offer=list.find(o=>o.id==='ci-builds');
 assert.equal(offer.ready({'extension_ci-builds':'true'}),false);assert.equal(offer.ready({'extension_ci-builds':'true',githubToken:'x'}),true);
 console.log('CI builds: routing and build-repair/build-question/Slack boundary, GitHub runs + failing job/step + redirected log, platform/branch filters, history strips, card-only rerun with notification, 401/403, repo clarification and git remote, Unity Build Automation v2, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
