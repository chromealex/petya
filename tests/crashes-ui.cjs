// «Крэши» card in the real chat with three crash sources (Sentry, Firebase Crashlytics, Google Play): totals, the
// per-source strip, the stacked chart split by source or by issue, rows grouped by source with source chips, «новый»,
// safe text, «Решено» only on Sentry rows, cross-app links; a one-source card; then end to end through the real main
// process with a fake local Sentry (settings in the «Sentry» card, a chat request answered with a card, «Решено» /
// «Отменить» reaching Sentry only when pressed) and the «Крэши» / «Firebase Crashlytics» settings cards.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160));});
 const wait=async(code,tries=200)=>{for(let i=0;i<tries;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+code.slice(0,120));};
 await js('window.chatNavigationReady');
 const today=Date.UTC(2026,10,8),DAY=86400000;
 const days=Array.from({length:7},(_,i)=>new Date(today-(6-i)*DAY).toISOString().slice(0,10));
 const row=(source,id,title,culprit,level,events,users,isNew,spark,extra={})=>({id,source,title,culprit,level,events,users,firstSeen:isNew?'2026-11-05T12:00:00Z':'2026-09-01T00:00:00Z',lastSeen:'2026-11-08T09:00:00Z',
  versions:[],platform:'Android',project:'',shortId:'',url:'https://example.test/'+source+'/'+id,unhandled:false,isNew,spark,canResolve:source==='sentry',...extra});
 const issues=[
  row('sentry','101','NullReferenceException: Object reference not set to an instance of an object','PlayerController.Update (Assets/Scripts/Player/PlayerController.cs)','fatal',4540,1210,false,[10,12,9,20,30,25,40,50,60,70,80,90,100,105],{shortId:'GAME-101',project:'game-android',unhandled:true,url:'https://my-studio.sentry.io/issues/101/'}),
  row('sentry','102','IndexOutOfRangeException: Index was outside the bounds of the array','Inventory.Add','error',1300,380,true,[0,0,0,0,0,0,0,0,0,0,40,80,90,90],{shortId:'GAME-102',project:'game-android'}),
  row('sentry','104','<img src=x onerror=alert(1)>','Shop.Purchase','warning',210,90,true,[0,0,0,0,0,0,0,0,0,5,10,20,30,30],{shortId:'GAME-104',project:'game-android'}),
  row('sentry','106','TimeoutException: Matchmaking','Net.Matchmaker.Join','error',80,30,false,[1,1,1,1,1,1,1,1,1,1,4,4,4,4],{shortId:'GAME-106',project:'game-android'}),
  row('sentry','107','KeyNotFoundException','Localization.Get','warning',40,22,false,[0,0,0,0,0,0,0,0,0,1,1,1,1,1],{shortId:'GAME-107',project:'game-android'}),
  row('crashlytics','7a1f','java.lang.NullPointerException','BattleScene.kt:214','fatal',812,301,false,[30,40,35,50,60,70,90,100,110,120,130,210,260,90],{project:'com.studio.bunker',versions:['2.3.1'],url:'https://console.firebase.google.com/project/bunker-wars-1234/crashlytics/app/android:com.studio.bunker/issues/7a1f'}),
  row('crashlytics','9c2e','UnityFramework','il2cpp::vm::Exception::Raise','fatal',133,77,true,[0,0,0,0,0,0,0,0,0,40,0,0,93,0],{platform:'iOS',project:'com.studio.bunker',versions:['2.3.1']}),
  row('google-play','aaa111','java.lang.IllegalStateException','com.studio.game.Billing.onPurchase','fatal',420,130,false,[0,0,0,0,10,0,0,0,0,0,0,150,200,0],{project:'Bunker Wars',versions:['versionCode 10420','versionCode 10422'],url:'https://play.google.com/console/developers/1/app/2/vitals/crashes/aaa111/details'}),
  row('google-play','bbb222','SIGSEGV','libunity.so','fatal',95,60,true,[0,0,0,0,0,0,0,0,0,0,30,0,65,0],{project:'Bunker Wars',versions:['versionCode 10422']})
 ];
 const sources=[
  {id:'sentry',name:'Sentry',color:'#c9a8f0',issues:5,more:false,events:6170,users:1732,fresh:2,url:'https://sentry.io/organizations/my-studio/issues/?project=11&statsPeriod=7d',scope:'my-studio / game-android',note:'',error:'',canResolve:true,crashFree:null},
  {id:'crashlytics',name:'Firebase Crashlytics',color:'#e5ce8c',issues:2,more:false,events:945,users:378,fresh:1,url:'https://console.firebase.google.com/project/bunker-wars-1234/crashlytics',scope:'com.studio.bunker',note:'',error:'',canResolve:false,crashFree:null},
  {id:'google-play',name:'Google Play',color:'#9dd9c9',issues:2,more:false,events:515,users:190,fresh:1,url:'https://play.google.com/console/',scope:'Bunker Wars',note:'',error:'',canResolve:false,crashFree:null}
 ];
 const series=[
  {id:'sentry:101',source:'sentry',label:issues[0].title,values:[250,300,350,400,450,500,525]},
  {id:'sentry:102',source:'sentry',label:issues[1].title,values:[0,0,0,120,240,270,270]},
  {id:'crashlytics:7a1f',source:'crashlytics',label:issues[5].title,values:[100,110,120,130,210,260,90]},
  {id:'google-play:aaa111',source:'google-play',label:issues[7].title,values:[0,0,0,0,150,200,0]},
  {id:'sentry:104',source:'sentry',label:issues[2].title,values:[0,0,5,10,20,30,30]},
  {id:'rest',label:'остальные',values:[1,2,42,6,35,9,70]}
 ];
 const bySource=[{id:'sentry',label:'Sentry',color:'#c9a8f0',values:[251,302,357,534,710,804,826]},{id:'crashlytics',label:'Firebase Crashlytics',color:'#e5ce8c',values:[100,110,160,130,210,353,90]},{id:'google-play',label:'Google Play',color:'#9dd9c9',values:[0,0,0,0,180,200,65]}];
 const card={sources,period:{label:'за неделю',kind:'week',from:'2026-11-01T10:00:00Z',to:'2026-11-08T10:00:00Z'},release:null,platform:null,environment:'',onlyNew:false,
  totals:{issues:9,more:false,events:7630,users:2300,fresh:4},chart:{days,series,bySource,from:'2026-11-01',to:'2026-11-08'},issues,notes:[],common:'Почти все — в игровом цикле Unity: обращение к уничтоженным объектам'};
 const single={sources:[{...sources[0],crashFree:{sessions:0.9871,users:0.9712,total:52000}}],period:{label:'после релиза 1.4.2',kind:'release',from:'2026-11-04T08:00:00Z',to:'2026-11-08T10:00:00Z'},release:{name:'1.4.2',date:'2026-11-04T08:00:00Z'},platform:null,environment:'',onlyNew:true,
  totals:{issues:2,more:false,events:1510,users:470,fresh:2},chart:{days,series:[series[1],series[4]],bySource:[{...bySource[0],values:[0,0,5,130,260,300,300]}],from:'2026-11-04',to:'2026-11-08'},issues:[issues[1],issues[2]],notes:[],common:''};
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token',extension_coder:'true',module_slack:'true',slackToken:'xoxp-ui'})");
 await js(`window.__asked=[];window.resultKit&&(window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);});
  view('home');showDialogueMessages([{role:'user',text:'какие крэши за неделю'},{role:'assistant',text:'За неделю: 9 крэшей (Sentry — 5, Firebase Crashlytics — 2, Google Play — 2).',by:'Крэши',extensionData:{crashCard:${JSON.stringify(card)}}},
   {role:'user',text:'новые крэши в Sentry после релиза 1.4.2'},{role:'assistant',text:'После релиза 1.4.2: 2 новых крэша.',by:'Крэши',extensionData:{crashCard:${JSON.stringify(single)}}}],'Крэши')`);
 await wait("document.querySelectorAll('.crash-card').length===2");
 const first="document.querySelectorAll('.crash-card')[0]",second="document.querySelectorAll('.crash-card')[1]";
 assert.equal(await js(first+".dataset.sources"),'3');
 assert.equal(await js(first+".querySelector('.crash-tile .kit-kpi-value').textContent"),'9');
 // Per-source strip: three sources, shares, counts; a click asks for that source only.
 assert.deepEqual(await js("[..."+first+".querySelectorAll('.crash-src')].map(x=>x.dataset.source)"),['sentry','crashlytics','google-play']);
 assert.match(await js(first+".querySelector('.crash-src[data-source=crashlytics] .crash-src-nums').textContent"),/^2 крэша · 945 событий$/);
 // The chart: split by source by default (three colours per day), «По крэшам» switches to the issue split.
 assert.equal(await js(first+".querySelector('.crash-chart').dataset.mode"),'source');
 assert.equal(await js(first+".querySelectorAll('.kit-bars-col')[4].querySelectorAll('.kit-bars-seg').length"),3,'three sources that day');
 assert.deepEqual(await js("[..."+first+".querySelectorAll('.kit-bars-col')[4].querySelectorAll('.kit-bars-seg')].map(s=>s.dataset.series)"),['sentry','crashlytics','google-play']);
 assert.equal(await js(first+".querySelectorAll('.kit-legend li').length"),3);
 assert.equal(await js(first+".querySelector('.crash-toggle [data-mode=source]').getAttribute('aria-pressed')"),'true');
 const sourceShot=await require('./card-shot.cjs')(win,'.crash-card','petya-crashes',{width:700});
 await js("document.getElementById('card-shot').querySelectorAll('.kit-more').forEach(d=>d.setAttribute('open',''));document.getElementById('card-shot').scrollTop=document.getElementById('card-shot').scrollHeight");
 await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(sourceShot.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("const b=document.getElementById('card-shot');b.scrollTop=0;[...b.querySelectorAll('.crash-card')].forEach(c=>document.querySelector('.message-list,#messages,main')?.append(c));b.remove()");
 await js(first+".querySelector('.crash-toggle [data-mode=issue]').click()");
 assert.equal(await js(first+".querySelector('.crash-chart').dataset.mode"),'issue');
 assert.equal(await js(first+".querySelectorAll('.kit-bars-col')[6].querySelectorAll('.kit-bars-seg').length"),5,'five issues and the rest that day (one is zero)');
 assert.equal(await js(first+".querySelectorAll('.kit-legend li').length"),6);
 assert.equal(await js(first+".querySelectorAll('.kit-legend li .crash-source').length"),5,'the issue legend names the source of each issue');
 // Rows grouped by source with chips; titles are text, never HTML; «Решено» only where the source resolves.
 assert.deepEqual(await js("[..."+first+".querySelectorAll('.crash-group')].map(g=>g.dataset.source)"),['sentry','crashlytics','google-play']);
 assert.equal(await js(first+".querySelectorAll('.crash-row').length"),9);
 assert.deepEqual(await js("[..."+first+".querySelectorAll('.crash-row')].map(r=>r.querySelector('.crash-source').textContent)"),['Sentry','Sentry','Sentry','Sentry','Sentry','Firebase Crashlytics','Firebase Crashlytics','Google Play','Google Play']);
 assert.equal(await js(first+".querySelectorAll('.crash-row .resolve').length"),5,'only Sentry rows have «Решено»');
 assert.equal(await js(first+".querySelectorAll('.crash-row[data-source=google-play] .resolve, .crash-row[data-source=crashlytics] .resolve').length"),0);
 assert.equal(await js(first+".querySelector('.crash-row[data-source=crashlytics] [data-action=open]').textContent"),'Открыть в Firebase Crashlytics');
 assert.equal(await js(first+".querySelectorAll('.crash-row .crash-new').length"),4);
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'issue titles are text, never HTML');
 assert.equal(await js(first+".querySelectorAll('.crash-title[data-no-i18n],.crash-culprit[data-no-i18n]').length"),18,'service text is not machine-translated');
 assert.equal(await js(first+".querySelector('.crash-group[data-source=sentry] .kit-more summary').textContent"),'Ещё крэши Sentry · 1');
 await js(first+".querySelector('.crash-src[data-source=google-play]').click()");
 await wait("window.__asked.length===1");
 assert.deepEqual((await js('window.__asked'))[0],['Крэши только Google Play за неделю',true]);
 // Cross-app links carry the source.
 await wait(first+".querySelector('.crash-row .kit-link[data-provider=coder]')");
 await js(first+".querySelector('.crash-row[data-source=crashlytics] .kit-link[data-provider=coder]').click()");
 await wait("window.__asked.length===2");
 assert.match((await js('window.__asked'))[1][0],/^Исправь баг в коде — крэш из Firebase Crashlytics: java\.lang\.NullPointerException в BattleScene\.kt:214/);
 // One source: no strip, the chart is one series («Всего») with «По крэшам» on demand, crash-free tile, «Открыть список в Sentry».
 assert.equal(await js(second+".querySelectorAll('.crash-src').length"),0);assert.equal(await js(second+".querySelector('.crash-chart').dataset.mode"),'total');assert.deepEqual(await js("[..."+second+".querySelectorAll('.crash-toggle button')].map(b=>b.textContent)"),['Всего','По крэшам']);
 assert.match(await js(second+".querySelectorAll('.crash-tile')[3].textContent"),/98,71%crash-free сессийпользователей: 97,12%/);
 assert.equal(await js(second+".querySelectorAll('.kit-bars-col.outside').length"),2,'days before the release are dimmed');
 assert.ok(await js("[..."+second+".querySelectorAll(':scope>.kit-actions button')].some(b=>b.textContent==='Открыть список в Sentry')"));

 // End to end through the real main process with a fake Sentry: «Sentry» settings, a chat request, resolve/undo.
 const writes=[];
 const server=require('node:http').createServer((req,res)=>{
  const u=new URL(req.url,'http://x');let body='';req.on('data',c=>body+=c);req.on('end',()=>{
   const send=v=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(v));};
   if(req.headers.authorization!=='Bearer sntrys_ui'){res.statusCode=401;return send({detail:'auth'});}
   if(u.pathname==='/api/0/organizations/my-studio/projects/')return send([{id:'11',slug:'game-android',name:'Game Android',platform:'android'}]);
   if(u.pathname==='/api/0/organizations/my-studio/issues/'&&req.method==='PUT'){writes.push([u.searchParams.get('id'),JSON.parse(body).status]);return send(JSON.parse(body));}
   if(u.pathname==='/api/0/organizations/my-studio/issues/'){const now=Date.now(),day=Math.floor(now/86400000)*86400;
    return send([{id:'201',shortId:'GAME-201',title:'NullReferenceException in live build',culprit:'Boss.Phase2',level:'fatal',count:'77',userCount:31,firstSeen:new Date(now-86400000).toISOString(),lastSeen:new Date(now).toISOString(),
     platform:'csharp',project:{id:'11',slug:'game-android'},permalink:'https://my-studio.sentry.io/issues/201/',isUnhandled:true,stats:{'14d':Array.from({length:14},(_,i)=>[day-(13-i)*86400,i>11?30:0])}}]);}
   res.statusCode=404;send({detail:'not found'});
  });
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  // «Крэши» added without any source: the answer offers the sources to connect.
  await js("window.petya.saveSettings({extension_crashes:'true'})");
  await js("submitChatCommand('какие крэши за неделю')");
  await wait("[...document.querySelectorAll('.offer-card')].some(c=>c.textContent.includes('Firebase Crashlytics'))",300);
  const offerText=await js("[...document.querySelectorAll('.offer-card')].at(-1).textContent");
  for(const name of ['Sentry','Firebase Crashlytics','Google Play'])assert.ok(offerText.includes(name),'offered: '+name);
  assert.ok(!offerText.includes('Добавлено'),'nothing is connected yet');
  assert.equal(await js("[...document.querySelectorAll('.offer-card')].at(-1).querySelectorAll('.kit-actions button.primary').length"),3,'one «Подключить» per source');
  await require('./card-shot.cjs')(win,'.offer-card','petya-crashes-offer',{width:700});
  await js("document.getElementById('card-shot').remove()");
  await js(`window.petya.saveSettings({extension_sentry:'true',sentryUrl:'http://127.0.0.1:${server.address().port}',sentryToken:'sntrys_ui',sentryOrg:'my-studio',sentryProjects:'game-android'})`);
  await js("submitChatCommand('какие крэши за неделю')");
  await wait("[...document.querySelectorAll('.crash-card .crash-title')].some(t=>t.textContent==='NullReferenceException in live build')",300);
  const live="[...document.querySelectorAll('.crash-card')].find(c=>c.querySelector('.crash-title')?.textContent==='NullReferenceException in live build')";
  assert.match(await js(live+".closest('[data-extension-presentation]')?.textContent||''"),/За неделю: 1 крэш/);
  // One source: its name is in the card header, not repeated on every row.
  assert.equal(await js(live+".querySelectorAll('.crash-row .crash-source').length"),0);assert.match(await js(live+".querySelector('.kit-key').textContent"),/Sentry/);
  assert.equal(await js(live+".querySelectorAll('.crash-new').length"),1);
  assert.deepEqual(writes,[],'reading never writes');
  // Settings cards: «Sentry» loads projects; «Крэши» lists sources; «Firebase Crashlytics» explains the export.
  await js("window.extensionHost.open('sentry',{stay:true})");await wait("!!document.querySelector('[data-extension=sentry]')");
  await js("{view('settings');const c=document.querySelector('[data-extension=sentry]');c.hidden=false;c.querySelector('details')&&(c.querySelector('details').open=true);document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'sentry'}))}");
  await wait("document.querySelectorAll('[data-extension=sentry] .sentry-projects input').length===1");
  assert.equal(await js("document.querySelector('[data-extension=sentry] .sentry-projects input').checked"),true);
  await wait("document.querySelector('[data-extension=sentry] [role=status]').textContent.startsWith('Sentry подключён')");
  assert.match(await js("document.querySelector('[data-extension=sentry] [role=status]').textContent"),/Sentry подключён\. Проектов: 1\. Отмечено: 1\./);
  await require('./card-shot.cjs')(win,'[data-extension=sentry]','petya-crashes-settings',{width:700});
  await js("document.getElementById('card-shot').remove()");
  await js("window.extensionHost.open('crashes',{stay:true})");await wait("!!document.querySelector('[data-extension=crashes]')");
  await js("{const c=document.querySelector('[data-extension=crashes]');c.hidden=false;c.querySelector('details')&&(c.querySelector('details').open=true);document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'crashes'}))}");
  await wait("document.querySelectorAll('[data-extension=crashes] .crashes-source').length===3");
  assert.equal(await js("document.querySelectorAll('[data-extension=crashes]').length"),1,'one settings card even after two crash cards mounted the app at once');
  assert.deepEqual(await js("[...document.querySelectorAll('[data-extension=crashes] .crashes-source')].map(r=>r.dataset.source+':'+r.dataset.state)"),['crashlytics:off','google-play:off','sentry:ready']);
  await require('./card-shot.cjs')(win,'[data-extension=crashes]','petya-crashes-sources',{width:700});
  await js("document.getElementById('card-shot').remove()");
  await js("window.extensionHost.open('crashlytics',{stay:true})");
  await js("{const c=document.querySelector('[data-extension=crashlytics]');if(c){c.hidden=false;c.querySelector('details')&&(c.querySelector('details').open=true);}document.dispatchEvent(new CustomEvent('petya-extension-open',{detail:'crashlytics'}))}");
  await wait("!!document.querySelector('[data-extension=crashlytics]')");
  assert.match(await js("document.querySelector('[data-extension=crashlytics]').textContent"),/BigQuery/);
  assert.equal(await js("!!document.querySelector('[data-extension=crashlytics] .crashlytics-key .delete-button')"),true,'removing the key is the shared delete button');
  await require('./card-shot.cjs')(win,'[data-extension=crashlytics]','petya-crashlytics-settings',{width:700});
  await js("document.getElementById('card-shot').remove();view('home')");
  // «Решено» / «Отменить» go through «Крэши» to the Sentry source.
  await js(live+".querySelector('.crash-row .resolve').click()");
  await wait(live+".querySelector('.crash-row').classList.contains('resolved')");
  assert.deepEqual(writes,[['201','resolved']]);
  assert.equal(await js(live+".querySelector('.crash-row .resolve').dataset.state"),'resolved');
  await js("document.querySelector('.kit-toast button:not(.kit-toast-close)').click()");
  for(let i=0;i<100;i++){if(writes.length===2&&!(await js(live+".querySelector('.crash-row').classList.contains('resolved')")))break;await new Promise(r=>setTimeout(r,30));}
  assert.deepEqual(writes,[['201','resolved'],['201','unresolved']]);
  assert.equal(await js(live+".querySelector('.crash-row .resolve').dataset.state"),'open');
 }finally{server.close();}
 console.log('Crashes card: three sources (strip, chart by source and by issue, grouped rows with chips, resolve only for Sentry), one-source card, no-source offer, Sentry end to end with resolve/undo, settings cards passed · '+sourceShot);
}};
require('../src/main.cjs');
