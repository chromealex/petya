// «Закупка трафика» card in the real chat, with data produced by the app from stubbed AppLovin, Unity Ads and Meta
// reports over 14 days: tiles with CPI and ROAS, spend bars with the installs line, networks with share bars,
// campaigns with a high CPI marked, countries — and a PNG to look at.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/ua-campaigns/feature.cjs');
 const NOW=Date.parse('2026-11-09T10:00:00Z');
 const days=Array.from({length:14},(_,i)=>new Date(Date.parse('2026-10-26T00:00:00Z')+i*86400e3).toISOString().slice(0,10));
 const wave=i=>1+0.35*Math.sin(i/2)+(i===9?0.6:0);
 const report=url=>{
  if(url.includes('r.applovin.com/report'))return {code:200,results:days.flatMap((d,i)=>[
   {day:d,campaign:'BW iOS US — tier 1',campaign_id_external:'c1',country:'US',platform:'ios',impressions:String(90000*wave(i)|0),clicks:String(1800*wave(i)|0),conversions:String(240*wave(i)|0),cost:(380*wave(i)).toFixed(2)},
   {day:d,campaign:'BW Android LATAM',campaign_id_external:'c2',country:'BR',platform:'android',impressions:'60000',clicks:'1300',conversions:String(330+i*4),cost:(150+i*2).toFixed(2)}])};
  if(url.includes('services.api.unity.com'))return {data:days.flatMap((d,i)=>[{timestamp:d,campaignId:'u1',campaignName:'Rewarded playable US',country:'US',platform:'ios',starts:30000,clicks:900,installs:150+i,spend:260+i*3},
   {timestamp:d,campaignId:'u2',campaignName:'Interstitial DE',country:'DE',platform:'android',starts:20000,clicks:300,installs:40,spend:150}])};
  if(url.includes('graph.facebook.com'))return {data:days.map((d,i)=>({date_start:d,campaign_id:'f1',campaign_name:'BW Lookalike 3%',country:'US',spend:(180+i*5).toFixed(2),impressions:'40000',clicks:'700',account_currency:'USD',actions:[{action_type:'mobile_app_install',value:String(95+i)}]}))};
  if(url.includes('maxReport'))return {code:200,results:days.map(d=>({day:d,application:'BW',package_name:'x',platform:'ios',network:'AppLovin',ad_format:'REWARD',impressions:'90000',estimated_revenue:'640'}))};
  throw Error('unexpected '+url);
 };
 const topic={id:'t',title:'Закупка',messages:[]};
 const s={settings:{'extension_ua-campaigns':'true','extension_ad-revenue':'true',uaApplovinKey:'a'.repeat(40),uaUnityOrg:'1234567890',uaUnityKeyId:'k'.repeat(36),uaUnitySecret:'s'.repeat(32),uaMetaAccounts:'123456',uaMetaToken:'m'.repeat(60),adRevenueApplovinKey:'a'.repeat(40)},
  request:async url=>report(url),requestProgress:{report(){}},dialogue:{active:()=>topic,persist(){},rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};
 const r=await app.uaTurn(s,'сколько потратили на закупку за 14 дней',NOW);
 await js(`view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'сколько потратили на закупку за 14 дней'},{role:'assistant',text:r.text,by:'Закупка трафика',extensionData:r.extensionData}])},'Закупка')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.ua-card .ua-net')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.ua-card').length"),1);
 assert.equal(await js("document.querySelectorAll('.ua-bar').length"),14);
 assert.equal(await js("document.querySelectorAll('.ua-net').length"),3);
 assert.ok(await js("document.querySelectorAll('.ua-camp:not(.ua-camp-head)').length")>=5);
 assert.ok(await js("[...document.querySelectorAll('.ua-tile span')].some(n=>n.textContent==='ROAS по рекламе')"));
 const file=await require('./card-shot.cjs')(win,'.ua-card','petya-ua-campaigns');
 console.log('Screenshot: '+file);
 console.log('UA campaigns card: tiles with CPI and ROAS, daily bars and installs line, networks, campaigns, countries passed');
}};
require('../src/main.cjs');
