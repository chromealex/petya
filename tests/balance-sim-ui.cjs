// «Симуляция баланса» cards in the real chat, from data the feature computes on the fixture project:
//  - the confirm card: rewards with file:line, the price ladder, the XP curve with its reading, the loop form with
//    «из конфига» / «предположение», the «what if» change highlighted; nothing runs before «Запустить симуляцию»;
//  - «Запустить симуляцию» → ipc `run` with the edited loop (the feature's real run) → percentile bands (SVG), the
//    milestones table with before → after, currency tabs, the Sheets slot; «Взять из метрик» fills the form;
//  - safe text from config names; screenshots of the confirm card, the result and the «what if».
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const until=async(code,ms=8000)=>{for(let i=0;i<ms/40;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,40));}return false;};
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/balance-sim/feature.cjs');
 const root=path.join(__dirname,'fixtures/balance-sim/project');
 const topic={id:'t',title:'Чат',messages:[],projectId:'p'};
 const s={settings:{'extension_balance-sim':'true'},requestProgress:{report(){}},
  dialogue:{state:{projects:[{id:'p',name:'Arena',folders:[root]}],activeProjectId:'p',topics:[topic]},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{events:async()=>[{name:'battle_win',users:900},{name:'battle_lose',users:800}],
  journeys:async()=>({journeys:Array.from({length:60},(_,i)=>({user:'u'+i,times:{battle_win:Array.from({length:4+i%5},(_,k)=>Date.now()-86400000*(1+i%3)+k*60000),battle_lose:Array.from({length:3+i%3},(_,k)=>Date.now()-86400000*(1+i%3)+k*90000)}}))})}}];
 await app.turn(s,'сколько дней до 10 уровня у игрока без доната');
 const plain=topic.messages.at(-1).extensionData.simCard;
 await app.turn(s,'что будет с экономикой, если поднять награду за победу на 20%');
 const whatif=topic.messages.at(-1).extensionData.simCard;
 // A hostile config name stays text.
 plain.economy.sources[0]={...plain.economy.sources[0],label:'dailyLoginGold <img src=x onerror=alert(1)>'};
 const {ipcMain}=require('electron'),calls=[];
 ipcMain.removeHandler('petya:feature');
 ipcMain.handle('petya:feature',async(event,name,method,...args)=>{
  calls.push([name,method,...args]);
  if(name==='appLinks'&&method==='available')return args[0]==='spreadsheet-export'?[{id:'google-sheets',name:'Google Таблицы',label:'Выгрузить в Google Таблицы'}]:[];
  if(name==='balanceSim'&&method==='run')return app.run(s,...args);
  if(name==='balanceSim'&&method==='calibrate')return app.calibrate(s,...args);
  return null;
 });
 await js(`view('home');showDialogueMessages([{role:'user',text:'сколько дней до 10 уровня у игрока без доната'},{role:'assistant',text:'Проверьте модель цикла.',by:'Симуляция баланса',extensionData:{simCard:${JSON.stringify(plain)}}},{role:'user',text:'что будет с экономикой, если поднять награду за победу на 20%'},{role:'assistant',text:'Проверьте модель цикла.',by:'Симуляция баланса',extensionData:{simCard:${JSON.stringify(whatif)}}}],'Баланс')`);
 assert.ok(await until("document.querySelectorAll('.sim-card').length===2"),'two cards');
 const first="document.querySelectorAll('.sim-card')[0]",second="document.querySelectorAll('.sim-card')[1]";
 assert.equal(await js(first+".dataset.state"),'confirm');
 assert.equal(await js(first+".querySelectorAll('.sim-src').length"),5,'five rewards');
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'config names are text');
 assert.match(await js(first+".querySelector('.sim-src .sim-field').textContent"),/<img/);
 assert.equal(await js(first+".querySelector('.sim-src[data-trigger=win] .sim-where').textContent"),'BattleRewards.asset:10');
 assert.equal(await js(first+".querySelectorAll('.sim-ladder').length"),2,'gold and gems');
 assert.ok(await js(first+".querySelector('.sim-warn')!==null"),'gems cannot be earned for free');
 assert.equal(await js(first+".querySelector('.sim-curve-kind').value"),'per-level');
 assert.equal(await js(first+".querySelector('input[data-key=actionsPerDay]').value"),'8');
 assert.match(await js(first+".querySelector('input[data-key=actionsPerDay]').parentNode.querySelector('.sim-from').textContent"),/из конфига/);
 assert.match(await js(first+".querySelector('input[data-key=winRate]').parentNode.querySelector('.sim-from').textContent"),/предположение/);
 assert.equal(await js(second+".querySelectorAll('.sim-src.changed').length"),1,'the changed reward is marked');
 assert.match(await js(second+".querySelector('.sim-src.changed .sim-new').textContent"),/144/);
 assert.equal(calls.filter(c=>c[1]==='run').length,0,'nothing runs before the button');
 await require('./card-shot.cjs')(win,'.sim-card[data-state=confirm]','petya-balance-sim-confirm',{width:700});
 await js("(()=>{const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.sim-card'))home.append(c);b.remove();})()");
 // Metrics calibration: the form takes the values, the user still presses the button.
 await js(first+".querySelectorAll('.kit-actions button')[1].click()");
 assert.ok(await until("document.querySelectorAll('.sim-card')[0].querySelector('.sim-from')?.textContent==='из метрик'"),'calibrated from metrics');
 const calibrated=Number(await js("document.querySelectorAll('.sim-card')[0].querySelector('input[data-key=actionsPerDay]').value"));
 assert.ok(calibrated>=8&&calibrated<=14,'battles per player-day from journeys: '+calibrated);
 assert.equal(calls.filter(c=>c[1]==='run').length,0);
 // The user edits the win rate and runs.
 await js("(()=>{const i=document.querySelectorAll('.sim-card')[0].querySelector('input[data-key=winRate]');i.value='55';i.dispatchEvent(new Event('input'));})()");
 await js("document.querySelectorAll('.sim-card')[0].querySelector('[data-action=run]').click()");
 assert.ok(await until("document.querySelectorAll('.sim-card')[0]?.dataset.state==='done'"),'result drawn');
 const run=calls.find(c=>c[1]==='run');assert.equal(run[3].winRate,0.55);
 assert.equal(await js("document.querySelectorAll('.sim-card')[0].querySelectorAll('.sim-chart polygon').length"),2,'two bands');
 assert.equal(await js("document.querySelectorAll('.sim-card')[0].querySelectorAll('.sim-chart polyline').length"),1,'median');
 assert.equal(await js("document.querySelectorAll('.sim-card')[0].querySelector('.sim-milestones tr[data-goal=\"level:10\"] td.goal').textContent"),'10 уровень');
 assert.match(await js("document.querySelectorAll('.sim-card')[0].querySelector('.kit-status, .kit-chip').textContent"),/медиана \d+/);
 assert.ok(await until("document.querySelectorAll('.sim-card')[0].querySelector('.kit-links[data-kind=spreadsheet-export] button')!==null"),'export');
 // Tabs: level ↔ gold.
 await js("[...document.querySelectorAll('.sim-card')[0].querySelectorAll('.sim-tabs .kit-chip')].find(b=>b.dataset.tab==='gold').click()");
 assert.equal(await js("document.querySelectorAll('.sim-card')[0].querySelector('.sim-tabs [aria-pressed=true]').dataset.tab"),'gold');
 await js("[...document.querySelectorAll('.sim-card')[0].querySelectorAll('.sim-tabs .kit-chip')].find(b=>b.dataset.tab==='level').click()");
 // The «what if»: base dashed, variant bands, before → after.
 await js("document.querySelectorAll('.sim-card')[1].querySelector('[data-action=run]').click()");
 assert.ok(await until("document.querySelectorAll('.sim-card')[1]?.dataset.state==='done'"),'what-if drawn');
 await js("[...document.querySelectorAll('.sim-card')[1].querySelectorAll('.sim-tabs .kit-chip')].find(b=>b.dataset.tab==='gold').click()");
 assert.equal(await js("document.querySelectorAll('.sim-card')[1].querySelectorAll('.sim-median-base').length"),1);
 assert.ok(await js("document.querySelectorAll('.sim-card')[1].querySelectorAll('.sim-after').length")>=1,'before → after');
 await js("document.querySelectorAll('.sim-card').forEach((c,i)=>c.dataset.shot=String(i))");
 const file=await require('./card-shot.cjs')(win,'.sim-card[data-shot="0"]','petya-balance-sim',{width:700});
 await js("(()=>{const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.sim-card'))home.append(c);b.remove();})()");
 const file2=await require('./card-shot.cjs')(win,'.sim-card[data-shot="1"]','petya-balance-sim-whatif',{width:700});
 app.deps.metrics=null;
 console.log('Balance simulation cards ('+file+', '+file2+'): economy with file:line, price ladder, curve reading, loop form, metrics calibration, run only on the button with the edited loop, bands, milestones, tabs, what-if before → after, Sheets slot, safe text passed');
}};
require('../src/main.cjs');
