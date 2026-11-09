// «Воронки» in the real chat, end to end through the real feature (sources stubbed in the main process):
//  - an events source (AppMetrica-like journeys): the request in the composer → the card with step bars, drop-offs
//    with medians, the main drop marked, the comparison switched between platform and country, «Сохранить воронку»
//    through the feature's IPC (saved per project), the Google Sheets link, safe text from event names;
//  - a database: the events query waits for «Выполнить», then the funnel query waits again, then the result;
// screenshots of both cards.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const until=async(code,ms=8000)=>{for(let i=0;i<ms/40;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,40));}return false;};
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/funnels/feature.cjs');
 const HOSTILE='tutorial_step_2 <img src=x onerror=alert(1)>';
 const NOW=Date.now(),DAY=86400000,start=Math.floor(NOW/DAY)*DAY-30*DAY;
 // 900 players; step 2 → 3 loses most; iOS converts better; one event name is hostile text.
 const journeys=[];
 for(let i=0;i<900;i++){
  const ios=i%3===0,at=start+(i%29)*DAY+(i*7919%70000)*1000,t={$install:[at]};let p=at;
  const go=(e,ok,gap)=>{if(!ok)return false;p+=gap*1000;t[e]=[p];return true;};
  go('tutorial_start',i%10!==9,25)&&go('tutorial_step_1',i%10<8,40+i%30)&&go(HOSTILE,i%10<(ios?7:4),100+i%60)&&go('tutorial_complete',i%10<(ios?6:3),50);
  journeys.push({user:'d'+i,platform:ios?'ios':'android',country:['US','BR','DE','RU','JP','TR','MX','KR'][i%8],version:i%4?'1.4.2':'1.4.1',times:t});
 }
 const events=['tutorial_start','tutorial_step_1',HOSTILE,'tutorial_complete','shop_open'].map((name,i)=>({name,users:900-i*100}));
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{installs:true,events:async()=>events,journeys:async()=>({journeys})}}];
 await js("window.petya.saveSettings({extension_funnels:'true'})");
 await js("submitChatCommand('воронка туториала по платформам')");
 assert.ok(await until("!!document.querySelector('.funnel-card[data-state=done]')"),'the funnel card appears');
 const card="document.querySelector('.funnel-card[data-state=done]')";
 assert.equal(await js(card+".querySelectorAll('.funnel-step').length"),5);
 assert.equal(await js(card+".querySelectorAll('.funnel-gap').length"),4);
 assert.equal(await js(card+".querySelectorAll('.funnel-gap.worst').length"),1);
 assert.equal(await js(card+".querySelector('.funnel-gap.worst').dataset.step"),'3');
 assert.equal(await js(card+".querySelectorAll('img').length"),0,'event names are text');
 assert.equal(await js(card+".querySelector('.funnel-step[data-step=\"3\"] .funnel-label').textContent"),HOSTILE);
 assert.equal(await js(card+".querySelector('.funnel-step .funnel-users').textContent.replace(/\\s/g,'')"),'900');
 assert.match(await js(card+".querySelector('.funnel-gap[data-step=\"1\"] .funnel-time').textContent"),/медиана 25 с/);
 assert.match(await js(card+".querySelector('.kit-status, .kit-chip').textContent"),/% до конца/);
 // Comparison: platform first, then country (local switch, no request).
 assert.equal(await js(card+".querySelector('.funnel-seg-chips [aria-pressed=true]').dataset.dim"),'platform');
 assert.deepEqual(await js("[..."+card+".querySelectorAll('.funnel-seg-table tbody tr')].map(r=>r.dataset.segment)"),['android','ios']);
 assert.equal(await js(card+".querySelector('.funnel-seg-table tr[data-segment=ios] td.conv').classList.contains('better')"),true);
 await js(card+".querySelector('.funnel-seg-chips [data-dim=country]').click()");
 assert.equal(await js(card+".querySelectorAll('.funnel-seg-table tbody tr').length"),7,'six countries and the rest');
 assert.equal(await js(card+".querySelector('.funnel-seg-chips [aria-pressed=true]').dataset.dim"),'country');
 // Save through the real IPC: per project, the button changes.
 await js(card+".querySelector('[data-action=save]').click()");
 assert.ok(await until(card+".querySelector('[data-action=save]').dataset.saved==='true'"),'saved');
 const fs=require('node:fs'),path=require('node:path');
 const findStore=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isFile()&&e.name==='funnels.json')return p;if(e.isDirectory()&&!e.isSymbolicLink()){const hit=findStore(p);if(hit)return hit;}}return '';};
 assert.match(fs.readFileSync(findStore(require('electron').app.getPath('userData')),'utf8'),/tutorial_step_1/);
 assert.ok(await until(card+".querySelector('.kit-links[data-kind=spreadsheet-export]')!==null"),'export slot');
 await js(card+".querySelector('.funnel-seg-chips [data-dim=platform]').click()");
 const file=await require('./card-shot.cjs')(win,'.funnel-card[data-state=done]','petya-funnels',{width:700});
 await js("document.getElementById('card-shot').remove()");

 // Database: events query → «Выполнить» → funnel query → «Выполнить» → result.
 const ran=[];
 const schema={tables:[{name:'analytics.events',columns:[{name:'user_id',type:'String'},{name:'event_name',type:'String'},{name:'event_time',type:'DateTime'},{name:'platform',type:'String'},{name:'country',type:'String'}]}]};
 app.deps.metrics=[];
 app.deps.sql={all:async()=>[{id:'ch',name:'Аналитика',kind:'clickhouse',dialect:'clickhouse',label:'Аналитика'}],engine:()=>({schema:async()=>schema,estimate:async()=>({kind:'rows',value:3.2e6}),
  run:async sql=>{ran.push(sql);if(/AS event_name/.test(sql))return {columns:[{name:'event_name'},{name:'players'}],rows:events.filter(e=>e.name!==HOSTILE).map(e=>[e.name,e.users])};
   return {columns:[{name:'seg'},{name:'step'},{name:'bucket'},{name:'users'}],rows:[['__all__',1,-1,9100],['__all__',2,2,5000],['__all__',2,3,2800],['__all__',3,5,2000],['__all__',3,6,1500],['ios',1,-1,3900],['ios',2,-1,3500],['ios',3,-1,2100],['android',1,-1,5200],['android',2,-1,4300],['android',3,-1,1400]]};}})};
 await js("window.petya.saveSettings({extension_sql:'true'})");
 await js("submitChatCommand('воронка туториала')");
 assert.ok(await until("!!document.querySelector('.funnel-card[data-state=pending]')"),'pending card');
 const pending="document.querySelector('.funnel-card[data-state=pending]')";
 assert.match(await js(pending+".querySelector('.funnel-code').textContent"),/^SELECT `event_name` AS event_name/);
 assert.match(await js(pending+".querySelector('.funnel-what').textContent"),/Шаг 1 из 2/);
 assert.equal(ran.length,0,'nothing ran before «Выполнить»');
 const shot2=await require('./card-shot.cjs')(win,'.funnel-card[data-state=pending]','petya-funnels-sql',{width:700});
 await js("const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.funnel-card'))home.append(c);b.remove()");
 await js(pending+".querySelector('.kit-actions button.primary').click()");
 assert.ok(await until("!!document.querySelector('.funnel-card[data-state=pending] .funnel-chips')"),'the funnel query with its steps');
 assert.equal(ran.length,1);
 assert.match(await js("document.querySelector('.funnel-card[data-state=pending] .funnel-code').textContent"),/minIfOrNull/);
 await js("document.querySelector('.funnel-card[data-state=pending] .kit-actions button.primary').click()");
 assert.ok(await until("document.querySelectorAll('.funnel-card[data-state=done]').length===2"),'the SQL funnel is drawn');
 assert.equal(ran.length,2);
 const sqlCard="[...document.querySelectorAll('.funnel-card[data-state=done]')].find(c=>c.querySelector('.funnel-sql-done'))";
 assert.match(await js(sqlCard+".querySelector('.funnel-gap[data-step=\"1\"] .funnel-time').textContent"),/медиана ≈ 30 с–1 мин/);
 assert.equal(await js(sqlCard+".querySelector('.funnel-sql-done summary').textContent"),'SQL');
 app.deps.metrics=null;app.deps.sql=null;
 console.log('Funnels card: chat request → steps, drop-offs with medians, main drop, platform/country comparison, saved per project through IPC, Sheets slot, safe text; SQL events → funnel → result only on «Выполнить» passed · '+file+' · '+shot2);
}};
require('../src/main.cjs');
