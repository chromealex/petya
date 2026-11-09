// «Идеи для ивентов» cards in the real chat, from data the feature computes (the balance fixture's configs, competitors'
// notes and a past event's metrics stubbed in the main process):
//  - ideas: the timeline (a bar per idea, holiday marks), evidence (holiday with regions, a competitor's line quoted
//    as written, our past event's DAU / revenue), cost with terms and file:line and the income gauge, «Запланировать»;
//  - the plan card: «Создать задачу» through the cross-app kind `task-tracker` (then the plan is saved through ipc
//    `planned`), «Сохранить в план» once; without a tracker the card says which apps create tasks;
//  - a past event: its metrics and «Запомнить ивент»; safe text throughout; screenshots.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const until=async(code,ms=8000)=>{for(let i=0;i<ms/40;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,40));}return false;};
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/event-ideas/feature.cjs');
 const dataRoot=fs.mkdtempSync(path.join(os.tmpdir(),'petya-events-ui-'));
 const topic={id:'t',title:'Чат',messages:[],projectId:'p'};
 const s={settings:{'extension_event-ideas':'true'},dataRoot,requestProgress:{report(){}},
  dialogue:{state:{projects:[{id:'p',name:'Arena',folders:[path.join(__dirname,'fixtures/balance-sim/project')]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 app.deps.now=()=>Date.parse('2026-11-09T09:00:00Z');
 app.deps.competitors=[{name:'Clash Arena <img src=x onerror=alert(1)>',store:'appstore',day:'2026-10-20',notes:'Winter festival event: collect snowflakes in battles for the Frost Knight skin!'},{name:'Hero Wars',store:'appstore',day:'2026-11-01',notes:'Новый турнир выходного дня с призами для лучших.'}];
 const DAY=86400000;
 const series=(metric,base,lift,from,to)=>{const out=[];for(let t=Date.parse(from);t<=Date.parse(to);t+=DAY){const d=new Date(t).toISOString().slice(0,10);out.push({date:d,value:(d>='2025-12-20'&&d<='2026-01-05'||d>='2025-10-24'&&d<='2025-11-02')?base*(1+lift):base});}return {metric,unit:'users',series:out};};
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{fetch:async(_,q)=>({series:[series('dau',1000,0.18,q.from,q.to),series('revenue',400,0.42,q.from,q.to)]})}}];
 require('../src/extensions/event-ideas/store.cjs').save(s,{name:'Новогодний календарь 2025',start:'2025-12-20',end:'2026-01-05',mechanic:'login',holiday:'new-year',planned:true});
 await app.turn(s,'какие ивенты провести до конца года для России и США');
 const ideas=topic.messages.at(-1).extensionData.eventCard;
 await app.turn(s,'запланируй ивент '+(ideas.ideas.findIndex(i=>i.holiday==='christmas')+1));
 const plan=topic.messages.at(-1).extensionData.eventCard;
 await app.turn(s,'прошлый ивент «Хэллоуин 2025» шёл с 24 октября по 2 ноября 2025');
 const past=topic.messages.at(-1).extensionData.eventCard;
 const {ipc}=app.setup(s);
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  calls.push([name,method,...args]);
  if(name==='appLinks'&&method==='available')return args[0]==='task-tracker'?[{id:'jira',name:'Jira',label:'В задачу Jira'}]:[];
  if(name==='appLinks'&&method==='run')return {text:'Задача передана в Jira'};
  if(name==='eventIdeas')return ipc[method](...args);
  return null;
 });
 await js(`view('home');showDialogueMessages([{role:'user',text:'какие ивенты провести до конца года'},{role:'assistant',text:'Идеи.',by:'Идеи для ивентов',extensionData:{eventCard:${JSON.stringify(ideas)}}},{role:'user',text:'запланируй ивент'},{role:'assistant',text:'План.',by:'Идеи для ивентов',extensionData:{eventCard:${JSON.stringify(plan)}}},{role:'user',text:'прошлый ивент'},{role:'assistant',text:'Прошлый.',by:'Идеи для ивентов',extensionData:{eventCard:${JSON.stringify(past)}}}],'Ивенты')`);
 assert.ok(await until("document.querySelectorAll('.event-card').length===3"),'three cards');
 const A="document.querySelector('.event-card[data-mode=ideas]')",P="document.querySelector('.event-card[data-mode=plan]')",Q="document.querySelector('.event-card[data-mode=past]')";
 assert.equal(await js("document.querySelectorAll('.event-card img').length"),0,'names are text');
 const n=ideas.ideas.length;
 assert.equal(await js(A+".querySelectorAll('.ei-row').length"),n);assert.equal(await js(A+".querySelectorAll('.ei-idea').length"),n);
 assert.ok(await js(A+".querySelectorAll('.ei-tick').length")>=1,'month ticks');
 assert.ok(await js(A+".querySelector('.ei-ev.competitor .ei-quote')?.textContent")==='Новый турнир выходного дня с призами для лучших.'||await js(A+".querySelector('.ei-ev.competitor .ei-quote')?.textContent")==='Winter festival event: collect snowflakes in battles for the Frost Knight skin!');
 assert.ok(await js(A+".querySelector('.ei-ev.past .ei-uplift b.up')!==null"),'our past event with its DAU rise');
 assert.match(await js(A+".querySelector('.ei-idea .ei-terms .ei-where')?.textContent||''"),/\.(?:json|asset):\d+$/);
 assert.ok(await js(A+".querySelector('.ei-gauge')!==null"));
 await require('./card-shot.cjs')(win,'.event-card[data-mode=ideas]','petya-event-ideas',{width:700});
 await js("(()=>{const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.event-card'))home.append(c);b.remove();})()");
 // The plan: the task through the tracker link, then the plan is saved; «Сохранить в план» does not save twice.
 assert.ok(await until(P+".querySelector('.kit-links[data-kind=task-tracker] button')!==null"),'tracker link');
 assert.equal(await js(P+".querySelector('.kit-links[data-kind=task-tracker] button').textContent"),'Создать задачу');
 await require('./card-shot.cjs')(win,'.event-card[data-mode=plan],.event-card[data-mode=past]','petya-event-ideas-plan',{width:700});
 await js("(()=>{const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.event-card'))home.append(c);b.remove();})()");
 await js(P+".querySelector('.kit-links[data-kind=task-tracker] button').click()");
 for(let i=0;i<100&&!calls.some(c=>c[0]==='eventIdeas'&&c[1]==='planned');i++)await new Promise(r=>setTimeout(r,30));
 const run=calls.find(c=>c[0]==='appLinks'&&c[1]==='run');
 assert.equal(run[2],'task-tracker');assert.equal(run[3],'jira');assert.match(run[4].title,/^Ивент: Календарь входа: Рождество$/);assert.match(run[4].description,/Стоимость на игрока: \d+ \(gold\)/);
 assert.ok(calls.some(c=>c[0]==='eventIdeas'&&c[1]==='planned'),'saved after the task');
 await js("[..."+P+".querySelectorAll('.kit-actions > button')].find(b=>!b.closest('.kit-links')).click()");
 assert.ok(await until(P+".querySelector('[data-saved=true]')!==null"));
 assert.equal(require('../src/extensions/event-ideas/store.cjs').list(s).filter(e=>e.name==='Календарь входа: Рождество').length,1,'one plan entry');
 // The past event: metrics and «Запомнить ивент».
 assert.match(await js(Q+".querySelector('.ei-metric b').textContent"),/^\+/);
 await js(Q+".querySelector('.kit-actions button').click()");
 assert.ok(await until(Q+".querySelector('[data-saved=true]')!==null"),'remembered');
 assert.ok(require('../src/extensions/event-ideas/store.cjs').list(s).some(e=>e.name==='Хэллоуин 2025'));
 app.deps.metrics=null;app.deps.competitors=null;app.deps.now=()=>Date.now();
 fs.rmSync(dataRoot,{recursive:true,force:true});
 console.log('Event ideas cards: timeline, evidence (holiday, competitor quote, past metrics), cost terms with file:line and income gauge, plan through the task-tracker link then saved once, past event remembered, safe text passed');
}};
require('../src/main.cjs');
