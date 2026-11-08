// «Кто знает» card in the real chat: ranked people with avatars, score bars split by source, collapsible evidence
// with links, safe text, «Написать в Slack» through the connected share-message app (its request goes to the chat)
// and «Пригласить на встречу» put into the composer when the calendar app is added.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 await js('window.chatNavigationReady');
 const now=Date.now(),DAY=86400000,gh='https://github.com/studio/game';
 const person=(name,role,member,points,extra={})=>({name,role,member,slackId:member?'U0'+name.length:'',points,score:Math.round(Object.values(points).reduce((a,b)=>a+b,0)*10)/10,last:null,files:[],commits:[],issues:[],threads:[],meetings:[],...extra});
 const card={topic:'сетевом коде',mode:'expert',calendar:true,at:now,
  search:{identifiers:[],paths:['net','network','netcode','multiplayer'],text:['сетев','net','network']},
  sources:[{kind:'code',state:'ok',label:'game',count:42,files:18,url:gh},{kind:'jira',state:'ok',label:'NET, GAME',count:9,url:'https://studio.atlassian.net/issues/?jql=text'},{kind:'slack',state:'ok',count:6,threads:120},{kind:'meetings',state:'off',note:'Нет записанных встреч с именами говорящих.'}],
  people:[
   person('Иван Петров','Сетевой программист',true,{code:14.2,jira:7.4,slack:2.6,meetings:0},{
    last:{short:'bd9000d0',subject:'Client keeps the session alive',at:now-5*DAY,url:gh+'/commit/bd9000d0'},
    files:[{path:'Assets/Scripts/Net/NetworkManager.cs',repo:'game',lines:842,commits:12,at:now-20*DAY,url:gh+'/blob/abc/Assets/Scripts/Net/NetworkManager.cs'},{path:'Assets/Scripts/Net/Client.cs',repo:'game',lines:310,commits:7,at:now-5*DAY,url:gh+'/blob/abc/Assets/Scripts/Net/Client.cs'},{path:'Assets/Scripts/Net/Transport/UdpTransport.cs',repo:'game',lines:120,commits:3,at:now-40*DAY,url:''}],
    commits:[{short:'bd9000d0',subject:'Client keeps the session alive',at:now-5*DAY,url:gh+'/commit/bd9000d0',lines:60},{short:'4d3b1a1a',subject:'Network manager with reconnect and exponential backoff for flaky mobile connections',at:now-20*DAY,url:gh+'/commit/4d3b1a1a',lines:120},{short:'bfabd076',subject:'Inventory sync over the network',at:now-15*DAY,url:gh+'/commit/bfabd076',lines:25,byMessage:true}],
    issues:[{key:'NET-12',summary:'Реконнект при потере сети',status:'In Progress',url:'https://studio.atlassian.net/browse/NET-12',at:now-3*DAY,roles:['исполнитель','комментарии: 2']},{key:'NET-9',summary:'Пинг скачет на 3G',status:'Done',url:'https://studio.atlassian.net/browse/NET-9',at:now-60*DAY,roles:['исполнитель']}],
    threads:[{title:'Сетевой слой',text:'Переписал сетевой слой, реконнект теперь в NetworkManager',at:now-2*DAY,url:'https://app.slack.com/archives/C1/p1762000000000100'}]}),
   person('Анна Смирнова','UI-программист',true,{code:4.1,jira:1.9,slack:1,meetings:0},{
    files:[{path:'Assets/UI/MainMenu.cs',repo:'game',lines:15,commits:1,at:now-3*DAY,url:gh+'/blob/abc/Assets/UI/MainMenu.cs'}],
    commits:[{short:'77aa01ce',subject:'Fix network error dialog in menu',at:now-3*DAY,url:gh+'/commit/77aa01ce',lines:15,byMessage:true}],
    issues:[{key:'NET-12',summary:'Реконнект при потере сети',status:'In Progress',url:'https://studio.atlassian.net/browse/NET-12',at:now-3*DAY,roles:['автор']}],
    threads:[{title:'Сетевой слой',text:'А сетевые ошибки в меню показываем?',at:now-2*DAY,url:'https://app.slack.com/archives/C1/p1762000100000200?thread_ts=1762000000.000100'}]}),
   person('Pavel Q','',false,{code:0,jira:3.3,slack:0,meetings:0},{issues:[{key:'NET-15',summary:'<img src=x onerror=alert(1)> таймауты на 3G',status:'Done',url:'https://studio.atlassian.net/browse/NET-15',at:now-200*DAY,roles:['исполнитель']}]}),
   person('Oleg K','',false,{code:1.2,jira:0,slack:0,meetings:0},{files:[{path:'Assets/Scripts/Inventory/Inventory.cs',repo:'game',lines:40,commits:1,at:now-DAY,url:gh+'/blob/abc/Assets/Scripts/Inventory/Inventory.cs'}],commits:[{short:'c0ffee12',subject:'Inventory stacking',at:now-DAY,url:gh+'/commit/c0ffee12',lines:40,byMessage:true}]}),
   person('Мария Козлова','Продюсер',true,{code:0,jira:0.8,slack:0.4,meetings:0},{issues:[{key:'GAME-3',summary:'Мультиплеер в релизе 2.0',status:'To Do',url:'https://studio.atlassian.net/browse/GAME-3',at:now-30*DAY,roles:['автор']}]}),
   person('Сергей Волков','QA',true,{code:0,jira:0.5,slack:0,meetings:0},{issues:[{key:'NET-20',summary:'Проверить сетевые ошибки',status:'To Do',url:'https://studio.atlassian.net/browse/NET-20',at:now-80*DAY,roles:['комментарии: 1']}]})
  ]};
 const last={...card,mode:'last',topic:'инвентарь',sources:card.sources.slice(0,2),people:[{...card.people[3],last:{short:'c0ffee12',subject:'Inventory stacking',at:now-DAY,url:gh+'/commit/c0ffee12'}},{...card.people[0],last:{short:'bfabd076',subject:'Inventory sync over the network',at:now-15*DAY,url:gh+'/commit/bfabd076'}}]};
 const empty={...card,topic:'квантовой физике',people:[],sources:card.sources.map(x=>x.state==='ok'?{...x,state:'empty',count:0}:x)};
 await js("window.petya.saveSettings({module_slack:'true',slackToken:'xoxp-ui','extension_who-knows':'true',extension_calendar:'true'})");
 await js(`window.__asked=[];window.resultKit.availableLinks.clear();window.resultKit.ask=async(t,o)=>{window.__asked.push([t,!!o?.send]);};
  view('home');showDialogueMessages([{role:'user',text:'Кто разбирается в сетевом коде?'},{role:'assistant',text:'По теме «сетевом коде» больше всех знают: Иван Петров.',by:'Кто знает',extensionData:{whoKnows:${JSON.stringify(card)}}},
   {role:'user',text:'кто последний трогал инвентарь'},{role:'assistant',text:'Последним «инвентарь» трогал(а) Oleg K.',by:'Кто знает',extensionData:{whoKnows:${JSON.stringify(last)}}},
   {role:'user',text:'кто разбирается в квантовой физике'},{role:'assistant',text:'Следов нет.',by:'Кто знает',extensionData:{whoKnows:${JSON.stringify(empty)}}}],'Кто знает')`);
 for(let i=0;i<150;i++){if(await js("document.querySelectorAll('.who-card').length===3&&document.querySelectorAll('.who-card .kit-link').length>=5"))break;await new Promise(r=>setTimeout(r,40));}
 assert.equal(await js("document.querySelectorAll('.who-card').length"),3);
 const first="document.querySelectorAll('.who-card')[0]";
 assert.equal(await js(first+".querySelectorAll('.who-row').length"),6);
 assert.equal(await js(first+".querySelectorAll(':scope .kit-stack>.who-row').length"),5,'five people shown, the rest behind «Ещё люди»');
 assert.equal(await js(first+".querySelector('.who-row .who-name strong').textContent"),'Иван Петров');
 assert.equal(await js(first+".querySelector('.who-row .kit-person').textContent"),'ИП','avatar with initials when no team photo');
 assert.deepEqual(await js(`[...${first}.querySelectorAll('.who-row')[0].querySelectorAll('.who-seg')].map(s=>s.dataset.source)`),['code','jira','slack'],'bar split by source, only sources with points');
 const widths=await js(`[...${first}.querySelectorAll('.who-fill')].map(f=>parseFloat(f.style.width))`);
 assert.equal(widths[0],100);assert.ok(widths[1]<widths[0]&&widths[1]>20,'bars are proportional to the top score');
 assert.equal(await js(first+".querySelectorAll('.who-details[open]').length"),0,'evidence starts collapsed');
 assert.equal(await js(first+".querySelector('.who-details a.who-path').href"),'https://github.com/studio/game/blob/abc/Assets/Scripts/Net/NetworkManager.cs');
 assert.equal(await js(first+".querySelectorAll('.who-details button.who-reveal').length"),1,'a file without a web link opens in its folder');
 assert.equal(await js(first+".querySelector('.who-details a[href*=\"browse/NET-12\"]').textContent"),'NET-12');
 assert.equal(await js("document.querySelectorAll('.who-card img').length"),0,'service text is never HTML');
 assert.equal(await js(first+".querySelectorAll('.who-outside').length"),2,'people outside «Команда» are marked');
 assert.equal(await js(first+".querySelectorAll('.who-row')[2].querySelector('.who-actions')"),null,'no Slack or calendar for a name that is not in «Команда»');
 assert.equal(await js(first+".querySelectorAll('.who-source').length"),4);
 assert.equal(await js(first+".querySelector('.who-source.off b').textContent"),'нет');
 assert.equal(await js("document.querySelectorAll('.who-card')[1].querySelector('.who-last').textContent.includes('Inventory stacking')"),true,'last-touch mode shows the latest commit');
 assert.equal(await js("document.querySelectorAll('.who-card')[2].querySelector('.who-empty')!==null"),true);
 // Actions: Slack through the share-message app (asks the channel and confirms), the calendar through the composer.
 await js(first+".querySelector('.who-row .kit-link').click()");
 for(let i=0;i<50&&!(await js('window.__asked.length'));i++)await new Promise(r=>setTimeout(r,40));
 const asked=await js('window.__asked[0]');
 assert.match(asked[0],/^Попроси команду Иван Петров, подскажи, пожалуйста, по теме «сетевом коде»/);assert.equal(asked[1],true);
 await js(first+".querySelector('.who-actions button:not(.kit-link)').click()");
 assert.deepEqual(await js('window.__asked[1]'),['Поставь встречу с Иван Петров по теме «сетевом коде» ',false]);
 await js(first+".querySelector('.who-row .who-details').open=true");
 await js("document.querySelectorAll('.who-card')[0].querySelectorAll('.who-row')[1].querySelector('.who-details').open=true");
 const file=await require('./card-shot.cjs')(win,'.who-card','petya-who-knows');
 console.log('Who knows card: '+file);
 // The whole list with evidence collapsed, and the last-touch and empty cards.
 await js("document.querySelectorAll('.who-details').forEach(d=>d.open=false);document.querySelector('.who-card .kit-more').open=true;const box=document.getElementById('card-shot'),keep=document.createElement('div');keep.append(...box.querySelectorAll('.who-card'));document.body.append(keep);box.remove()");
 console.log('Who knows list: '+await require('./card-shot.cjs')(win,'.who-card','petya-who-knows-list'));
 console.log('Who knows card: ranked people, split score bars, collapsible evidence with links, safe text, Slack and calendar actions passed');
}};
require('../src/main.cjs');
