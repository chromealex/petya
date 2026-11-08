// «Зависимости»: manifest parsing (npm, pip requirements/pyproject, Unity UPM, Gradle, CocoaPods), version kinds and
// PEP 440 specifiers, npm outdated/audit without a shell, PyPI and OSV (stubbed, no network), CVSS severities,
// offline handling, routing with near-misses, the no-folder question, and the card data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const M=require('../src/extensions/dependencies/manifests.cjs');
const S=require('../src/extensions/dependencies/sources.cjs');
const app=require('../src/extensions/dependencies/feature.cjs');
const offers=require('../src/features/extension-offers.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-deps-'));
const w=(rel,text)=>{const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,typeof text==='string'?text:JSON.stringify(text));};
w('web/package.json',{name:'web',dependencies:{lodash:'^4.17.20',react:'^17.0.2'},devDependencies:{jest:'^29.0.0'}});
w('web/package-lock.json',{lockfileVersion:3,packages:{'node_modules/lodash':{version:'4.17.20'},'node_modules/react':{version:'17.0.2'},'node_modules/jest':{version:'29.7.0'}}});
w('web/node_modules/ignored/package.json',{name:'ignored'});
w('api/requirements.txt','# api\nrequests==2.31.0\nflask>=2.0,<3  # web\nnumpy\n-r dev.txt\ngit+https://github.com/x/y.git\n');
w('api/pyproject.toml','[project]\nname="api"\ndependencies = [\n  "pydantic==1.10.2",\n]\n[tool.poetry.dependencies]\npython = "^3.11"\nhttpx = "0.27.0"\n');
w('Game/Assets/.keep','');
w('Game/ProjectSettings/ProjectVersion.txt','m_EditorVersion: 2022.3.40f1\n');
w('Game/Packages/manifest.json',{dependencies:{'com.unity.inputsystem':'1.7.0','com.unity.entities':'1.0.0-pre.65','com.company.tools':'https://github.com/company/tools.git#v2','com.local.kit':'file:../kit','com.unity.modules.audio':'1.0.0'}});
w('Game/Packages/packages-lock.json',{dependencies:{'com.unity.inputsystem':{version:'1.7.0',depth:0,source:'registry'},'com.company.tools':{version:'https://github.com/company/tools.git#v2',depth:0,source:'git',hash:'abc'},'com.local.kit':{version:'file:../kit',depth:0,source:'local'},'com.unity.modules.audio':{version:'1.0.0',depth:0,source:'builtin'}}});
w('android/build.gradle','dependencies {\n implementation "com.squareup.okhttp3:okhttp:4.12.0"\n testImplementation("junit:junit:4.13.2")\n}\n');
w('android/gradle/libs.versions.toml','[versions]\nkotlin = "1.9.22"\n[libraries]\nkotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }\n');
w('ios/Podfile.lock','PODS:\n  - Alamofire (5.8.1)\n  - Firebase/Core (10.20.0):\n    - FirebaseAnalytics (= 10.20.0)\n\nDEPENDENCIES:\n  - Alamofire\n');

(async()=>{
 // Parsing.
 const found=M.discover([root]);
 assert.deepEqual(found.npm,[path.join(root,'web')],'node_modules is not entered');
 assert.deepEqual(found.pip[0].files,['requirements.txt','pyproject.toml']);
 assert.deepEqual(found.unity,[path.join(root,'Game')]);
 assert.equal(found.gradle.length,1);assert.equal(found.pods.length,1);
 const npm=M.npmProject(path.join(root,'web'));
 assert.deepEqual(npm.deps.map(d=>[d.name,d.installed,d.dev]),[['lodash','4.17.20',false],['react','17.0.2',false],['jest','29.7.0',true]]);
 const pip=M.pipProject(found.pip[0]);
 assert.deepEqual(pip.deps.map(d=>[d.name,d.spec,d.pinned]),[['requests','==2.31.0','2.31.0'],['flask','>=2.0,<3',null],['numpy','',null],['pydantic','==1.10.2','1.10.2'],['httpx','0.27.0','0.27.0']]);
 const unity=M.unityProject(path.join(root,'Game'));
 assert.equal(unity.editor,'2022.3.40f1');
 assert.deepEqual(Object.fromEntries(unity.deps.map(d=>[d.name,d.flags])),{'com.unity.inputsystem':[],'com.unity.entities':['preview'],'com.company.tools':['git'],'com.local.kit':['file'],'com.unity.modules.audio':[]});
 assert.equal(unity.deps.find(d=>d.name==='com.unity.modules.audio').builtin,true);
 assert.deepEqual(M.gradleProject(path.join(root,'android')).deps.map(d=>d.name+'@'+d.version),['com.squareup.okhttp3:okhttp@4.12.0','junit:junit@4.13.2','org.jetbrains.kotlin:kotlin-stdlib@1.9.22']);
 assert.deepEqual(M.podsProject(path.join(root,'ios')).deps,[{name:'Alamofire',version:'5.8.1'},{name:'Firebase/Core',version:'10.20.0'}]);
 // Versions.
 assert.equal(M.kind('4.17.20','4.17.21'),'patch');assert.equal(M.kind('17.0.2','18.3.1'),'major');assert.equal(M.kind('1.2.0','1.4.0'),'minor');
 assert.equal(M.kind('0.3.1','0.4.0'),'major','0.x minor is breaking');assert.equal(M.kind('2.0.0','2.0.0'),null);assert.equal(M.kind('2.0.0','2.0.0-beta.1'),null);
 assert.equal(M.allows('>=2.0,<3','2.3.3'),true);assert.equal(M.allows('>=2.0,<3','3.0.0'),false);assert.equal(M.allows('~=1.4','1.9'),true);assert.equal(M.allows('~=1.4.2','1.5.0'),false);assert.equal(M.allows('==1.2.*','1.2.9'),true);
 // CVSS and OSV records.
 assert.equal(S.cvss3('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'),9.8);
 assert.equal(S.cvss3('CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N'),6.1);
 assert.deepEqual(S.advisory({id:'PYSEC-1',aliases:['GHSA-aaaa-bbbb-cccc'],summary:'Leak',severity:[{type:'CVSS_V3',score:'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N'}],affected:[{package:{name:'requests'},ranges:[{events:[{introduced:'0'},{fixed:'2.32.0'}]}]}]},'requests'),
  {id:'PYSEC-1',severity:'high',summary:'Leak',url:'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',fixed:'2.32.0'});
 // npm without a shell; on Windows through node.exe + npm-cli.js.
 assert.deepEqual(S.npmCommand({platform:'darwin',env:{PATH:''},exists:f=>f==='/opt/homebrew/bin/npm'}),{file:'/opt/homebrew/bin/npm',args:[],dir:'/opt/homebrew/bin'});
 const win=S.npmCommand({platform:'win32',env:{Path:'C:\\nodejs'},exists:f=>/^C:\\nodejs\\(?:node\.exe|node_modules\\npm\\bin\\npm-cli\.js)$/.test(f)});
 assert.deepEqual(win,{file:'C:\\nodejs\\node.exe',args:['C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],dir:'C:\\nodejs'});
 const real=await S.exec(process.execPath,['-e','process.stdout.write("{\\"a\\":1}");process.exit(1)'],{timeout:5000});
 assert.equal(real.stdout,'{"a":1}','stdout of a non-zero exit (npm outdated) is kept');

 // Chat turns with stubs.
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[],sent=[];let online=true,folders=[root];
 const pypi={requests:{info:{version:'2.32.3'},releases:{'2.31.0':[{}],'2.32.3':[{}],'3.0.0b1':[{}]}},flask:{info:{version:'3.0.3'},releases:{'2.3.3':[{}],'3.0.3':[{}]}},numpy:{info:{version:'2.1.0'},releases:{'2.1.0':[{}]}},pydantic:{info:{version:'2.9.2'},releases:{'1.10.2':[{}],'1.10.18':[{}],'2.9.2':[{}]}},httpx:{info:{version:'0.27.2'},releases:{'0.27.0':[{}],'0.27.2':[{}]}}};
 const s={settings:{},requestProgress:{report(){}},win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(c,i)=>sent.push([c,i])}},
  gitWorkspace:{discover:async()=>({name:'Петя-демо',folders,repositories:[],selected:''})},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   calls.push(url);
   if(!online)throw Object.assign(Error('fetch failed'),{code:'ENOTFOUND'});
   const m=/pypi\.org\/pypi\/([^/]+)\/json/.exec(url);if(m){if(!pypi[m[1]])throw Error('404 Not Found');return pypi[m[1]];}
   if(url.endsWith('/v1/querybatch')){const q=JSON.parse(options.body).queries;assert.ok(q.every(x=>x.version&&x.package.ecosystem));return {results:q.map(x=>({vulns:x.package.name==='requests'?[{id:'GHSA-9wx4-h78v-vm56',modified:'x'}]:[]}))};}
   if(url.includes('/v1/vulns/GHSA-9wx4-h78v-vm56'))return {id:'GHSA-9wx4-h78v-vm56',summary:'Requests Session verify=False persists',database_specific:{severity:'MODERATE'},affected:[{package:{name:'requests'},ranges:[{events:[{fixed:'2.32.0'}]}]}]};
   throw Error('unexpected '+url);
  }};
 app.deps.npm=()=>({file:'/usr/local/bin/npm',args:[],dir:'/usr/local/bin'});
 let npmMode='ok';
 app.deps.exec=async(file,args,opts)=>{
  calls.push(['npm',...args].join(' '));
  assert.equal(file,'/usr/local/bin/npm');assert.equal(opts.cwd,path.join(root,'web'));assert.ok(opts.timeout>0);
  if(npmMode==='offline')return {stdout:JSON.stringify({error:{code:'ENOTFOUND',summary:'request to https://registry.npmjs.org/lodash failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org'}})};
  if(args[0]==='outdated')return {stdout:JSON.stringify({lodash:{current:'4.17.20',wanted:'4.17.21',latest:'4.17.21'},react:{current:'17.0.2',wanted:'17.0.2',latest:'18.3.1'}})};
  return {stdout:JSON.stringify({vulnerabilities:{lodash:{name:'lodash',severity:'high',isDirect:true,via:[{source:1094,name:'lodash',title:'Prototype Pollution in lodash',url:'https://github.com/advisories/GHSA-p6mc-m468-83gw',severity:'high',range:'<4.17.21'}],fixAvailable:true}},metadata:{vulnerabilities:{high:1,total:1}}})};
 };
 assert.equal(await app.turn(s,'какие пакеты устарели'),null,'not added');
 s.settings.extension_dependencies='true';
 for(const miss of ['покажи зависимости между задачами в Jira','у меня эмоциональная зависимость от сериалов','от чего зависит дедлайн?','Как программист, обнови зависимости lodash до 4.17.21 (npm) в отдельной ветке и прогони тесты','обнови зависимости'])
  assert.equal(await app.turn(s,miss),null,'near-miss: '+miss);
 for(const phrase of ['какие пакеты устарели','есть ли уязвимости в зависимостях','npm audit','что обновить в проекте','проверь зависимости юнити'])assert.ok(app.wanted(phrase),phrase);
 const r=await app.turn(s,'какие пакеты устарели');
 const card=r.extensionData.dependencies;
 assert.equal(topic.messages.at(-1).by,'Зависимости');
 assert.ok(calls.includes('npm outdated --json --long')&&calls.includes('npm audit --json'));
 const pkg=name=>card.packages.find(p=>p.name===name);
 assert.deepEqual([pkg('lodash').kind,pkg('lodash').vulns[0].severity,pkg('lodash').vulns[0].url],['patch','high','https://github.com/advisories/GHSA-p6mc-m468-83gw']);
 assert.equal(pkg('react').kind,'major');
 assert.deepEqual([pkg('requests').current,pkg('requests').wanted,pkg('requests').latest,pkg('requests').kind],['2.31.0','2.31.0','2.32.3','minor'],'pre-releases are not «latest»');
 assert.equal(pkg('requests').vulns[0].fixed,'2.32.0');
 assert.deepEqual([pkg('flask').wanted,pkg('flask').latest,pkg('flask').kind],['2.3.3','3.0.3',null],'unpinned: wanted from the specifier, no kind');
 assert.equal(pkg('pydantic').kind,'major');assert.equal(pkg('httpx').kind,'patch');
 assert.deepEqual(pkg('com.company.tools').flags,['git']);assert.equal(pkg('com.unity.modules.audio'),undefined,'built-in modules are not listed');
 assert.equal(pkg('Alamofire').ecosystem,'pods');assert.equal(pkg('junit:junit').ecosystem,'gradle');
 assert.deepEqual([card.summary.outdated,card.summary.major,card.summary.minor,card.summary.patch],[5,2,1,2]);
 assert.deepEqual(card.summary.vulns,{critical:0,high:1,moderate:1,low:0,unknown:0});
 assert.equal(card.packages[0].name,'lodash','most severe first');
 assert.match(r.text,/^Петя-демо: устарело 5 пакетов \(крупных обновлений — 2\)\. Уязвимостей: 2, высоких — 1\. Unity: 4 пакета, с пометками/);
 assert.ok(card.notes.some(n=>/без точной версии/.test(n)));
 assert.equal(card.ecosystems.find(e=>e.id==='unity').status,'listed');assert.match(card.ecosystems.find(e=>e.id==='unity').note,/без редактора не узнать/);
 const notices=sent.filter(([c,i])=>c==='extension-install-progress'&&i.id==='dependencies-check');
 assert.ok(notices.length>=3&&notices.at(-1)[1].busy===false&&notices.slice(0,-1).every(([,i])=>i.busy));
 // Unity only: no network and no npm calls.
 calls.length=0;
 const u=await app.turn(s,'проверь зависимости юнити');
 assert.deepEqual(calls,[]);assert.ok(u.extensionData.dependencies.packages.every(p=>p.ecosystem==='unity'));
 assert.match(u.text,/^Unity: 4 пакета, с пометками \(git\/file\/preview\) — 3; последние версии без редактора не узнать\.$/);
 // «есть ли уязвимости» opens the card filtered to vulnerabilities.
 assert.equal((await app.turn(s,'есть ли уязвимости в зависимостях')).extensionData.dependencies.showVulns,true);
 // Offline: npm errors and PyPI/OSV failures are reported as no network; local data still shown.
 online=false;npmMode='offline';
 const off=await app.turn(s,'что обновить в проекте');
 const od=off.extensionData.dependencies;
 assert.equal(off.error,false);
 assert.deepEqual(od.ecosystems.filter(e=>['npm','pip'].includes(e.id)).map(e=>e.status),['offline','offline']);
 assert.match(off.text,/Нет сети — npm, pip проверены не полностью/);
 assert.ok(od.packages.some(p=>p.name==='lodash'),'packages from package.json are still listed');
 // npm audit unavailable (no lockfile) → OSV for npm.
 online=true;npmMode='ok';fs.rmSync(path.join(root,'web/package-lock.json'));fs.mkdirSync(path.join(root,'web/node_modules/lodash'),{recursive:true});fs.writeFileSync(path.join(root,'web/node_modules/lodash/package.json'),JSON.stringify({version:'4.17.20'}));
 calls.length=0;
 const noLock=await app.turn(s,'npm audit');
 assert.ok(!calls.includes('npm audit --json'));assert.ok(calls.some(c=>String(c).endsWith('/v1/querybatch')));
 assert.equal(noLock.extensionData.dependencies.ecosystems.find(e=>e.id==='npm').vulnSource,'OSV');
 // npm missing.
 app.deps.npm=()=>null;
 const missing=await app.turn(s,'npm outdated');assert.match(missing.extensionData.dependencies.ecosystems.find(e=>e.id==='npm').note,/npm не найден/);
 // No project folder → a question, not an error; no manifests → a question too.
 folders=[];
 const q=await app.turn(s,'какие пакеты устарели');assert.equal(q.question,true);assert.match(q.text,/Подключите папку проекта/);
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'petya-deps-empty-'));folders=[empty];
 assert.equal((await app.turn(s,'какие пакеты устарели')).question,true);
 // Offers.
 const offer=offers.load().find(o=>o.id==='dependencies');
 const pick=text=>offers.candidates(text,{offers:[offer],settings:{}}).map(x=>x.offer.id);
 assert.deepEqual(pick('какие пакеты устарели в проекте?'),['dependencies']);assert.deepEqual(pick('npm audit'),['dependencies']);
 for(const miss of ['зависимости между задачами','эмоциональная зависимость','от чего зависит дедлайн'])assert.deepEqual(pick(miss),[],miss);
 fs.rmSync(root,{recursive:true,force:true});fs.rmSync(empty,{recursive:true,force:true});
 console.log('Dependencies: manifests (npm/pip/UPM/Gradle/Pods), version kinds and specifiers, CVSS, npm without shell, PyPI+OSV stubs, offline, audit→OSV fallback, routing and near-misses, questions, offers passed');
})().catch(e=>{console.error(e);process.exit(1);});
