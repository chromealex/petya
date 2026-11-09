// «Свежесть документации» over a real fixture git repository (dated commits): routing incl. near-misses (packages,
// deprecated APIs, writing docs), not added, no repository, references in Markdown (paths in code spans, prose and
// links, symbols, settings with values, Unity / Node / dependency versions; fenced code ignored), findings with the
// git evidence — a renamed and a deleted file, a renamed and a removed symbol, a changed setting value, changed
// versions, files changed after the doc's last edit — ADRs and changelogs skipped, staleness order, the exact line
// edit only through `applyEdit` (and back), Confluence pages and Google Docs over stubbed services, the weekly check
// (off by default, once a week, a notification, nothing changed).
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/doc-freshness/feature.cjs');
const scan=require('../src/extensions/doc-freshness/scan.cjs');
const sources=require('../src/extensions/doc-freshness/sources.cjs');
const offer=require('../src/extensions/doc-freshness/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=new Date('2026-11-09T10:00:00Z');
const SETUP=['# Установка','','Клиент сети — `src/net/Client.cs`, подключение через `NetClient.Connect()`.','Уровни грузит `Assets/Scripts/LevelLoader.cs` методом `LoadLevel()`.',
 'Лимит игроков задаёт `MAX_PLAYERS` = 8 (см. src/Config.cs).','Нужен Unity 2022.3 и Node 18, утилиты — lodash 4.17.','Сборка: `tools/build.sh`. Подробнее — [гайд](guide.md).','',
 '```','LoadLevel(); // пример, не проверяется','```',''].join('\n');
function git(dir,args,date){execFileSync('git',['-C',dir,...args],{env:{...process.env,GIT_AUTHOR_DATE:date||'',GIT_COMMITTER_DATE:date||'',GIT_AUTHOR_NAME:'Олег Смирнов',GIT_AUTHOR_EMAIL:'oleg@studio.example',GIT_COMMITTER_NAME:'Олег Смирнов',GIT_COMMITTER_EMAIL:'oleg@studio.example'},stdio:'pipe'});}
function write(dir,file,text){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
function repo(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-fresh-'));
 const dir=path.join(root,'game');fs.mkdirSync(dir);
 git(dir,['init','-q','-b','main']);git(dir,['remote','add','origin','git@github.com:studio/game.git']);
 write(dir,'src/net/Client.cs','namespace Game {\n public class NetClient {\n  public void Connect() { Open(); }\n  void Open() {}\n }\n}\n');
 write(dir,'Assets/Scripts/LevelLoader.cs','public class LevelLoader {\n public void LoadLevel() {}\n public void Unload() {}\n}\n');
 write(dir,'src/Config.cs','static class Config {\n public const int MAX_PLAYERS = 8;\n}\n');
 write(dir,'tools/build.sh','#!/bin/sh\necho build\n');
 write(dir,'package.json',JSON.stringify({name:'game-tools',engines:{node:'>=18'},dependencies:{lodash:'^4.17.21'}},null,1));
 write(dir,'ProjectSettings/ProjectVersion.txt','m_EditorVersion: 2022.3.10f1\n');
 write(dir,'docs/guide.md','# Гайд\n\nВсё про `NetClient`.\n');
 git(dir,['add','-A']);git(dir,['commit','-q','-m','Начальная версия'],'2026-09-01T10:00:00Z');
 write(dir,'docs/setup.md',SETUP);
 write(dir,'README.md','# Game\n\nСобрать: `tools/build.sh`.\n');
 write(dir,'docs/adr/0001-staroe.md','# 1. Старое\n\nИспользуем `tools/build.sh` и `LoadLevel()`.\n');
 write(dir,'CHANGELOG.md','- убрали `tools/build.sh`\n');
 git(dir,['add','-A']);git(dir,['commit','-q','-m','Документация по установке'],'2026-09-10T10:00:00Z');
 git(dir,['mv','src/net/Client.cs','src/net/NetClient.cs']);
 write(dir,'src/net/NetClient.cs','namespace Game {\n public class NetClient {\n  public void ConnectAsync() { Open(); }\n  void Open() {}\n }\n}\n');
 write(dir,'Assets/Scripts/LevelLoader.cs','public class LevelLoader {\n public void Unload() {}\n}\n');
 write(dir,'src/Config.cs','static class Config {\n public const int MAX_PLAYERS = 16;\n}\n');
 git(dir,['rm','-q','tools/build.sh']);
 write(dir,'package.json',JSON.stringify({name:'game-tools',engines:{node:'>=20'},dependencies:{lodash:'^4.17.21'}},null,1));
 write(dir,'ProjectSettings/ProjectVersion.txt','m_EditorVersion: 6000.0.23f1\n');
 git(dir,['add','-A']);git(dir,['commit','-q','-m','Сеть: асинхронное подключение, 16 игроков, Unity 6'],'2026-10-01T12:00:00Z');
 return {root,dir};
}
function fixture(over={}){
 const r=over.repo||repo();
 const notices=[],saved=[];
 const settings={'extension_doc-freshness':'true',docFreshnessWeekly:'false',...over.settings};
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const state={topics:[topic],projects:[{id:'general',name:'Общий'},{id:'p1',name:'Game',folders:over.noRepo?[]:[r.dir]}],activeProjectId:'p1'};
 const s={settings,dataRoot:r.root,requestProgress:{report(){}},saveSettings:async patch=>{saved.push(patch);Object.assign(settings,patch);},
  win:{isDestroyed:()=>false,webContents:{send:(channel,item)=>notices.push({channel,item})}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state}};
 return {s,r,notices,saved,settings};
}
const by=(card,file)=>card.docs.find(d=>d.title===file||d.path===file);

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------
 const own={'проверь свежесть документации':'check','Петя, проверь свежесть документации':'check','какая документация устарела?':'check','найди устаревшую документацию':'check','найди устаревшие места в README':'check',
  'проверь актуальность доков':'check','что в документации устарело':'check','проверь документацию на актуальность':'check','найди устаревшие страницы в Confluence':'check','свежесть документации':'check',
  'включи еженедельную проверку документации':'weekly-on','выключи еженедельную проверку документации':'weekly-off','проверяй документацию каждую неделю':'weekly-on'};
 for(const [p,k] of Object.entries(own))assert.equal(app.kind(p),k,p);
 for(const p of ['какие пакеты устарели','устаревшие зависимости','найди устаревшие API в коде','обнови документацию','напиши документацию к модулю','найди документацию по Unity','свежие новости','что такое устаревшая документация','проверь документ на ошибки','/doc-freshness проверь',''])
  assert.equal(app.kind(p),null,'should not trigger: '+p);
 assert.deepEqual(app.named('найди устаревшие страницы в Confluence'),['confluence']);assert.deepEqual(app.named('проверь свежесть документации'),[]);

 // --- References ------------------------------------------------------------------------------------------------
 const refs=scan.refs(SETUP,{manifests:{unity:{},node:{},deps:[['lodash',{}]]}});
 assert.deepEqual(refs.map(r=>r.kind+':'+r.value),['path:src/net/Client.cs','symbol:NetClient.Connect()','path:Assets/Scripts/LevelLoader.cs','symbol:LoadLevel()','setting:MAX_PLAYERS','path:src/Config.cs','version:2022.3','version:18','version:4.17','path:tools/build.sh','path:guide.md']);
 assert.equal(refs.find(r=>r.kind==='setting').claimed,'8');
 assert.ok(!refs.some(r=>r.n>=10),'fenced code is not checked');
 assert.equal(scan.sameVersion('2022.3','2022.3.10f1'),true);assert.equal(scan.sameVersion('18','20'),false);assert.equal(scan.sameVersion('4.17','4.17.21'),true);

 // --- Not added / no repository ------------------------------------------------------------------------------------
 let f=fixture({settings:{'extension_doc-freshness':'false'}});
 assert.equal(await app.turn(f.s,'проверь свежесть документации'),null);
 f=fixture({noRepo:true});
 const q=await app.turn(f.s,'проверь свежесть документации',{now:NOW});
 assert.equal(q.question,true);assert.match(q.text,/git-репозиторием/);

 // --- The check -------------------------------------------------------------------------------------------------------
 f=fixture();
 const head=fs.readFileSync(path.join(f.r.dir,'docs/setup.md'),'utf8');
 const res=await app.turn(f.s,'проверь свежесть документации',{now:NOW});
 const c=res.extensionData.freshnessCard;
 assert.deepEqual(c.docs.map(d=>d.title),['docs/setup.md','README.md'],'staleness order; ADRs, changelogs and fresh docs are not listed');
 assert.equal(c.totals.scanned,3,'README, setup and guide (ADR and CHANGELOG skipped)');
 const setup=by(c,'docs/setup.md');
 const got=Object.fromEntries(setup.findings.map(x=>[x.ref.value,x.problem]));
 assert.deepEqual(got,{'src/net/Client.cs':'renamed','NetClient.Connect()':'renamed','LoadLevel()':'removed','tools/build.sh':'missing','MAX_PLAYERS':'value','2022.3':'version','18':'version','Assets/Scripts/LevelLoader.cs':'changed','src/Config.cs':'changed'});
 const f1=setup.findings.find(x=>x.ref.value==='src/net/Client.cs');
 assert.equal(f1.line.n,3);assert.match(f1.line.text,/Клиент сети/);
 assert.equal(f1.change.subject,'Сеть: асинхронное подключение, 16 игроков, Unity 6');assert.equal(f1.change.author,'Олег Смирнов');assert.equal(f1.change.date,'2026-10-01T12:00:00.000Z');
 assert.match(f1.change.url,/^https:\/\/github\.com\/studio\/game\/commit\/[0-9a-f]{40}$/);
 assert.equal(f1.detail,'src/net/Client.cs → src/net/NetClient.cs');assert.equal(f1.suggestion.to,'src/net/NetClient.cs');
 const conn=setup.findings.find(x=>x.ref.value==='NetClient.Connect()');
 assert.match(conn.detail,/^Connect → ConnectAsync/);assert.equal(conn.suggestion.line,'Клиент сети — `src/net/Client.cs`, подключение через `NetClient.ConnectAsync()`.');
 assert.match(setup.findings.find(x=>x.ref.value==='LoadLevel()').detail,/^удалено: public void LoadLevel\(\) \{\}/);
 const val=setup.findings.find(x=>x.ref.value==='MAX_PLAYERS');assert.match(val.detail,/MAX_PLAYERS = 16 \(в документе 8\)/);assert.equal(val.suggestion.line,'Лимит игроков задаёт `MAX_PLAYERS` = 16 (см. src/Config.cs).');
 const unity=setup.findings.find(x=>x.ref.value==='2022.3');assert.equal(unity.suggestion.line,'Нужен Unity 6000.0 и Node 18, утилиты — lodash 4.17.');
 assert.equal(setup.findings.find(x=>x.ref.value==='18').suggestion.line,'Нужен Unity 2022.3 и Node 20, утилиты — lodash 4.17.');
 assert.equal(setup.findings[0].severity,3);assert.equal(setup.findings.at(-1).problem,'changed');
 assert.equal(setup.edited,'2026-09-10T10:00:00.000Z');assert.equal(setup.lag,21);
 assert.deepEqual(by(c,'README.md').findings.map(x=>x.problem),['missing']);
 assert.deepEqual(c.totals.byProblem,{renamed:2,removed:1,missing:2,value:1,version:2,changed:2});
 assert.match(res.text,/^Устарело 2 из 3 документов \(10 мест: /);assert.match(res.text,/Правки — только по вашей кнопке\./);
 assert.equal(fs.readFileSync(path.join(f.r.dir,'docs/setup.md'),'utf8'),head,'the check changes nothing');

 // --- The edit: only through applyEdit, exactly the shown line, and back -----------------------------------------------
 const ipc=app.setup({...f.s,smoke:true}).ipc;
 const done=ipc.applyEdit(c.checkId,val.id);
 assert.equal(done.text,'Исправлено: docs/setup.md:5');
 const after=fs.readFileSync(path.join(f.r.dir,'docs/setup.md'),'utf8');
 assert.equal(after,head.replace('`MAX_PLAYERS` = 8','`MAX_PLAYERS` = 16'),'only that line');
 assert.throws(()=>ipc.applyEdit(c.checkId,val.id),/уже изменилась/);
 assert.equal(ipc.applyEdit(c.checkId,val.id,true).text,'Вернул строку docs/setup.md:5');
 assert.equal(fs.readFileSync(path.join(f.r.dir,'docs/setup.md'),'utf8'),head);
 assert.throws(()=>ipc.applyEdit(c.checkId,setup.findings.find(x=>x.problem==='missing').id),/устарела/,'no suggestion → nothing to apply');
 assert.throws(()=>ipc.applyEdit('nope',val.id),/Некорректная правка/);
 // The user edited the line meanwhile: refused.
 fs.writeFileSync(path.join(f.r.dir,'docs/setup.md'),head.replace('Лимит игроков','Лимит'));
 assert.throws(()=>ipc.applyEdit(c.checkId,val.id),/уже изменилась/);
 fs.writeFileSync(path.join(f.r.dir,'docs/setup.md'),head);
 // An uncommitted edit makes the document fresh: findings about changes before it disappear.
 fs.writeFileSync(path.join(f.r.dir,'README.md'),'# Game\n\nСобрать: `tools/build.sh` (скоро уберём).\n');
 const dirty=(await app.turn(f.s,'проверь свежесть документации',{now:NOW})).extensionData.freshnessCard;
 assert.deepEqual(by(dirty,'README.md').findings.map(x=>x.problem),['missing'],'a deleted file stays a finding');

 // --- Confluence and Google Docs (stubbed services) -------------------------------------------------------------------
 const ext=fixture({repo:f.r,settings:{module_confluence:'true',jiraUrl:'https://studio.atlassian.net',jiraEmail:'lead@studio.com',jiraToken:'jira-token',confluenceSpace:'GAME','extension_google-drive':'true',googleDriveMode:'service',googleDriveCredential:'stub'}});
 const asked=[];
 ext.s.workspace={async api(route,options,settings){asked.push(route);assert.equal(settings.confluenceSpace,'GAME');
  return {results:[{id:'42',title:'Сетевой протокол',version:{when:'2026-09-05T08:00:00.000Z'},body:{storage:{value:'<h2>Клиент</h2><p>Подключение — <code>NetClient.Connect()</code> в <code>src/net/Client.cs</code>.</p><ac:structured-macro ac:name="code"><ac:plain-text-body>LoadLevel();</ac:plain-text-body></ac:structured-macro>'}}},
   {id:'43',title:'Свежая страница',version:{when:'2026-11-01T08:00:00.000Z'},body:{storage:{value:'<p>Всё про <code>NetClient</code>.</p>'}}}]};}};
 const gauth=require('../src/extensions/google-drive/auth.cjs');const realConnected=gauth.connected,realToken=gauth.token;
 gauth.connected=()=>true;gauth.token=async()=>'stub-access';
 ext.s.request=async(url)=>{
  if(/\/drive\/v3\/files\?/.test(url))return {files:[{id:'1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',name:'Как собрать игру',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-09-02T00:00:00Z',webViewLink:'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit'}]};
  if(/docs\.googleapis\.com\/v1\/documents\//.test(url))return {title:'Как собрать игру',body:{content:[{paragraph:{elements:[{textRun:{content:'Запустите tools/build.sh на Node 18.\n'}}]}}]}};
  throw Error('unexpected '+url);
 };
 try{
  const ec=(await app.turn(ext.s,'проверь свежесть документации',{now:NOW})).extensionData.freshnessCard;
  assert.equal(asked[0].startsWith('/wiki/rest/api/content/search?'),true);assert.equal(new URLSearchParams(asked[0].split('?')[1]).get('cql'),'space = "GAME" AND type = page ORDER BY lastmodified DESC');
  assert.deepEqual(ec.used,{project:3,confluence:2,google:1});
  const page=ec.docs.find(d=>d.source==='confluence');
  assert.equal(page.title,'Сетевой протокол');assert.equal(page.url,'https://studio.atlassian.net/wiki/pages/viewpage.action?pageId=42');
  assert.deepEqual(page.findings.map(x=>x.ref.value).sort(),['NetClient.Connect()','src/net/Client.cs']);
  const gdoc=ec.docs.find(d=>d.source==='google');
  assert.deepEqual(gdoc.findings.map(x=>x.ref.value+':'+x.problem).sort(),['18:version','tools/build.sh:missing']);
  assert.ok(!ec.docs.some(d=>d.title==='Свежая страница'));
  const only=(await app.turn(ext.s,'найди устаревшие страницы в Confluence',{now:NOW})).extensionData.freshnessCard;
  assert.deepEqual(only.used,{project:0,confluence:2,google:null});
 }finally{gauth.connected=realConnected;gauth.token=realToken;}
 assert.equal(sources.storageText('<p>A <code>x<b>y</b></code></p><ul><li>one</li></ul>'),'A `xy`\n- one');

 // --- Weekly: off by default, once a week, a notification, no edits -----------------------------------------------------
 f=fixture({repo:f.r});
 assert.equal(await app.weekly(f.s,{now:NOW}),null,'off by default');
 const on=await app.turn(f.s,'включи еженедельную проверку документации');
 assert.deepEqual(f.saved,[{docFreshnessWeekly:'true'}]);assert.match(on.text,/Раз в неделю/);
 const w=await app.weekly(f.s,{now:NOW});
 assert.equal(w.item.id,'doc-freshness:weekly');assert.equal(w.item.kind,'attention');assert.match(w.item.text,/^Game: устарело документов — 2 \(сильнее всего docs\/setup\.md\)/);
 assert.equal(f.notices.at(-1).channel,'extension-install-progress');
 assert.equal(await app.weekly(f.s,{now:new Date(+NOW+3*86400000)}),null,'not again within a week');
 assert.ok(await app.weekly(f.s,{now:new Date(+NOW+8*86400000)}));
 assert.equal(fs.readFileSync(path.join(f.r.dir,'docs/setup.md'),'utf8'),head,'the weekly check changes nothing');
 await app.turn(f.s,'выключи еженедельную проверку документации');assert.equal(f.settings.docFreshnessWeekly,'false');
 assert.equal(await app.weekly(f.s,{now:new Date(+NOW+30*86400000)}),null);
 assert.throws(()=>app.validate({docFreshnessWeekly:'maybe'}),/еженедельной/);
 assert.deepEqual(app.setup({...f.s,smoke:true}).ipc.status().weekly,false);
 app.teardown();

 // --- Errors and several repositories ---------------------------------------------------------------------------------
 const two=fixture({repo:f.r});
 const second=path.join(f.r.root,'tools');fs.mkdirSync(path.join(second,'.git'),{recursive:true});
 two.s.dialogue.state.projects[1].folders=[f.r.dir,second];
 let choose;try{await app.turn(two.s,'проверь свежесть документации',{now:NOW});}catch(e){choose=e;}
 assert.ok(choose instanceof InputRequired);assert.equal(choose.spec.options.length,2);
 const broken=await choose.resume('tools · '+second);
 assert.equal(broken.error,true,'a folder that is not a working repository is a failure, not a crash');
 assert.equal(offer.ready({'extension_doc-freshness':'true'}),true);
 console.log('Doc freshness: routing and near-misses, references, git evidence (renames, deletions, removed symbols, values, versions, changes after the edit), order, confirmed line edit and undo, Confluence and Google Docs, weekly check passed');
})().catch(e=>{console.error(e);process.exit(1);});
