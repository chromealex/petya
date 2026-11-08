// The `log-source` foundation (src/features/log-sources.cjs) on its own: provider loading and checks, the bounded
// spec (period, limit, filters, query languages), entry normalization (level, service), histogram, error
// signatures and groups, the model-free request reading, the model translation under the schema — and a fuzz of
// the LogQL and KQL validators and of `bound`: whatever comes in, what reaches a source stays within the caps.
const assert=require('node:assert/strict');
const L=require('../src/features/log-sources.cjs');

const now=Date.parse('2026-11-09T12:00:00Z');
const fake=(over={})=>({id:'fake',name:'Fake',language:'logql',ready:()=>true,compile:f=>'{app="'+(f.services[0]||'all')+'"}',async search(){return {entries:[]};},...over});

(async()=>{
 // Loading: the real providers in the repo are valid; a bad provider is refused.
 const real=L.load();
 assert.deepEqual(real.map(x=>x.id).sort(),['elasticsearch','kubernetes','loki']);
 assert.ok(real.every(x=>['logql','kql','text'].includes(x.source.language)));

 // Ranges: last/from-to, the cap, nonsense, the future.
 const notes=[];
 assert.deepEqual(L.range({last:'15m'},{now}),{from:'2026-11-09T11:45:00.000Z',to:'2026-11-09T12:00:00.000Z'});
 const capped=L.range({last:'30d'},{now,maxMs:7*86400e3},notes);
 assert.equal(Date.parse(capped.to)-Date.parse(capped.from),7*86400e3);assert.match(notes[0],/сокращён/);
 assert.equal(L.range({from:'2026-11-10T00:00:00Z',to:'2026-11-20T00:00:00Z'},{now}).to,'2026-11-09T12:00:00.000Z','never in the future');
 assert.equal(Date.parse(L.range({from:'garbage'},{now}).to)-Date.parse(L.range({from:'garbage'},{now}).from),3600e3);

 // The spec: limit and filters bounded, an invalid query rebuilt from the filters with a note.
 const spec=L.bound({query:'sum(rate({app="x"}[1m]))',levels:['error','bogus'],services:['payments','bad name;rm'],contains:['x','timeout'],limit:99999,range:{last:'2h'}},fake(),{now});
 assert.equal(spec.limit,1000);assert.deepEqual(spec.filters.levels,['error']);assert.deepEqual(spec.filters.services,['payments']);assert.deepEqual(spec.filters.contains,['timeout']);
 assert.equal(spec.query,'{app="payments"}');assert.ok(spec.notes.some(n=>/не прошёл проверку/.test(n)));
 assert.equal(L.bound({},fake({maxLimit:50}),{now}).limit,50);
 assert.equal(L.bound({limit:0},fake(),{now}).limit,200);
 assert.equal(L.bound({query:'{app="api"} |= "x"'},fake({validate:()=>({ok:false,error:'нет'})}),{now}).query,'{app="all"}','a source may be stricter');

 // LogQL: log queries only.
 for(const ok of ['{app="api"}','{service_name=~"pay.*", env="prod"} |= "payment" != "health" |~ "(?i)timeout"','{job="x"} | json | level="error" | status >= 500','{a="b"} | logfmt | duration > 1s'])assert.ok(L.validateLogQL(ok).ok,ok);
 for(const bad of ['','rate({a="b"}[5m])','{a=~".*"}','{a!="b"}','{a="b"} | line_format "{{.x}}"','{a="b"} |= x','{a="b"} |~ "(?=x)"','{a="b"} |~ "(x"','{a="b"}; drop','{a="b"} | delete','{a="b" | json'])assert.equal(L.validateLogQL(bad).ok,false,bad);

 // KQL subset.
 const k=L.parseKQL('service.name:payments and (log.level:error or log.level:fatal) and not "health check" pay*');
 assert.ok(k.ok);assert.ok(JSON.stringify(k.tree).includes('{"not":{"phrase":"health check"}}'));assert.deepEqual(k.tree.and[1],{prefix:'pay'});
 for(const bad of ['*pay','a:(b:c)','((((((((a))))))))','a:','"open','a:{"script":1}','a > 5'])assert.equal(L.parseKQL(bad).ok,false,bad);

 // Entries: level from labels, JSON, logfmt, keywords; service from labels.
 const e=L.entry({ts:'1762689600000000000',message:'{"level":"error","msg":"payment failed"}',labels:{service_name:'payments',junk:{x:1}}},'loki');
 assert.equal(e.level,'error');assert.equal(e.service,'payments');assert.equal(e.ts,new Date(1762689600000).toISOString());assert.equal(e.labels.junk,undefined);
 assert.equal(L.levelOf('ts=1 level=warn msg=slow'),'warn');assert.equal(L.levelOf('panic: nil map'),'fatal');assert.equal(L.levelOf('GET /health 200'),'info');assert.equal(L.levelOf('0 errors found'),'info');
 assert.equal(L.serviceOf({'app.kubernetes.io/name':'api'}),'api');assert.equal(L.serviceOf({job:'prod/checkout'}),'checkout');
 assert.equal(L.entry({message:'x'.repeat(9000),ts:now},'t').message.length,4000);

 // Signatures and groups: the same error with different ids is one group.
 const lines=[['2026-11-09T11:10:00Z','ERROR payment failed for order 1234 user=8f14e45f-ceea-467f-a0e6-7a4e2c1b2a11'],['2026-11-09T11:50:00Z','ERROR payment failed for order 99 user=1f14e45f-ceea-467f-a0e6-7a4e2c1b2a12'],
  ['2026-11-09T11:20:00Z','ERROR db timeout after 3000ms to 10.0.0.12:5432'],['2026-11-09T11:30:00Z','INFO ok']].map(([ts,m])=>L.entry({ts,message:m,labels:{app:'api'}},'t'));
 const g=L.groups(lines);
 assert.equal(g.length,2);assert.equal(g[0].count,2);assert.equal(g[0].first,'2026-11-09T11:10:00.000Z');assert.equal(g[0].last,'2026-11-09T11:50:00.000Z');assert.deepEqual(g[0].services,['api']);
 assert.equal(g[1].signature,'ERROR db timeout after <n> to <ip>');
 const h=L.histogram(lines,{range:{from:'2026-11-09T11:00:00Z',to:'2026-11-09T12:00:00Z'}});
 assert.equal(h.step,300e3);assert.equal(h.buckets.length,12);assert.equal(h.buckets.reduce((a,b)=>a+b.total,0),4);assert.equal(h.buckets.reduce((a,b)=>a+b.errors,0),3);

 // Reading a request without the model.
 const p=L.parse('логи сервиса payments за последние 15 минут',new Date(now));
 assert.deepEqual(p.services,['payments']);assert.deepEqual(p.range,{last:'15m'});assert.equal(p.period,true);
 assert.deepEqual(L.parse('ошибки в логах api за сутки «timeout»',new Date(now)),{levels:['error','fatal'],services:['api'],contains:['timeout'],range:{last:'1d'},period:true});
 assert.equal(L.parse('логи сервера',new Date(now)).period,false);

 // The model's answer goes through the schema and then `bound`.
 const seen=[];
 const model=async(s,o)=>{seen.push(o);return {query:'{service_name="payments"} |~ "(?i)payment"',levels:['error'],services:['payments'],contains:['payment'],last:'1h'};};
 const t=await L.translate({settings:{model:'m'}},'ошибки оплаты за последний час',real.find(x=>x.id==='loki'),{model});
 assert.equal(seen[0].schema.properties.last.enum.includes('7d'),true);assert.match(seen[0].system,/LogQL/);
 assert.deepEqual(t.range,{last:'1h'});
 assert.equal(await L.translate({settings:{}},'x',real.find(x=>x.id==='loki'),{model:async()=>{throw Error('down');}}),null);

 // The registry: added + connected; search bounds and normalizes whatever the source returns.
 const src=fake({async search(s,sp){return {entries:[{ts:'2026-11-09T11:59:00Z',message:'ERROR x 1',labels:{app:'a'}},{ts:'2026-11-08T00:00:00Z',message:'old'},{ts:'2026-11-09T11:58:00Z',message:'WARN y'}],total:5,histogram:{step:60e3,buckets:[{t:'2026-11-09T11:59:00Z',total:5,errors:1}]}};}});
 const reg=L.create({settings:{extension_x:'true'}},{sources:[{id:'fake',extension:'x',setting:'extension_x',name:'Fake',source:src}],now:()=>now});
 assert.equal(reg.list().length,1);
 const r=await reg.search('fake',{range:{last:'1h'},limit:5});
 assert.equal(r.entries.length,2,'lines outside the period are dropped');assert.equal(r.entries[0].level,'error');assert.equal(r.total,5);assert.equal(r.histogram.exact,true);assert.equal(r.truncated,true);
 const off=L.create({settings:{extension_x:'false'}},{sources:[{id:'fake',extension:'x',setting:'extension_x',name:'Fake',source:src}]});
 assert.equal(off.list().length,0);await assert.rejects(off.search('fake',{}),/не добавлен/);
 await assert.rejects(L.create({settings:{extension_x:'true'}},{sources:[{id:'fake',extension:'x',setting:'extension_x',name:'Fake',source:fake({async search(){return {nope:1};}})}]}).search('fake',{}),/некорректный/);

 // Fuzz: random strings and structures never produce a spec outside the caps, and an accepted query is
 // re-accepted by its validator (validators never crash).
 let seed=7;const rnd=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
 const alphabet=['{','}','"','`','=','~','!','|','(',')',':','*','a','app','service_name','error','and','or','not',' ',' ','json','logfmt','sum','rate','[5m]','\\','.+','.*','line_format','>','5','\n','\u0000','ё','😀'];
 const junk=()=>Array.from({length:rnd(40)},()=>alphabet[rnd(alphabet.length)]).join('');
 const values=[undefined,null,-1,0,1,1e9,'x',NaN,{},[],'7d','1h','99999h',junk()];
 for(let i=0;i<3000;i++){
  const q=junk();
  for(const fn of [L.validateLogQL,x=>L.parseKQL(x)]){const v=fn(q);assert.equal(typeof v.ok,'boolean');if(v.ok&&v.query)assert.ok(fn(v.query).ok);}
  const lang=['logql','kql','text'][rnd(3)];
  const out=L.bound({query:rnd(2)?q:values[rnd(values.length)],limit:values[rnd(values.length)],levels:[junk(),'error'],services:[junk(),q],contains:[junk(),junk()],range:rnd(2)?{last:values[rnd(values.length)]}:{from:values[rnd(values.length)],to:values[rnd(values.length)]}},fake({language:lang,compile:()=>''}),{now});
  const span=Date.parse(out.range.to)-Date.parse(out.range.from);
  assert.ok(out.limit>=1&&out.limit<=1000&&Number.isInteger(out.limit));
  assert.ok(span>=60e3&&span<=7*86400e3&&Date.parse(out.range.to)<=now,'span '+span);
  assert.ok(out.query.length<=600);
  if(out.query)assert.ok(L.validateQuery(lang,out.query).ok,'accepted query re-validates: '+out.query);
  assert.ok(out.filters.services.every(s=>/^[A-Za-z0-9][A-Za-z0-9._/-]{0,62}$/.test(s)));
  assert.ok(Object.values(out.filters).every(list=>list.length<=8&&list.every(x=>x.length<=80&&!/[\u0000\n]/.test(x))));
 }
 console.log('Log sources: providers, bounded spec, LogQL/KQL validation, entries, signatures, groups, histogram, request reading, model schema, registry and 3000-case fuzz passed');
})().catch(e=>{console.error(e);process.exit(1);});
