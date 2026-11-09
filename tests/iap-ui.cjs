// «Покупки в игре» in the real chat, end to end through the real feature and the real purchase-source registry with
// fake providers in the main process: the request → the card with currency chips (never one total), KPI tiles, daily
// bars with refunds, products with shares and refund marks, the database query waiting for «Выполнить», then (IPC
// `run`) payers, ARPPU, conversion, first purchases and ROAS with purchases and ads; safe text from product names;
// the settings card. Screenshots of the card (both states) and the settings.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const until=async(code,ms=8000)=>{for(let i=0;i<ms/40;i++){if(await js(code))return true;await new Promise(r=>setTimeout(r,40));}return false;};
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/iap/feature.cjs'),PS=require('../src/features/purchase-sources.cjs');
 const today=new Date(),day=n=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-n*86400000).toISOString().slice(0,10);
 const rows=[];
 const products=[['gems_m','Кристаллы M',4.99,9],['starter','Стартовый набор',2.99,6],['vip_month','VIP на месяц',9.99,3],['gems_xl','Кристаллы XL',19.99,1],['<img src=x onerror=alert(1)>','<img src=x onerror=alert(1)>',0.99,2]];
 for(let d=1;d<=30;d++)for(const [product,title,price,n] of products){const units=Math.max(0,n+((d*7+product.length)%5)-2-(d===12?n:0));if(units)rows.push({date:day(d),store:'appstore',product,title,units,amount:units*price,currency:'USD',platform:'ios',type:product==='vip_month'?'subscription':'iap'});
  if(d%9===0&&product==='gems_m')rows.push({date:day(d),store:'appstore',product,title,units:1,amount:price,currency:'USD',kind:'refund',platform:'ios'});}
 for(let d=1;d<=30;d+=2)rows.push({date:day(d),store:'googleplay',product:'gems_m',title:'Кристаллы M',units:3,amount:3*349,currency:'RUB',platform:'android'},{date:day(d),store:'googleplay',product:'starter',title:'Стартовый набор',units:1,amount:199,currency:'RUB',platform:'android'});
 rows.push({date:day(4),store:'googleplay',product:'vip_month',title:'VIP',units:1,amount:8.99,currency:'EUR',platform:'android'});
 const ran=[];
 const providers=[
  {id:'appstore',name:'App Store',setting:'',source:{ready:()=>true,fetch:async(_,q)=>({rows:rows.filter(r=>r.store==='appstore'&&r.date>=q.start&&r.date<=q.end)})}},
  {id:'googleplay',name:'Google Play',setting:'',source:{ready:()=>true,fetch:async(_,q)=>({rows:rows.filter(r=>r.store==='googleplay'&&r.date>=q.start&&r.date<=q.end),notes:['Google Play: отчёт за текущий месяц обновляется раз в день.']})}},
  {id:'sql-purchases',name:'База (SQL)',setting:'',source:{confirm:true,ready:()=>true,
   plan:async()=>({sql:'WITH p AS (SELECT user_id AS buyer FROM game.purchases)\nSELECT part, d, product, currency, platform, refund, units, amount, payers FROM x LIMIT 5000',connection:{id:'ch',name:'Аналитика',dialect:'clickhouse'},table:'game.purchases',estimate:{kind:'rows',value:812000}}),
   fetch:async(_,q)=>{ran.push(q.plan.sql);return {rows:[],payers:{total:1840,newPayers:410,days:[{date:day(1),payers:120},{date:day(2),payers:140}],byCurrency:[{currency:'USD',payers:1500,amount:21800},{currency:'RUB',payers:340,amount:42100}],first:[{product:'starter',payers:230},{product:'gems_m',payers:120},{product:'vip_month',payers:60}]}};}}}];
 app.deps.purchases=s=>PS.create(s,{sources:providers});
 app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{fetch:async()=>({series:[{metric:'dau',series:[{date:day(1),value:24000},{date:day(2),value:26000}]}]})}}];
 app.deps.ads=[{id:'max',name:'AppLovin MAX',source:{fetch:async(_,q)=>({rows:[{day:q.start,revenue:3200},{day:q.end,revenue:2800}]})}}];
 app.deps.ua={list:()=>[{id:'applovin-ua'}],fetchAll:async()=>({rows:[{currency:'USD',spend:9000},{currency:'USD',spend:3000},{currency:'GBP',spend:500}],used:[{name:'AppLovin'}]})};
 await js("window.petya.saveSettings({extension_iap:'true'})");
 await js("submitChatCommand('конверсия в платящих и ARPPU за месяц')");
 assert.ok(await until("!!document.querySelector('.iap-card[data-state=pending]')"),'the purchases card');
 const card="document.querySelector('.iap-card')";
 assert.deepEqual(await js("[..."+card+".querySelectorAll('.iap-currencies .kit-chip')].map(c=>c.dataset.currency)"),['USD','RUB','EUR'],'currency chips, by purchases');
 assert.equal(await js(card+".querySelector('.iap-currencies [aria-pressed=true]').dataset.currency"),'USD');
 assert.equal(await js(card+".querySelectorAll('.iap-svg rect.bar').length"),30);
 assert.ok(await js(card+".querySelectorAll('.iap-svg rect.refund').length")>=3,'refund days below the axis');
 assert.equal(await js(card+".querySelectorAll('img').length"),0,'product names are text');
 assert.equal(await js(card+".querySelector('.iap-bars li .iap-name').textContent"),'Кристаллы M');
 assert.ok(await js(card+".querySelector('.iap-refund')!==null"));
 assert.match(await js(card+".querySelector('.iap-code').textContent"),/game\.purchases/);
 assert.equal(ran.length,0,'the database query waits for «Выполнить»');
 // Another currency: nothing is added across.
 await js(card+".querySelector('.iap-currencies [data-currency=RUB]').click()");
 assert.match(await js(card+".querySelector('[data-kpi=amount] .iap-value').textContent"),/₽/);
 await js(card+".querySelector('.iap-currencies [data-currency=USD]').click()");
 const pending=await require('./card-shot.cjs')(win,'.iap-card','petya-iap-pending',{width:700});
 await js("const b=document.getElementById('card-shot');const home=document.querySelector('.message-content')?.parentNode||document.body;for(const c of b.querySelectorAll('.iap-card'))home.append(c);b.remove()");
 await js(card+".querySelector('.kit-actions button.primary').click()");
 assert.ok(await until("!!document.querySelector('.iap-card[data-state=done]')"),'after «Выполнить»');
 assert.equal(ran.length,1);
 const done="document.querySelector('.iap-card[data-state=done]')";
 assert.match(await js(done+".querySelector('[data-kpi=payers] .iap-value').textContent"),/1\s840/);
 assert.match(await js(done+".querySelector('[data-kpi=arppu] .iap-value').textContent"),/14,53\s\$/);
 assert.match(await js(done+".querySelector('[data-kpi=conversion] .iap-value').textContent"),/0,52%/);
 assert.equal(await js(done+".querySelectorAll('.iap-bars.first li').length"),3);
 assert.deepEqual(await js("[..."+done+".querySelectorAll('.iap-blend-table tbody tr')].map(r=>r.dataset.currency)"),['USD']);
 assert.match(await js(done+".querySelector('.iap-blend').textContent"),/Закупка в валюте без покупок: GBP/);
 const file=await require('./card-shot.cjs')(win,'.iap-card[data-state=done]','petya-iap',{width:700});
 await js("document.getElementById('card-shot').remove()");
 // Settings card: added from the catalog, its form and status.
 await js("window.extensionHost.open('iap')");
 await js("view('settings')");
 assert.ok(await until("!!document.querySelector('[data-extension=iap]')"),'iap settings card');
 await js("const c=document.querySelector('[data-extension=iap]');c.hidden=false;document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'iap'}))");
 assert.ok(await until("/App Store: не подключён/.test(document.querySelector('[data-extension=iap] [role=status]')?.textContent||'')"),'status line');
 assert.equal(await js("document.querySelector('[data-extension=iap] [name=iapAscKey]').tagName"),'TEXTAREA');
 const settingsShot=await require('./card-shot.cjs')(win,'[data-extension=iap]','petya-iap-settings',{width:700});
 app.deps.purchases=null;app.deps.metrics=null;app.deps.ads=null;app.deps.ua=null;
 console.log('In-game purchases card: chat request, currency chips never added, tiles, daily bars with refunds, products, safe text, the database query waiting for «Выполнить» then payers, ARPPU, conversion, first purchases and ROAS per currency; settings card passed · '+pending+' · '+file+' · '+settingsShot);
}};
require('../src/main.cjs');
