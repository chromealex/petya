// «Запись экрана → баг» in the real window: the choice card (window and screen previews, the game's log and system
// info switches, nothing recorded before «Начать запись»), a stubbed recording with its live time and «Стоп», the
// draft opened by the ordinary chat request when the recording is ready, and the report card: last frame, the log's
// errors on the recording's timeline, steps left to the user, cited log lines, environment, attachments, the tracker
// hand-off and «Прикрепить запись и лог» (upload stubbed). Window names and log lines never become HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<300;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 win.setContentSize(1180,1500);
 const app=require('../src/extensions/screen-bug/feature.cjs');
 const attach=require('../src/extensions/screenshot-task/attach.cjs');
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'petya-sbug-ui-'));
 const log=path.join(home,'Editor.log');fs.writeFileSync(log,'Unity Editor version:    2022.3.21f1 (abc)\nLoading scene Main\n');
 // Previews drawn in the page: a game window, an IDE, the whole screen.
 const draw=(bg,fg)=>js(`(()=>{const c=document.createElement('canvas');c.width=320;c.height=200;const g=c.getContext('2d');g.fillStyle='${bg}';g.fillRect(0,0,320,200);g.fillStyle='${fg}';g.fillRect(20,20,180,24);g.fillRect(20,60,280,110);g.fillStyle='#ffffff55';g.fillRect(220,20,80,24);return c.toDataURL('image/jpeg',0.8);})()`);
 const thumbs=[await draw('#1f2b24','#6fa36f'),await draw('#2a2340','#9b86d8'),await draw('#1d2430','#86a8e0'),await draw('#302a20','#e5ce8c')];
 const sources=[{id:'screen:1:0',name:'Entire Screen'},{id:'window:42:0',name:'Bunker Wars'},{id:'window:43:0',name:'Rider — <b>Inventory.cs</b>'},{id:'window:44:0',name:'Unity 2022.3 — Bunker Wars — Android'}];
 const pickId='5b3f1c2a-0000-4c3b-9a55-0c2d3e4f5a61';
 app.state.picks.set(pickId,{id:pickId,at:Date.now(),note:'инвентарь не открывается после покупки',sources:new Map(sources.map(s=>[s.id,s])),logs:new Set([log])});
 const recordings=[];
 Object.assign(app.deps,{userData:()=>home,system:async unity=>[{label:'Система',value:'macOS 15.1 · arm64'},{label:'Процессор',value:'Apple M2 Pro · 12 потоков'},{label:'Память',value:'32 ГБ'},{label:'Видеокарта',value:'Apple M2 Pro'},{label:'Экраны',value:'3024×1964 @2x 120 Гц'},{label:'Язык системы',value:'ru'},{label:'Unity',value:unity}],
  record:async options=>{let resolve;const done=new Promise(r=>{resolve=r;});const rec={options,done,stop:()=>{fs.writeFileSync(options.file,Buffer.alloc(8192,1));resolve({file:options.file,bytes:8192,duration:47000,poster:thumbs[1],reason:'stop'});}};recordings.push(rec);return rec;}});
 const pick={stage:'pick',pick:pickId,note:'инвентарь не открывается после покупки',max:120000,at:Date.now(),
  sources:sources.map((s,i)=>({id:s.id,kind:i?'window':'screen',name:i?s.name:'Экран 1',thumb:thumbs[i===0?2:i===1?0:i===2?1:3]})),
  logs:[{file:log,label:'Unity Editor',kind:'editor',mtime:Date.now()-120000}]};
 await js("view('home');window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};window.resultKit.availableLinks.clear()");
 await js(`showDialogueMessages([{role:'user',text:'запиши баг: инвентарь не открывается после покупки'},{role:'assistant',text:'Выберите окно игры или экран.',by:'Запись экрана → баг',extensionData:{screenBug:${JSON.stringify(pick)}}}],'Баг')`);
 await wait("document.querySelectorAll('.sbug-pick').length===1",'pick card');
 await js("document.querySelectorAll('.onb').forEach(n=>n.style.display='none')");
 assert.equal(await js("document.querySelectorAll('.sbug-source').length"),4);
 assert.equal(await js("document.querySelectorAll('.sbug-pick b').length"),0,'window names are never HTML');
 assert.equal(await js("document.querySelector('.sbug-go').disabled"),true,'nothing to start before a choice');
 assert.equal(await js("document.querySelector('.sbug-log-select').value"),log);
 await require('./card-shot.cjs')(win,'.sbug-pick','petya-screen-bug-pick');
 // Choose the game window and start: the stubbed recorder gets exactly that source.
 await js("document.querySelectorAll('.sbug-source')[1].click()");
 assert.equal(await js("document.querySelector('.sbug-go').textContent"),'Начать запись · Bunker Wars');
 assert.equal(recordings.length,0,'never silent: nothing recorded before the press');
 await js("document.querySelector('.sbug-go').click()");
 await wait("!document.querySelector('.sbug-live').hidden",'live');
 assert.equal(recordings[0].options.source.id,'window:42:0');
 assert.equal(await js("document.querySelector('.sbug-pick .kit-chip').textContent"),'идёт запись');
 fs.appendFileSync(log,'Purchase completed: chest_gold\nNullReferenceException: Object reference not set to an instance of an object\n  at InventoryView.Open () in Assets/UI/InventoryView.cs:88\nWarning: UI atlas rebuilt\n');
 await new Promise(r=>setTimeout(r,1100));
 await require('./card-shot.cjs')(win,'.sbug-pick','petya-screen-bug-recording');
 // «Стоп» in the card: the recording ends, the draft is asked for with the ordinary request.
 await js("document.querySelector('.sbug-stop').click()");
 await wait("window.__asked.some(a=>a[0]==='оформи баг по записи экрана'&&a[1])",'draft requested');
 await wait("document.querySelector('.sbug-pick .kit-chip').textContent==='записано'",'recorded');
 const id=app.state.pending;assert.ok(id);
 const meta=JSON.parse(fs.readFileSync(path.join(home,'screen-bug',id+'.json'),'utf8'));
 assert.equal(meta.log.errors,1);assert.equal(meta.system.at(-1).value,'2022.3.21f1');
 // The report card, from a time-stamped Player.log for the timeline.
 const t0=Date.now()-47000;
 const lines=[[-12,'info','[Shop] Opened'],[3,'info','[Shop] Purchase chest_gold'],[9,'warning','Warning: UI atlas rebuilt (2048x2048)'],[14,'error','NullReferenceException: Object reference not set to an instance of an object'],[14,'trace','  at InventoryView.Open () [0x00012] in Assets/UI/InventoryView.cs:88'],[21,'error','Error: <script>alert(1)</script> inventory view missing'],[38,'warning','Warning: slow frame 124 ms']]
  .map(([s,level,text],i)=>({n:i+1,text,level,t:t0+s*1000,during:s>=0}));
 const report={stage:'report',id,at:t0+47000,source:'Bunker Wars',kind:'window',duration:47000,bytes:11.8e6,poster:thumbs[0],reason:'stop',note:'инвентарь не открывается после покупки',
  video:{name:'bug-Bunker-Wars-'+id.slice(0,8)+'.webm',bytes:11.8e6},
  log:{label:'Bunker Wars / Player.log',file:log,mode:'time',lines,errors:2,warnings:2,hidden:1,truncated:false,unity:'2022.3.21f1',name:'bug-Bunker-Wars-'+id.slice(0,8)+'.log.txt'},
  system:meta.system,draft:{title:'Инвентарь не открывается после покупки',steps:[],expected:'',actual:'В логе NullReferenceException в InventoryView.Open сразу после покупки chest_gold.',evidence:[4],model:true}};
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token'})");
 await js("window.resultKit.availableLinks.clear()");
 await js(`showDialogueMessages([{role:'user',text:'оформи баг по записи экрана'},{role:'assistant',text:'Набросал баг.',by:'Запись экрана → баг',extensionData:{screenBug:${JSON.stringify(report)}}}],'Баг')`);
 await wait("document.querySelectorAll('.sbug-report').length===1",'report card');
 await js("document.querySelectorAll('.onb').forEach(n=>n.style.display='none')");
 assert.equal(await js("document.querySelector('.sbug-report input[name=title]').value"),report.draft.title);
 assert.equal(await js("document.querySelector('.sbug-report textarea[name=steps]').value"),'','steps are the user\'s');
 assert.equal(await js("document.querySelectorAll('.sbug-mark').length"),4,'errors and warnings during the recording on the timeline');
 assert.equal(await js("document.querySelectorAll('.sbug-report script').length"),0,'log lines are never HTML');
 assert.match(await js("document.querySelector('.sbug-tag').textContent"),/^по логу · строки 4$/);
 assert.equal(await js("document.querySelectorAll('.sbug-section .sbug-lines')[0].querySelectorAll('.sbug-line.cited').length"),1,'the cited error line');
 assert.equal(await js("document.querySelectorAll('.sbug-env dt').length"),7);
 await wait("!!document.querySelector('.sbug-report .kit-link')",'tracker');
 await require('./card-shot.cjs')(win,'.sbug-report','petya-screen-bug');
 // Hand-off: the tracker's own flow gets the text, then the attach box offers the upload.
 await js("document.querySelector('.sbug-report textarea[name=steps]').value='Открыть магазин\\nКупить сундук\\nОткрыть инвентарь'");
 await js("document.querySelector('.sbug-report .kit-link').click()");
 await wait("window.__asked.some(a=>/^Создай задачу в Jira: Баг\\. Инвентарь не открывается/.test(a[0]))",'tracker request');
 const asked=await js("window.__asked.find(a=>/^Создай задачу в Jira/.test(a[0]))[0]");
 assert.match(asked,/Шаги: 1\) Открыть магазин 2\) Купить сундук 3\) Открыть инвентарь/);
 assert.match(asked,/Окружение: Система — macOS 15\.1 · arm64/);assert.match(asked,/Вложения: запись экрана 0:47, лог 7 строк/);
 await wait("!document.querySelector('.sbug-attach').hidden",'attach box');
 const uploads=[];const original=attach.upload;
 attach.upload=async(svc,args)=>{uploads.push(args);return {provider:'jira',key:args.key,name:args.name,url:'https://acme.atlassian.net/browse/'+args.key};};
 await js("(()=>{const i=document.querySelector('.sbug-attach input');i.value='BW-77';i.dispatchEvent(new Event('input'));})()");
 assert.equal(await js("document.querySelector('.sbug-attach .primary').textContent"),'Прикрепить к BW-77');
 // The log excerpt exists only for a recording with a log: this one has it (from the real Editor.log above).
 await js("document.querySelector('.sbug-attach .primary').click()");
 await wait("!!document.querySelector('.sbug-attached')",'attached');
 assert.deepEqual(uploads.map(u=>u.type),['video/webm','text/plain']);
 assert.match(await js("document.querySelector('.sbug-attached').textContent"),/Запись и лог прикреплены к BW-77/);
 attach.upload=original;
 await require('./card-shot.cjs')(win,'.sbug-report','petya-screen-bug-attached');
 fs.rmSync(home,{recursive:true,force:true});
 console.log('Screen bug cards: choice with previews, nothing before the press, live recording and stop, draft requested, report with timeline, cited lines, environment, tracker and attachments passed');
}};
require('../src/main.cjs');
