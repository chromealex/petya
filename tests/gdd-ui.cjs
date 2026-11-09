// «Геймдизайн-документ» cards in the real chat, from real drafts over a fixture project: the draft shows where the
// section goes, cited / «уточнить» counts, the word diff against the GDD and the editable text (an edit re-checks
// through the app's real IPC), the config values with file:line and the sources; «Записать в GDD» writes exactly the
// editor's text through the real IPC and the card turns «записано» (also when drawn again). The gaps card shows the
// coverage bar and systems without a section. Text from files and chats never becomes HTML.
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/gdd/feature.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-gdd-ui-')),dir=path.join(root,'game');
fs.cpSync(path.join(__dirname,'fixtures/config-balance/project'),dir,{recursive:true});
fs.mkdirSync(path.join(dir,'Assets/Configs/Leagues'),{recursive:true});
fs.writeFileSync(path.join(dir,'Assets/Configs/Leagues/leagues.json'),'[\n {"id":"bronze","name":"Бронза","minRating":0,"promoteTop":10,"seasonDays":28},\n {"id":"silver","name":"Серебро","minRating":1000,"promoteTop":10,"seasonDays":28},\n {"id":"gold","name":"Золото","minRating":2000,"promoteTop":5,"seasonDays":28}\n]\n');
fs.mkdirSync(path.join(dir,'Assets/Scripts/Crafting'),{recursive:true});for(const f of ['Recipe.cs','Workbench.cs'])fs.writeFileSync(path.join(dir,'Assets/Scripts/Crafting',f),'class X {}\n');
fs.mkdirSync(path.join(dir,'docs'),{recursive:true});
const GDD='# GDD «Бункер»\n\n## Лиги\n\nВ сезоне 5 лиг. Сезон длится 30 дней.\n\n## Экономика\n\nСтартовый баланс — 100 золота. Лучник стоит 100.\n\n## Юниты\n\nЛучник, рыцарь, маг.\n';
fs.writeFileSync(path.join(dir,'docs/gdd.md'),GDD);

require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const topic={id:'t1',title:'Лиги',projectId:'p1',messages:[{role:'user',text:'По лигам решили: 6 лиг, легенда — топ-100 сервера <img src=x onerror=alert(1)>.'}]};
 const memory=[{id:'m1',kind:'summary',title:'Сводка встречи · Геймдизайн',at:Date.parse('2026-11-05T12:30:00Z'),summary:{decisions:['Повышение в лиге — топ-10 игроков'],discussed:[],tasks:[],notDiscussed:[]}}];
 const s={settings:{extension_gdd:'true',model:''},dataRoot:root,requestProgress:{report(){}},memory:{prune:()=>memory},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'p1',name:'Game',folders:[dir]}],activeProjectId:'p1'}}};
 const r=await app.turn(s,'опиши систему лиг в GDD',{now:new Date('2026-11-09T10:00:00Z')});
 const card=r.extensionData.gddCard;
 const ipc=app.setup(s).ipc,{ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  if(name==='appLinks'&&method==='available')return [];
  if(name!=='gdd')return null;
  calls.push([method,...args]);return ipc[method](...args);
 });
 const show=async(c,user)=>{
  await js(`view('home');showDialogueMessages([{role:'user',text:${JSON.stringify(user)}},{role:'assistant',text:'Готово.',by:'Геймдизайн-документ',extensionData:{gddCard:${JSON.stringify(c)}}}],'GDD')`);
  for(let i=0;i<150;i++){if(await js("!!document.querySelector('.gdd-card')"))break;await new Promise(r=>setTimeout(r,30));}
 };
 // --- Draft --------------------------------------------------------------------------------------------------------
 await show(card,'опиши систему лиг в GDD');
 assert.equal(await js("document.querySelector('.gdd-text').value"),card.text);
 assert.equal(await js("document.querySelector('.gdd-where').textContent"),'game/docs/gdd.md');
 assert.match(await js("document.querySelector('.gdd-checks').textContent"),/уточнить: 2/);
 assert.ok(await js("document.querySelectorAll('.gdd-diff ins').length")>0);
 assert.equal(await js("document.querySelectorAll('.gdd-card img').length"),0,'chat text is never HTML');
 assert.equal(await js("document.querySelectorAll('.gdd-facts tbody tr').length"),card.facts.length);
 // An edit that backs one number: the counter follows through the real IPC.
 await js("(()=>{const a=document.querySelector('.gdd-text');a.value=a.value.replace('В сезоне 5 (уточнить) лиг.','В сезоне 6 лиг [чат «Лиги»].');a.dispatchEvent(new Event('input'));})()");
 for(let i=0;i<60;i++){if(/уточнить: 1/.test(await js("document.querySelector('.gdd-checks').textContent")))break;await new Promise(r=>setTimeout(r,50));}
 assert.match(await js("document.querySelector('.gdd-checks').textContent"),/уточнить: 1/);
 const shot=await require('./card-shot.cjs')(win,'.gdd-card','petya-gdd');
 await js("document.getElementById('card-shot').scrollTop=1e5");
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await new Promise(r=>setTimeout(r,300));
 fs.writeFileSync(path.join(os.tmpdir(),'petya-gdd-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot')?.remove()");
 // Write: exactly the editor's text.
 await show(card,'опиши систему лиг в GDD');
 await js("(()=>{const a=document.querySelector('.gdd-text');a.value=a.value.replace('В сезоне 5 (уточнить) лиг.','В сезоне 6 лиг [чат «Лиги»].');a.dispatchEvent(new Event('input'));})()");
 const before=fs.readFileSync(path.join(dir,'docs/gdd.md'),'utf8');assert.equal(before,GDD,'nothing written before the press');
 await js("document.querySelector('.gdd-card .kit-actions button.primary').click()");
 for(let i=0;i<100;i++){if(await js("document.querySelector('.gdd-text').readOnly"))break;await new Promise(r=>setTimeout(r,30));}
 const written=fs.readFileSync(path.join(dir,'docs/gdd.md'),'utf8');
 const edited=card.text.replace('В сезоне 5 (уточнить) лиг.','В сезоне 6 лиг [чат «Лиги»].');
 assert.ok(written.includes('## Лиги\n\n'+edited+'\n\n## Экономика'),'the editor text is the section');
 assert.equal(calls.filter(c=>c[0]==='apply').length,1);
 await show(card,'опиши систему лиг в GDD');
 for(let i=0;i<50;i++){if(await js("document.querySelector('.gdd-text').readOnly"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.gdd-card .kit-actions button.primary').disabled"),true,'drawn again: written');
 // --- Gaps -----------------------------------------------------------------------------------------------------------
 const g=(await app.turn(s,'чего не хватает в GDD')).extensionData.gddCard;
 await show(g,'чего не хватает в GDD');
 assert.ok(await js("document.querySelectorAll('.gdd-system.st-missing').length")>=2);
 assert.ok(await js("document.querySelectorAll('.gdd-system.st-covered').length")>=2);
 const asked=await js("(async()=>{let got='';const k=window.resultKit,old=k.ask;k.ask=async t=>{got=t;};document.querySelector('.gdd-describe').click();await new Promise(r=>setTimeout(r,50));k.ask=old;return got;})()");
 assert.match(asked,/^Опиши \S+ в GDD$/);
 const gaps=await require('./card-shot.cjs')(win,'.gdd-card','petya-gdd-gaps');
 console.log('GDD cards ('+shot+', '+gaps+'): destination, cited / «уточнить», diff, editor re-checked through IPC, exact write, gaps passed');
}};
require('../src/main.cjs');
