// «Реклама и монетизация» card in the real chat: KPI tiles, revenue by day stacked by network with the eCPM line,
// anomalies, networks with eCPM trend and fill rate, format × network table, countries, safe text, the follow-up
// «Сравнить с прошлой неделей» and «Отправить в Slack» (share-message link, connected in settings).
// The card data is produced by the extension itself from a stubbed AppLovin report (no network).
process.env.PETYA_SMOKE_TEST='1';
process.env.TZ='UTC';
const assert=require('node:assert/strict');
const DAY=86400000,iso=ms=>new Date(ms).toISOString().slice(0,10);
const NOW=new Date('2026-11-09T10:00:00Z'),YESTERDAY='2026-11-08';
const NETS={APPLOVIN_EXCHANGE:40,ADMOB_BIDDING:30,UNITY_BIDDING:15,FACEBOOK_NETWORK:10,MINTEGRAL_BIDDING:6,'<img src=x onerror=alert(1)>':3,INMOBI_BIDDING:1};
const FMTS={REWARD:[0.6,14],INTER:[0.3,9],BANNER:[0.1,0.6]};
function rows(start,end){
 const out=[];
 for(let t=Date.parse(start+'T00:00:00Z');t<=Date.parse(end+'T00:00:00Z');t+=DAY){
  const day=iso(t),wd=new Date(t).getUTCDay(),weekend=wd===0||wd===6?1.25:1,wave=1+0.08*Math.sin(t/DAY/3);
  for(const [net,w] of Object.entries(NETS))for(const [fmt,[share,ecpm]] of Object.entries(FMTS))for(const platform of ['android','ios']){
   let revenue=w*share*weekend*wave*(platform==='ios'?1.5:1)*10;
   if(day===YESTERDAY&&fmt==='REWARD'&&(net==='ADMOB_BIDDING'||net==='APPLOVIN_EXCHANGE'))revenue*=0.25;
   const impressions=Math.round(revenue/(ecpm*(net==='ADMOB_BIDDING'?1.1:1)*wave)*1000);
   out.push({day,application:'Bunker Wars',platform,network:net,ad_format:fmt,attempts:String(impressions*3),responses:String(Math.round(impressions*(net==='UNITY_BIDDING'?1.2:1.6))),impressions:String(impressions),estimated_revenue:revenue.toFixed(4)});
  }
 }
 return out;
}
async function card(command){
 const app=require('../src/extensions/ad-revenue/feature.cjs');
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{'extension_ad-revenue':'true',adRevenueApplovinKey:'applovin_report_key_1234567890'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url){const u=new URL(url);if(u.searchParams.get('columns').includes('country'))return {code:200,results:[{country:'US',impressions:'500000',estimated_revenue:'4200.5'},{country:'DE',impressions:'200000',estimated_revenue:'1300'},{country:'JP',impressions:'90000',estimated_revenue:'900'},{country:'RU',impressions:'400000',estimated_revenue:'600.25'},{country:'BR',impressions:'300000',estimated_revenue:'350'}]};
   return {code:200,results:rows(u.searchParams.get('start'),u.searchParams.get('end'))};}};
 const r=await app.adTurn(s,command,NOW);
 return {text:r.text,data:r.extensionData.adRevenue};
}
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' '+e.message);});
 await js('window.chatNavigationReady');
 const yesterday=await card('сколько заработали на рекламе вчера');
 const week=await card('упала выручка с rewarded');
 await js("window.petya.saveSettings({module_slack:'true',slackToken:'xoxp-ui'})");
 await js(`window.__asked=[];window.resultKit&&(window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);});
  view('home');showDialogueMessages([{role:'user',text:'сколько заработали на рекламе вчера'},{role:'assistant',text:${JSON.stringify(yesterday.text)},by:'Реклама и монетизация',extensionData:{adRevenue:${JSON.stringify(yesterday.data)}}},
   {role:'user',text:'упала выручка с rewarded'},{role:'assistant',text:${JSON.stringify(week.text)},by:'Реклама и монетизация',extensionData:{adRevenue:${JSON.stringify(week.data)}}}],'Реклама')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.ad-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.ad-card').length"),2);
 const first="document.querySelectorAll('.ad-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.ad-tile').length"),4,'revenue, impressions, eCPM, change');
 assert.match(await js(first+".querySelector('.ad-tile .ad-value').textContent"),/\$/);
 assert.match(await js(first+".querySelectorAll('.ad-tile')[3].textContent"),/^−\d+%к обычному дню недели/);
 assert.equal(await js(first+".querySelectorAll('.ad-col').length"),14);
 assert.equal(await js(first+".querySelectorAll('.ad-col.outside').length"),13,'one day asked, two weeks for context');
 assert.equal(await js(first+".querySelectorAll('.ad-col')[13].querySelectorAll('.ad-seg').length"),6,'stacked: five networks and the rest');
 assert.equal(await js(first+".querySelectorAll('.ad-ecpm-line polyline').length"),1);
 assert.ok(await js(first+".querySelectorAll('.ad-anomaly.down').length")>=1);
 assert.equal(await js(first+".querySelectorAll('.ad-net:not(.head)').length"),7);
 assert.equal(await js(first+".querySelectorAll('.ad-table tbody tr').length"),3,'three formats');
 assert.equal(await js(first+".querySelectorAll('.ad-table thead th').length"),8,'format, five networks, rest, total');
 assert.equal(await js(first+".querySelectorAll('.ad-country').length"),5);
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'network names are text, never HTML');
 assert.ok(await js(first+".querySelectorAll('.ad-net-name span[data-no-i18n]').length")>=7,'service names are not machine-translated');
 assert.equal(await js(first+".querySelector('.kit-chip').textContent"),'просадка');
 // Actions: a follow-up request and the Slack link with the summary.
 await js(first+".querySelector(':scope>.kit-actions button').click()");
 for(let i=0;i<100;i++){if((await js('window.__asked.length'))===1)break;await new Promise(r=>setTimeout(r,30));}
 assert.deepEqual((await js('window.__asked'))[0],['Сравни выручку с рекламы за 7 дней с прошлой неделей',true]);
 for(let i=0;i<150;i++){if(await js(first+".querySelector(':scope>.kit-actions .kit-link[data-provider=slack]')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelector(':scope>.kit-actions .kit-link[data-provider=slack]').textContent"),'Отправить в Slack');
 await js(first+".querySelector(':scope>.kit-actions .kit-link[data-provider=slack]').click()");
 for(let i=0;i<100;i++){if((await js('window.__asked.length'))===2)break;await new Promise(r=>setTimeout(r,30));}
 assert.match((await js('window.__asked'))[1][0],/^Попроси команду посмотреть выручку с рекламы вчера: .+\$.+eCPM .+, больше всего — AppLovin \(\d+%\)\. Просадка: /);
 // Second card: one format, the week dimmed nowhere.
 const second="document.querySelectorAll('.ad-card')[1]";
 assert.equal(await js(second+".querySelectorAll('.ad-col.outside').length"),7,'7-day period in a 14-day chart');
 assert.match(await js(second+".querySelector('.kit-subtitle').textContent"),/за 7 дней · Rewarded/);
 const file=await require('./card-shot.cjs')(win,'.ad-card','petya-ad-revenue',{width:700});
 await js("const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight");
 await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot').remove()");
 console.log('Ad revenue card: tiles, stacked chart with eCPM, anomalies, networks, format × network, countries, follow-up and Slack link passed');
}};
require('../src/main.cjs');
