// «Крэши» card in the real chat: totals, stacked daily chart, issue rows with sparklines and «новый», safe text,
// «Решено» with undo through the feature ipc (real main process, fake local Sentry), and the tracker / Programmer / Slack
// cross-app links (connected in settings) handing their requests to the chat.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160));});
 await js('window.chatNavigationReady');
 const today=Date.UTC(2026,10,8),DAY=86400000;
 const days=Array.from({length:7},(_,i)=>new Date(today-(6-i)*DAY).toISOString().slice(0,10));
 const spark=values=>values;
 const row=(id,title,culprit,level,events,users,isNew,s,extra={})=>({id,shortId:'GAME-'+id,title,culprit,level,events,users,firstSeen:isNew?'2026-11-05T12:00:00Z':'2026-09-01T00:00:00Z',lastSeen:'2026-11-08T09:00:00Z',
  platform:'csharp',project:'game-android',url:'https://my-studio.sentry.io/issues/'+id+'/',unhandled:true,status:'unresolved',isNew,spark:spark(s),...extra});
 const issues=[
  row('101','NullReferenceException: Object reference not set to an instance of an object','PlayerController.Update (Assets/Scripts/Player/PlayerController.cs)','fatal',4540,1210,false,[10,12,9,20,30,25,40,50,60,70,80,90,100,105]),
  row('102','IndexOutOfRangeException: Index was outside the bounds of the array','Inventory.Add','error',1300,380,true,[0,0,0,0,0,0,0,0,0,0,40,80,90,90]),
  row('103','OutOfMemoryException','TextureLoader.Load','error',620,140,false,[5,5,5,5,5,5,10,10,10,10,10,20,20,20]),
  row('104','<img src=x onerror=alert(1)>','Shop.Purchase','warning',210,90,true,[0,0,0,0,0,0,0,0,0,5,10,20,30,30]),
  row('105','ANativeActivity_onCreate SIGSEGV','libunity.so','fatal',120,60,false,[2,2,2,2,2,2,2,8,8,8,8,8,8,8]),
  row('106','TimeoutException: Matchmaking','Net.Matchmaker.Join','error',80,30,false,[1,1,1,1,1,1,1,1,1,1,4,4,4,4]),
  row('107','KeyNotFoundException','Localization.Get','warning',40,22,false,[0,0,0,0,0,0,0,0,0,1,1,1,1,1])
 ];
 const series=[
  {id:'101',label:issues[0].title,values:[50,60,70,80,90,100,105].map(v=>v*5)},
  {id:'102',label:issues[1].title,values:[0,0,0,40,80,90,90].map(v=>v*3)},
  {id:'103',label:issues[2].title,values:[10,10,10,10,20,20,20].map(v=>v*4)},
  {id:'104',label:issues[3].title,values:[0,0,5,10,20,30,30]},
  {id:'105',label:issues[4].title,values:[2,8,8,8,8,8,8]},
  {id:'rest',label:'остальные',values:[5,5,6,8,8,9,10]}
 ];
 const card={org:'my-studio',projects:['game-android'],url:'https://sentry.io/organizations/my-studio/issues/?project=11&statsPeriod=7d',
  period:{label:'за неделю',kind:'week',from:'2026-11-01T10:00:00Z',to:'2026-11-08T10:00:00Z'},release:null,platform:'Android',environment:'production',onlyNew:false,
  totals:{issues:7,more:false,events:6910,users:1932,fresh:2},crashFree:null,chart:{days,series,from:'2026-11-01',to:'2026-11-08'},issues,common:'Почти все — в игровом цикле Unity на Android: обращение к уничтоженным объектам'};
 const release={...card,period:{label:'после релиза 1.4.2',kind:'release',from:'2026-11-04T08:00:00Z',to:'2026-11-08T10:00:00Z'},release:{name:'1.4.2',versions:['com.studio.game@1.4.2+102'],date:'2026-11-04T08:00:00Z'},platform:null,environment:'',onlyNew:true,
  totals:{issues:2,more:false,events:1510,users:470,fresh:2},crashFree:{sessions:0.9871,users:0.9712,total:52000},issues:[issues[1],issues[3]],common:'',
  chart:{days,series:[series[1],series[3]],from:'2026-11-04',to:'2026-11-08'}};
 await js("window.petya.saveSettings({module_jira:'true',jiraUrl:'https://acme.atlassian.net',jiraEmail:'qa@acme.dev',jiraToken:'jira-token',extension_coder:'true',module_slack:'true',slackToken:'xoxp-ui'})");
 await js(`window.__asked=[];window.resultKit&&(window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);});
  view('home');showDialogueMessages([{role:'user',text:'какие крэши за неделю на андроиде'},{role:'assistant',text:'За неделю на Android: 7 крэшей.',by:'Крэши',extensionData:{crashCard:${JSON.stringify(card)}}},
   {role:'user',text:'новые крэши после релиза 1.4.2'},{role:'assistant',text:'После релиза 1.4.2: 2 новых крэша.',by:'Крэши',extensionData:{crashCard:${JSON.stringify(release)}}}],'Крэши')`);
 for(let i=0;i<200;i++){if(await js("document.querySelectorAll('.crash-card').length===2"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.crash-card').length"),2);
 const first="document.querySelectorAll('.crash-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.crash-tile').length"),3);
 assert.equal(await js(first+".querySelector('.crash-tile .crash-value').textContent"),'7');
 assert.equal(await js(first+".querySelectorAll('.crash-col').length"),7);
 assert.equal(await js(first+".querySelectorAll('.crash-col.outside').length"),0,'a week fills the chart');
 assert.equal(await js("document.querySelectorAll('.crash-card')[1].querySelectorAll('.crash-col.outside').length"),2,'days before the release are dimmed');
 assert.equal(await js(first+".querySelectorAll('.crash-col')[6].querySelectorAll('.crash-seg').length"),6,'stacked: five issues and the rest');
 assert.equal(await js(first+".querySelectorAll('.crash-legend li').length"),6);
 assert.equal(await js(first+".querySelectorAll('.crash-row').length"),7);
 assert.equal(await js(first+".querySelectorAll('.crash-spark polyline').length"),7);
 assert.equal(await js(first+".querySelectorAll('.crash-row .crash-new').length"),2,'two «новый» chips');
 assert.equal(await js(first+".querySelectorAll('img').length"),0,'issue titles are text, never HTML');
 assert.equal(await js(first+".querySelectorAll('.crash-title[data-no-i18n],.crash-culprit[data-no-i18n]').length"),14,'service text is not machine-translated');
 assert.equal(await js(first+".querySelector('.crash-common').textContent.startsWith('Общее: ')"),true);
 assert.equal(await js(first+".querySelector('.kit-more summary').textContent"),'Ещё крэши · 2');
 // Second card: crash-free tile, only new issues.
 assert.match(await js("document.querySelectorAll('.crash-card')[1].querySelectorAll('.crash-tile')[3].textContent"),/98,71%crash-free сессийпользователей: 97,12%/);
 // Cross-app links: the connected tracker and the Programmer get the crash as chat requests for their own flows.
 for(let i=0;i<150;i++){if(await js(first+".querySelector('.crash-row .kit-link[data-provider=coder]')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js(first+".querySelector('.crash-row .kit-link[data-provider=jira]').textContent"),'В задачу Jira');
 assert.equal(await js(first+".querySelectorAll('.crash-row .kit-link-more').length"),0,'one tracker: a plain button');
 await js(first+".querySelector('.crash-row .kit-link[data-provider=jira]').click()");
 for(let i=0;i<100;i++){if((await js('window.__asked.length'))===1)break;await new Promise(r=>setTimeout(r,30));}
 await js(first+".querySelector('.crash-row .kit-link[data-provider=coder]').click()");
 for(let i=0;i<100;i++){if((await js('window.__asked.length'))===2)break;await new Promise(r=>setTimeout(r,30));}
 const asked=await js('window.__asked');
 assert.match(asked[0][0],/^Создай задачу в Jira: Баг\. Крэш GAME-101 — NullReferenceException.*Ссылка: https:\/\/my-studio\.sentry\.io\/issues\/101\//);assert.equal(asked[0][1],true);
 // New crashes this week: «Отправить в Slack» in the card actions.
 assert.equal(await js(first+".querySelector(':scope>.kit-actions .kit-link[data-provider=slack]').textContent"),'Отправить в Slack');
 assert.match(asked[1][0],/^Исправь баг в коде — крэш из Sentry: NullReferenceException.* в PlayerController\.Update/);
 const file=await require('./card-shot.cjs')(win,'.crash-card','petya-crashes',{width:700});
 // The second card and the collapsed rows are below the fold: a second picture of the scrolled overlay.
 await js("const b=document.getElementById('card-shot');b.querySelector('.kit-more')?.setAttribute('open','');b.scrollTop=b.scrollHeight");
 await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace(/\.png$/,'-2.png'),(await win.webContents.capturePage()).toPNG());
 await js("document.getElementById('card-shot').remove()");
 // End to end through the real main process: settings saved, a chat request answered by the extension from a
 // local fake Sentry, and «Решено» / «Отменить» reaching Sentry only when pressed.
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
  await js(`window.petya.saveSettings({extension_crashes:'true',sentryUrl:'http://127.0.0.1:${server.address().port}',sentryToken:'sntrys_ui',sentryOrg:'my-studio',sentryProjects:'game-android'})`);
  await js("submitChatCommand('какие крэши за неделю')");
  for(let i=0;i<300;i++){if(await js("[...document.querySelectorAll('.crash-card .crash-title')].some(t=>t.textContent==='NullReferenceException in live build')"))break;await new Promise(r=>setTimeout(r,50));}
  const live="[...document.querySelectorAll('.crash-card')].find(c=>c.querySelector('.crash-title')?.textContent==='NullReferenceException in live build')";
  assert.equal(await js('!!'+live),true,'the chat request is answered with a card');
  assert.match(await js("document.querySelector('.crash-card').closest('[data-extension-presentation]')?.textContent||''"),/За неделю: 1 крэш/);
  assert.equal(await js(live+".querySelector('.crash-title').textContent"),'NullReferenceException in live build');
  assert.equal(await js(live+".querySelectorAll('.crash-new').length"),1);
  assert.deepEqual(writes,[],'reading never writes');
  // Settings card: the project list is loaded from Sentry when the card is opened.
  await js("view('settings');const c=document.querySelector('[data-extension=crashes]');c.hidden=false;c.querySelector('details').open=true");
  for(let i=0;i<100;i++){if(await js("document.querySelectorAll('[data-extension=crashes] .crashes-projects input').length===1"))break;await new Promise(r=>setTimeout(r,30));}
  assert.equal(await js("document.querySelector('[data-extension=crashes] .crashes-projects input').checked"),true);
  assert.match(await js("document.querySelector('[data-extension=crashes] [role=status]').textContent"),/Sentry подключён\. Проектов: 1\. Отмечено: 1\./);
  assert.equal(await js("document.querySelector('[data-extension=crashes] [name=sentryOrg]').value"),'my-studio');
  await require('./card-shot.cjs')(win,'[data-extension=crashes]','petya-crashes-settings',{width:700});
  await js("document.getElementById('card-shot').remove();view('home')");
  await js(live+".querySelector('.crash-row .resolve').click()");
  for(let i=0;i<100;i++){if(await js(live+".querySelector('.crash-row').classList.contains('resolved')"))break;await new Promise(r=>setTimeout(r,30));}
  assert.deepEqual(writes,[['201','resolved']]);
  assert.equal(await js(live+".querySelector('.crash-row .resolve').dataset.state"),'resolved');
  await js("document.querySelector('.kit-toast button:not(.kit-toast-close)').click()");
  for(let i=0;i<100;i++){if(writes.length===2&&!(await js(live+".querySelector('.crash-row').classList.contains('resolved')")))break;await new Promise(r=>setTimeout(r,30));}
  assert.deepEqual(writes,[['201','resolved'],['201','unresolved']]);
  assert.equal(await js(live+".querySelector('.crash-row .resolve').dataset.state"),'open');
 }finally{server.close();}
 console.log('Crashes card: totals, stacked chart, sparklines, new chips, safe text, Jira/Programmer follow-ups, chat request end to end, resolve with undo passed · '+file);
}};
require('../src/main.cjs');
