// «Код-ревью»: routing and near-misses, diff parsing and skip rules, deterministic checks (secrets, debug leftovers,
// TODO, large files, missing tests) on a fixture git repository in a temp folder, model comments verified against the
// changed lines (wrong line / made-up quote dropped, a near line corrected), model-free behaviour, the base branch
// question, a GitHub PR review through «Pull requests» and the one-batch review write only through the card (ipc).
// No network: s.request and s.fetch are stubs; the model is a stub.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/code-review/feature.cjs');
const diff=require('../src/extensions/code-review/diff.cjs');
const checks=require('../src/extensions/code-review/checks.cjs');
const review=require('../src/extensions/code-review/review.cjs');
const offer=require('../src/extensions/code-review/offer.cjs');
const {GitWorkspace}=require('../src/git-workspace.cjs');
const {InputRequired}=require('../src/input-required.cjs');

// Fake secrets are built at run time, never written in the source.
const AWS='AKIA'+'Q'.repeat(16);

// --- fixture repository ------------------------------------------------------------------------------------
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-code-review-'));
const env={...process.env,GIT_CONFIG_NOSYSTEM:'1',HOME:root,GIT_AUTHOR_NAME:'Dev',GIT_AUTHOR_EMAIL:'dev@example.com',GIT_COMMITTER_NAME:'Dev',GIT_COMMITTER_EMAIL:'dev@example.com'};
const run=args=>execFileSync('git',['-C',root,...args],{env,stdio:['ignore','pipe','pipe']}).toString();
const write=(file,text)=>{const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,text);};
run(['init','-q','-b','main']);
write('src/sum.js','function sum(a, b) {\n  return a + b;\n}\nmodule.exports = { sum };\n');
write('tests/sum.test.js','const { sum } = require("../src/sum");\nconsole.log(sum(1, 2));\n');
write('package-lock.json','{"lockfileVersion":3}\n');
write('README.md','# Demo\n');
run(['add','.']);run(['commit','-q','-m','init']);
run(['checkout','-q','-b','feature/average']);
write('src/sum.js',[
 'function sum(a, b) {',
 '  return a + b;',
 '}',
 'function average(list) {',
 '  const total = list.reduce((a, b) => a + b, 0);',
 '  console.log("total", total);',
 '  // TODO handle empty lists',
 '  return total / list.length;',
 '}',
 'const awsKey = "'+AWS+'";',
 'module.exports = { sum, average };',''].join('\n'));
write('src/format.js','function format(n) {\n  return n.toFixed(2);\n}\nfunction pad(s) {\n  return String(s).padStart(8);\n}\nmodule.exports = { format, pad };\n');
write('package-lock.json','{"lockfileVersion":3,"packages":{}}\n');
write('dist/app.min.js','!function(){}();\n');
run(['add','.']);run(['commit','-q','-m','average']);
// Uncommitted and untracked changes are part of «my changes».
write('src/debug.js','function check(x) {\n  debugger;\n  return x;\n}\n');
fs.writeFileSync(path.join(root,'logo.bin'),Buffer.alloc(1536*1024,1));

(async()=>{
 // --- routing -------------------------------------------------------------------------------------------------
 const local=['проверь мои изменения','ревью ветки перед PR','посмотри diff','глянь мой дифф','сделай код-ревью','Петя, проверь мои правки перед пушем','поревьюй мой код','проверь незакоммиченные изменения','сделай code review моих изменений'];
 for(const t of local)assert.equal(app.route(t)?.kind,'local',t);
 assert.equal(app.route('сделай ревью изменений относительно develop').base,'develop');
 assert.equal(app.route('проверь ветку перед мержем в main').base,'main');
 assert.equal(app.route('проверь мои изменения против release/1.4').base,'release/1.4');
 assert.deepEqual(app.route('сделай ревью PR 123'),{kind:'pr',repo:'',number:123});
 assert.deepEqual(app.route('код-ревью пулл-реквеста acme/game#12'),{kind:'pr',repo:'acme/game',number:12});
 assert.deepEqual(app.route('https://github.com/acme/game/pull/77 сделай ревью'),{kind:'pr',repo:'acme/game',number:77});
 assert.deepEqual(app.route('найди баги в PR 42'),{kind:'pr',repo:'',number:42});
 // Near-misses: the concept, store reviews, people's reviews, PR lists and summaries (pull-requests), showing a diff
 // (git), pasted code (skills), Jira tasks on review.
 for(const t of ['что такое код-ревью','как правильно проводить код-ревью?','зачем нужно код-ревью','отзывы в App Store','сделай ревью отзывов в Google Play','перфоманс-ревью','performance review для Маши','ревью сотрудника',
  'годовое ревью','какие PR ждут моего ревью','мне на ревью что-нибудь есть?','что в PR 123','резюме PR 12','покажи diff','покажи дифф','сделай код-ревью: function sum(a){ return a }','задачи на ревью в Jira','проверь изменения в гите','статус CI','проверь код','какая ветка'])
  assert.equal(app.route(t),null,'not ours: '+t);
 const offered=t=>(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)))&&!offer.avoid.some(r=>r.test(t));
 for(const t of ['сделай код-ревью','проверь мои изменения','ревью ветки перед пулл-реквестом','отревьюй мой дифф'])assert.ok(offered(t),t);
 for(const t of ['что такое код-ревью','перфоманс-ревью','отзывы в App Store','какие PR ждут моего ревью','покажи diff'])assert.ok(!offered(t),t);

 // --- diff parsing and skip rules ----------------------------------------------------------------------------
 const hunks=diff.parseHunks('@@ -1,3 +1,4 @@\n a\n-b\n+c\n+d\n e\n');
 assert.deepEqual(hunks[0].lines.map(l=>[l.kind,l.n??null,l.text]),[['ctx',1,'a'],['del',null,'b'],['add',2,'c'],['add',3,'d'],['ctx',4,'e']]);
 for(const [file,why] of [['package-lock.json','lock'],['ios/Podfile.lock','lock'],['vendor/lib/a.go','vendor'],['node_modules/x/index.js','vendor'],['dist/app.js','generated'],['web/app.min.js','generated'],['Assets/Hero.prefab.meta','generated'],['api/user_pb2.py','generated'],['src/build/rules.gradle','']])
  assert.equal(diff.skipReason(file),why,file);
 const capped=diff.select([{path:'big.js',status:'modified',binary:false,hunks:[{oldStart:1,newStart:1,lines:Array.from({length:700},(_,i)=>({kind:'add',n:i+1,text:'x'+i}))}]}]);
 assert.equal(capped.files[0].truncated,true);assert.equal(capped.files[0].hunks[0].lines.length,diff.LIMITS.fileLines);

 // --- checks --------------------------------------------------------------------------------------------------
 assert.equal(checks.secretIn('const k = "'+AWS+'";').what,'ключ доступа AWS');
 assert.equal(checks.secretIn('password = "'+'s3cr'+'etValue1"').what,'пароль или ключ в коде');
 assert.equal(checks.secretIn('password = "changeme123"'),null,'placeholders are not secrets');
 assert.equal(checks.secretIn('token = process.env.TOKEN'),null);
 assert.ok(!checks.mask('k="'+AWS+'"').includes(AWS),'secrets are masked');

 // --- local review --------------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 let model=[];const modelCalls=[],calls=[],writes=[],sent=[];let routes={};
 const s={settings:{model:'qwen3:8b',ollamaUrl:'http://127.0.0.1:11434/api/chat'},companyId:'c1',requestProgress:{report(){}},
  gitWorkspace:new GitWorkspace({context:()=>({id:'p',name:'Demo',folder:root})}),
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  win:{isDestroyed:()=>false,webContents:{send:(ch,data)=>sent.push([ch,data])}},
  async request(url,options){
   if(url.includes('/api/chat')){const body=JSON.parse(options.body);modelCalls.push(body);const next=model.shift();assert.ok(next!==undefined,'unexpected model call: '+body.messages[1].content.slice(0,80));return {message:{content:JSON.stringify(typeof next==='function'?next(body):next)}};}
   calls.push(url);const key=Object.keys(routes).sort((a,b)=>b.length-a.length).find(k=>url.includes(k));assert.ok(key,'unexpected request '+url);const v=routes[key];if(v instanceof Error)throw v;return typeof v==='function'?v(url):v;},
  async fetch(url,options){writes.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify({id:1,html_url:'https://github.com/acme/game/pull/12#pullrequestreview-1'})};}};
 Object.assign(s,(({ipc,...rest})=>(s.ipc=ipc,rest))(app.setup(s)));

 assert.equal(await app.turn(s,'проверь мои изменения'),null,'not added: nothing here');
 s.settings['extension_code-review']='true';

 // The model answers per file; for src/sum.js: one good comment, one on an unchanged line, one with a made-up
 // quote, one off by a line (corrected), one duplicating the code check.
 const byFile=body=>{const m=body.messages[1].content.match(/^Файл: (.+)$/m);return m[1];};
 const answers={
  'src/sum.js':{comments:[
   {line:8,quote:'total / list.length',severity:'blocker',category:'bug',comment:'Пустой список даст деление на ноль: NaN вместо 0.',suggestion:'  return list.length ? total / list.length : 0;'},
   {line:2,quote:'return a + b',severity:'nit',category:'style',comment:'Эта строка не менялась — замечание должно отброситься.'},
   {line:5,quote:'list.map(x => x * 2)',severity:'warning',category:'perf',comment:'Цитата выдумана — отбросить.'},
   {line:4,quote:'const total = list.reduce',severity:'nit',category:'style',comment:'Номер строки сбит на один — исправить на 5.'},
   {line:6,quote:'console.log("total"',severity:'nit',category:'style',comment:'Повтор проверки кода — останется одна.'}]},
  'src/format.js':{comments:[]},'src/debug.js':{comments:[]}};
 model=Array.from({length:3},()=>body=>{const f=byFile(body);assert.ok(answers[f],'model asked about '+f);return answers[f];});
 const r=await app.turn(s,'проверь мои изменения');
 const card=r.extensionData.codeReview;
 assert.equal(card.source,'local');assert.equal(card.mode,'branch');assert.equal(card.branch,'feature/average');assert.equal(card.base,'main');
 assert.equal(card.title,'feature/average → main');
 assert.deepEqual(modelCalls.map(byFile).sort(),['src/debug.js','src/format.js','src/sum.js'],'the model reads only reviewed files');
 assert.equal(modelCalls[0].format.properties.comments.items.properties.severity.enum.join(),'blocker,warning,nit','strict schema');
 assert.ok(!modelCalls.some(b=>b.messages[1].content.includes('lockfileVersion')),'lock files are not sent to the model');
 const skipped=Object.fromEntries(card.files.filter(f=>f.status==='skipped').map(f=>[f.path,f.reason]));
 assert.deepEqual(skipped,{'dist/app.min.js':'generated','logo.bin':'binary','package-lock.json':'lock'});
 const find=(file,check)=>card.comments.find(c=>c.file===file&&(typeof check==='number'?c.line===check:c.check===check));
 const secret=find('src/sum.js','secret');
 assert.equal(secret.severity,'blocker');assert.equal(secret.category,'security');assert.equal(secret.line,10);
 assert.ok(!JSON.stringify(card).includes(AWS),'the secret never reaches the card or the chat');
 assert.equal(find('src/sum.js','debug').severity,'nit');
 assert.equal(find('src/debug.js','debug').severity,'warning','debugger in an untracked file');
 assert.equal(find('src/sum.js','todo').line,7);
 assert.match(find('src/sum.js','tests').comment,/tests\/sum\.test\.js/,'an existing test that was not changed');
 assert.equal(find('src/sum.js','tests').severity,'warning');
 assert.equal(find('src/format.js','tests').severity,'nit','no test at all');
 assert.ok(!card.comments.some(c=>c.file==='tests/sum.test.js'),'nothing about unchanged tests');
 assert.match(find('logo.bin','large').comment,/1\.5 МБ/);
 const division=find('src/sum.js',8);
 assert.equal(division.by,'model');assert.equal(division.severity,'blocker');assert.equal(division.suggestion,'  return list.length ? total / list.length : 0;');
 assert.deepEqual(division.excerpt.map(l=>[l.n,l.target]),[[6,false],[7,false],[8,true],[9,false],[10,false]]);
 assert.equal(division.lang,'js');
 assert.equal(find('src/sum.js',5)?.comment,'Номер строки сбит на один — исправить на 5.','a near line is corrected');
 assert.ok(!card.comments.some(c=>c.file==='src/sum.js'&&c.line===2),'unchanged line dropped');
 assert.ok(!card.comments.some(c=>/выдумана/.test(c.comment)),'made-up quote dropped');
 assert.equal(card.comments.filter(c=>c.file==='src/sum.js'&&c.line===6).length,1,'one comment per line and category');
 assert.equal(card.dropped,2);
 assert.equal(card.comments[0].severity,'blocker','blockers first');
 assert.deepEqual(card.totals,{blocker:2,warning:3,nit:4,files:3,skipped:3,additions:card.totals.additions,deletions:card.totals.deletions});
 assert.match(r.text,/^Ревью feature\/average → main: 3 файла \(ещё 3 пропущено\)\. 2 блокера, 3 замечания, 4 нит-пика\. Отбросил 2 замечания модели/);
 assert.ok(sent.some(([ch,d])=>ch==='extension-install-progress'&&d.id==='code-review'&&!d.busy&&d.kind==='attention'),'finished review in the notification center');

 // Model-free: only the code checks, and it says so.
 s.settings.model='';
 const plain=await app.turn(s,'посмотри diff');
 assert.equal(plain.extensionData.codeReview.model,false);
 assert.ok(plain.extensionData.codeReview.comments.every(c=>c.by==='check'));
 assert.match(plain.text,/Модель не выбрана — только автоматические проверки\./);

 // A base branch that does not exist: a question with the branches, resumed with the answer.
 let question=null;try{await app.turn(s,'сделай ревью изменений относительно develop');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.match(question.spec.text,/Ветки «develop» нет/);assert.ok(question.spec.options.includes('main'));
 const resumed=await question.resume('main');assert.equal(resumed.extensionData.codeReview.base,'main');
 // On the base branch itself: only uncommitted changes; a clean tree has nothing to review.
 run(['add','.']);run(['commit','-q','-m','wip']);run(['checkout','-q','main']);
 assert.equal((await app.turn(s,'проверь мои изменения')).text,'Незакоммиченных изменений нет — проверять нечего.');
 write('README.md','# Demo\nconsole text\n');
 const dirty=await app.turn(s,'проверь мои изменения');
 assert.equal(dirty.extensionData.codeReview.mode,'uncommitted');assert.equal(dirty.extensionData.codeReview.title,'незакоммиченные изменения в main');
 // No git folder in the chat's project: a question, not an error.
 const noGit={...s,gitWorkspace:new GitWorkspace({context:()=>({id:'p',name:'Demo'})})};
 const asked=await app.turn(noGit,'проверь мои изменения');assert.equal(asked.question,true);assert.match(asked.text,/папку проекта с Git/);

 // --- GitHub PR ------------------------------------------------------------------------------------------------
 s.settings.model='qwen3:8b';
 const needPr=await app.turn(s,'сделай ревью PR 12');
 assert.equal(needPr.question,true);assert.match(needPr.text,/«Pull requests»/);assert.equal(calls.length,0);
 // With the offers feature the same answer is the offer card for «Pull requests».
 let proposed=null;const withOffers={...s,extensionOffers:{propose:(command,ids,text,by)=>{proposed={command,ids,by};return {handled:true,question:true,text};}}};
 await app.turn(withOffers,'сделай ревью PR 12');assert.deepEqual(proposed,{command:'сделай ревью PR 12',ids:['pull-requests'],by:'Код-ревью'});
 Object.assign(s.settings,{'extension_pull-requests':'true',githubToken:['ghx','y'.repeat(20)].join('_'),githubRepos:'acme/game'});
 routes={'/repos/acme/game/pulls/12/files':[
   {filename:'src/api.ts',status:'modified',additions:2,deletions:1,patch:'@@ -10,3 +10,4 @@ export function load() {\n   const url = base + path;\n-  return fetch(url);\n+  const res = await fetch(url);\n+  return res.json();\n }'},
   {filename:'yarn.lock',status:'modified',additions:40,deletions:12,patch:'@@ -1 +1 @@\n-a\n+b'},
   {filename:'huge.sql',status:'added',additions:90000,deletions:0}],
  '/repos/acme/game/pulls/12':{number:12,title:'Load JSON',html_url:'https://github.com/acme/game/pull/12',head:{sha:'abc123def4567890',ref:'feature/json'},base:{ref:'main'}}};
 model=[{comments:[{line:12,quote:'res.json()',severity:'warning',category:'bug',comment:'Нет проверки res.ok: ошибка сервера разберётся как JSON.',suggestion:'  if (!res.ok) throw new Error(res.statusText);\n  return res.json();'},{line:11,quote:'await fetch(url)',severity:'blocker',category:'bug',comment:'await в функции без async — синтаксическая ошибка.'}]}];
 const pr=await app.turn(s,'сделай ревью PR 12');
 const prCard=pr.extensionData.codeReview;
 assert.equal(prCard.source,'pr');assert.equal(prCard.key,'acme/game#12@abc123def456');assert.equal(prCard.url,'https://github.com/acme/game/pull/12');
 assert.equal(prCard.branch,'feature/json');assert.equal(prCard.base,'main');
 assert.deepEqual(prCard.files.filter(f=>f.status==='skipped').map(f=>[f.path,f.reason]),[['huge.sql','limit'],['yarn.lock','lock']]);
 assert.deepEqual(prCard.comments.map(c=>[c.line,c.severity]),[[11,'blocker'],[12,'warning']]);
 assert.ok(calls.every(u=>u.startsWith('https://api.github.com/repos/acme/game/pulls/12')),'only reads before the confirmation');
 assert.equal(writes.length,0);
 // The card posts one review after the user confirmed in it.
 const posted=await s.ipc.postReview(prCard.key,prCard.comments.map(c=>c.id));
 assert.equal(writes.length,1);
 const w=writes[0];assert.equal(w.url,'https://api.github.com/repos/acme/game/pulls/12/reviews');assert.equal(w.options.method,'POST');
 const body=JSON.parse(w.options.body);
 assert.equal(body.commit_id,'abc123def4567890');assert.equal(body.event,'COMMENT');
 assert.deepEqual(body.comments.map(c=>[c.path,c.line,c.side]),[['src/api.ts',11,'RIGHT'],['src/api.ts',12,'RIGHT']]);
 assert.match(body.comments[1].body,/```suggestion\n  if \(!res\.ok\)/);
 assert.match(posted.text,/^Оставил 2 комментария в acme\/game#12 одним ревью\.$/);
 await assert.rejects(s.ipc.postReview(prCard.key,prCard.comments.map(c=>c.id)),/уже оставлены/,'no second batch');
 await assert.rejects(s.ipc.postReview('acme/game#99@x',['c1']),/устарела/);
 // GitHub errors are told in words.
 routes['/repos/acme/game/pulls/13']=Object.assign(Error('HTTP 404'),{status:404});
 const missing=await app.turn(s,'сделай ревью PR 13');
 assert.equal(missing.error,true);assert.match(missing.text,/не найдено/);

 // --- verify() directly: a quote must be on an added line ----------------------------------------------------------
 const file={path:'a.py',hunks:diff.parseHunks('@@ -1,2 +1,3 @@\n x = 1\n+y = x / 0\n z = 2\n')};
 assert.equal(review.verify(file,{line:2,quote:'x / 0',severity:'blocker',category:'bug',comment:'Деление на ноль.'}).line,2);
 assert.equal(review.verify(file,{line:1,quote:'x = 1',severity:'nit',category:'style',comment:'Контекст не менялся.'}),null);
 assert.equal(review.verify(file,{line:2,quote:'x / 0',severity:'critical',category:'bug',comment:'Неизвестная важность.'}),null);
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Code review: routing, skip rules, checks, verified model comments, base question, PR review and one-batch write passed');
})().catch(e=>{console.error(e);fs.rmSync(root,{recursive:true,force:true});process.exit(1);});
