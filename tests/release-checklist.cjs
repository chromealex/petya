// «Релизный чек-лист»: routing and near-misses, not installed → null, the version question, the release-check
// registry (ok / problem / not checked / no app → offer, errors and timeouts), manual ticks saved per release, the
// template editor, the Slack status and tasks, and every app's release-check provider with stubbed services and
// temporary project files. No network, no model.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const feature=require('../src/extensions/release-checklist/feature.cjs');
const checks=require('../src/extensions/release-checklist/checks.cjs');
const template=require('../src/extensions/release-checklist/template.cjs');
const versions=require('../src/extensions/release-checklist/versions.cjs');
const offer=require('../src/extensions/release-checklist/offer.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-release-'));
const NOW=new Date('2026-11-09T10:00:00Z');

// --- Routing -------------------------------------------------------------------------------------------------------
for(const p of ['готов ли релиз 1.5','Готов ли релиз 1.5?','чек-лист релиза','релизный чек-лист для 2.0','что мешает выпустить версию 2.0','что ещё мешает выпустить 1.5?','можно ли выпускать 1.5','готовы ли мы к релизу','релиз 1.5 готов?','статус релиза 1.5'])assert(feature.intent(p),p);
for(const p of ['напиши патчноут к релизу 1.5','крэши после релиза 1.5','отзывы после релиза','когда релиз?','когда будет релиз 1.5','чек-лист переезда','чек-лист собеседования','готов ли ужин','release notes к версии 1.5','что такое релизный чек-лист','релиз ноутс 1.5'])assert(!feature.intent(p),p);
assert.equal(feature.versionOf('готов ли релиз 1.5?'),'1.5');assert.equal(feature.versionOf('чек-лист релиза v2.3.1'),'2.3.1');assert.equal(feature.versionOf('чек-лист релиза'),'');
assert.equal(feature.previousOf('1.5'),'1.4');assert.equal(feature.previousOf('1.5.0'),'1.4');assert.equal(feature.previousOf('2.0'),'1');assert.equal(feature.previousOf('1.5',['1.3','1.4.2','1.6']),'1.4.2');

// --- Template ---------------------------------------------------------------------------------------------------------
{const d=template.defaults();assert(d.length>=12);assert(d.some(i=>i.check==='ci.green')&&d.some(i=>!i.check));
 assert.throws(()=>template.normalize([{title:''}]),/название/);assert.throws(()=>template.normalize([{title:'a',check:'bad check'}]),/проверка/);
 const n=template.normalize([{id:'x',title:'  Свой   пункт ',group:''},{id:'x',title:'Второй'}]);assert.equal(n[0].title,'Свой пункт');assert.equal(n[0].group,'Другое');assert.notEqual(n[1].id,'x','duplicate ids are replaced');
 assert.equal(template.custom(d[0]),false);assert.equal(template.custom({...d[0],title:'Другое'}),true);}

// --- Version files ---------------------------------------------------------------------------------------------------------
async function versionCases(){
 const root=path.join(tmp,'game');fs.mkdirSync(path.join(root,'ProjectSettings'),{recursive:true});
 fs.writeFileSync(path.join(root,'ProjectSettings','ProjectSettings.asset'),'PlayerSettings:\n  productName: Towers\n  bundleVersion: 1.5.0\n  buildNumber:\n    Standalone: 0\n    iPhone: 42\n    tvOS: 0\n  AndroidBundleVersionCode: 42\n');
 fs.mkdirSync(path.join(root,'android','app'),{recursive:true});fs.writeFileSync(path.join(root,'android','app','build.gradle'),'android {\n defaultConfig {\n  versionCode 42\n  versionName "1.5"\n }\n}\n');
 fs.mkdirSync(path.join(root,'ios','Towers'),{recursive:true});fs.mkdirSync(path.join(root,'ios','Towers.xcodeproj'),{recursive:true});
 fs.writeFileSync(path.join(root,'ios','Towers','Info.plist'),'<plist><dict><key>CFBundleShortVersionString</key><string>$(MARKETING_VERSION)</string><key>CFBundleVersion</key><string>$(CURRENT_PROJECT_VERSION)</string></dict></plist>');
 fs.writeFileSync(path.join(root,'ios','Towers.xcodeproj','project.pbxproj'),'buildSettings = {\n MARKETING_VERSION = 1.5.0;\n CURRENT_PROJECT_VERSION = 42;\n};');
 let [r]=await versions.run({},{version:'1.5',roots:[root]});
 assert.equal(r.status,'ok',r.summary);assert.equal(r.evidence.length,3);assert.match(r.summary,/Unity, Android, iOS/);
 fs.writeFileSync(path.join(root,'android','app','build.gradle'),'android { defaultConfig { versionCode = 41\n versionName = "1.4.2" } }');
 [r]=await versions.run({},{version:'1.5',roots:[root]});
 assert.equal(r.status,'problem');assert.match(r.summary,/Android: версия 1\.4\.2, а релиз — 1\.5/);assert.match(r.summary,/Android versionCode различается: 42 и 41/);
 [r]=await versions.run({},{version:'1.5',roots:[]});assert.equal(r.status,'unknown');
 [r]=await versions.run({},{version:'1.5',roots:[path.join(tmp,'empty-dir-that-is-missing')]});assert.equal(r.status,'unknown');
 return root;
}

(async()=>{
 const root=await versionCases();
 // --- The registry ----------------------------------------------------------------------------------------------------------
 const P=(extension,setting,checkIds,run,{ready=()=>true,hint}={})=>({id:extension,extension,setting,name:extension.toUpperCase(),checks:checkIds.map(id=>({id,title:id,group:''})),provider:{checks:checkIds.map(id=>({id,title:id})),ready,run,...hint?{hint}:{}}});
 let ciCalls=0;
 const providers=[
  P('ci-builds','extension_ci-builds',['ci.green'],async(s,r)=>{ciCalls++;assert.equal(r.branch,'release/1.5');assert.equal(r.version,'1.5');return [{id:'ci.green',status:'problem',summary:'Упал Android #12.',evidence:[{text:'Android #12 — упал',url:'https://github.com/o/r/actions/runs/1'},{text:'bad link',url:'javascript:alert(1)'}],action:{label:'Почему упала',ask:'почему упала сборка на ветке release/1.5'}}];}),
  P('crashes','extension_crashes',['crashes.release'],async()=>[{id:'crashes.release',status:'ok',summary:'Новых нет.'}],{ready:()=>false,hint:()=>'Подключите источник крэшей.'}),
  P('store-reviews','extension_store-reviews',['reviews.trend'],async()=>[{id:'reviews.trend',status:'ok'}]),
  P('patch-notes','extension_patch-notes',['patchnotes.ready'],async()=>{throw Error('сломалось');}),
  P('localization','extension_localization',['loc.missing'],()=>new Promise(()=>{})),
  P('release-checklist','extension_release-checklist',['versions.consistent'],async(s,r)=>versions.run(s,r)),
  P('jira','module_jira',['jira.blockers'],async()=>[{id:'jira.blockers',status:'ok',summary:'Блокеров нет.'}]),
  P('dependencies','extension_dependencies',['deps.vulnerable'],async()=>[{id:'other.check',status:'ok'}])
 ];
 const topic={id:'t',title:'Чат',projectId:'p1',messages:[]};
 const state={projects:[{id:'general',name:'Общее'},{id:'p1',name:'Towers',folder:root}],topics:[topic],activeProjectId:'p1'};
 const offered=[];
 const s={settings:{'extension_release-checklist':'true','extension_ci-builds':'true',extension_crashes:'true',extension_localization:'true','extension_patch-notes':'true',extension_dependencies:'true',module_jira:'true',releaseChecklistBranch:'release/{version}'},
  dataRoot:path.join(tmp,'company'),requestProgress:{report(){}},
  extensionOffers:{prerequisite:(ext,command)=>{offered.push(ext);return ext==='jira'?null:{items:[{id:'o-'+ext,ext,name:ext,pitch:'p'}],direct:true};}},
  dialogue:{state,active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text,at:Date.now()});}}};
 // Not installed → null.
 assert.equal(await feature.turn({...s,settings:{}},'готов ли релиз 1.5'),null);
 assert.equal(await feature.turn(s,'напиши патчноут к релизу 1.5'),null);
 // No version → the shared question with saved versions as options; the answer resumes the check.
 {let asked=null;try{await feature.turn(s,'чек-лист релиза',{providers});}catch(e){asked=e;}
  assert.equal(asked?.name,'InputRequired');assert.equal(asked.spec.label,'Версия');
  const bad=await asked.resume('не знаю');assert.equal(bad.question,true);}
 const r=await feature.turn(s,'готов ли релиз 1.5',{providers,now:NOW,timeout:200});
 const card=r.extensionData.releaseChecklist,by=id=>card.items.find(i=>i.id===id);
 assert.equal(card.version,'1.5');assert.equal(card.previous,'1.4');assert.equal(card.branch,'release/1.5');assert.equal(card.project.name,'Towers');
 assert.equal(by('ci').status,'problem');assert.equal(by('ci').evidence.length,2);assert.equal(by('ci').evidence[1].url,'','unsafe links are dropped');assert.equal(by('ci').action.ask,'почему упала сборка на ветке release/1.5');
 assert.equal(by('crashes').status,'unknown');assert.equal(by('crashes').summary,'Подключите источник крэшей.');assert.equal(by('crashes').connect,true);
 assert.equal(by('reviews').status,'missing');assert.equal(by('reviews').summary,'Нет приложения «STORE-REVIEWS».');
 assert.equal(by('notes').status,'unknown');assert.match(by('notes').summary,/Не удалось проверить: сломалось/);
 assert.equal(by('loc').status,'unknown');assert.match(by('loc').summary,/не ответил вовремя/);
 assert.equal(by('versions').status,'problem');assert.equal(by('blockers').status,'ok');
 assert.equal(by('deps').status,'unknown');assert.match(by('deps').summary,/не дал ответа/);
 assert.equal(by('size').status,'unknown');assert.match(by('size').summary,/не предоставляет ни одно приложение/);
 assert.equal(by('smoke').kind,'manual');assert.equal(by('smoke').status,'todo');
 assert.equal(ciCalls,1,'one run per provider');
 assert.deepEqual(card.counts,{total:14,ok:1,problem:2,unknown:5,missing:1,todo:5});
 // Missing and unconnected apps are offered through the shared offer card (Jira has no offer of its own).
 assert.deepEqual(offered.sort(),['crashes','store-reviews']);assert.deepEqual(r.extensionData.extensionOffer.items.map(i=>i.ext).sort(),['crashes','store-reviews']);
 assert.match(r.text,/^Релиз 1\.5: готово 1 из 14\. Проблемы: CI зелёный на релизной ветке \(Упал Android #12\)/);assert.match(r.text,/Не проверено: 6, из них без приложения — 1/);
 assert.match(card.share,/^Релиз 1\.5 \(Towers\): готово 1 из 14\. Проблемы: /);assert.equal(card.tasks.length,2);assert.match(card.tasks[0],/^Релиз 1\.5: CI зелёный на релизной ветке — Упал Android #12\.$/);
 // State saved per project and release.
 const file=path.join(s.dataRoot,'extensions','release-checklist','state.json');
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.projects.p1.releases['1.5'].checked.statuses.ci,'problem');
 assert.equal((fs.statSync(file).mode&0o777).toString(8),'600');

 // --- Manual ticks ---------------------------------------------------------------------------------------------------
 const ipc=feature.setup(s).ipc;
 const t1=ipc.tick('p1','1.5','smoke',true);assert.equal(t1.counts.ok,2);assert.equal(t1.counts.todo,4);assert.equal(by('smoke').status,'ok','the card in the chat shows the tick');
 assert.throws(()=>ipc.tick('p1','1.5','ci',true),/нет в чек-листе/,'automatic items are not ticked by hand');
 assert.throws(()=>ipc.tick('nope','1.5','smoke',true),/Проект не найден/);
 {const again=await feature.turn(s,'чек-лист релиза 1.5',{providers,now:NOW,timeout:200});const c=again.extensionData.releaseChecklist;
  assert.equal(c.items.find(i=>i.id==='smoke').done,true,'ticks survive a recheck');
  assert.equal(c.items.find(i=>i.id==='store-page').done,false);}
 {const other=await feature.turn(s,'готов ли релиз 1.6',{providers:[],now:NOW});assert.equal(other.extensionData.releaseChecklist.items.find(i=>i.id==='smoke').done,false,'ticks are per release');}
 ipc.tick('p1','1.5','smoke',false);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).projects.p1.releases['1.5'].manual.smoke,undefined);
 // A version without the question: saved versions are offered.
 {let asked=null;try{await feature.turn(s,'чек-лист релиза',{providers,timeout:200});}catch(e){asked=e;}assert.deepEqual(asked.spec.options.sort(),['1.5','1.6']);
  const resumed=await asked.resume('1.5');assert.equal(resumed.extensionData.releaseChecklist.version,'1.5');}

 // --- Template editor ------------------------------------------------------------------------------------------------
 {const st=ipc.template('p1');assert.equal(st.project,'p1');assert(st.checks.some(c=>c.id==='ci.green'&&c.extension==='ci-builds'));assert(st.checks.some(c=>c.id==='versions.consistent'));
  const saved2=ipc.saveTemplate('p1',[{id:'ci',title:'CI на ветке',group:'Сборка',check:'ci.green'},{title:'Свой ручной пункт',group:'Своя группа'}]).items;
  assert.equal(saved2.length,2);
  const re=await feature.turn(s,'готов ли релиз 1.5',{providers,now:NOW});const c=re.extensionData.releaseChecklist;
  assert.equal(c.items.length,2);assert.equal(c.items[0].custom,true);assert.equal(c.items[1].customGroup,true);assert.equal(c.items[1].kind,'manual');
  assert.equal(ipc.template('general').items.length,template.DEFAULT.length,'other projects keep the default');
  assert.equal(ipc.resetTemplate('p1').items.length,template.DEFAULT.length);
  assert.throws(()=>ipc.saveTemplate('p1',[{title:''}]),/название/);}
 // Settings validation.
 {const v={releaseChecklistBranch:' release/{version} '};feature.validate(v);assert.equal(v.releaseChecklistBranch,'release/{version}');assert.throws(()=>feature.validate({releaseChecklistBranch:'rm -rf /'}),/Ветка/);}
 // The real providers load, each check id has one owner.
 {const all=checks.load();const ids=all.flatMap(x=>x.checks.map(c=>c.id));assert.equal(new Set(ids).size,ids.length);
  for(const id of template.DEFAULT.filter(i=>i.check).map(i=>i.check))assert(ids.includes(id),'a provider for '+id);}

 await providerCases(root);
 // Offer: precise subject.
 const offers=require('../src/features/extension-offers.cjs');
 assert(offers.candidates('готов ли релиз 1.5',{offers:[offer],settings:{}}).length===1);
 assert.equal(offers.candidates('напиши патчноут к релизу',{offers:[offer],settings:{}}).length,0);
 console.log('Release checklist: routing, version question, registry statuses (ok/problem/not checked/no app → offer, errors, timeouts), manual ticks per release, template editor, Slack status and tasks, version files and every app provider passed');
})().catch(e=>{console.error(e);process.exit(1);});

// --- Each app's provider with stubbed services ------------------------------------------------------------------------------
async function providerCases(root){
 const release={version:'1.5',previous:'1.4',branch:'release/1.5',roots:[root],now:NOW,project:{id:'p1',name:'Towers'}};
 // CI: the latest run per workflow decides.
 {const p=require('../src/extensions/ci-builds/release-check.cjs'),gh=require('../src/extensions/github/client.cjs'),src=require('../src/extensions/ci-builds/sources.cjs');
  const o={repos:gh.repos,runs:src.githubRuns};let branch=null;
  gh.repos=async()=>['o/game'];
  const run=(group,number,status,at)=>({key:group+number,group,workflow:group,number,status,at,url:'https://github.com/o/game/actions/runs/'+number,branch:'release/1.5'});
  src.githubRuns=async(s,repo,q)=>{branch=q.branch;return [run('Android',12,'failure','2026-11-09T09:00:00Z'),run('Android',11,'success','2026-11-08T09:00:00Z'),run('iOS',7,'success','2026-11-09T08:00:00Z')];};
  assert.equal(p.ready({githubToken:'x'.repeat(10)}),true);assert.equal(p.ready({}),false);
  let [r]=await p.run({settings:{githubToken:'x'.repeat(10)}},release);
  assert.equal(branch,'release/1.5');assert.equal(r.status,'problem');assert.match(r.summary,/упал «Android» #12/);assert.equal(r.evidence.length,2);
  src.githubRuns=async()=>[run('Android',13,'success','2026-11-09T10:00:00Z'),run('Android',12,'failure','2026-11-09T09:00:00Z')];
  [r]=await p.run({settings:{githubToken:'x'.repeat(10)}},release);assert.equal(r.status,'ok','a later green run fixes it');
  src.githubRuns=async()=>[];[r]=await p.run({settings:{githubToken:'x'.repeat(10)}},release);assert.equal(r.status,'unknown');assert.match(r.summary,/запусков CI нет/);
  gh.repos=o.repos;src.githubRuns=o.runs;}
 // Crashes: new issues of the release and crash-free against the previous version.
 {const p=require('../src/extensions/crashes/release-check.cjs');
  const reg={list:()=>[{id:'sentry',name:'Sentry'}],release:async(id,v)=>v==='1.5'?{name:'1.5',date:'2026-11-05T00:00:00Z',versions:['g@1.5']}:v==='1.4'?{name:'1.4',date:'2026-10-20T00:00:00Z',versions:['g@1.4']}:null,
   issues:async(id,q)=>{assert.equal(q.onlyNew,true);assert.equal(q.release,'1.5');return {issues:[{id:'1',title:'NullReferenceException in Shop',isNew:true,events:140,users:60,url:'https://sentry.io/i/1'},{id:'2',title:'tiny',isNew:true,events:3,users:1,url:''},{id:'3',title:'old',isNew:false,events:900,users:300,url:''}]};},
   crashFree:async(id,q)=>q.release==='1.5'?{sessions:0.991}:{sessions:0.998}};
  let [r]=await p.run({settings:{},crashSources:reg},release);
  assert.equal(r.status,'problem');assert.match(r.summary,/новых крэшей — 1/);assert.match(r.summary,/crash-free упал с 99,8% до 99,1%/);assert(r.evidence.some(e=>e.url==='https://sentry.io/i/1'));
  [r]=await p.run({settings:{},crashSources:{...reg,release:async()=>null}},release);assert.equal(r.status,'unknown');assert.match(r.summary,/релиза 1\.5 нет/);}
 // Store reviews: rating of the latest version against the one before.
 {const p=require('../src/extensions/store-reviews/release-check.cjs'),f=require('../src/extensions/store-reviews/feature.cjs'),st=require('../src/extensions/store-reviews/stores.cjs');
  const o={connected:f.connected,read:f.read,asc:st.ascApps};
  f.connected=()=>({appstore:true,play:false});st.ascApps=async()=>[{id:'123456',label:'Towers',store:'appstore'}];
  f.read=async(s,game,which,command)=>{assert.equal(command,'отзывы после обновления');return {version:'1.4.2',summary:{count:40,average:3.9,previous:{count:50,average:4.5},delta:-0.6}};};
  let [r]=await p.run({settings:{}},release);assert.equal(r.status,'problem');assert.match(r.summary,/упала на 0,6★/);
  f.read=async()=>({version:'1.4.2',summary:{count:3,average:2,previous:null,delta:null}});[r]=await p.run({settings:{}},release);assert.equal(r.status,'unknown');
  Object.assign(f,{connected:o.connected,read:o.read});st.ascApps=o.asc;}
 // Patch notes: the newest card of the version, languages from the settings, limits.
 {const p=require('../src/extensions/patch-notes/release-check.cjs');
  const t=(count,limit,dropped=0)=>({count,limit,dropped});
  const mk=(langs,play)=>({version:'1.5',title:'Версия 1.5',languages:langs,texts:Object.fromEntries(langs.map(l=>[l,{appstore:t(800,4000),play:play||t(420,500),post:t(900,2000)}]))});
  const s={settings:{patchNotesLanguages:'ru, en'},dialogue:{state:{topics:[{messages:[{at:1,extensionData:{patchNotes:mk(['ru'])}},{at:2,extensionData:{patchNotes:mk(['ru','en'],t(500,500,2))}}]}]}}};
  let [r]=await p.run(s,release);assert.equal(r.status,'problem');assert.match(r.summary,/Google Play: не влезло строк — 2/);
  s.dialogue.state.topics[0].messages.push({at:3,extensionData:{patchNotes:mk(['ru','en'])}});[r]=await p.run(s,release);assert.equal(r.status,'ok');
  s.settings.patchNotesLanguages='ru, en, de';[r]=await p.run(s,release);assert.equal(r.status,'problem');assert.match(r.summary,/нет языков: немецкий/);
  [r]=await p.run({settings:{},dialogue:{state:{topics:[]}}},release);assert.equal(r.status,'unknown');assert.equal(r.action.ask,'напиши патчноут к версии 1.5');}
 // Localization: JSON files in the project.
 {const p=require('../src/extensions/localization/release-check.cjs');
  const dir=path.join(root,'Assets','locales');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'en.json'),JSON.stringify({menu:{play:'Play',shop:'Shop',quit:'Quit game'}}));
  fs.writeFileSync(path.join(dir,'de.json'),JSON.stringify({menu:{play:'Spielen',shop:''}}));
  let [r]=await p.run({settings:{}},release);assert.equal(r.status,'problem');assert.match(r.summary,/Не переведено строк: 2/);assert.match(r.evidence[0].text,/нет перевода 1, пусто 1/);
  fs.writeFileSync(path.join(dir,'de.json'),JSON.stringify({menu:{play:'Spielen',shop:'Laden',quit:'Spiel beenden'}}));
  [r]=await p.run({settings:{}},release);assert.equal(r.status,'ok',r.summary);}
 // Build size: two APKs of the fixture set in the project folder.
 {const p=require('../src/extensions/build-size/release-check.cjs');const builds=path.join(root,'Exports');fs.mkdirSync(builds,{recursive:true});
  const fix=path.join(__dirname,'fixtures/build-size');
  fs.copyFileSync(path.join(fix,'towers-1.4.0.apk'),path.join(builds,'towers-1.4.0.apk'));fs.copyFileSync(path.join(fix,'towers-1.5.0.apk'),path.join(builds,'towers-1.5.0.apk'));
  const [r]=await p.run({settings:{}},release);assert(['ok','problem'].includes(r.status));assert.match(r.evidence[0].text,/towers-1\.5\.0\.apk/);assert.match(r.evidence[0].text,/было/);
  const [none]=await p.run({settings:{}},{...release,roots:[path.join(tmp,'nothing')]});assert.equal(none.status,'unknown');}
 // Dependencies: a fresh card of the app is reused.
 {const p=require('../src/extensions/dependencies/release-check.cjs');
  const dep={at:NOW.getTime()-3600000,filter:null,summary:{vulns:{critical:1,high:0,moderate:2,low:0,unknown:0}},packages:[{name:'lodash',vulns:[{severity:'critical',summary:'Prototype pollution',url:'https://github.com/advisories/GHSA-x'}]},{name:'ok',vulns:[]}]};
  let [r]=await p.run({settings:{},dialogue:{state:{topics:[{messages:[{extensionData:{dependencies:dep}}]}]}}},release);
  assert.equal(r.status,'problem');assert.match(r.summary,/критических — 1/);assert.equal(r.evidence[0].url,'https://github.com/advisories/GHSA-x');
  dep.summary.vulns={critical:0,high:0,moderate:2,low:0,unknown:0};[r]=await p.run({settings:{},dialogue:{state:{topics:[{messages:[{extensionData:{dependencies:dep}}]}]}}},release);assert.equal(r.status,'ok');assert.match(r.summary,/средних и низких — 2/);
  [r]=await p.run({settings:{},dialogue:{state:{topics:[]}},gitWorkspace:{discover:async()=>null}},{...release,roots:[]});assert.equal(r.status,'unknown');}
 // Jira: open bugs of the version picked by priority or label.
 {const p=require('../src/extensions/jira/release-check.cjs');const calls=[];
  const api=async(url,o)=>{calls.push([url,o?.body?JSON.parse(o.body).jql:'']);if(/versions$/.test(url))return [{name:'v1.5.0'},{name:'1.4'}];
   return {issues:[{key:'G-1',fields:{summary:'Crash on start',issuetype:{name:'Bug'},priority:{name:'Highest'},status:{name:'In Progress'},labels:[]}},{key:'G-2',fields:{summary:'Typo',issuetype:{name:'Bug'},priority:{name:'Low'},status:{name:'Open'},labels:['release-blocker']}},{key:'G-3',fields:{summary:'Feature',issuetype:{name:'Story'},priority:{name:'Highest'},status:{name:'Open'},labels:[]}}],isLast:true};};
  const s={settings:{jiraProjects:'GAME',jiraUrl:'https://acme.atlassian.net'},workspace:{api}};
  let [r]=await p.run(s,release);assert.equal(r.status,'problem');assert.match(r.summary,/блокирующих багов: 2/);
  assert.match(calls[1][1],/fixVersion in \("v1\.5\.0"\) AND statusCategory != Done/);assert.equal(r.evidence[0].url,'https://acme.atlassian.net/browse/G-1');
  [r]=await p.run({settings:{jiraProjects:'GAME',jiraUrl:'https://acme.atlassian.net'},workspace:{api:async u=>/versions$/.test(u)?[{name:'2.0'}]:{issues:[]}}},release);assert.equal(r.status,'unknown');assert.match(r.summary,/Версии 1\.5 нет в Jira/);
  [r]=await p.run({settings:{}},release);assert.equal(r.status,'unknown');
  assert.equal(p.ready({}),false);}
}
