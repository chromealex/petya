// «Логи сервера» against fake Loki and Elasticsearch servers on localhost (real HTTP, no network): the requests each
// source sends (endpoint, LogQL/KQL → bool query, time range in ns/ISO, limit, auth headers), parsing of streams,
// hits and histograms, errors told apart; chat routing with near-misses (Docker, CI, monitoring), not added → null,
// not connected → question, the happy path card with groups and histogram, the model's query (validated, a bad one
// rebuilt), a source that needs a service → clarification, «Почему?» grounded in the lines, settings validation.
const assert=require('node:assert/strict');
const http=require('node:http');
const L=require('../src/features/log-sources.cjs');
const app=require('../src/extensions/logs/feature.cjs');
const loki=require('../src/extensions/logs/loki-source.cjs');
const es=require('../src/extensions/logs/elasticsearch-source.cjs');
const offer=require('../src/extensions/logs/offer.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const NOW=Date.now();
const iso=ms=>new Date(ms).toISOString();
const calls=[];
// Fake Loki: query_range for lines (streams) and for counts (matrix), label values; checks auth.
function lokiServer(){
 return http.createServer((req,res)=>{
  const u=new URL(req.url,'http://x');calls.push({server:'loki',path:u.pathname,query:Object.fromEntries(u.searchParams),headers:req.headers});
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  if(req.headers.authorization!=='Basic '+Buffer.from('1234:'+'t'.repeat(20)).toString('base64'))return send(401,{message:'unauthorized'});
  if(u.pathname==='/loki/api/v1/label/service_name/values')return send(200,{status:'success',data:['payments','api','worker']});
  if(u.pathname!=='/loki/api/v1/query_range')return send(404,{});
  const q=u.searchParams.get('query');
  if(q.startsWith('sum(count_over_time(')){
   const step=parseInt(u.searchParams.get('step'));const start=Math.ceil(Number(u.searchParams.get('start').slice(0,-6))/1000/step)*step;
   const errors=q.includes('(?i)\\\\b(error|err|fatal');
   return send(200,{status:'success',data:{resultType:'matrix',result:[{metric:{},values:Array.from({length:12},(_,i)=>[start+i*step,String(errors?(i%3===0?4:0):20+i)])}]}});
  }
  if(q.includes('boom'))return send(400,{message:'parse error'});
  const at=k=>String(NOW-k*60e3)+'000000';
  send(200,{status:'success',data:{resultType:'streams',result:[
   {stream:{service_name:'payments',env:'prod'},values:[[at(1),'level=error msg="payment failed for order 1001" user=8f14e45f-ceea-467f-a0e6-7a4e2c1b2a11'],[at(5),'level=error msg="payment failed for order 1002" user=1f14e45f-ceea-467f-a0e6-7a4e2c1b2a12'],[at(9),'level=info msg="charged order 1003"']]},
   {stream:{service_name:'api'},values:[[at(3),'{"level":"warn","msg":"slow request /checkout 2300ms"}'],[at(7),'ERROR upstream timeout after 3000ms to 10.0.0.12:5432']]}]}});
 });
}
function esServer(){
 return http.createServer((req,res)=>{
  let body='';req.on('data',d=>body+=d);req.on('end',()=>{
   const u=new URL(req.url,'http://x');calls.push({server:'es',path:u.pathname,method:req.method,body:body?JSON.parse(body):null,headers:req.headers});
   const send=(code,b)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
   if(req.headers.authorization!=='ApiKey '+'k'.repeat(24))return send(401,{error:'security_exception'});
   if(!/^\/[^/]+\/_search$/.test(u.pathname)||req.method!=='POST')return send(405,{});
   send(200,{timed_out:false,_shards:{failed:0},hits:{total:{value:57,relation:'eq'},hits:[
    {_source:{'@timestamp':iso(NOW-2*60e3),message:'payment declined: card_expired order=77',log:{level:'error'},service:{name:'payments'},host:{name:'node-1'}}},
    {_source:{'@timestamp':iso(NOW-4*60e3),message:'payment declined: card_expired order=78','log.level':'ERROR','service.name':'payments'}},
    {_source:{'@timestamp':iso(NOW-6*60e3),message:'ok',log:{level:'info'},kubernetes:{labels:{app:'web'}}}}]},
    aggregations:{timeline:{buckets:[{key:NOW-30*60e3,doc_count:30,errors:{doc_count:2}},{key:NOW-25*60e3,doc_count:27,errors:{doc_count:0}}]}}});
  });
 });
}
// Petya's s.request: fetch, non-OK → error with status and detail, JSON.
async function request(url,{timeoutMs,...options}={}){
 const r=await fetch(url,{...options,redirect:'error'});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.status===204?null:r.json();
}
const listen=srv=>new Promise(r=>srv.listen(0,'127.0.0.1',()=>r('http://127.0.0.1:'+srv.address().port)));
function services(settings,{model=null,messages=[]}={}){
 const topic={id:'t',title:'Чат',messages:[...messages]};
 return {settings:{extension_logs:'true',...settings},request,requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},model,topic};
}

(async()=>{
 const lokiSrv=lokiServer(),esSrv=esServer();
 const lokiUrl=await listen(lokiSrv),esUrl=await listen(esSrv);
 const LOKI={logsLokiUrl:lokiUrl,logsLokiUser:'1234',logsLokiToken:'t'.repeat(20),logsGrafanaUrl:'https://grafana.example.com',logsGrafanaDatasource:'loki-uid'};
 const ES={logsElasticUrl:esUrl,logsElasticIndex:'logs-*',logsElasticKey:'k'.repeat(24),logsKibanaUrl:'https://kibana.example.com'};
 try{
  // Routing: own phrases, monitoring's request shape, near-misses.
  for(const p of ['Логи сервера за последний час','ошибки оплаты в логах за час','логи сервиса payments за последний час','Что в Loki по api за сутки?','покажи логи прода','ошибки в Кибане за 15 минут','ошибки на проде за час','логи пода api'])
   assert.ok(app.about(p,{}),p);
  for(const p of ['логи контейнера api','логи сборки в CI','логи докера','что с серверами','какие алерты горят','сервер упал','лог чата','логин не работает','логистика заказов','Editor.log в Unity','git log за неделю','метрики сервера','ошибки оплаты в поддержке','ошибки оплаты за последний час'])
   assert.equal(app.about(p,{}),false,p);
  // Right after a logs card, short follow-ups belong to it.
  const after={dialogue:{active:()=>({messages:[{role:'assistant',by:'Логи сервера'}]})}};
  assert.ok(app.about('ошибки оплаты за последний час',after));assert.ok(app.about('а за сутки?',after));
  assert.equal(await app.turn({settings:{}},'логи сервера за час'),null,'not added → null');
  const none=await app.turn(services({}),'логи сервера за час');
  assert.ok(none.question&&/Настройки → «Логи сервера»/.test(none.text),'added but not connected → where to connect');

  // Loki: the request it sends and the card it builds, model-free.
  calls.length=0;
  const s1=services(LOKI);
  const r1=await app.turn(s1,'логи сервиса payments за последние 15 минут');
  assert.equal(r1.by,'Логи сервера');assert.ok(!r1.error,r1.text);
  const lines=calls.find(c=>c.server==='loki'&&!c.query.query.startsWith('sum('));
  assert.equal(lines.query.query,'{service_name="payments"}');assert.equal(lines.query.direction,'backward');assert.equal(lines.query.limit,'200');
  assert.ok(Math.abs((Number(lines.query.end)-Number(lines.query.start))/1e6-15*60e3)<1000,'15 minutes in ns');
  const counts=calls.filter(c=>c.query.query?.startsWith('sum(count_over_time('));
  assert.equal(counts.length,2,'total and error counts');assert.match(counts[0].query.step,/^\d+s$/);
  const card=r1.extensionData.logs;
  assert.equal(card.source.id,'loki');assert.equal(card.entries.length,5);assert.equal(card.entries[0].service,'payments');assert.equal(card.entries[0].level,'error');
  assert.equal(card.histogram.exact,true);assert.equal(card.total,card.histogram.buckets.reduce((a,b)=>a+b.total,0));
  assert.equal(card.groups[0].count,2,'two payment failures with different ids are one signature');assert.match(card.groups[0].signature,/payment failed for order <n>/);
  assert.match(card.explore.url,/^https:\/\/grafana\.example\.com\/explore\?schemaVersion=1&panes=/);
  assert.ok(decodeURIComponent(card.explore.url).includes('"uid":"loki-uid"'));
  assert.match(r1.text,/Loki \(payments\) за последние 15 минут: .* строк.*ошибок 16.*Чаще всего: «/);
  // Errors only → a level line filter.
  calls.length=0;await app.turn(services(LOKI),'только ошибки в логах сервиса api за час');
  assert.match(calls[0].query.query,/^\{service_name="api"\} \|~ "\(\?i\)\\\\b\(error\|err\|exception\|fatal\|panic\|critical\)\\\\b"$/);

  // The model writes LogQL; a valid one is used, an invalid one is rebuilt; invented services are dropped.
  const model=answer=>async()=>({message:{content:JSON.stringify(answer)}});
  calls.length=0;
  const s2=services({...LOKI,model:'m'});s2.request=async(url,o)=>/\/api\/chat$/.test(url)?{message:{content:JSON.stringify({query:'{service_name=~".+"} |~ "(?i)payment" |~ "(?i)(fail|declin)"',levels:['error'],services:[],contains:['payment'],last:'1h'})}}:request(url,o);
  s2.settings.ollamaUrl='http://127.0.0.1:1/api/chat';
  const r2=await app.turn(s2,'ошибки оплаты в логах за последний час');
  assert.equal(r2.extensionData.logs.by,'model');
  assert.equal(calls.find(c=>!c.query.query.startsWith('sum(')).query.query,'{service_name=~".+"} |~ "(?i)payment" |~ "(?i)(fail|declin)"');
  calls.length=0;
  s2.request=async(url,o)=>/\/api\/chat$/.test(url)?{message:{content:JSON.stringify({query:'sum(rate({env="prod"}[5m]))',levels:['error'],services:['billing'],contains:['payment'],last:'24h'})}}:request(url,o);
  const r3=await app.turn(s2,'ошибки оплаты в логах за последний час');
  const q3=calls.find(c=>!c.query.query.startsWith('sum(')).query;
  assert.equal(q3.query,'{service_name=~".+"} |~ "(?i)\\\\b(error|err|exception|fatal|panic|critical)\\\\b" |~ "(?i)payment"','metric query and invented service dropped, rebuilt from filters');
  assert.ok(Math.abs((Number(q3.end)-Number(q3.start))/1e6-3600e3)<1000,'the period said in the request wins over the model');
  assert.ok(r3.extensionData.logs.notes.some(n=>/не прошёл проверку/.test(n)));

  // Loki errors: auth, bad query.
  const bad=await app.turn(services({...LOKI,logsLokiToken:'x'.repeat(20)}),'логи сервера за час');
  assert.ok(bad.error&&/Loki не принял ключ/.test(bad.text));
  await assert.rejects(L.create(services(LOKI)).search('loki',{query:'{app="a"} |= "boom"'}),/Loki отклонил запрос: .*parse error/);
  const down=await app.turn(services({...LOKI,logsLokiUrl:'http://127.0.0.1:1'}),'логи сервера за час');
  assert.ok(down.error&&/Loki недоступен/.test(down.text),down.text);

  // Elasticsearch: KQL → bool query, the index, ApiKey, hits and histogram.
  calls.length=0;
  const r4=await app.turn(services(ES),'ошибки в логах сервиса payments в Кибане за 30 минут');
  const sent=calls.find(c=>c.server==='es');
  assert.equal(sent.path,'/logs-*/_search');assert.equal(sent.method,'POST');
  assert.equal(sent.body.size,200);assert.equal(sent.body.query.bool.filter[0].range['@timestamp'].format,'strict_date_optional_time');
  const dsl=JSON.stringify(sent.body.query.bool.filter[1]);
  assert.ok(dsl.includes('{"match_phrase":{"service.name":"payments"}}')&&dsl.includes('{"match_phrase":{"log.level":"error"}}')&&!/script|query_string/.test(dsl),dsl);
  assert.equal(sent.body.aggs.timeline.date_histogram.fixed_interval,'60s');
  const c4=r4.extensionData.logs;
  assert.equal(c4.source.id,'elasticsearch');assert.equal(c4.total,57);assert.equal(c4.entries.length,3);assert.equal(c4.groups[0].count,2);assert.equal(c4.entries[2].service,'web');
  assert.match(c4.explore.url,/^https:\/\/kibana\.example\.com\/app\/discover#\/\?_g=\(time:\(from:'.+',to:'.+'\)\)&_a=\(query:\(language:kuery,query:/);
  assert.equal(es.dsl(L.parseKQL('a:(x or y*) and not "z"').tree).bool.filter.length,2);
  const esBad=await app.turn(services({...ES,logsElasticKey:'q'.repeat(24)}),'логи сервера в Кибане за час');
  assert.ok(esBad.error&&/Elasticsearch не принял ключ/.test(esBad.text));

  // Several sources: the named one wins; none named → a clarification with both.
  calls.length=0;
  await app.turn(services({...LOKI,...ES}),'что в Loki за час');assert.ok(calls.every(c=>c.server==='loki'));
  await assert.rejects(app.turn(services({...LOKI,...ES}),'логи сервера за час'),e=>e instanceof InputRequired&&e.spec.options.includes('Loki')&&e.spec.options.includes('Elasticsearch / OpenSearch'));
  calls.length=0;await app.turn(services({...LOKI,...ES,logsDefaultSource:'elasticsearch'}),'логи сервера за час');assert.ok(calls.every(c=>c.server==='es'));

  // A source that needs a service (Kubernetes pod logs) → «какой сервис?» with the source's names.
  const needs={id:'kube',extension:'k',setting:'',name:'Kube',source:{id:'kube',name:'Kube',language:'text',ready:()=>true,compile:()=> '',async search(s,spec){if(!spec.filters.services.length)throw Object.assign(Error('нужен сервис'),{need:'service'});return {entries:[{ts:iso(NOW-60e3),message:'ERROR x',labels:{app:spec.filters.services[0]}}]};},async services(){return ['api','worker'];}}};
  const s5=services({});s5.logSources=L.create(s5,{sources:[needs]});
  let asked=null;try{await app.turn(s5,'логи сервера за час');}catch(e){asked=e;}
  assert.ok(asked instanceof InputRequired);assert.deepEqual(asked.spec.options,['api','worker']);
  const resumed=await asked.resume('worker');assert.equal(resumed.extensionData.logs.entries[0].service,'worker');

  // «Почему?»: grounded quotes only; without a model — a clear error.
  await assert.rejects(app.why({settings:{}},card.groups[0]),/нужна локальная модель/);
  const sw=services({model:'m',ollamaUrl:'http://127.0.0.1:1'});
  sw.request=async()=>({message:{content:JSON.stringify({cause:'Платёжный шлюз отклоняет заказы',explanation:'Ошибки идут подряд.',evidence:['payment failed for order 1001','выдуманная строка'],steps:['Проверить шлюз']})}});
  const w=await app.why(sw,card.groups[0]);
  assert.deepEqual(w.evidence,['payment failed for order 1001']);assert.equal(w.cause,'Платёжный шлюз отклоняет заказы');

  // Settings validation and the offer.
  const next={logsLokiUrl:'https://user:pw@loki.example.com'};assert.throws(()=>app.validate(next),/не подходит/);
  const ok={logsLokiUrl:'https://loki.example.com/',logsLokiSelector:'{env="prod"}',logsElasticIndex:'logs-*,app-*'};app.validate(ok);assert.equal(ok.logsLokiUrl,'https://loki.example.com');
  assert.throws(()=>app.validate({logsLokiSelector:'sum(rate({a="b"}[1m]))'}),/селектором потока/);
  assert.throws(()=>app.validate({logsElasticIndex:'_all'}),/Индекс/);
  assert.equal(offer.ready({extension_logs:'true'}),false);assert.equal(offer.ready({extension_logs:'true',logsLokiUrl:'https://l.example.com'}),true);
  assert.equal(loki.compile({services:['a','b'],levels:[],contains:['x.y'],exclude:['health']}),'{service_name=~"a|b"} |~ "(?i)x\\\\.y" !~ "(?i)health"');
  console.log('Logs: Loki and Elasticsearch over HTTP (queries, auth, histograms, errors), routing and near-misses, connect question, model query validated and rebuilt, service clarification, grounded «Почему?», settings passed');
 }finally{lokiSrv.close();esSrv.close();}
})().catch(e=>{console.error(e);process.exit(1);});
