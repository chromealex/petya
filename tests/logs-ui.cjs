// «Логи сервера» card in the real chat: query line, tiles, histogram with error stacks, error signatures with
// «Почему?» (answered through the app's call), samples, entries table with the level filter, safe text, the
// Grafana link — and a PNG to look at.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 await js('window.chatNavigationReady');
 const now=Date.now(),iso=m=>new Date(now-m*60e3).toISOString();
 const step=300e3,first=Math.floor((now-3600e3)/step)*step;
 const buckets=Array.from({length:13},(_,i)=>({t:new Date(first+i*step).toISOString(),total:[40,38,52,47,61,180,240,96,58,44,49,51,30][i],errors:[0,1,0,2,0,64,121,23,4,1,0,2,1][i],warns:0}));
 const entries=[
  {ts:iso(1),level:'error',service:'payments',message:'level=error msg="payment failed for order 10442: gateway timeout after 30000ms" user=8f14e45f-ceea-467f-a0e6-7a4e2c1b2a11',labels:{service_name:'payments',env:'prod'}},
  {ts:iso(2),level:'warn',service:'api',message:'{"level":"warn","msg":"slow request /checkout 2300ms"}',labels:{service_name:'api'}},
  {ts:iso(3),level:'error',service:'payments',message:'level=error msg="payment failed for order 10439: gateway timeout after 30000ms" user=1f14e45f-ceea-467f-a0e6-7a4e2c1b2a12',labels:{service_name:'payments'}},
  {ts:iso(4),level:'info',service:'api',message:'GET /health 200 3ms',labels:{service_name:'api'}},
  {ts:iso(5),level:'fatal',service:'payments',message:'<img src=x onerror=alert(1)> panic: nil map in refund handler',labels:{service_name:'payments'}},
  {ts:iso(6),level:'error',service:'api',message:'ERROR upstream payments timeout after 3000ms to 10.0.0.12:5432',labels:{service_name:'api'}},
  {ts:iso(7),level:'info',service:'payments',message:'level=info msg="charged order 10431" amount=4.99',labels:{service_name:'payments'}},
  {ts:iso(8),level:'debug',service:'api',message:'cache hit key=user:42',labels:{service_name:'api'}}
 ];
 const card={source:{id:'loki',name:'Loki',language:'logql'},by:'model',request:'ошибки оплаты за последний час',
  spec:{language:'logql',query:'{service_name=~"payments|api"} |~ "(?i)payment" |~ "(?i)\\\\b(error|fatal)\\\\b"',range:{from:new Date(now-3600e3).toISOString(),to:new Date(now).toISOString()},limit:200,filters:{levels:['error','fatal'],services:[],contains:['payment'],exclude:[]}},
  entries,histogram:{step,buckets,exact:true},
  groups:[{signature:'payment failed for order <n>: gateway timeout after <n>',count:184,level:'error',first:iso(34),last:iso(1),services:['payments'],samples:[entries[0].message,entries[2].message]},
   {signature:'upstream payments timeout after <n> to <ip>',count:31,level:'error',first:iso(30),last:iso(6),services:['api'],samples:[entries[5].message]},
   {signature:'<img src=x onerror=alert(1)> panic: nil map in refund handler',count:2,level:'fatal',first:iso(20),last:iso(5),services:['payments'],samples:[entries[4].message]}],
  total:886,truncated:true,notes:['Запрос составила модель и проверил Петя.'],explore:{label:'Открыть в Grafana',url:'https://grafana.example.com/explore?schemaVersion=1&panes=%7B%7D'},at:now};
 // «Почему?» goes through the app's real IPC; the model's answer is given here (the unit test checks grounding).
 const app=require('../src/extensions/logs/feature.cjs');
 app.why=async(s,group)=>{assert.match(group.signature,/payment failed/);return {cause:'Платёжный шлюз не отвечает за 30 секунд',explanation:'Все ошибки — таймаут шлюза на заказах подряд, всплеск начался около 35 минут назад.',evidence:['gateway timeout after 30000ms'],steps:['Проверить статус платёжного шлюза','Посмотреть таймауты клиента']};};
 await js(`view('home');showDialogueMessages([{role:'user',text:'ошибки оплаты за последний час'},{role:'assistant',text:'Loki за последний час: 886 строк, ошибок 219.',by:'Логи сервера',extensionData:{logs:${JSON.stringify(card)}}}],'Логи')`);
 for(let i=0;i<150;i++){if(await js("!!document.querySelector('.lg-card .lg-line')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelectorAll('.lg-card').length"),1);
 assert.equal(await js("document.querySelector('.lg-q').textContent"),card.spec.query);
 assert.equal(await js("document.querySelectorAll('.lg-col').length"),13);
 assert.equal(await js("document.querySelectorAll('.lg-group').length"),3);
 assert.equal(await js("document.querySelectorAll('.lg-card img').length"),0,'log text is never HTML');
 assert.equal(await js("document.querySelectorAll('.lg-line').length"),8);
 assert.equal(await js("document.querySelector('.lg-explore').getAttribute('href')"),card.explore.url);
 await js("document.querySelector('.lg-tab[data-mode=\"error\"]').click()");
 assert.equal(await js("document.querySelectorAll('.lg-line').length"),4,'errors filter: error + fatal');
 await js("document.querySelector('.lg-tab[data-mode=\"all\"]').click()");
 await js("document.querySelector('.lg-group .lg-mini').click()");
 for(let i=0;i<100;i++){if(await js("!!document.querySelector('.lg-cause')"))break;await new Promise(r=>setTimeout(r,30));}
 assert.equal(await js("document.querySelector('.lg-cause').textContent"),'Платёжный шлюз не отвечает за 30 секунд');
 const file=await require('./card-shot.cjs')(win,'.lg-card','petya-logs');
 // The lower half: the entries table.
 await js("document.getElementById('card-shot').scrollTop=1e5");await new Promise(r=>setTimeout(r,300));
 require('node:fs').writeFileSync(file.replace('.png','-lines.png'),(await win.webContents.capturePage()).toPNG());
 console.log('Screenshot: '+file);
 console.log('Logs card: query, histogram, signatures with «Почему?», level filter, safe text, Grafana link passed');
}};
require('../src/main.cjs');
