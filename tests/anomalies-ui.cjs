// «Аномалии» card in the real chat, built by the real detector from stubbed sources: a sparkline per anomaly with the
// baseline band, baseline days and the anomalous point, impact, source chip, «Почему?» and «Не показывать такое»
// (a mute rule saved by the app, hidden in place, «Отменить» brings it back), missing data as notes; a quiet card;
// the settings card with the daily check and sensitivity.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const feature=require('../src/extensions/anomalies/feature.cjs');
const {shift}=require('../src/extensions/anomalies/stats.cjs');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const wait=async(code,tries=200)=>{for(let i=0;i<tries;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+code.slice(0,120));};
 await js('window.chatNavigationReady');
 // Realistic data: 6 weeks ending yesterday (Mon 9 Nov 2026) with weekly seasonality and noise.
 const NOW=new Date(2026,10,10,9,5),Y='2026-11-09';
 const days=[];for(let i=41;i>=0;i--)days.push(shift(Y,-i));
 const wd=d=>new Date(d+'T12:00:00Z').getUTCDay(),noise=d=>((Number(d.slice(8))*37)%11)-5;
 const series=(key,kind,source,sourceName,metric,unit,fn,last,segment=null)=>({key,kind,source,sourceName,metric,unit,segment,points:days.filter(d=>d!==Y||last!==undefined).map(d=>({date:d,value:d===Y?last:fn(d)}))});
 const season=b=>d=>Math.round(b*([0,6].includes(wd(d))?1.35:1)+noise(d)*b/200);
 const readers={
  metrics:async()=>({series:[
   series('m:new','metrics','appmetrica','AppMetrica','new','users',season(4200),3300),
   series('m:new:br','metrics','appmetrica','AppMetrica','new','users',season(1500),900,{key:'country',value:'BR',label:'BR'}),
   series('m:dau','metrics','appmetrica','AppMetrica','dau','users',season(52000),51800)],notes:[]}),
  crashes:async()=>({series:[{...series('c','crashes','sentry','Sentry','events','events',d=>120+noise(d)*3,410),points:days.slice(-14).map(d=>({date:d,value:d===Y?410:120+noise(d)*3}))}],notes:[]}),
  support:async()=>({series:[series('s','support','zendesk','Zendesk','tickets','tickets',d=>40+noise(d),78)],notes:[]}),
  ads:async()=>({series:[series('a','ads','applovin','AppLovin MAX','revenue','currency:USD',season(2400),undefined)],notes:[]}),
  reviews:async()=>({series:[series('r','reviews','appstore','App Store','rating','stars',d=>4.4,undefined,{key:'store',value:'appstore',label:'App Store'})],notes:[]})
 };
 const s={settings:{extension_anomalies:'true',anomaliesSensitivity:'normal',anomaliesMuted:'[]'},requestProgress:{report(){}}};
 const card=await feature.check(s,{days:1,now:NOW,readers});
 assert(card.items.some(x=>x.headline==='Вчера установки из Бразилии −40%'),card.items.map(x=>x.headline).join('; '));
 const quiet=await feature.check(s,{days:1,now:NOW,readers:{metrics:async()=>({series:[series('m:dau','metrics','appmetrica','AppMetrica','dau','users',season(52000),51800)],notes:[]})}});
 await js("window.petya.saveSettings({extension_anomalies:'true'})");
 await js(`view('home');showDialogueMessages([{role:'user',text:'что необычного вчера'},{role:'assistant',text:${JSON.stringify(feature.summary(card))},by:'Аномалии',extensionData:{anomalies:${JSON.stringify(card)}}},{role:'user',text:'а позавчера?'},{role:'assistant',text:'Всё спокойно.',by:'Аномалии',extensionData:{anomalies:${JSON.stringify(quiet)}}}],'Аномалии')`);
 await wait("document.querySelectorAll('.an-card').length===2");
 const n=card.items.length;
 assert.equal(await js("document.querySelectorAll('.an-card')[0].querySelectorAll('.an-item').length"),n);
 assert.equal(await js("document.querySelectorAll('.an-card')[0].querySelectorAll('svg.an-spark').length"),n);
 assert.equal(await js("[...document.querySelectorAll('.an-item .an-headline')].some(h=>h.textContent==='Вчера установки из Бразилии −40%')"),true);
 assert.equal(await js("document.querySelector('.an-item .an-headline').hasAttribute('data-no-i18n')"),true);
 assert.equal(await js("document.querySelectorAll('.an-card')[0].querySelectorAll('.an-point.bad').length"),n,'every anomaly here is bad news');
 assert.equal(await js("[...document.querySelectorAll('.an-item')].find(i=>/Бразилии/.test(i.textContent)).querySelectorAll('.an-base').length"),4,'four same-weekday baseline days');
 assert.equal(await js("[...document.querySelectorAll('.an-item')].find(i=>/крэши/.test(i.textContent)).textContent.includes('короткая история')"),true,'14-day crash stats are marked');
 assert.match(await js("document.querySelector('.an-notes').textContent"),/AppLovin MAX: нет данных за вчера/);
 assert.match(await js("document.querySelectorAll('.an-card')[1].textContent"),/Вчера всё в пределах обычного/);
 // «Не показывать такое»: saved by the app, hidden in place; «Отменить» removes the rule.
 await js("document.querySelector('.an-item .an-actions button.quiet').click()");
 await wait("document.querySelector('.an-item').hidden===true");
 assert.equal(await js("window.petya.feature('anomalies','status').then(r=>r.rules.length)"),1);
 await js("[...document.querySelectorAll('.kit-toast button')].find(b=>!b.classList.contains('kit-toast-close')).click()");
 await wait("document.querySelector('.an-item').hidden===false");
 assert.equal(await js("window.petya.feature('anomalies','status').then(r=>r.rules.length)"),0);
 await js("document.querySelectorAll('.kit-toast').forEach(t=>t.remove())");
 await require('./card-shot.cjs')(win,'.an-card','petya-anomalies');
 await js("document.getElementById('card-shot').remove()");
 // Settings card.
 await js("window.extensionHost.open('anomalies',{stay:true})");await wait("!!document.querySelector('[data-extension=anomalies]')");
 await js("{view('settings');const c=document.querySelector('[data-extension=anomalies]');c.hidden=false;c.querySelector('details')&&(c.querySelector('details').open=true);}");
 await wait("document.querySelector('[data-extension=anomalies] .an-sources').textContent.length>0");
 assert.equal(await js("document.querySelector('[data-extension=anomalies] .an-daily-on').checked"),true,'on by default at 09:00');
 assert.match(await js("document.querySelector('[data-extension=anomalies] .an-sources').textContent"),/Нет подключённых источников/);
 await require('./card-shot.cjs')(win,'[data-extension=anomalies]','petya-anomalies-settings',{width:700});
 console.log('Anomalies card: sparklines with baseline band and points, headline, missing data note, mute and undo, quiet card, settings passed');
}};
require('../src/main.cjs');
