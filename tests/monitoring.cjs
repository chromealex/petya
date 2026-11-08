// «Мониторинг» (src/extensions/monitoring) with fake Prometheus / Alertmanager / Grafana servers and a local HTTP
// target for uptime checks — no external network, no model: routing and near-misses, not added → null, nothing
// connected → a question, the board / alerts / uptime / why / incidents cards, a failing source, PromQL templates,
// probes (status, keyword, timeout, stubbed TLS, GET only, proxies), the silence only after the card's
// confirmation with exact matchers, background notifications with dedupe and flapping on a fake clock, and
// endpoint discovery in a Unity-like project (C# folding, #if branches per platform, env mappings, serialized
// overrides, placeholders, redacted secrets, ignore rules, proposals added only after confirmation).
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const feature=require('../src/extensions/monitoring/feature.cjs');
const Q=require('../src/extensions/monitoring/query.cjs');
const P=require('../src/extensions/monitoring/promql.cjs');
const U=require('../src/extensions/monitoring/uptime.cjs');
const H=require('../src/extensions/monitoring/http.cjs');
const D=require('../src/extensions/monitoring/discover.cjs');
const CS=require('../src/extensions/monitoring/csharp.cjs');
const Watch=require('../src/extensions/monitoring/watch.cjs');
const Store=require('../src/extensions/monitoring/store.cjs');
const M=require('../src/features/monitor-sources.cjs');
const fixture=require('./monitoring-fixture.cjs');
const MIN=60000,DAY=86400000;

// --- Fake services on one local server: /prom, /am, /grafana, /target -------------------------------------------
const seen=[];let promFails=false,flap=true,tick=0;
const T0=Date.parse('2026-11-09T12:00:00Z');
const series=(from,to,fn)=>{const out=[];for(let t=from;t<=to;t+=300)out.push([t,String(fn(t))]);return out;};
function prom(u,res){
 const q=u.searchParams.get('query')||'';
 if(promFails){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({status:'error',error:'storage is down'}));}
 if(u.pathname.endsWith('/api/v1/query')){
  assert.equal(q,'up');
  return json(res,{status:'success',data:{resultType:'vector',result:[
   {metric:{job:'api',instance:'api-1:8080'},value:[T0/1000,'1']},{metric:{job:'api',instance:'api-2:8080'},value:[T0/1000,'0']},
   {metric:{service:'payments',job:'kubernetes-pods',instance:'pay-1:8080'},value:[T0/1000,'0']},{metric:{job:'web',instance:'web-1:80'},value:[T0/1000,'1']},
   {metric:{job:'node-exporter',instance:'db-1.prod:9100'},value:[T0/1000,'1']}]}});
 }
 if(u.pathname.endsWith('/api/v1/query_range')){
  const from=Number(u.searchParams.get('start')),to=Number(u.searchParams.get('end'));
  assert.ok(Number(u.searchParams.get('step'))>=60,'step ≥ 60 s');
  if(q.startsWith('ALERTS'))return json(res,{status:'success',data:{resultType:'matrix',result:[{metric:{alertname:'PaymentsDown',service:'payments',severity:'critical'},values:series(Math.max(from,T0/1000-3*3600),T0/1000-2*3600,()=>1)}]}});
  let fn=null;
  if(q.includes('code=~"5.."')&&q.includes('web'))fn=()=>0.08;
  else if(q.includes('code=~"5.."'))fn=()=>0.001;
  else if(q.startsWith('histogram_quantile'))fn=t=>q.includes('"api"')?0.35+((t/300)%3)/10:0.12;
  else if(q.startsWith('sum(rate(http_requests_total'))fn=t=>q.includes('payments')?(t<T0/1000-1800?50:2):120+((t/300)%5)*4;
  else if(q.startsWith('up{'))fn=t=>q.includes('payments')?(t<T0/1000-1200?1:0):(t<T0/1000-600?1:0);
  return json(res,{status:'success',data:{resultType:'matrix',result:fn?[{metric:{},values:series(from,to,fn)}]:[]}});
 }
 if(u.pathname.endsWith('/api/v1/alerts'))return json(res,{status:'success',data:{alerts:[{labels:{alertname:'PaymentsDown',service:'payments',severity:'critical',instance:'pay-1:8080'},annotations:{summary:'Payments API is down'},state:'firing',activeAt:new Date(T0-20*MIN).toISOString(),value:'0'}]}});
 res.writeHead(404);res.end();
}
const silences=[];
function am(u,req,res,body){
 if(req.method==='GET'&&u.pathname.endsWith('/api/v2/alerts')){
  assert.equal(u.searchParams.get('silenced'),'true');
  return json(res,[
   {fingerprint:'f1',labels:{alertname:'PaymentsDown',service:'payments',severity:'critical',instance:'pay-1:8080'},annotations:{summary:'Payments API is down'},startsAt:new Date(T0-20*MIN).toISOString(),status:{state:'active',silencedBy:[],inhibitedBy:[]},generatorURL:'https://prom.example.com/graph?g0.expr=up'},
   {fingerprint:'f2',labels:{alertname:'HighLatency',job:'api',severity:'warning',instance:'api-1:8080'},annotations:{summary:'p95 > 1s'},startsAt:new Date(T0-90*MIN).toISOString(),status:{state:'active',silencedBy:[]}},
   {fingerprint:'f3',labels:{alertname:'DiskSoon',job:'node-exporter',instance:'db-1.prod:9100',severity:'warning'},startsAt:new Date(T0-DAY).toISOString(),status:{state:'suppressed',silencedBy:['s-old']}}]);
 }
 if(req.method==='GET'&&u.pathname.endsWith('/api/v2/silences'))return json(res,[{id:'s-old',matchers:[{name:'alertname',value:'DiskSoon',isRegex:false,isEqual:true}],startsAt:new Date(T0-DAY).toISOString(),endsAt:new Date(T0+DAY).toISOString(),createdBy:'ops',comment:'',status:{state:'active'}}]);
 if(req.method==='POST'&&u.pathname.endsWith('/api/v2/silences')){silences.push(JSON.parse(body));return json(res,{silenceID:'s-'+silences.length});}
 res.writeHead(405);res.end();
}
function grafana(u,req,res){
 if(req.headers.authorization!=='Bearer '+grafanaToken){res.writeHead(401);return res.end('{"message":"Unauthorized"}');}
 if(u.pathname.endsWith('/api/prometheus/grafana/api/v1/rules'))return json(res,{status:'success',data:{groups:[{name:'edge',rules:[
  {name:'CDN 5xx',type:'alerting',state:'firing',labels:{severity:'warning'},annotations:{summary:'CDN errors'},alerts:[{labels:{service:'cdn'},annotations:{},state:'Alerting',activeAt:new Date(T0-30*MIN).toISOString(),value:'0.07'}]},
  {name:'Quiet',type:'alerting',state:'inactive',labels:{},alerts:[{labels:{service:'web'},state:'Normal'}]}]}]}});
 res.writeHead(404);res.end();
}
function target(u,res){
 if(u.pathname==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('OK status: healthy');}
 if(u.pathname==='/down'){res.writeHead(503);return res.end('maintenance');}
 if(u.pathname==='/slow'){setTimeout(()=>{res.writeHead(200);res.end('late');},1500);return;}
 if(u.pathname==='/flap'){tick++;res.writeHead(flap?200:503);return res.end(flap?'up':'down');}
 if(u.pathname==='/redirect'){res.writeHead(302,{Location:'/health'});return res.end();}
 res.writeHead(404);res.end();
}
const json=(res,v)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
const grafanaToken=['g'.repeat(10),'h'.repeat(10)].join('_');
const server=http.createServer((req,res)=>{
 let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const u=new URL(req.url,'http://127.0.0.1');seen.push({method:req.method,path:u.pathname,query:u.search});
  if(u.pathname.startsWith('/prom'))return prom(u,res);
  if(u.pathname.startsWith('/am'))return am(u,req,res,body);
  if(u.pathname.startsWith('/grafana'))return grafana(u,req,res);
  if(u.pathname.startsWith('/target'))return target(new URL(u.pathname.slice(7)||'/','http://x'),res);
  res.writeHead(404);res.end();
 });
});
// A plain HTTP proxy for the proxy test: answers itself and records the absolute URI it was asked for.
const proxied=[];
const proxy=http.createServer((req,res)=>{proxied.push(req.url);res.writeHead(200,{'Content-Type':'text/plain'});res.end('via proxy');});

function services({settings={},dataRoot}={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{extension_monitoring:'true',...settings},dataRoot,smoke:true,requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[],activeProjectId:'general'}},
  saveSettings(patch){Object.assign(s.settings,patch);return s.settings;}};
 return s;
}
const data=r=>r.extensionData||r.messages?.at(-1)?.extensionData;

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-monitoring-'));
 const all={monitoringPrometheusUrl:base+'/prom',monitoringAlertmanagerUrl:base+'/am',monitoringGrafanaUrl:base+'/grafana',monitoringGrafanaToken:grafanaToken};

 // --- Routing and near-misses ---
 const own=['что с серверами','всё ли живое','какие алерты горят','аптайм за неделю','почему лежит api','заглуши алерт на час','инциденты за неделю','что в Grafana','лежит прод?','живы ли сервера','найди все адреса серваков в проекте','какие сервера использует игра','собери адреса серверов из кода игры'];
 for(const p of own)assert.ok(Q.about(p),'«'+p+'» is monitoring');
 const near=['мониторинг конкурентов','мониторинг упоминаний бренда','второй монитор не работает','настрой яркость монитора','аптайм компьютера','сколько аптайм у компа','поставь алерт в календаре','логи сервиса api за последний час','что с подами в kubernetes','почему падает контейнер postgres','что запущено в докере','адрес офиса','IP моего компьютера','какие эндпоинты в openapi проекта','проверь, отвечает ли staging','крэши за неделю','привет','что такое мониторинг'];
 for(const p of near)assert.ok(!Q.about(p),'«'+p+'» is not monitoring');
 assert.deepEqual(own.map(Q.intent),['overview','overview','alerts','uptime','why','silence','incidents','overview','overview','overview','discover','discover','discover']);
 assert.equal(Q.signal('почему тормозит api'),'latencyP95');assert.equal(Q.signal('много 5xx у payments'),'errorRate');
 assert.equal(Q.duration('заглуши на час').ms,3600000);assert.equal(Q.duration('на 30 минут').ms,30*MIN);assert.equal(Q.duration('на 2 часа').ms,2*3600000);assert.equal(Q.duration('заглуши'),null);
 assert.equal(Q.period('аптайм за неделю',T0,Q.DEFAULT_PERIOD.uptime).ms,7*DAY);assert.equal(Q.period('что с серверами',T0,Q.DEFAULT_PERIOD.overview).ms,6*3600000);

 // --- Not added → null; added but nothing connected → a question (no network) ---
 {const s=services({dataRoot:path.join(root,'a')});s.settings.extension_monitoring='false';assert.equal(await feature.turn(s,'что с серверами'),null);}
 {const s=services({dataRoot:path.join(root,'b')});
  for(const p of near)assert.equal(await feature.turn(s,p),null,'«'+p+'» → null');
  const r=await feature.turn(s,'что с серверами');assert.equal(r.question,true);assert.match(r.text,/Prometheus, Alertmanager или Grafana/);
  const u=await feature.turn(s,'аптайм за неделю');assert.equal(u.question,true);assert.match(u.text,/Проверок доступности пока нет/);}

 // --- PromQL templates ---
 assert.equal(P.render('errorRate',{name:'api',label:'job',value:'api'}),'sum(rate(http_requests_total{job="api",code=~"5.."}[5m])) / sum(rate(http_requests_total{job="api"}[5m]))');
 assert.equal(P.render('up',{name:'x',label:'service',value:'pay"ments\\'}),'up{service="pay\\"ments\\\\"}','values are escaped');
 assert.equal(P.render('rps',{name:'api',selector:'namespace="prod",app=~"api.*"',window:'1m'}),'sum(rate(http_requests_total{namespace="prod",app=~"api.*"}[1m]))');
 assert.equal(P.render('latencyP95',{name:'api',label:'job',value:'api',templates:{latencyP95:'max(my_latency{{{selector}}}) by ({{service}})'}}),'max(my_latency{job="api"}) by (api)');
 assert.throws(()=>P.checkSelector('job="a"} or vector(1) #'),/Селектор/);
 assert.throws(()=>P.checkTemplate('sum(rate(x[5m]))'),/selector/);
 assert.throws(()=>P.checkTemplate('x{{{selector}}} {{evil}}'),/допустимы/);
 assert.throws(()=>P.render('rps',{name:'a',label:'job',value:'a',window:'5 minutes'}),/Окно/);
 assert.deepEqual(P.judge({errorRate:0.06,latencyP95:0.5}),{status:'critical',reasons:['errorRate']});
 assert.deepEqual(P.judge({latencyP95:1.2,saturation:0.1}),{status:'warn',reasons:['latencyP95']});
 assert.deepEqual(P.judge({errorRate:0.02},{errorRate:[0.05,0.1]}),{status:'ok',reasons:[]},'per-service thresholds');

 // --- Uptime probes against the local target ---
 const now=()=>T0;
 let r=await U.probe(U.validate({url:base+'/target/health',keyword:'healthy'}),{now});
 assert.equal(r.ok,true);assert.equal(r.status,200);assert.equal(r.keywordOk,true);assert.ok(r.ms>=0);assert.equal(r.tlsDays,null);
 r=await U.probe(U.validate({url:base+'/target/health',keyword:'banana'}),{now});assert.equal(r.ok,false);assert.match(r.error,/banana/);
 r=await U.probe(U.validate({url:base+'/target/down'}),{now});assert.equal(r.ok,false);assert.equal(r.status,503);
 r=await U.probe(U.validate({url:base+'/target/down',expect:'503'}),{now});assert.equal(r.ok,true,'expected code configurable');
 r=await U.probe(U.validate({url:base+'/target/redirect'}),{now});assert.equal(r.status,302,'redirects are not followed');assert.equal(r.ok,true,'3xx is within 200-399');
 r=await U.probe(U.validate({url:base+'/target/slow',timeoutSec:1}),{now});assert.equal(r.ok,false);assert.match(r.error,/Нет ответа за 1 с/);
 r=await U.probe(U.validate({url:'https://127.0.0.1:1/x'}),{now});assert.equal(r.ok,false,'refused');
 // TLS info stubbed: days left from the certificate's validTo.
 r=await U.probe(U.validate({url:base+'/target/health'}),{now,certificate:()=>({validTo:new Date(T0+5*DAY+3600000).toISOString()})});assert.equal(r.tlsDays,5);
 r=await U.probe(U.validate({url:base+'/target/health'}),{now,certificate:()=>({validTo:new Date(T0-DAY).toISOString()})});assert.equal(r.ok,false);assert.match(r.error,/Сертификат истёк/);
 assert.ok(seen.filter(x=>x.path.startsWith('/target')).every(x=>x.method==='GET'),'probes only GET');
 r=await U.probe(U.validate({url:base+'/target/health',method:'HEAD'}),{now});assert.equal(seen.at(-1).method,'HEAD');
 assert.throws(()=>U.validate({url:base+'/target/x',method:'POST'}),/GET или HEAD/);
 assert.throws(()=>U.validate({url:'http://example.com/health'}),/только https/);
 assert.throws(()=>U.validate({url:'https://user:pw@example.com/'}),/Логин и пароль/);
 assert.throws(()=>U.validate({url:'https://example.com/',intervalMin:0}),/Интервал/);
 // Proxies: the resolver's PROXY answer, DIRECT, environment with NO_PROXY, localhost always direct.
 assert.equal(await H.proxyFor('https://example.com/',{resolveProxy:async()=>'PROXY 10.1.1.1:3128; DIRECT'}),'http://10.1.1.1:3128');
 assert.equal(await H.proxyFor('https://example.com/',{resolveProxy:async()=>'DIRECT'}),'');
 process.env.HTTPS_PROXY='http://10.2.2.2:8080';process.env.NO_PROXY='.corp.local,internal.example';
 assert.equal(await H.proxyFor('https://api.example.com/',{resolveProxy:null}),'http://10.2.2.2:8080');
 assert.equal(await H.proxyFor('https://x.corp.local/',{resolveProxy:null}),'');
 assert.equal(await H.proxyFor('https://internal.example/',{resolveProxy:null}),'');
 assert.equal(await H.proxyFor('http://127.0.0.1:9/x',{resolveProxy:async()=>'PROXY 10.1.1.1:3128'}),'','localhost direct');
 delete process.env.HTTPS_PROXY;delete process.env.NO_PROXY;
 const pr=await U.probe({url:'http://status.example.test/health',method:'GET',expect:'200',timeoutSec:5},{now,resolveProxy:async()=>'PROXY 127.0.0.1:'+proxy.address().port});
 assert.equal(pr.ok,true);assert.deepEqual(proxied,['http://status.example.test/health'],'through the proxy with an absolute URI');

 // --- Store: 30 days kept, stats and status ---
 {const st=new Store.MonitorStore({now:()=>T0});const c=st.putCheck(U.validate({url:'https://api.example.com/health',service:'api'}));
  for(let i=40*24;i>=0;i--)st.addProbe(c.id,{at:T0-i*3600000,ok:!(i>=24&&i<27),ms:100+i%7,status:i>=24&&i<27?503:200,tlsDays:20});
  st.prune();assert.ok(st.probes(c.id)[0][0]>=T0-30*DAY,'older than 30 days dropped');
  const x=U.stats(st,c,{now:T0});assert.equal(x.strip.length,30);assert.equal(x.failures.length,1);assert.equal(x.failures[0].probes,3);
  assert.ok(x.percent>0.99&&x.percent<1);assert.equal(U.status(st,c).status,'ok');
  st.addProbe(c.id,{at:T0+60000,ok:false,status:500});assert.equal(U.status(st,c).status,'warn','one failure → warn');
  st.addProbe(c.id,{at:T0+120000,ok:false,status:500});assert.equal(U.status(st,c).status,'critical','two in a row → critical');
  assert.equal(U.status(st,c).since,new Date(T0+60000).toISOString());}

 // --- Board with every source connected ---
 const s=services({settings:all,dataRoot:path.join(root,'c')});
 const setup=feature.setup(s,{now:()=>T0,electron:{}});
 await setup.ipc.saveCheck({url:base+'/target/health',name:'Сайт',service:'web',keyword:'healthy'});
 await setup.ipc.saveCheck({url:base+'/target/down',name:'Платежи health',service:'payments'});
 assert.equal(s.settings.monitoringUptimeChecks,'2','the count makes the uptime source ready');
 await U.run(Store.open(s),{now:()=>T0-2*MIN});await U.run(Store.open(s),{now:()=>T0-MIN,only:Store.open(s).checks().map(c=>c.id)});
 const realNow=Date.now;Date.now=()=>T0;
 let reply;
 try{reply=await feature.boardTurn(s,'что с серверами','overview',T0);}finally{Date.now=realNow;}
 let card=data(reply).monitorCard;
 const status=Object.fromEntries(card.services.map(x=>[x.name,x.status]));
 assert.equal(status.payments,'critical','up=0 + a critical alert + a failing check');
 assert.equal(status.api,'warn','one of two instances down');
 assert.equal(status.cdn,'warn','a Grafana warning alert makes its service «warn»');
 assert.equal(status.web,'critical','error rate 8% over the 5% threshold');
 assert.equal(status['db-1.prod'],'ok','node-exporter job → instance host');
 assert.equal(card.services[0].status,'critical','worst first');
 const pay=card.services.find(x=>x.name==='payments');
 assert.ok(pay.since&&Date.parse(pay.since)<=T0-20*MIN,'since from the up series / alert');
 const api=card.services.find(x=>x.name==='api');
 assert.ok(api.series.latencyP95.length>=10&&api.series.latencyP95.length<=49,'sparkline series, thinned');
 assert.ok(api.signals.rps>100);
 assert.deepEqual(card.alerts.map(a=>a.name).sort(),['CDN 5xx','DiskSoon','HighLatency','PaymentsDown']);
 assert.equal(card.alerts.filter(a=>a.name==='PaymentsDown').length,1,'Prometheus + Alertmanager → one row');
 assert.equal(card.alerts.find(a=>a.name==='DiskSoon').silenced,true);
 assert.equal(card.alerts.find(a=>a.name==='PaymentsDown').sources.sort().join(),'alertmanager,prometheus');
 assert.ok(card.incidents.some(e=>e.title==='PaymentsDown'&&e.kind==='alert'),'incidents from ALERTS history');
 assert.ok(card.incidents.some(e=>e.kind==='uptime'&&e.service==='payments'),'incidents from failed probes');
 assert.equal(card.uptime.length,2);assert.equal(card.uptime.find(u=>u.service==='web').percent,1);
 assert.equal(card.uptime.find(u=>u.service==='web').strip.length,30);
 assert.equal(card.canSilence,true);assert.equal(card.logs,'');
 assert.match(reply.text,/Не работает: .*payments/);
 assert.ok(!seen.some(x=>x.method==='POST'),'reading never writes');
 // Grafana's token is sent as Bearer; without it the source is not ready.
 assert.ok(card.sources.find(x=>x.id==='grafana')&&!card.sources.find(x=>x.id==='grafana').error);
 // «почему лежит payments»
 Date.now=()=>T0;try{reply=await feature.boardTurn(s,'почему лежит payments','why',T0);}finally{Date.now=realNow;}
 card=data(reply).monitorCard;
 assert.equal(card.focus.service,'payments');assert.equal(card.focus.found,true);assert.equal(card.focus.status,'critical');
 assert.ok(card.focus.reasons.some(r=>/PaymentsDown/.test(r)));assert.ok(card.focus.reasons.some(r=>/Трафик упал/.test(r)),'traffic drop from the RPS series');
 assert.ok(card.focus.reasons.some(r=>/Платежи health/.test(r)),'the failing check');
 assert.match(reply.text,/«payments»: не работает/);
 // Alerts / uptime / incidents.
 Date.now=()=>T0;try{reply=await feature.boardTurn(s,'какие алерты горят','alerts',T0);}finally{Date.now=realNow;}
 assert.match(reply.text,/Горят 3 алерта, из них критичных — 1/);
 Date.now=()=>T0;try{reply=await feature.boardTurn(s,'аптайм за неделю','uptime',T0);}finally{Date.now=realNow;}
 assert.match(reply.text,/Аптайм за неделю: .*Сайт — 100%/);
 Date.now=()=>T0;try{reply=await feature.boardTurn(s,'инциденты за неделю','incidents',T0);}finally{Date.now=realNow;}
 assert.match(reply.text,/инцидент/);
 // The logs app: added → the card offers «Логи этого сервиса».
 s.settings.extension_logs='true';Date.now=()=>T0;try{reply=await feature.boardTurn(s,'что с серверами','overview',T0);}finally{Date.now=realNow;}
 assert.equal(data(reply).monitorCard.logs,'installed');delete s.settings.extension_logs;

 // --- A failing source: the others still answer; all failing → an error reply ---
 promFails=true;
 Date.now=()=>T0;try{reply=await feature.boardTurn(s,'что с серверами','overview',T0);}finally{Date.now=realNow;}
 assert.match(data(reply).monitorCard.sources.find(x=>x.id==='prometheus').error,/HTTP 500.*storage is down/);
 assert.ok(data(reply).monitorCard.alerts.length>0,'Alertmanager still answers');
 {const s2=services({settings:{monitoringPrometheusUrl:base+'/prom'},dataRoot:path.join(root,'d')});
  const e=await feature.turn(s2,'что с серверами');assert.equal(e.error,true);assert.match(e.text,/Мониторинг · .*HTTP 500/);}
 promFails=false;
 {const s3=services({settings:{monitoringGrafanaUrl:base+'/grafana',monitoringGrafanaToken:'wrong'},dataRoot:path.join(root,'e')});
  const e=await feature.turn(s3,'какие алерты горят');assert.equal(e.error,true);assert.match(e.text,/нет доступа/);}

 // --- Silence: the chat turn only prepares; the POST happens on the card's button ---
 const {InputRequired}=require('../src/input-required.cjs');
 await assert.rejects(()=>feature.silenceTurn(s,'заглуши алерт на час',T0),e=>e instanceof InputRequired&&e.spec.options.length===2,'two alerts firing → which one');
 let asked=null;try{await feature.silenceTurn(s,'заглуши PaymentsDown',T0);}catch(e){asked=e;}
 assert.ok(asked instanceof InputRequired);assert.deepEqual(asked.spec.options,['На 30 минут','На 1 час','На 4 часа','До утра']);
 const resumed=await asked.resume('На 1 час');
 const draft=data(resumed).monitorSilence;
 assert.deepEqual(draft.matchers,[{name:'alertname',value:'PaymentsDown',isRegex:false,isEqual:true},{name:'service',value:'payments',isRegex:false,isEqual:true},{name:'instance',value:'pay-1:8080',isRegex:false,isEqual:true}]);
 assert.equal(draft.durationMs,3600000);assert.equal(draft.affected,1);assert.equal(draft.source,'alertmanager');
 assert.equal(silences.length,0,'nothing written by the chat turn');
 s.dialogue.state.topics[0].messages.at(-1).extensionData={monitorSilence:draft};
 const done=await setup.ipc.silence(draft.id);
 assert.equal(silences.length,1);assert.equal(done.id,'s-1');
 assert.deepEqual(silences[0].matchers,draft.matchers);
 assert.equal(Date.parse(silences[0].endsAt)-Date.parse(silences[0].startsAt),3600000);
 assert.equal(silences[0].createdBy,'Petya');assert.match(silences[0].comment,/1 час/);
 assert.equal(done.url,base+'/am/#/silences/s-1');
 const again=await setup.ipc.silence(draft.id);assert.equal(again.already,true);assert.equal(silences.length,1,'a second press does not create another');
 await assert.rejects(()=>setup.ipc.silence('nope'),/устарела/);
 {const r=await feature.silenceTurn(s,'заглуши алерт HighLatency на 2 часа',T0);const d=data(r).monitorSilence;
  assert.deepEqual(d.matchers.map(m=>m.name+'='+m.value),['alertname=HighLatency','job=api','instance=api-1:8080']);assert.equal(d.durationMs,2*3600000);}
 {const s4=services({settings:{monitoringPrometheusUrl:base+'/prom'},dataRoot:path.join(root,'f')});const r=await feature.turn(s4,'заглуши алерт PaymentsDown на час');assert.equal(r.question,true);assert.match(r.text,/только Alertmanager/);}

 // --- Background watch: off by default, dedupe and flapping on a fake clock ---
 {
  let clock=T0;const delivered=[];
  const s5=services({dataRoot:path.join(root,'g')});
  const st=Store.open(s5,{now:()=>clock});
  st.putCheck(U.validate({url:base+'/target/flap',service:'game',intervalMin:1}));s5.settings.monitoringUptimeChecks='1';
  const w=Watch.create(s5,{store:st,registry:()=>M.create(s5),now:()=>clock,deliver:n=>delivered.push(n),flapLimit:4,flapWindow:30*MIN});
  assert.deepEqual(await w.tick(),{skipped:true},'off until the user turns it on');
  s5.settings.monitoringWatch='true';
  const at=async up=>{flap=up;clock+=MIN;return w.tick();};
  await at(true);await at(true);assert.equal(delivered.length,0,'healthy: nothing');
  await at(false);assert.equal(delivered.length,0,'one failed probe (warn) is not news');
  await at(false);assert.equal(delivered.length,0,'critical observed once');
  await at(false);assert.equal(delivered.length,1);assert.equal(delivered[0].type,'down');assert.match(delivered[0].text,/«game» не работает/);
  await at(false);await at(false);assert.equal(delivered.length,1,'no repeats while down');
  await at(true);await at(true);assert.equal(delivered.length,2);assert.equal(delivered[1].type,'recovered');assert.match(delivered[1].text,/лежал/);assert.equal(delivered[1].kind,'success');
  for(let i=0;i<15;i++)await at(i%5>=3);
  const kinds=delivered.map(n=>n.type);
  assert.equal(kinds.filter(k=>k==='flapping').length,1,'flapping told once: '+kinds.join(','));
  const after=delivered.length;for(let i=0;i<6;i++)await at(i%2===0);assert.equal(delivered.length,after,'quiet while flapping');
  for(let i=0;i<35;i++)await at(true);
  assert.equal(delivered.at(-1).type,'recovered');assert.ok(delivered.at(-1).id==='monitoring:game','one card per service');
  assert.deepEqual(st.notices().map(n=>n.type),['recovered'],'the latest notice per service is kept for the notification center');
  // Restart: the tracker state is saved, nothing is told again.
  const w2=Watch.create(s5,{store:st,registry:()=>M.create(s5),now:()=>clock,deliver:n=>delivered.push(n)});const n0=delivered.length;
  await at(true);clock+=MIN;await w2.tick();assert.equal(delivered.length,n0);
 }

 // --- Endpoint discovery in a Unity-like project ---
 const project=fixture.create();
 const sD=services({dataRoot:path.join(root,'h')});
 const published=[];
 reply=await feature.discoverTurn(sD,'найди все адреса серваков в проекте',{roots:[project],publish:n=>published.push(n)});
 const ep=data(reply).monitorEndpoints;
 const dump=JSON.stringify(ep);
 assert.ok(!dump.includes(fixture.SECRET),'a token in a URL is redacted');assert.ok(!dump.includes(fixture.PASSWORD),'a password in a URL is redacted');
 for(const hidden of ['secret-admin','ignored-local','library.mygame','npm-junk','binary.mygame'])assert.ok(!dump.includes(hidden),hidden+' must not appear');
 const shownUrls=ep.addresses.map(a=>a.display).join('\n');
 for(const noise of ['docs.unity3d.com','schemas.android.com'])assert.ok(!shownUrls.includes(noise),noise+' is not a server');
 const byUrl=u=>ep.addresses.find(a=>a.display===u);
 const need=u=>{const a=byUrl(u);assert.ok(a,'missing '+u+'\n'+ep.addresses.map(a=>a.display).join('\n'));return a;};
 assert.ok(need('https://api.mygame.com/v1/events?token=***&app=game'));
 assert.ok(need('https://***@ftp.mygame.com/upload'));
 // C#: concatenation, interpolation, Format, Uri, UriBuilder, verbatim/raw, Path.Combine, $@.
 assert.deepEqual(need('https://api.mygame.com/v2').sources[0].via,'ServerConfig.ProdApi');
 assert.ok(need('https://api.staging.mygame.com:7777/v2').envs.includes('staging'));
 need('https://api.mygame.com/v2/profile');need('https://api.mygame.com/status');need('https://api.staging.mygame.com:7777/ping');
 need('https://verbatim.mygame.com/path');need('https://raw.mygame.com/v1');need('https://api.mygame.com/v2/saves');need('https://shop.mygame.com/v2/items');
 need('https://api.mygame.com/auth/login');
 // Provenance per resolved piece.
 const prof=need('https://api.mygame.com/v2/profile').sources[0];
 assert.equal(prof.file,'Assets/Scripts/Net/ApiClient.cs');assert.equal(prof.line,10);
 assert.ok(prof.pieces.some(p=>p.via==='ServerConfig.ProdHost'&&p.line===7)&&prof.pieces.some(p=>p.via==='ServerConfig.Scheme'),'pieces: '+JSON.stringify(prof.pieces));
 // A placeholder, never a guess.
 const rt=ep.addresses.find(a=>a.display==='https://{RuntimeHost}/api');assert.ok(rt,'runtime placeholder');
 assert.equal(rt.partial,true);assert.deepEqual(rt.holes.map(h=>[h.name,h.file,h.line,h.why]),[['RuntimeHost','Assets/Scripts/Net/ServerConfig.cs',16,'runtime']]);
 // #if branches and which builds compile them (ProjectSettings scriptingDefineSymbols).
 assert.deepEqual(ep.defines,{Android:['PRODUCTION','FIREBASE'],iOS:['STAGING'],Standalone:[]});
 const mm=need('wss://mm.mygame.com/ws');assert.deepEqual(mm.envs,['prod']);assert.equal(mm.active.PRODUCTION.platforms.Android,'all');assert.equal(mm.active.PRODUCTION.platforms.iOS,false);
 const mms=need('wss://mm.staging.mygame.com/ws');assert.deepEqual(mms.envs,['staging']);assert.equal(Object.values(mms.active)[0].platforms.iOS,'all');
 const mml=need('ws://localhost:9000/ws');assert.deepEqual(mml.envs,['dev']);assert.equal(Object.values(mml.active)[0].platforms.Standalone,'all');
 assert.equal(need('https://qa-tools.mygame.com/upload').active.DEVELOPMENT_BUILD.platforms.Android,'development');
 assert.equal(need('http://localhost:5000/debug').active.UNITY_EDITOR.editor,true);
 // Environment mappings: switch sections, switch expressions, dictionaries.
 assert.deepEqual(need('https://gw.mygame.net/stage').envs,['staging']);assert.deepEqual(need('http://10.0.0.15:8080').envs,['dev']);
 assert.deepEqual(need('https://cdn.mygame.com/bundles').envs,['prod']);assert.deepEqual(need('https://cdn-stage.mygame.com/bundles').envs,['staging']);
 assert.deepEqual(need('https://events.mygame.com/collect').envs,['prod']);assert.deepEqual(need('https://ev.mygame.io/collect').envs,['dev']);
 // Serialized defaults vs scene / prefab values.
 const def=need('https://api.mygame.com');assert.ok(def.overriddenBy?.some(o=>o.value==='https://api.staging.mygame.com'&&o.file==='Assets/Scenes/Main.unity'));
 assert.ok(need('https://api.staging.mygame.com').sources.some(s=>s.override&&s.via.startsWith('ApiClient.baseUrl')));
 assert.ok(need('lobby-eu.mygame.com').sources.some(s=>s.via.startsWith('Lobby.lobbyHost')));
 need('lobby.mygame.com:7000');need('api.mygame.com:7777');
 // A prefab instance's override in a scene (propertyPath/value), matched by the field name.
 assert.ok(need('https://lb-eu.mygame.com').sources.some(s=>s.override&&s.file==='Assets/Scenes/Lobby.unity'&&s.via.startsWith('ApiClient.leaderboardUrl')));
 assert.ok(need('https://lb.mygame.com').overriddenBy?.some(o=>o.value==='https://lb-eu.mygame.com'));
 // A ternary whose condition compares an enum: both branches.
 assert.equal(need('https://pay.mygame.com').sources[0].via,'ServerConfig.Payments');assert.deepEqual(need('https://pay.staging.mygame.com').envs,['staging']);
 // Configs, build and deploy files; environment from file names.
 assert.deepEqual(need('https://api.staging.mygame.com').envs,['staging']);
 need('game.mygame.com:7777');need('http://game-server:8080/health');need('https://api.mygame.com/healthz');
 // Categories.
 assert.equal(need('https://api2.amplitude.com/2/httpapi').category,'third');assert.equal(need('https://api2.amplitude.com/2/httpapi').vendor,'Amplitude');
 assert.equal(need('https://events.appsflyer.com/v1').type,'attribution');
 assert.equal(need('https://d111111abcdef8.cloudfront.net/[BuildTarget]').category,'cdn');assert.equal(need('https://cdn.mygame.com/bundles').category,'cdn');
 assert.equal(need('https://api.mygame.com').category,'own');
 assert.ok(ep.healthPaths.includes('/healthz'));
 assert.ok(published.some(n=>n.busy)&&published.at(-1).busy===false&&/найдены/.test(published.at(-1).title),'progress and completion in the notification center');
 assert.match(reply.text,/Нашёл \d+ адрес/);
 // «Следить за выбранными»: proposals only; checks are added by the confirmation call.
 const sDs=feature.setup(sD,{now:()=>T0,electron:{}});
 sD.dialogue.state.topics[0].messages.at(-1).extensionData={monitorEndpoints:ep};
 const props=sDs.ipc.proposeChecks(ep.id,[def.key,need('https://***@ftp.mygame.com/upload').key,need('https://raw.mygame.com/v1').key]);
 assert.equal(props.find(p=>p.address===def.key).url,'https://api.mygame.com/healthz','health path found in code on the same origin');
 assert.equal(props.find(p=>p.address===def.key).from,'code');
 assert.equal(props.find(p=>/raw\.mygame/.test(p.url)).from,'guess');
 assert.ok(!props.some(p=>p.url.includes('@')),'addresses with credentials are never probed');
 assert.equal(Store.open(sD).checks().length,0,'nothing saved by proposing');
 const added=sDs.ipc.addChecks(props.filter(p=>p.ok));assert.equal(added.added,2);assert.equal(sD.settings.monitoringUptimeChecks,'2');
 assert.equal(sDs.ipc.addChecks(props.filter(p=>p.ok)).added,0,'duplicates skipped');
 assert.throws(()=>sDs.ipc.openSource(ep.id,'../../etc/passwd'),/не найден|Некорректный/);
 // Discovery routing and the project folder.
 {const s6=services({dataRoot:path.join(root,'i')});const r6=await feature.turn(s6,'какие сервера использует игра');assert.equal(r6.question,true);assert.match(r6.text,/папки на компьютере/);}
 for(const p of ['адрес офиса','IP моего компьютера','адрес доставки пиццы'])assert.equal(await feature.turn(sD,p),null);

 // --- C# details on their own ---
 const one=src=>CS.scan([{file:'A.cs',text:src}]).found.map(x=>x.text);
 assert.deepEqual(one('class A{ const string H="h.example.com"; string U => $"https://{H}:{{8080}}/x"; }').sort(),['h.example.com','https://h.example.com:{8080}/x'].sort());
 assert.deepEqual(one('class A{ static string B = "https://a.example.com"; void F(){ var u = B + "/v1"; var v = u + "/users"; } }').sort(),['https://a.example.com','https://a.example.com/v1','https://a.example.com/v1/users']);
 assert.deepEqual(one('class A{ void F(bool p){ var u = p ? "https://prod.example.com" : "https://dev.example.com"; } }').sort(),['https://dev.example.com','https://prod.example.com']);
 assert.deepEqual(one('class A{ void F(){ var u = string.Join("/", "https://j.example.com", "a", "b"); } }'),['https://j.example.com/a/b']);
 assert.deepEqual(one('class A{ void F(){ var b = new UriBuilder { Scheme = "https", Host = "ub.example.com", Port = 8443, Path = "v1" }; } }'),['https://ub.example.com:8443/v1']);
 assert.deepEqual(one('class A{ void F(){ var u = $"https://{GetHost()}/x"; } }'),['https://{GetHost()}/x']);
 assert.equal(CS.evalCondition('PRODUCTION && !(DEBUG || UNITY_EDITOR)',new Set(['PRODUCTION'])),true);
 assert.equal(CS.envOfCondition('!DEVELOPMENT_BUILD'),'prod');assert.equal(CS.envOfCondition('STAGING'),'staging');
 assert.equal(D.redact('wss://u:p@h.example.com/x?api_key=abc&v=1'),'wss://***@h.example.com/x?api_key=***&v=1');
 assert.equal(D.redact('https://h.example.com/hooks/'+'Ab3'.repeat(10)),'https://h.example.com/hooks/***');
 assert.equal(D.redact('https://h.example.com/v1/users'),'https://h.example.com/v1/users');
 const gi=D.gitignore('build/\n*.log\n!keep.log\n/Root.txt\n**/cache/**','/p');
 assert.equal(D.ignored([gi],'/p/build',true),true);assert.equal(D.ignored([gi],'/p/a/x.log',false),true);assert.equal(D.ignored([gi],'/p/keep.log',false),false);
 assert.equal(D.ignored([gi],'/p/Root.txt',false),true);assert.equal(D.ignored([gi],'/p/sub/Root.txt',false),false);assert.equal(D.ignored([gi],'/p/a/cache/x.json',false),true);

 // --- Settings validation ---
 const v={monitoringPrometheusUrl:'https://prom.example.com/'};feature.validate(v);assert.equal(v.monitoringPrometheusUrl,'https://prom.example.com');
 assert.throws(()=>feature.validate({monitoringGrafanaUrl:'https://u:p@g.example.com'}),/логин и пароль/);
 assert.throws(()=>feature.validate({monitoringGrafanaUrl:'ftp://g.example.com'}),/https/);
 assert.throws(()=>feature.validate({monitoringPollMin:'0'}),/от 1 до 30/);
 assert.deepEqual(feature.secrets,['monitoringPrometheusToken','monitoringAlertmanagerToken','monitoringGrafanaToken']);
 assert.equal(feature.defaults.monitoringWatch,'false','background notifications off by default');
 assert.equal(feature.dashboard.accepts('что с серверами'),true);assert.equal(feature.dashboard.accepts('заглуши алерт на час'),false);

 server.close();proxy.close();fs.rmSync(root,{recursive:true,force:true});fs.rmSync(project,{recursive:true,force:true});
 console.log('Monitoring: routing and near-misses, not added / not connected, PromQL templates, uptime probes (keyword, timeout, TLS stub, GET only, proxy), 30-day store, board/why/alerts/uptime/incidents from fake Prometheus + Alertmanager + Grafana, failing sources, silence only on confirmation with exact matchers, background dedupe and flapping on a fake clock, endpoint discovery (C# folding, #if per platform, env mappings, serialized overrides, placeholders, redaction, ignore rules, confirmed checks) passed');
 process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
