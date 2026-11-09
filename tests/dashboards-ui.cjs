// Dashboards in the app: «Сделать дашбордом» in the chat header, the dashboard in place of the chat (the sidebar
// stays), widgets drawn by the extension renderers and refreshed, the sidebar row, «В дашборд…» on an answer,
// the start screen of the project, and «Собери дашборд: …» in the chat.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const shots=process.env.DASH_SHOTS||'';
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 let step='';const js=code=>{step=code.slice(0,140);return win.webContents.executeJavaScript(code).catch(e=>{throw Error(e.message+' IN '+step);});};
 win.webContents.on('console-message',(e)=>{if(e.level==='error'||e.level===3)console.log('RENDERER',e.message);});
 const wait=async(code,label)=>{for(let i=0;i<200;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,60));}throw Error('Timeout: '+(label||code)+' DBG '+await js("JSON.stringify({screen:document.querySelector('.dash-screen')?.hidden,widgets:[...document.querySelectorAll('.dash-widget')].map(w=>w.dataset.kind+':'+w.querySelector('h3').textContent),toasts:[...document.querySelectorAll('.kit-toast,#notice')].map(t=>t.textContent).join('|'),cls:document.querySelector('#home .chat-shell')?.className})"));};
 const shot=async name=>{if(!shots)return;await js("document.getElementById('boot-splash')?.remove();document.querySelectorAll('body>.onb').forEach(n=>n.remove());document.documentElement.classList.remove('boot-landing');document.querySelectorAll('.kit-toast').forEach(n=>n.remove())");if(!win.isVisible())win.show();win.setSize(1440,900);win.webContents.invalidate();await new Promise(r=>setTimeout(r,700));const img=await win.webContents.capturePage();require('node:fs').writeFileSync(require('node:path').join(shots,name+'.png'),img.toPNG());};
 const s=globalThis.petyaTestServices;
 // A read the dashboard can refresh: the «Крэши» extension answers with a chart (stands in for Sentry here).
 const crashes=require('../src/extensions/crashes/feature.cjs');let reads=0;
 crashes.turn=async(sx,command)=>{reads++;return require('../src/extensions/app-kit.cjs').reply(sx,command,{by:'Крэши',text:'Крэшей: '+reads,data:{charts:[{type:'bars',title:'Крэши по дням',rows:[{label:'пн',value:3+reads},{label:'вт',value:5},{label:'ср',value:2}]}]}});};
 s.settings.extension_crashes='true';
 await js('window.chatNavigationReady');await js("view('home')");
 const send=require('./chat-send.cjs')(win);await js("selectDialogueTopic('')");await send('Привет');
 const id=await js('topicSelect.value');assert(id);
 const topic=s.dialogue.state.topics.find(t=>t.id===id),now=Date.now();
 topic.messages.push({role:'user',text:'Петя, крэши за неделю',at:now},{role:'assistant',text:'Крэшей: 0',by:'Крэши',extensionData:{charts:[{type:'donut',title:'Крэши',rows:[{label:'Android',value:4},{label:'iOS',value:2}]}]},at:now+1},
  {role:'user',text:'какие платформы',at:now+2},{role:'assistant',text:'Платформы',extensionData:{charts:[{type:'donut',title:'Платформы',rows:[{label:'Android',value:7},{label:'iOS',value:3}]}]},at:now+3});
 s.dialogue.persist();await js('selectDialogueTopic('+JSON.stringify(id)+')');
 // The chat header offers to make a dashboard of it.
 await wait("document.getElementById('chat-dashboard-open')?.textContent.includes('Сделать дашбордом')",'header button');
 await js("document.getElementById('chat-dashboard-open').click()");
 await wait("!document.querySelector('.dash-screen').hidden&&document.querySelectorAll('.dash-widget').length===3",'dashboard shown (the smoke greeting carries a chart too)');
 assert.equal(await js("getComputedStyle(document.querySelector('#home .chat-feed')).display"),'none','the dashboard takes the chat\'s place');
 assert(await js("!!document.querySelector('#project-sidebar')&&getComputedStyle(document.querySelector('#project-sidebar')).display!=='none'"),'the sidebar stays');
 await wait("document.querySelector('.dash-widget[data-kind=extension] .chart-card')&&document.querySelector('.dash-widget[data-kind=extension] .dash-widget-meta time')",'refreshed widget drawn by the charts renderer');
 assert(reads>=1);assert.equal(s.dialogue.state.topics.find(t=>t.id===id).messages.length,6,'refresh writes nothing to the chat');
 assert.equal(await js("document.querySelector('.dash-widget[data-kind=snapshot] .dash-widget-meta').textContent.startsWith('снимок')"),true);
 await wait("[...document.querySelectorAll('.project-dashboard-row button')].some(b=>b.getAttribute('aria-current')==='true')",'sidebar row');
 await shot('dashboard');
 // Widget menu: size.
 await js("document.querySelector('.dash-widget[data-kind=extension] .dash-widget-tools .dash-tool:last-child').click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent==='Во всю ширину')",'widget menu');
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent==='Во всю ширину').click()");
 await wait("document.querySelector('.dash-widget[data-kind=extension]')?.style.gridColumn.includes('span 12')",'full width from the menu');
 // Drag a widget by its header: it moves on the grid, the others make room, the arrangement is saved.
 const dashNow=await js("document.querySelector('.dash-screen').dataset.id");
 const drag=async(selector,dx,dy)=>js("(async()=>{const dx="+dx+",dy="+dy+";const el=document.querySelector("+JSON.stringify(selector)+");const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;const ev=(type,cx,cy)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,clientX:cx,clientY:cy,button:0,pointerId:1,isPrimary:true}));ev('pointerdown',x,y);for(let k=1;k<=6;k++){ev('pointermove',x+dx*k/6,y+dy*k/6);await new Promise(r=>setTimeout(r,16));}ev('pointerup',x+dx,y+dy);return true;})()");
 const posOf=async kind=>(await js("window.petya.feature('dashboards','peek',"+JSON.stringify(dashNow)+")")).widgets.find(w=>w.kind===kind||w.title===kind).pos;
 await wait("Promise.resolve(true)");
 // Wait until every widget has its place and its height fitted to its data.
 for(let i=0;i<80;i++){const ws=(await js("window.petya.feature('dashboards','peek',"+JSON.stringify(dashNow)+")")).widgets;if(ws.every(w=>w.pos&&!w.pos.fit))break;await new Promise(r=>setTimeout(r,100));}
 await new Promise(r=>setTimeout(r,400));
 const snapBefore=await posOf('Привет');assert(snapBefore,'positions saved on first view');
 const width=await js("document.querySelector('.dash-grid.free').clientWidth");
 // The first snapshot widget goes one column-half to the right and down below the others.
 const helloId=(await js("window.petya.feature('dashboards','peek',"+JSON.stringify(dashNow)+")")).widgets.find(w=>w.title==='Привет').id;
 await drag('.dash-screen .dash-widget[data-id="'+helloId+'"] .dash-widget-title',Math.round(width/2),900);
 for(let i=0;i<40;i++){const p=await posOf('Привет');if(p&&(p.x!==snapBefore.x||p.y!==snapBefore.y))break;await new Promise(r=>setTimeout(r,100));}
 const snapAfter=await posOf('Привет');assert(snapAfter.y>snapBefore.y||snapAfter.x!==snapBefore.x,'moved: '+JSON.stringify([snapBefore,snapAfter]));
 // Resize by the corner.
 const extBefore=await posOf('extension');
 await drag(".dash-screen .dash-widget[data-kind=extension] .dash-resize",-Math.round(width/2),120);
 for(let i=0;i<40;i++){const p=await posOf('extension');if(p.w!==extBefore.w||p.h!==extBefore.h)break;await new Promise(r=>setTimeout(r,100));}
 const extAfter=await posOf('extension');assert(extAfter.w<extBefore.w&&extAfter.h>extBefore.h,'resized: '+JSON.stringify([extBefore,extAfter]));
 // Nothing overlaps.
 assert(await js("(()=>{const r=[...document.querySelectorAll('.dash-screen .dash-grid.free>.dash-widget')].map(w=>w.getBoundingClientRect());return r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));})()"),'no overlaps');
 await shot('arranged');
 // Adder: ready widgets of connected apps.
 await js("document.querySelector('.dash-head-tools .dash-add').click()");
 await wait("[...document.querySelectorAll('.dash-chip')].some(c=>c.textContent.includes('Новые крэши'))",'catalog chips');
 await shot('dashboard-adder');
 await js("[...document.querySelectorAll('.dash-chip')].find(c=>c.textContent.includes('Новые крэши')).click()");
 await wait("document.querySelectorAll('.dash-widget').length===4",'widget added');
 // Start screen of the project.
 await js("document.querySelector('.dash-head-tools .dash-tool').click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent.startsWith('Показывать при открытии проекта'))");
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.startsWith('Показывать при открытии проекта')).click()");
 await wait("document.querySelector('.dash-sub')?.textContent.includes('стартовый экран проекта')",'start screen noted under the title');
 // Back to the chat; a new chat shows the start dashboard under «Чем помочь?».
 await js("document.querySelector('.dash-head-title .dash-tool').click()");
 await wait("document.querySelector('.dash-screen').hidden&&getComputedStyle(document.querySelector('#home .chat-feed')).display!=='none'",'back to chat');
 await wait("document.getElementById('chat-dashboard-open').textContent.includes('Дашборд')&&!document.getElementById('chat-dashboard-open').textContent.includes('Сделать')",'header now opens it');
 await js("selectDialogueTopic('')");
 await wait("!document.querySelector('.dash-start').hidden&&document.querySelectorAll('.dash-start .dash-widget').length===4",'start screen');
 await shot('start-screen');
 // «В дашборд…» on an answer with a card.
 await js('selectDialogueTopic('+JSON.stringify(id)+')');
 await wait("[...document.querySelectorAll('.answer-menu-items button')].some(b=>b.textContent==='В дашборд…')",'pin item');
 await js("(()=>{const b=[...document.querySelectorAll('.answer-menu-items button')].filter(b=>b.textContent==='В дашборд…').at(-1);b.closest('details').open=true;b.click();})()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent==='Новый дашборд')",'pin menu');
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent==='Новый дашборд').click()");
 await wait("[...document.querySelectorAll('.kit-toast')].some(t=>t.textContent.includes('в «Мой дашборд»'))",'pinned');
 // «Собери дашборд: …» in the chat: the reply has a button that opens it.
 await send('Собери дашборд «Релиз»: крэши за неделю');
 await wait("[...document.querySelectorAll('.dash-open-reply')].some(b=>b.textContent.includes('Релиз'))",'compose reply');
 await js("[...document.querySelectorAll('.dash-open-reply')].find(b=>b.textContent.includes('Релиз')).click()");
 await wait("document.querySelector('.dash-head h1')?.textContent==='Релиз'",'composed dashboard opened');
 const rows=await js("[...document.querySelectorAll('.project-dashboard-row .project-chat-title')].map(n=>n.textContent)");
 assert(rows.includes('Релиз')&&rows.includes('Мой дашборд'),'all dashboards in the sidebar: '+rows);
 await shot('composed');
 // Jira cards on a dashboard are drawn by the Jira renderer, as in the chat.
 const jt=s.dialogue.state.topics.find(t=>t.id===id);jt.messages.push({role:'user',text:'что в работе',at:Date.now()},{role:'assistant',text:'2 задачи',jiraItems:[{key:'BW-1',site:'https://bw.atlassian.net',summary:'Падает загрузка уровня',status:'В работе',category:'indeterminate',assignee:'Полина',priority:'High',type:'Bug'},{key:'BW-2',site:'https://bw.atlassian.net',summary:'Новый экран магазина',status:'К выполнению',category:'new',assignee:'',priority:'Medium',type:'Task'}],at:Date.now()+1});
 const jdash=await js("document.querySelector('.dash-screen').dataset.id");
 s.dialogue.persist();await js("window.petya.feature('dashboards','pin',"+JSON.stringify(jdash)+","+JSON.stringify(id)+","+(jt.messages.length-1)+")");
 await js("window.openDashboard("+JSON.stringify(jdash)+")");
 await wait("document.querySelectorAll('.dash-widget .jira-issue-card').length===2",'jira widget shows the pinned card at once');
 await shot('jira');
 // A small window on top of the others: the same widgets, drawn by the card renderers; it can only read its dashboard.
 const dashId=await js("document.querySelector('.dash-screen').dataset.id");
 await js("[...document.querySelectorAll('.dash-head-tools .dash-tool')].at(-1).click()");
 await wait("[...document.querySelectorAll('.kit-menu-item')].some(b=>b.textContent.startsWith('Открыть в отдельном окне'))");
 await js("[...document.querySelectorAll('.kit-menu-item')].find(b=>b.textContent.startsWith('Открыть в отдельном окне')).click()");
 const {BrowserWindow}=require('electron');let mini;
 for(let i=0;i<100&&!mini;i++){mini=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('dashboard-window.html'));if(!mini)await new Promise(r=>setTimeout(r,60));}
 assert(mini,'the small window opened');assert(mini.isAlwaysOnTop(),'on top by default');
 const mjs=code=>mini.webContents.executeJavaScript(code);
 for(let i=0;i<150;i++){if(await mjs("!!document.querySelector('.dash-widget .chart-card')").catch(()=>false))break;await new Promise(r=>setTimeout(r,60));}
 assert(await mjs("document.querySelector('.dash-window-head h1').textContent==='Релиз'&&!!document.querySelector('.dash-widget .chart-card')"),'the small window draws the widgets');
 assert.equal(await mjs("typeof window.petya"),'undefined','the small window has no access to the rest of Petya');
 await assert.rejects(()=>mjs("window.petyaDashboard.top(false)").then(on=>{if(on!==false)throw Error('still on top');throw Error('ok');}),/ok/);
 if(shots){mini.show();mini.webContents.invalidate();await new Promise(r=>setTimeout(r,700));require('node:fs').writeFileSync(require('node:path').join(shots,'mini.png'),(await mini.webContents.capturePage()).toPNG());}
 // «В Пете» in the small window opens the dashboard in the main window.
 await js("selectDialogueTopic('')");await wait("document.querySelector('.dash-screen').hidden");
 await mjs("window.petyaDashboard.openMain()");await wait("!document.querySelector('.dash-screen').hidden&&document.querySelector('.dash-screen').dataset.id==="+JSON.stringify(dashId),'opened in the main window');
 mini.close();
 // «Собери дашборд: основные метрики проекта (из wombyte), краши и ANR»: three widgets drawn by the chat's own cards —
 // «Метрики игры» read from the wombyte Grafana, «Крэши», and the Google Play ANR card.
 {
  const metrics=require('../src/extensions/metrics/feature.cjs'),registry=require('../src/extensions/metrics/sources.cjs'),compute=require('../src/extensions/metrics/compute.cjs');
  const play=require('../src/extensions/google-play/feature.cjs').dashboard,realLoad=play.load;
  Object.assign(s.settings,{extension_metrics:'true',extension_grafana:'true',grafanaUrl:'https://dashboards.wombyte.net/?orgId=2',grafanaToken:'glsa_test',grafanaMetricMap:JSON.stringify({dau:{d:'kpi',p:1,f:'',t:'DAU',dt:'KPI'}}),
   module_googleplay:'true',googlePlayCredential:JSON.stringify({type:'oauth',client:{client_id:'c',client_secret:'x'},refresh_token:'r'})});
  const wd=d=>new Date(d+'T00:00:00Z').getUTCDay(),wave=d=>[0,180,-120,90,-60,150,-100][wd(d)];
  metrics.useSources(registry.create(s,{sources:registry.load().map(x=>x.id!=='grafana'?x:{...x,source:{...x.source,retention:undefined,fetch:async(_,q)=>{const days=compute.range(q.from,q.to);
   return {series:[{metric:'dau',unit:'users',series:days.map((d,i)=>({date:d,value:12400+wave(d)+i*14}))},{metric:'new',unit:'users',series:days.map(d=>({date:d,value:1310+(wd(d)%6===0?240:0)}))},
    {metric:'revenue',unit:'currency:USD',series:days.map((d,i)=>({date:d,value:6100+(wd(d)%6===0?1400:0)+i*9}))}]};}}})}));
  const day=(y,m,d)=>({year:y,month:m,day:d}),v=n=>({decimalValue:{value:String(n)}});
  const anr=[0.0042,0.0039,0.0047,0.0051,0.0044,0.0038,0.0041];
  play.load=(sx,command,opts)=>realLoad(new Proxy(sx,{get:(t,k)=>k!=='request'?t[k]:async(url,options={})=>{url=String(url);
   if(url.startsWith('https://oauth2.googleapis.com/token'))return {access_token:'a',expires_in:3600};
   if(url.includes('apps:search'))return {apps:[{name:'apps/com.wombyte.game',displayName:'Wombyte Game',packageName:'com.wombyte.game'}]};
   if(url.endsWith('/anrRateMetricSet'))return {freshnessInfo:{freshnesses:[{aggregationPeriod:'DAILY',latestEndTime:day(2026,11,8)}]}};
   if(url.endsWith(':query')&&options.method==='POST')return {rows:anr.map((r,i)=>({startTime:day(2026,11,1+i),metrics:[{metric:'anrRate',...v(r*1.9)},{metric:'userPerceivedAnrRate',...v(r)},{metric:'userPerceivedAnrRate7dUserWeighted',...v(0.0043)}]}))};
   throw Error('unexpected '+url);}}),command,opts);
  const days=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10));
  const issue=(id,title,culprit,events,users,isNew,spark)=>({id,source:'google-play',title,culprit,level:'fatal',events,users,firstSeen:null,lastSeen:'2026-11-08T09:00:00Z',versions:['versionCode 10422'],platform:'Android',project:'Wombyte Game',shortId:'',url:'https://play.google.com/console/',unhandled:false,isNew,spark,canResolve:false});
  const issues=[issue('a1','java.lang.IllegalStateException','com.wombyte.Billing.onPurchase',420,130,false,[2,3,1,4,6,5,8,9,7,10,12,9,11,14]),issue('b2','SIGSEGV','libunity.so',95,60,true,[0,0,0,0,0,0,0,0,0,0,30,0,65,0]),issue('c3','java.lang.OutOfMemoryError','Bitmap.createBitmap',61,40,false,[1,0,2,1,3,2,4,3,5,4,6,5,4,6])];
  const crashCard={sources:[{id:'google-play',name:'Google Play',color:'#9dd9c9',issues:3,more:false,events:576,users:230,fresh:1,url:'https://play.google.com/console/',scope:'Wombyte Game',note:'',error:'',canResolve:false,crashFree:null}],
   period:{label:'за неделю',kind:'week',from:'2026-11-01T10:00:00Z',to:'2026-11-08T10:00:00Z'},release:null,platform:null,environment:'',onlyNew:false,totals:{issues:3,more:false,events:576,users:230,fresh:1},
   chart:{days,series:[{id:'google-play:a1',source:'google-play',label:issues[0].title,values:[50,60,40,70,80,60,60]},{id:'google-play:b2',source:'google-play',label:issues[1].title,values:[0,0,0,30,0,65,0]}],bySource:[{id:'google-play',label:'Google Play',color:'#9dd9c9',values:[58,66,49,108,92,133,70]}],from:'2026-11-02',to:'2026-11-08'},issues,notes:[],common:''};
  const crashTurn=crashes.turn;
  crashes.turn=async(sx,command)=>require('../src/extensions/app-kit.cjs').reply(sx,command,{by:'Крэши',text:'За неделю: 3 крэша.',data:{crashCard}});
  try{
   await js("selectDialogueTopic('')");
   await send('Собери дашборд: основные метрики проекта (из wombyte), краши и ANR');
   await wait("[...document.querySelectorAll('.dash-open-reply')].some(b=>b.textContent.includes('Дашборд'))",'three-widget compose reply');
   await js("[...document.querySelectorAll('.dash-open-reply')].find(b=>b.textContent.includes('Дашборд')).click()");
   await wait("document.querySelectorAll('.dash-screen .dash-widget').length===3&&!!document.querySelector('.dash-screen .metrics-card')&&!!document.querySelector('.dash-screen .crash-card')&&!!document.querySelector('.dash-screen .vitals-card')",'metrics, crashes and the ANR card on the dashboard');
   assert.deepEqual(await js("[...document.querySelectorAll('.dash-screen .dash-widget h3')].map(h=>h.textContent)"),['Основные метрики проекта (из wombyte)','Краши','ANR']);
   assert.equal(await js("document.querySelectorAll('.dash-screen .dash-widget-error, .dash-screen .dash-error').length"),0,'no widget failed');
   for(let i=0;i<60;i++){const ws=(await js("window.petya.feature('dashboards','peek',document.querySelector('.dash-screen').dataset.id)")).widgets;if(ws.every(w=>w.pos&&!w.pos.fit))break;await new Promise(r=>setTimeout(r,100));}
   await new Promise(r=>setTimeout(r,400));
   assert(await js("(()=>{const r=[...document.querySelectorAll('.dash-screen .dash-grid.free>.dash-widget')].map(w=>w.getBoundingClientRect());return r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));})()"),'three widgets without overlaps');
   await shot('sources');
   await js("document.querySelector('.dash-screen').scrollTop=2000");await shot('sources-bottom');
  }finally{crashes.turn=crashTurn;play.load=realLoad;metrics.reset();}
 }
 // The analytics example: KPI tiles and line charts, marked as made-up data.
 await js("window.openDashboardExample('')");
 await wait("document.querySelector('.dash-head h1')?.textContent==='Пример · аналитика игры'&&document.querySelectorAll('.dash-widget .chart-kpi-tile').length===5&&document.querySelectorAll('.dash-widget .chart-line-svg').length===3",'analytics example');
 assert(await js("!!document.querySelector('.dash-tag.demo')&&!!document.querySelector('.dash-note')"),'made-up numbers are marked');
 // Rows are full: every row of six columns adds up to six.
 assert(await js("(()=>{const r=[...document.querySelectorAll('.dash-screen .dash-grid.free>.dash-widget')].map(w=>w.getBoundingClientRect());return r.length===7&&r.every((a,i)=>r.every((b,j)=>i===j||a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1));})()"),'example laid out without overlaps');
 await shot('example');
 await js("document.querySelector('.dash-screen').scrollTop=2000");await shot('example-bottom');
 console.log('Dashboards UI: chat → dashboard, refresh, sidebar, widget menu, adder, start screen, pin and compose passed');
}};
require('../src/main.cjs');
