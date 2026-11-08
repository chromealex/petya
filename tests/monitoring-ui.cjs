// «Мониторинг» cards in the real chat: the health board (status dots, sparklines, alerts with severity and age,
// the week's incidents strip, uptime with the 30-day strip, TLS chips, safe text), the «почему лежит» focus, the
// silence confirmation card (nothing written until pressed), and the endpoint discovery card built by the real
// scanner from the Unity-like fixture project (groups, env chips and filter, provenance, placeholders, #if lines,
// «Следить за выбранными» → proposals through the real main process, nothing saved before confirmation).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code).catch(e=>{throw Error('Page script failed: '+code.slice(0,160)+' — '+e.message);});
 const wait=async(code,tries=200)=>{for(let i=0;i<tries;i++){if(await js(code))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+code.slice(0,120));};
 await js('window.chatNavigationReady');
 const now=Date.now(),MIN=60000,DAY=86400000,iso=ms=>new Date(ms).toISOString();
 const wave=(n,f)=>Array.from({length:n},(_,i)=>[now-(n-1-i)*5*MIN,f(i)]);
 const svc=(name,status,since,signals,series,note='')=>({name,status,since,signals:{saturation:null,...signals},series,sources:['prometheus'],url:'',note});
 const board={mode:'overview',now,period:{label:'за 6 часов',from:iso(now-6*3600000),to:iso(now)},
  sources:[{id:'prometheus',name:'Prometheus',error:''},{id:'alertmanager',name:'Alertmanager',error:''},{id:'grafana',name:'Grafana',error:''},{id:'uptime',name:'Проверки доступности',error:''}],
  services:[
   svc('payments','critical',iso(now-23*MIN),{errorRate:0.31,latencyP95:2.4,rps:2.1},{errorRate:wave(48,i=>i<40?0.004:0.3),latencyP95:wave(48,i=>i<40?0.2:2.4),rps:wave(48,i=>i<40?52+i%5:2)},'1 из 2 экз. не отвечают'),
   svc('api','warn',iso(now-75*MIN),{errorRate:0.006,latencyP95:1.31,rps:124},{errorRate:wave(48,i=>0.004+(i%7)/1000),latencyP95:wave(48,i=>0.4+(i>30?0.9:0)+(i%3)/10),rps:wave(48,i=>110+(i%9)*3)}),
   svc('web','ok',null,{errorRate:0.001,latencyP95:0.18,rps:340},{errorRate:wave(48,i=>0.001),latencyP95:wave(48,i=>0.15+(i%4)/50),rps:wave(48,i=>300+(i%12)*6)}),
   svc('db-1.prod','ok',null,{errorRate:null,latencyP95:null,rps:null},{}),
   svc('<img src=x onerror=alert(1)>','unknown',null,{errorRate:null,latencyP95:null,rps:null},{})],
  alerts:[
   {id:'f1',name:'PaymentsDown',severity:'critical',service:'payments',startsAt:iso(now-20*MIN),labels:{alertname:'PaymentsDown',service:'payments',instance:'pay-1:8080'},annotations:{summary:'Payments API is down on pay-1'},source:'alertmanager',sources:['alertmanager','prometheus'],silenced:false,state:'firing',url:'https://prom.example.com/graph'},
   {id:'f2',name:'HighLatency',severity:'warning',service:'api',startsAt:iso(now-90*MIN),labels:{},annotations:{summary:'p95 > 1s for 15m'},source:'alertmanager',silenced:false,state:'firing',url:''},
   {id:'g1',name:'CDN 5xx',severity:'warning',service:'cdn',startsAt:iso(now-30*MIN),labels:{},annotations:{},source:'grafana',silenced:false,state:'pending',url:''},
   {id:'f3',name:'DiskSoon',severity:'warning',service:'db-1.prod',startsAt:iso(now-DAY),labels:{},annotations:{},source:'alertmanager',silenced:true,state:'firing',url:''}],
  incidents:[
   {service:'payments',title:'PaymentsDown',from:iso(now-23*MIN),to:null,kind:'alert',status:'critical',source:'alertmanager',ms:23*MIN},
   {service:'payments',title:'Платежи health: Код 503',from:iso(now-2*DAY-3*3600000),to:iso(now-2*DAY-2*3600000),kind:'uptime',status:'critical',source:'uptime',ms:3600000},
   {service:'api',title:'HighLatency',from:iso(now-4*DAY),to:iso(now-4*DAY+40*MIN),kind:'alert',status:'warn',source:'prometheus',ms:40*MIN}],
  uptime:[
   {id:'c1',name:'Сайт',url:'https://mygame.com/health',service:'web',status:'ok',percent:1,periodPercent:1,strip:Array.from({length:30},(_,i)=>i<8?null:1),last:{ok:true,ms:143,status:200},tlsDays:64},
   {id:'c2',name:'Платежи health',url:'https://pay.mygame.com/health',service:'payments',status:'critical',percent:0.9821,periodPercent:0.9821,strip:Array.from({length:30},(_,i)=>i===27?0.92:i===29?0.6:1),last:{ok:false,ms:null,status:503,error:'Код 503'},tlsDays:5}],
  tls:[{name:'Платежи health',url:'https://pay.mygame.com/health',days:5}],logs:'installed',tracker:false,canSilence:true};
 const why={...board,mode:'why',focus:{service:'payments',found:true,status:'critical',since:iso(now-23*MIN),reasons:['1 из 2 экз. не отвечают.','Алерт «PaymentsDown» (critical): Payments API is down on pay-1.','Ошибок: 31% запросов.','Трафик упал с 52.0 до 2.1 запросов/с.']}};
 const silence={id:'draft-1',source:'alertmanager',sourceName:'Alertmanager',alert:{name:'PaymentsDown',service:'payments',severity:'critical',startsAt:iso(now-20*MIN)},
  matchers:[{name:'alertname',value:'PaymentsDown',isRegex:false,isEqual:true},{name:'service',value:'payments',isRegex:false,isEqual:true},{name:'instance',value:'pay-1:8080',isRegex:false,isEqual:true}],durationMs:3600000,label:'1 час',affected:1,created:null};
 // The discovery card from the real scanner in this main process (its result is also kept for «Следить за выбранными»).
 const fixture=require('./monitoring-fixture.cjs'),project=fixture.create();
 const feature=require('../src/extensions/monitoring/feature.cjs');
 const topic={id:'t',title:'Чат',messages:[]};
 const fake={settings:{},dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[]}}};
 const reply=await feature.discoverTurn(fake,'найди все адреса серваков в проекте',{roots:[project]});
 const endpoints=reply.extensionData.monitorEndpoints;
 assert.ok(!JSON.stringify(endpoints).includes(fixture.SECRET));
 const msgs=[{role:'user',text:'что с серверами'},{role:'assistant',text:'Не работает: payments.',by:'Мониторинг',extensionData:{monitorCard:board}},
  {role:'user',text:'почему лежит payments'},{role:'assistant',text:'«payments»: не работает.',by:'Мониторинг',extensionData:{monitorCard:why}},
  {role:'user',text:'заглуши алерт на час'},{role:'assistant',text:'Заглушу.',by:'Мониторинг',extensionData:{monitorSilence:silence}},
  {role:'user',text:'найди все адреса серваков в проекте'},{role:'assistant',text:reply.text,by:'Мониторинг',extensionData:{monitorEndpoints:endpoints}}];
 await js(`view('home');showDialogueMessages(${JSON.stringify(msgs)},'Мониторинг')`);
 await wait("document.querySelectorAll('.mon-card').length===4");
 // Board.
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-svc').length"),5);
 assert.equal(await js("document.querySelector('.mon-svc[data-status=\"critical\"] .mon-svc-name').textContent"),'payments');
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-svc')[0].querySelectorAll('.mon-spark polyline').length"),3,'three sparklines');
 assert.equal(await js("document.querySelectorAll('.mon-card img').length"),0,'service text is never HTML');
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-alert').length"),4);
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-alert.silenced').length"),1);
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('[data-action=\"silence\"]').length"),2,'«Заглушить…» only for firing, not silenced');
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-day').length"),7);
 assert.equal(await js("document.querySelectorAll('.mon-card')[0].querySelectorAll('.mon-uptime .mon-cell').length"),60);
 assert.ok(await js("[...document.querySelectorAll('.mon-card')[0].querySelectorAll('.kit-actions button')].some(b=>b.textContent==='Логи этого сервиса')"));
 assert.ok(await js("document.querySelectorAll('.mon-card')[0].querySelector('.kit-chip.tone-alert')!==null"));
 // Why.
 assert.equal(await js("document.querySelectorAll('.mon-card')[1].querySelectorAll('.mon-reasons li').length"),4);
 assert.equal(await js("document.querySelectorAll('.mon-card')[1].querySelectorAll('.mon-svc').length"),1,'only the asked service');
 // Silence: matchers shown exactly, nothing sent yet.
 assert.deepEqual(await js("[...document.querySelectorAll('.mon-silence .mon-matcher')].map(x=>x.textContent)"),['alertname="PaymentsDown"','service="payments"','instance="pay-1:8080"']);
 assert.equal(await js("document.querySelector('.mon-silence').dataset.state"),'draft');
 assert.equal(await js("document.querySelector('[data-action=\"confirm-silence\"]').disabled"),false);
 // Endpoints.
 const card="document.querySelector('.mon-endpoints')";
 assert.ok(await js(card+".querySelectorAll('.mon-addr').length")>=30);
 assert.deepEqual(await js("[..."+card+".querySelectorAll('.mon-group')].map(g=>g.dataset.category)"),['own','cdn','third']);
 assert.ok(await js("[..."+card+".querySelectorAll('.mon-hole')].some(p=>p.textContent.includes('RuntimeHost')&&p.textContent.includes('ServerConfig.cs:16'))"));
 assert.ok(await js("[..."+card+".querySelectorAll('.mon-cond')].some(p=>/#if PRODUCTION → Android/.test(p.textContent))"));
 assert.ok(await js("[..."+card+".querySelectorAll('.mon-override')].length>=1"));
 assert.ok(!(await js(card+".textContent")).includes(fixture.SECRET),'no secret in the card');
 // Env filter hides other environments.
 await js("[..."+card+".querySelectorAll('.mon-filter button')].find(b=>b.dataset.env==='staging').click()");
 assert.ok(await js("[..."+card+".querySelectorAll('.mon-addr')].filter(li=>!li.hidden).every(li=>li.dataset.env.split(' ').includes('staging'))"));
 await js("[..."+card+".querySelectorAll('.mon-filter button')].find(b=>b.dataset.env==='all').click()");
 // Pick two addresses and ask for proposals through the real main process.
 await js("(()=>{const rows=[..."+card+".querySelectorAll('.mon-addr')];for(const key of ['https://api.mygame.com','https://raw.mygame.com/v1']){const li=rows.find(r=>r.dataset.key===key);li.querySelector('.mon-pick').click();}})()");
 await js("[..."+card+".querySelectorAll('.kit-actions button')].find(b=>b.textContent==='Следить за выбранными').click()");
 await wait(card+".querySelectorAll('.mon-proposal').length===2");
 assert.ok(await js("[..."+card+".querySelectorAll('.mon-proposal code')].some(c=>c.textContent==='https://api.mygame.com/healthz')"));
 assert.equal(await js(card+".querySelector('[data-action=\"confirm-checks\"]').textContent"),'Добавить проверки: 2');
 await require('./card-shot.cjs')(win,'.mon-card','petya-monitoring',{width:680});
 // The overlay scrolls: one more screenshot per screen of cards, to look at all of them.
 const height=await js("document.getElementById('card-shot').scrollHeight"),view=await js('innerHeight');
 for(let i=1;i*view<height&&i<8;i++){
  await js(`document.getElementById('card-shot').scrollTop=${i*(view-40)}`);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  win.webContents.invalidate();await new Promise(r=>setTimeout(r,250));
  require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(),'petya-monitoring-'+(i+1)+'.png'),(await win.webContents.capturePage()).toPNG());
 }
 require('node:fs').rmSync(project,{recursive:true,force:true});
 console.log('Monitoring cards: board with sparklines, alerts, incidents strip, uptime strip, TLS; why focus; silence draft with exact matchers; endpoints with groups, env filter, placeholders, #if lines, overrides and proposals before confirmation passed');
}};
require('../src/main.cjs');
