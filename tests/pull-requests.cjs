// «Pull requests»: routing and near-misses (Jira «на ревью», store reviews, translation, code review of pasted
// code), review-requested / mine / repo lists with size, checks and review state, one PR with files, checks and a
// model summary from a capped diff, repo clarification, model-free behaviour, errors, comment only through the card
// (ipc) with a notification, and the offer. No network: s.request and s.fetch are stubs.
const assert=require('node:assert/strict');
const app=require('../src/extensions/pull-requests/feature.cjs');
const prs=require('../src/extensions/pull-requests/prs.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const iso=h=>new Date(Date.now()-h*3600000).toISOString();

(async()=>{
 // --- Helpers -----------------------------------------------------------------------------------------
 assert.equal(prs.checks([]).state,'none');
 assert.deepEqual((({state,passed,failed,pending})=>({state,passed,failed,pending}))(prs.checks([{name:'a',status:'completed',conclusion:'success'},{name:'b',status:'completed',conclusion:'failure'},{name:'c',status:'in_progress'}])),{state:'failure',passed:1,failed:1,pending:1});
 assert.equal(prs.checks([{name:'b',status:'completed',conclusion:'failure'},{name:'a',status:'completed',conclusion:'success'}]).list[0].name,'b','failed checks first');
 assert.equal(prs.reviewState([{user:{login:'a'},state:'CHANGES_REQUESTED'},{user:{login:'a'},state:'APPROVED'}],0),'approved','the latest review of a reviewer counts');
 assert.equal(prs.reviewState([{user:{login:'a'},state:'APPROVED'},{user:{login:'a'},state:'COMMENTED'}],0),'approved','a later comment does not reset approval');
 assert.equal(prs.reviewState([{user:{login:'a'},state:'APPROVED'},{user:{login:'b'},state:'CHANGES_REQUESTED'}],0),'changes');
 assert.equal(prs.reviewState([],2),'pending');

 // --- Routing ---------------------------------------------------------------------------------------
 const kinds={'какие PR ждут моего ревью':'review','что мне поревьюить?':'review','мои пулл-реквесты':'mine','покажи мои PR':'mine','что в PR 123':'pr','резюме пулл-реквеста':'pr',
  'открытые PR в acme/game':'repo','какие открытые пулл реквесты':'repo','https://github.com/acme/game/pull/77':'pr','резюме PR acme/game#12':'pr'};
 for(const [text,kind] of Object.entries(kinds))assert.equal(app.route(text)?.kind,kind,text);
 assert.deepEqual(app.route('что в PR 123'),{kind:'pr',repo:'',number:123,summary:true});
 assert.deepEqual(app.route('резюме PR acme/game#12'),{kind:'pr',repo:'acme/game',number:12,summary:true});
 assert.deepEqual(app.route('посмотри https://github.com/acme/game/pull/77'),{kind:'pr',repo:'acme/game',number:77,summary:false});
 assert.equal(app.route('PR 5').summary,false);
 for(const text of ['какие задачи на мне на ревью?','какие из них на ревью?','Переведи на русский: please review my pull request','сделай код-ревью: function sum(a){}','что такое pull request',
  'покажи отзывы в App Store','какие отзывы в Google Play','почему упала сборка?','статус CI','закоммить изменения','регулярно созваниваемся','какие задачи в BW на ревью?','PR-менеджер написал пресс-релиз'])
  assert.equal(app.route(text),null,'not ours: '+text);

 // --- Chat turns -------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[],writes=[],sent=[];let routes={},model=[];
 const pull=(n,extra={})=>({number:n,title:'Feature '+n,user:{login:'alice'},html_url:'https://github.com/acme/game/pull/'+n,draft:false,created_at:iso(30),updated_at:iso(2),additions:120,deletions:30,changed_files:4,head:{sha:'sha'+n,ref:'feature/'+n},base:{ref:'main'},requested_reviewers:[{login:'me'}],body:'Adds the thing',...extra});
 const s={settings:{model:'',githubRepos:'acme/game'},companyId:'c1',requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  win:{isDestroyed:()=>false,webContents:{send:(ch,data)=>sent.push([ch,data])}},
  async request(url,options){calls.push({url,options});
   if(url.includes('/api/chat')){const next=model.shift();assert.ok(next,'unexpected model call');const body=JSON.parse(options.body);return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}
   const key=Object.keys(routes).sort((a,b)=>b.length-a.length).find(k=>url.includes(k));assert.ok(key,'unexpected request '+url);const v=routes[key];if(v instanceof Error)throw v;return typeof v==='function'?v(url,options):v;},
  async fetch(url,options){writes.push({url,options});assert.equal(options.method,'POST');assert.equal(url,'https://api.github.com/repos/acme/game/issues/12/comments');assert.equal(JSON.parse(options.body).body,'LGTM, но поправь тест');return {ok:true,status:201,text:async()=>JSON.stringify({html_url:'https://github.com/acme/game/pull/12#issuecomment-1'})};}};
 Object.assign(s,(({ipc,...rest})=>(s.ipc=ipc,rest))(app.setup(s)));

 assert.equal(await app.turn(s,'какие PR ждут моего ревью'),null,'not added: nothing here');
 s.settings['extension_pull-requests']='true';
 const noToken=await app.turn(s,'какие PR ждут моего ревью');
 assert.equal(noToken.question,true);assert.match(noToken.text,/Подключите GitHub/);assert.equal(calls.length,0);

 s.settings.githubToken='github_pat_x';
 routes={'/search/issues':{total_count:2,items:[{number:12,title:'Speed up sum',user:{login:'alice'},repository_url:'https://api.github.com/repos/acme/game',html_url:'https://github.com/acme/game/pull/12',pull_request:{},created_at:iso(30),updated_at:iso(3)},
   {number:7,title:'Fix login',user:{login:'bob'},repository_url:'https://api.github.com/repos/acme/tools',html_url:'https://github.com/acme/tools/pull/7',pull_request:{},created_at:iso(80),updated_at:iso(20)}]},
  '/repos/acme/game/pulls/12':pull(12,{title:'Speed up sum'}),'/repos/acme/tools/pulls/7':pull(7,{title:'Fix login',user:{login:'bob'},additions:3,deletions:1,requested_reviewers:[]}),
  '/commits/sha12/check-runs':{check_runs:[{name:'test',status:'completed',conclusion:'failure',html_url:'https://github.com/acme/game/runs/1'},{name:'lint',status:'completed',conclusion:'success'}]},
  '/commits/sha7/check-runs':{check_runs:[{name:'test',status:'completed',conclusion:'success'}]},
  '/repos/acme/game/pulls/12/reviews':[],'/repos/acme/tools/pulls/7/reviews':[{user:{login:'me'},state:'APPROVED'}]};
 const review=await app.turn(s,'какие PR ждут моего ревью');
 const q=new URL(calls.find(c=>c.url.includes('/search/issues')).url).searchParams.get('q');
 assert.equal(q,'is:open is:pr archived:false review-requested:@me');
 assert.equal(review.text,'Вашего ревью ждут 2 PR. С упавшими проверками: 1.');
 const items=review.extensionData.prCard.items;
 assert.deepEqual(items.map(i=>[i.key,i.additions,i.deletions,i.checks.state,i.review]),[['acme/game#12',120,30,'failure','pending'],['acme/tools#7',3,1,'success','approved']]);
 assert.equal(calls[0].options.headers.Authorization,'Bearer github_pat_x');
 const mine=await app.turn(s,'мои пулл-реквесты');
 assert.match(new URL(calls.filter(c=>c.url.includes('/search/issues')).at(-1).url).searchParams.get('q'),/author:@me$/);
 assert.match(mine.text,/^У вас открыто 2 PR/);
 await app.turn(s,'какие открытые пулл реквесты');
 assert.match(new URL(calls.filter(c=>c.url.includes('/search/issues')).at(-1).url).searchParams.get('q'),/ repo:acme\/game$/,'repo list uses the default repository');
 routes['/search/issues']={total_count:0,items:[]};
 assert.equal((await app.turn(s,'какие PR ждут моего ревью')).text,'Сейчас никто не ждёт вашего ревью.');

 // One PR, model-free: files, checks, review; no summary and it says why.
 routes['/repos/acme/game/pulls/12/files']=[{filename:'src/sum.js',status:'modified',additions:100,deletions:20,patch:'@@ -1 +1 @@\n-old\n+new'},{filename:'tests/sum.test.js',status:'added',additions:20,deletions:0,patch:'+test'.repeat(5000)},{filename:'logo.png',status:'modified',additions:0,deletions:0}];
 const plain=await app.turn(s,'что в PR 12');
 const card=plain.extensionData.prCard;
 assert.equal(card.mode,'pr');assert.equal(card.summary,null);assert.deepEqual(card.fileList.map(f=>f.name),['src/sum.js','tests/sum.test.js','logo.png']);
 assert.equal(card.checks.list[0].status,'failure');assert.equal(card.diff,undefined,'the diff is not stored in the chat');
 assert.match(plain.text,/^acme\/game#12 «Speed up sum» от alice: \+120 −30 в 4 файлах\. Проверки упали: 1\. Ждёт ревью\. Чтобы получить резюме, выберите локальную модель/);
 // With a model: the summary comes from a capped diff.
 s.settings.model='qwen3:4b';s.settings.ollamaUrl='http://127.0.0.1:11434/api/chat';
 model=[body=>{const user=JSON.parse(body.messages.at(-1).content);assert.ok(user.diff.length<=prs.MAX_DIFF);assert.match(user.diff,/--- src\/sum\.js/);assert.deepEqual(user.files.slice(0,1),['src/sum.js +100 −20']);return {bullets:['Ускоряет sum: цикл вместо reduce.','Добавляет тесты.'],risk:'Поменялось поведение на пустом массиве.'};}];
 const summarized=await app.turn(s,'резюме пулл-реквеста 12');
 assert.deepEqual(summarized.extensionData.prCard.summary.bullets,['Ускоряет sum: цикл вместо reduce.','Добавляет тесты.']);
 assert.equal(summarized.extensionData.prCard.summarized,true);
 assert.match(summarized.text,/Ускоряет sum/);
 // «Резюме» without a number asks which PR and continues.
 let asked;try{await app.turn(s,'резюме пулл-реквеста');}catch(e){asked=e;}
 assert.ok(asked instanceof InputRequired);
 model=[{bullets:['Кратко.'],risk:''}];
 assert.equal((await asked.resume('#12')).extensionData.prCard.number,12);
 s.settings.model='';
 // Several default repositories: a PR number asks which one (choices from the shared panel).
 s.settings.githubRepos='acme/game, acme/tools';
 asked=null;try{await app.turn(s,'PR 12');}catch(e){asked=e;}
 assert.deepEqual(asked.spec.options,['acme/game','acme/tools']);assert.equal(asked.spec.strictChoices,true);
 assert.equal((await asked.resume('acme/game')).extensionData.prCard.key,'acme/game#12');
 s.settings.githubRepos='acme/game';

 // --- Errors ---------------------------------------------------------------------------------------------
 routes['/search/issues']=Object.assign(Error('HTTP 403'),{status:403,detail:'{"message":"API rate limit exceeded"}'});
 const limited=await app.turn(s,'какие PR ждут моего ревью');assert.equal(limited.error,true);assert.match(limited.text,/лимит API/);
 routes['/repos/acme/game/pulls/99']=Object.assign(Error('HTTP 404'),{status:404});
 assert.match((await app.turn(s,'что в PR 99')).text,/не найдено/);

 // --- Comment: only through the card's ipc, for a PR that was shown -------------------------------------------
 assert.equal(writes.length,0,'chat turns never write');
 await assert.rejects(s.ipc.comment('acme/game#5','x'),/устарела/);
 await assert.rejects(s.ipc.comment('acme/game#12','  '),/Напишите/);
 const posted=await s.ipc.comment('acme/game#12','LGTM, но поправь тест');
 assert.equal(posted.url,'https://github.com/acme/game/pull/12#issuecomment-1');assert.equal(writes.length,1);
 assert.deepEqual(sent.map(([,d])=>[d.id,d.busy,d.kind]),[['pull-requests',true,'info'],['pull-requests',false,'success']]);

 // --- Offer --------------------------------------------------------------------------------------------
 const list=offers.load(),pick=text=>offers.candidates(text,{offers:list,settings:{}}).filter(r=>r.direct).map(r=>r.offer.id);
 assert.deepEqual(pick('какие PR ждут моего ревью'),['pull-requests']);
 assert.deepEqual(pick('покажи мои пулл-реквесты'),['pull-requests']);
 for(const text of ['какие задачи на ревью','покажи отзывы в App Store','переведи pull request','последние сборки'])assert.equal(pick(text).includes('pull-requests'),false,'no offer: '+text);
 const offer=list.find(o=>o.id==='pull-requests');assert.equal(offer.ready({'extension_pull-requests':'true'}),false);assert.equal(offer.ready({'extension_pull-requests':'true',githubToken:'t'}),true);
 console.log('Pull requests: routing and near-misses, review/mine/repo search with size/checks/review state, single PR with files and capped-diff summary, clarifications, model-free, errors, card-only comment with notification, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
