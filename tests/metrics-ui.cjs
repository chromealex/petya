// «Метрики игры» card in the real chat, built from realistic AppMetrica answers by the real feature code (stubbed
// network): KPI tiles with changes, the line chart (series, hover read-out, anomaly mark, previous period on
// «Сравнить с прошлым периодом»), the retention heatmap, period / platform / version chips asking the chat,
// «Почему упало?», «Отправить в Slack» through the share-message link, two sources switching, safe text;
// then the chat request end to end (metrics added, no source → the question) and the AppMetrica settings card.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 await js('window.chatNavigationReady');
 const app=require('../src/extensions/metrics/feature.cjs'),compute=require('../src/extensions/metrics/compute.cjs'),registry=require('../src/extensions/metrics/sources.cjs');
 const DAY=86400000,t0=Date.parse('2026-09-01T00:00:00Z'),week=d=>Math.floor((Date.parse(d+'T00:00:00Z')-t0)/DAY/7),wd=d=>new Date(d+'T00:00:00Z').getUTCDay();
 // Ordinary week-to-week noise (deterministic), a small dip this week, and an outage on Wednesday 4 Nov.
 const noise=d=>[0,310,-240,150,-90,280,-200][(week(d)*3+wd(d))%7];
 const dau=d=>d==='2026-11-04'?7400:12000+(wd(d)===0||wd(d)===6?2600:0)+(wd(d)===5?900:0)+25*week(d)+noise(d)-(d>='2026-11-02'?400:0);
 const fresh=d=>1300+(wd(d)===6?300:0)+(wd(d)===0?220:0)+4*week(d);
 const revenue=d=>61000+(wd(d)===6?14000:0)+(wd(d)===0?9000:0)+300*week(d)-(d==='2026-11-04'?30000:0);
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{model:'',extension_metrics:'true',extension_appmetrica:'true',appmetricaToken:'y0',appmetricaApps:'4242',appmetricaAppNames:'{"4242":"Bunker Wars"}',appmetricaCurrency:'RUB'},requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url){
   const u=new URL(url),p=u.searchParams,list=p.get('date1')?compute.range(p.get('date1'),p.get('date2')):[];
   if(u.pathname.endsWith('/bytime')&&p.get('metrics').startsWith('ym:u:'))return {data:[{dimensions:[],metrics:[list.map(dau),list.map(fresh)]}]};
   if(u.pathname.endsWith('/bytime'))return {data:[{dimensions:[],metrics:[list.map(revenue)]}]};
   if(p.get('dimensions')==='ym:u:appVersion')return {data:['1.4.2','1.4.1','1.3.9'].map((v,i)=>({dimensions:[{name:v}],metrics:[9000-i*3000]}))};
   const rows=[];
   for(const a of list)for(const b of list){const n=(Date.parse(b)-Date.parse(a))/DAY,size=1000+(a.charCodeAt(9)%5)*40;const v=n===0?size:n===1?Math.round(size*(0.41-(a>='2026-10-26'?0.03:0))):n===7?Math.round(size*0.16):n===30?Math.round(size*0.065):null;if(v!==null)rows.push({dimensions:[{name:a},{name:b}],metrics:[v]});}
   return {data:rows};
  }};
 const NOW=new Date(2026,10,9,10,0);
 const one=(await app.metricsTurn(s,'DAU за неделю',NOW)).extensionData.metricsCard;
 const am=registry.load().find(x=>x.id==='appmetrica');
 const other={id:'gamestats',setting:'',name:'<img src=x onerror=alert(1)>',source:{ready:()=>true,fetch:async(_,q)=>({series:[{metric:'dau',unit:'users',series:compute.range(q.from,q.to).map(d=>({date:d,value:dau(d)*0.9}))}]})}};
 app.useSources(registry.create(s,{sources:[am,other]}));
 const two=(await app.metricsTurn(s,'ретеншн D1 D7 D30 за 30 дней на Android',NOW)).extensionData.metricsCard;
 app.reset();
 await js("window.petya.saveSettings({module_slack:'true',slackToken:'xoxp-ui'})");
 await js(`window.__asked=[];window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};
  view('home');showDialogueMessages(${JSON.stringify([{role:'user',text:'DAU за неделю'},{role:'assistant',text:'Метрики.',by:'Метрики игры',extensionData:{metricsCard:one}},{role:'user',text:'ретеншн D1 D7 D30 за 30 дней на Android'},{role:'assistant',text:'Ретеншн.',by:'Метрики игры',extensionData:{metricsCard:two}}])},'Метрики')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.metrics-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 const card=i=>"document.querySelectorAll('.metrics-card')["+i+"]";
 assert.equal(await js("document.querySelectorAll('.metrics-card').length"),2);
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-tile').length"),5,'DAU, new, D1, revenue, ARPDAU');
 assert.deepEqual(await js("[..."+card(0)+".querySelectorAll('.metrics-tile')].map(t=>t.dataset.kpi)"),['dau','new','d1','revenue','arpdau']);
 assert.match(await js(card(0)+".querySelector('[data-kpi=dau] .metrics-change').className"),/down/);
 assert.match(await js(card(0)+".querySelector('[data-kpi=d1] .metrics-change').textContent"),/п\.п\./);
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-svg path.line:not(.previous)').length"),2,'DAU and new by default');
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-svg circle.anomaly.down[data-date=\"2026-11-04\"]').length"),1);
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-svg rect.hit').length"),14);
 await js(card(0)+".querySelector('rect.hit[data-date=\"2026-11-04\"]').dispatchEvent(new PointerEvent('pointerenter'))");
 assert.match(await js(card(0)+".querySelector('.metrics-tip').textContent"),/4 нояб\.: DAU 7\s400 · новые игроки 1\s3\d\d · необычный день/);
 // Revenue series on, then compare with the previous period.
 await js(card(0)+".querySelector('.metrics-series[data-metric=revenue]').click()");
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-svg path.line:not(.previous)').length"),3);
 await js(card(0)+".querySelector('[data-action=compare]').click()");
 for(let i=0;i<50;i++){if(await js(card(0)+".querySelectorAll('path.previous').length===3"))break;await new Promise(r=>setTimeout(r,20));}
 assert.equal(await js(card(0)+".querySelectorAll('path.previous').length"),3);
 assert.equal(await js(card(0)+".querySelector('[data-action=compare]').dataset.state"),'on');
 // Retention heatmap and filters.
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-heat tbody tr').length"),6);
 assert.equal(await js(card(0)+".querySelectorAll('.metrics-heat td.empty').length")>0,true,'young cohorts have no D30 yet');
 assert.equal(await js(card(0)+".querySelector('.metrics-filter [aria-pressed=true]').textContent"),'7 дней');
 await js("[..."+card(0)+".querySelectorAll('.metrics-filter .kit-chip')].find(c=>c.textContent==='30 дней').click()");
 await js("[..."+card(0)+".querySelectorAll('.metrics-filter .kit-chip')].find(c=>c.textContent==='1.4.2').click()");
 await js("[..."+card(0)+".querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Почему упало?').click()");
 for(let i=0;i<50;i++){if((await js('window.__asked.length'))===3)break;await new Promise(r=>setTimeout(r,30));}
 const asked=await js('window.__asked');
 assert.deepEqual(asked[0],['Метрики игры за 30 дней',true]);assert.deepEqual(asked[1],['Метрики игры за 7 дней версии 1.4.2',true]);
 assert.match(asked[2][0],/^Почему .+ (упал на|снизился на) .+ к прошлому периоду .+\? Период за 7 дней\. Что проверить в первую очередь\?$/);
 for(let i=0;i<150;i++){if(await js(card(0)+".querySelector('.kit-actions .kit-link[data-provider=slack]')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(card(0)+".querySelector('.kit-actions .kit-link[data-provider=slack]').textContent"),'Отправить в Slack');
 // Second card: two sources with chips, the other source's name is text.
 assert.equal(await js(card(1)+".querySelectorAll('.metrics-sources .kit-chip').length"),2);
 assert.equal(await js(card(1)+".querySelectorAll('img').length"),0);
 assert.equal(await js(card(1)+".querySelector('.metrics-filter [aria-pressed=true]').textContent"),'30 дней');
 assert.equal(await js("[..."+card(1)+".querySelectorAll('.metrics-filter .kit-chip')].find(c=>c.getAttribute('aria-pressed')==='true'&&c.textContent==='Android')!==undefined"),true);
 await js(card(1)+".querySelectorAll('.metrics-sources .kit-chip')[1].click()");
 assert.equal(await js(card(1)+".querySelector('.metrics-block').dataset.source"),'gamestats');
 assert.equal(await js(card(1)+".querySelectorAll('.metrics-tile').length"),1);
 await js(card(1)+".querySelectorAll('.metrics-sources .kit-chip')[0].click()");
 await js(card(0)+".querySelector('rect.hit[data-date=\"2026-11-04\"]').dispatchEvent(new PointerEvent('pointerenter'))");
 const file=await require('./card-shot.cjs')(win,'.metrics-card','petya-metrics',{width:700});
 await js("const b=document.getElementById('card-shot');b.scrollTop=b.scrollHeight");
 await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot').remove()");
 // End to end: metrics added, AppMetrica not added → the question listing sources.
 await js("window.petya.saveSettings({extension_metrics:'true',extension_appmetrica:'false'})");
 await js("submitChatCommand('DAU за неделю')");
 for(let i=0;i<200;i++){if(await js("[...document.querySelectorAll('.message-content')].some(n=>/подключите источник данных: AppMetrica/.test(n.textContent))"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await js("[...document.querySelectorAll('.message-content')].some(n=>/подключите источник данных: AppMetrica/.test(n.textContent))"),true);
 // AppMetrica settings card.
 // Added from the catalog: the host mounts its settings script.
 await js("window.extensionHost.open('appmetrica')");
 await js("view('settings')");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('[data-extension=appmetrica]')"))break;await new Promise(r=>setTimeout(r,50));}
 assert.equal(await js("!!document.querySelector('[data-extension=appmetrica]')"),true,'AppMetrica settings card is in the form');
 await js("const c=document.querySelector('[data-extension=appmetrica]');c.hidden=false;document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'appmetrica'}))");
 for(let i=0;i<100;i++){if(await js("/Вставьте OAuth-токен/.test(document.querySelector('[data-extension=appmetrica] [role=status]')?.textContent||'')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.match(await js("document.querySelector('[data-extension=appmetrica] [role=status]').textContent"),/Вставьте OAuth-токен AppMetrica/);
 assert.equal(await js("document.querySelector('[data-extension=appmetrica] [name=appmetricaToken]').type"),'password');
 await require('./card-shot.cjs')(win,'[data-extension=appmetrica]','petya-appmetrica-settings',{width:700});
 console.log('Metrics card: KPI tiles, multi-series chart with hover, anomaly, previous period, retention heatmap, filter chips, why-dropped, Slack link, two sources, safe text, no-source question, AppMetrica settings passed · '+file);
}};
require('../src/main.cjs');
