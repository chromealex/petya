// «Свежесть документации» card in the real chat, from a real check of a fixture git repository: the findings bar,
// documents by staleness with the meter, each finding's document line (the reference highlighted) next to the git
// commit, «Создать задачу» through task-tracker, «Предложить правку» showing the exact line change and writing it
// only on «Применить правку» (through the app's real IPC) with «Отменить», the Programmer link where there is no
// exact change, and text from documents never becoming HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const app=require('../src/extensions/doc-freshness/feature.cjs');

function git(dir,args,date){execFileSync('git',['-C',dir,...args],{env:{...process.env,GIT_AUTHOR_DATE:date||'',GIT_COMMITTER_DATE:date||'',GIT_AUTHOR_NAME:'Олег Смирнов',GIT_AUTHOR_EMAIL:'oleg@studio.example',GIT_COMMITTER_NAME:'Олег Смирнов',GIT_COMMITTER_EMAIL:'oleg@studio.example'},stdio:'pipe'});}
function write(dir,file,text){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),text);}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-fresh-ui-')),dir=path.join(root,'game');fs.mkdirSync(dir);
git(dir,['init','-q','-b','main']);git(dir,['remote','add','origin','https://github.com/studio/game.git']);
write(dir,'src/net/Client.cs','namespace Game.Net {\n public class NetClient {\n  readonly Socket socket;\n  public void Connect() {}\n  public void Send(byte[] data) {}\n  public void Close() {}\n }\n}\n');
write(dir,'src/Config.cs','static class Config {\n public const int MAX_PLAYERS = 8;\n}\n');
write(dir,'tools/build.sh','echo build\n');
write(dir,'ProjectSettings/ProjectVersion.txt','m_EditorVersion: 2022.3.10f1\n');
git(dir,['add','-A']);git(dir,['commit','-q','-m','Начальная версия'],'2026-09-01T10:00:00Z');
write(dir,'docs/setup.md','# Установка\n\nКлиент — `src/net/Client.cs`, вызов `NetClient.Connect()`.\nЛимит `MAX_PLAYERS` = 8. Нужен Unity 2022.3.\nСборка: `tools/build.sh` <img src=x onerror=alert(1)>\n');
write(dir,'README.md','# Game\n\nСобрать: `tools/build.sh`.\n');
git(dir,['add','-A']);git(dir,['commit','-q','-m','Документация'],'2026-09-10T10:00:00Z');
git(dir,['mv','src/net/Client.cs','src/net/NetClient.cs']);
write(dir,'src/net/NetClient.cs','namespace Game.Net {\n public class NetClient {\n  readonly Socket socket;\n  public void ConnectAsync() {}\n  public void Send(byte[] data) {}\n  public void Close() {}\n }\n}\n');
write(dir,'src/Config.cs','static class Config {\n public const int MAX_PLAYERS = 16;\n}\n');
git(dir,['rm','-q','tools/build.sh']);
write(dir,'ProjectSettings/ProjectVersion.txt','m_EditorVersion: 6000.0.23f1\n');
git(dir,['add','-A']);git(dir,['commit','-q','-m','Сеть: асинхронное подключение, 16 игроков, Unity 6'],'2026-10-01T12:00:00Z');

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 await js("window.resultKit.availableLinks=async kind=>kind==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:kind==='code-fix'?[{id:'coder',name:'Программист',label:'Отдать Программисту'}]:[];0");
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const s={settings:{'extension_doc-freshness':'true',docFreshnessWeekly:'false'},dataRoot:root,smoke:true,requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'p1',name:'Game',folders:[dir]}],activeProjectId:'p1'}}};
 const r=await app.turn(s,'проверь свежесть документации',{now:new Date('2026-11-09T10:00:00Z')});
 const card=r.extensionData.freshnessCard;
 const ipc=app.setup(s).ipc,{ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name!=='docFreshness')return null;
  calls.push([method,...args]);return ipc[method](...args);
 });
 await js(`view('home');showDialogueMessages([{role:'user',text:'проверь свежесть документации'},{role:'assistant',text:${JSON.stringify(r.text)},by:'Свежесть документации',extensionData:{freshnessCard:${JSON.stringify(card)}}}],'Документация')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.fresh-card')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.fresh-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.fresh-doc').length"),2);
 assert.match(await js("document.querySelector('.fresh-doc .fresh-title').textContent"),/docs\/setup\.md/);
 assert.equal(await js("document.querySelectorAll('.fresh-bar .seg').length")>=3,true);
 assert.equal(await js("document.querySelectorAll('.fresh-card img').length"),0,'document text is never HTML');
 assert.equal(await js("document.querySelectorAll('.fresh-line mark').length")>=5,true,'the reference is highlighted in the line');
 assert.match(await js("document.querySelector('.fresh-sha').getAttribute('href')"),/^https:\/\/github\.com\/studio\/game\/commit\/[0-9a-f]{40}$/);
 for(let i=0;i<100;i++){if(await js("document.querySelectorAll('.fresh-card .kit-link').length>=6"))break;await new Promise(r=>setTimeout(r,30));}
 assert.ok(await js("[...document.querySelectorAll('.fresh-card .kit-link')].some(b=>b.textContent==='Создать задачу')"));
 assert.ok(await js("[...document.querySelectorAll('.fresh-card .kit-link')].some(b=>b.textContent==='Предложить правку')"),'the Programmer where there is no exact change');
 const file=await require('./card-shot.cjs')(win,'.fresh-card','petya-doc-freshness');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(path.join(os.tmpdir(),'petya-doc-freshness-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot')?.remove()");
 await js(`view('home');showDialogueMessages([{role:'user',text:'проверь свежесть документации'},{role:'assistant',text:'…',by:'Свежесть документации',extensionData:{freshnessCard:${JSON.stringify(card)}}}],'Документация')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.fresh-card')"))break;await new Promise(r=>setTimeout(r,30));}
 // The value finding: «Предложить правку» opens the exact change; nothing is written until «Применить правку».
 const before=fs.readFileSync(path.join(dir,'docs/setup.md'),'utf8');
 const id=card.docs[0].findings.find(f=>f.problem==='value').id;
 await js(`(()=>{const row=[...document.querySelectorAll('.fresh-finding')].find(r=>r.dataset.finding===${JSON.stringify(id)});[...row.querySelectorAll('.fresh-actions > button')].find(b=>!b.closest('.kit-links')).click();})()`);
 assert.equal(await js(`[...document.querySelectorAll('.fresh-finding')].find(r=>r.dataset.finding===${JSON.stringify(id)}).querySelector('.fresh-diff').hidden`),false);
 assert.match(await js(`[...document.querySelectorAll('.fresh-finding')].find(r=>r.dataset.finding===${JSON.stringify(id)}).querySelector('.fresh-new').textContent`),/MAX_PLAYERS` = 16/);
 const shot2=await require('./card-shot.cjs')(win,'.fresh-card','petya-doc-freshness-diff');
 await js(`[...document.querySelectorAll('#card-shot .fresh-finding')].find(r=>r.dataset.finding===${JSON.stringify(id)})?.scrollIntoView({block:'center'})`);
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(shot2,(await win.webContents.capturePage()).toPNG());
 assert.equal(fs.readFileSync(path.join(dir,'docs/setup.md'),'utf8'),before,'showing the change writes nothing');
 await js("document.getElementById('card-shot')?.remove()");
 await js(`view('home');showDialogueMessages([{role:'user',text:'проверь свежесть документации'},{role:'assistant',text:'…',by:'Свежесть документации',extensionData:{freshnessCard:${JSON.stringify(card)}}}],'Документация')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.fresh-card')"))break;await new Promise(r=>setTimeout(r,30));}
 await js(`(()=>{const row=[...document.querySelectorAll('.fresh-finding')].find(r=>r.dataset.finding===${JSON.stringify(id)});[...row.querySelectorAll('.fresh-actions > button')].find(b=>!b.closest('.kit-links')).click();row.querySelector('.fresh-diff-actions button').click();})()`);
 for(let i=0;i<100;i++){if(calls.some(c=>c[0]==='applyEdit'))break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,200));
 assert.equal(fs.readFileSync(path.join(dir,'docs/setup.md'),'utf8'),before.replace('`MAX_PLAYERS` = 8','`MAX_PLAYERS` = 16'));
 // «Отменить» in the toast puts the line back.
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>b.textContent==='Отменить').click()");
 for(let i=0;i<100;i++){if(calls.filter(c=>c[0]==='applyEdit').length>=2)break;await new Promise(r=>setTimeout(r,30));}
 await new Promise(r=>setTimeout(r,200));
 assert.equal(fs.readFileSync(path.join(dir,'docs/setup.md'),'utf8'),before);
 app.teardown();fs.rmSync(root,{recursive:true,force:true});
 console.log('Doc freshness card ('+file+', '+shot2+'): bar, staleness order, line next to commit, task and Programmer links, confirmed line edit with undo passed');
}};
require('../src/main.cjs');
