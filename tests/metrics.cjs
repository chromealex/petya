// «Метрики игры» + «AppMetrica» (first metrics source): routing incl. near-misses (team metrics, velocity,
// crashes, reviews, ANR, server metrics, A/B), not added → null, no source → question listing sources, source added
// but not connected → question, the AppMetrica Reporting API requests (auth, namespaces, filters, currency), KPI
// changes, the 3σ same-weekday anomaly flag, retention cohorts, a refused revenue metric degrading gracefully,
// service errors, a second source merged, the model line without numbers, and the offers.
// No network: AppMetrica and the local model are stubbed through s.request.
const assert=require('node:assert/strict');
const app=require('../src/extensions/metrics/feature.cjs');
const query=require('../src/extensions/metrics/query.cjs');
const compute=require('../src/extensions/metrics/compute.cjs');
const registry=require('../src/extensions/metrics/sources.cjs');
const amFeature=require('../src/extensions/appmetrica/feature.cjs');
const amClient=require('../src/extensions/appmetrica/client.cjs');
const offers=require('../src/features/extension-offers.cjs');
const links=require('../src/features/app-links.cjs');

const NOW=new Date(2026,10,9,10,0);// Monday 9 Nov 2026, local time
const DAY=86400000;
const t0=Date.parse('2026-09-01T00:00:00Z');
const week=d=>Math.floor((Date.parse(d+'T00:00:00Z')-t0)/DAY/7);
const wd=d=>new Date(d+'T00:00:00Z').getUTCDay();
// A weekly pattern with a slow trend; Wednesday 4 Nov is a planted outage.
const dau=d=>d==='2026-11-04'?6000:10000+(wd(d)===0||wd(d)===6?2000:0)+10*week(d);
const fresh=d=>1000+(wd(d)===6?200:0)+5*week(d);
const revenue=d=>50000+(wd(d)===6?10000:0)+100*week(d);
const days=(a,b)=>compute.range(a,b);

function services({over={},settings={}}={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const calls=[];
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_metrics:'true',extension_appmetrica:'true',appmetricaToken:'y0_test',appmetricaApps:'4242',appmetricaAppNames:'{"4242":"Bunker Wars"}',appmetricaCurrency:'RUB',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){
   const u=new URL(url);calls.push({url:u,options});
   if(u.pathname==='/api/chat'){if(over.model)return over.model(JSON.parse(options.body));throw Error('no model');}
   assert.equal(u.origin,'https://api.appmetrica.yandex.ru');
   assert.equal(options.headers.Authorization,'OAuth y0_test');
   const p=u.searchParams,key=u.pathname+' '+(p.get('metrics')||'')+' '+(p.get('dimensions')||'');
   if(over[key])return over[key](p);
   if(u.pathname==='/stat/v1/data/bytime'&&p.get('metrics')==='ym:u:activeUsers,ym:u:newUsers'){
    const list=days(p.get('date1'),p.get('date2'));
    return {data:[{dimensions:[],metrics:[list.map(dau),list.map(fresh)]}],time_intervals:list.map(d=>[d+' 00:00:00',d+' 23:59:59'])};
   }
   if(u.pathname==='/stat/v1/data/bytime'&&p.get('metrics')==='ym:r2:revenue<currency>'){
    // No time_intervals: days follow date1.
    return {data:[{dimensions:[],metrics:[days(p.get('date1'),p.get('date2')).map(revenue)]}]};
   }
   if(u.pathname==='/stat/v1/data'&&p.get('dimensions')==='ym:u:profileInstallDate,ym:u:date'){
    const list=days(p.get('date1'),p.get('date2')),rows=[];
    for(const install of list)for(const day of list){
     const n=Math.round((Date.parse(day)-Date.parse(install))/DAY);if(n<0)continue;
     const size=1000;const v=n===0?size:n===1?400:n===7?150:n===30?60:n===2?300:null;
     if(v!==null)rows.push({dimensions:[{name:install},{name:day}],metrics:[v]});
    }
    return {data:rows,total_rows:rows.length};
   }
   if(u.pathname==='/stat/v1/data'&&p.get('dimensions')==='ym:u:appVersion')return {data:[{dimensions:[{name:'1.4.2'}],metrics:[9000]},{dimensions:[{name:'1.4.1'}],metrics:[2000]}]};
   if(u.pathname==='/management/v1/applications')return {applications:[{id:4242,name:'Bunker Wars'},{id:77,name:'Other'}]};
   throw Object.assign(Error('unexpected '+url),{status:404});
  }};
 app.reset();
 return {s,topic,calls};
}
const find=(calls,pred)=>calls.find(c=>pred(c.url.searchParams,c.url.pathname));

(async()=>{
 // --- Routing ---
 for(const p of ['DAU за неделю','ретеншн D1 D7 D30','сколько новых игроков вчера','как выручка после ивента','сравни эту неделю с прошлой','метрики игры за 30 дней на Android','DAU из AppMetrica','ARPDAU за месяц'])
  assert.ok(query.about(p),'should trigger: '+p);
 for(const p of ['метрики команды','велосити команды за спринт','метрики сервера','крэши за неделю','отзывы за неделю','ANR за неделю','значим ли тест','почему упал DAU','что такое ретеншн','сравни эту неделю с прошлой по задачам','сколько задач закрыли за неделю',''])
  assert.ok(!query.about(p),'should not trigger: '+p);
 assert.deepEqual(query.parse('сколько новых игроков вчера'),{days:1,focus:'new',platform:null,version:null,compare:false,source:null});
 assert.deepEqual(query.parse('метрики игры за 30 дней на Android версии 1.4.2'),{days:30,focus:null,platform:'android',version:'1.4.2',compare:false,source:null});
 assert.equal(query.parse('ретеншн за квартал').days,90);assert.equal(query.parse('как выручка после ивента').compare,true);

 // --- Pure computations ---
 const w=compute.window(7,NOW);
 assert.deepEqual([w.start,w.end,w.prevStart,w.prevEnd,w.chartStart,w.from],['2026-11-02','2026-11-08','2026-10-26','2026-11-01','2026-10-26','2026-09-28']);
 // 3σ on the same weekday: baseline 100,104,96,100 → mean 100, σ=3.266 (sample); 109.9 is 3.03σ (flagged), 109.7 is
 // 2.97σ (not). A σ below 2% of the mean is floored: 100,101,99,100 (σ=0.816) needs more than ±6, not ±2.45.
 const base=['2026-10-07','2026-10-14','2026-10-21','2026-10-28'].map((date,i)=>({date,value:[100,104,96,100][i]}));
 assert.equal(compute.anomalies([...base,{date:'2026-11-04',value:109.9}],['2026-11-04'],'dau').length,1);
 assert.equal(compute.anomalies([...base,{date:'2026-11-04',value:109.7}],['2026-11-04'],'dau').length,0);
 const steady=base.map((x,i)=>({...x,value:[100,101,99,100][i]}));
 assert.equal(compute.anomalies([...steady,{date:'2026-11-04',value:105}],['2026-11-04'],'dau').length,0);
 assert.equal(compute.anomalies([...steady,{date:'2026-11-04',value:93.9}],['2026-11-04'],'dau')[0].direction,'down');
 assert.equal(compute.anomalies([...base.slice(1),{date:'2026-11-04',value:500}],['2026-11-04'],'dau').length,0,'needs 4 weeks of baseline');
 assert.deepEqual(registry.normalize('x',{series:[{metric:'dau',series:[{date:'2026-11-01',value:'5'},{date:'bad',value:1},{date:'2026-11-02',value:NaN}]},{metric:'secret',series:[]}]}),[{source:'x',metric:'dau',unit:'users',series:[{date:'2026-11-01',value:5}],dimensions:{}}]);

 // --- Not added / no source / not connected ---
 let {s,calls}=services();
 s.settings.extension_metrics='false';
 assert.equal(await app.turn(s,'DAU за неделю'),null);
 s.settings.extension_metrics='true';s.settings.extension_appmetrica='false';
 let r=await app.turn(s,'DAU за неделю');
 assert.equal(r.question,true);assert.match(r.text,/подключите источник данных: AppMetrica \(Каталог → «AppMetrica»/);assert.equal(calls.length,0);
 s.settings.extension_appmetrica='true';s.settings.appmetricaToken='';app.reset();
 r=await app.turn(s,'DAU за неделю');assert.equal(r.question,true);assert.match(r.text,/«AppMetrica» добавлен, но не подключён\. Откройте Настройки → «AppMetrica»/);
 s.settings.appmetricaToken='y0_test';
 for(const p of ['метрики команды','крэши за неделю','ANR за неделю'])assert.equal(await app.turn(s,p),null,p);

 // --- Happy path: a week from AppMetrica ---
 ({s,calls}=services());
 r=await app.metricsTurn(s,'DAU за неделю',NOW);
 const card=r.extensionData.metricsCard,b=card.sources[0];
 const aud=find(calls,(p,path)=>path==='/stat/v1/data/bytime'&&p.get('metrics')==='ym:u:activeUsers,ym:u:newUsers').url.searchParams;
 assert.equal(aud.get('id'),'4242');assert.equal(aud.get('group'),'day');assert.equal(aud.get('date1'),'2026-09-28');assert.equal(aud.get('date2'),'2026-11-08');assert.equal(aud.get('filters'),null);
 const rev=find(calls,(p,path)=>path==='/stat/v1/data/bytime'&&p.get('metrics')==='ym:r2:revenue<currency>').url.searchParams;
 assert.equal(rev.get('currency'),'RUB','revenue namespace separately, currency as a parameter');
 const coh=find(calls,(p)=>p.get('dimensions')==='ym:u:profileInstallDate,ym:u:date').url.searchParams;
 assert.equal(coh.get('date1'),'2026-09-28');assert.equal(coh.get('filters'),"ym:u:profileInstallDate>='2026-09-28'");
 assert.equal(b.id,'appmetrica');assert.equal(b.name,'AppMetrica');assert.equal(b.app,'Bunker Wars');
 const cur=days('2026-11-02','2026-11-08'),prev=days('2026-10-26','2026-11-01');
 const avg=list=>list.reduce((a,d)=>a+dau(d),0)/list.length;
 const k=id=>b.kpis.find(x=>x.id===id);
 assert.equal(k('dau').value,avg(cur));assert.equal(k('dau').previous,avg(prev));assert.equal(k('dau').change,avg(cur)/avg(prev)-1);
 assert.equal(k('new').value,cur.reduce((a,d)=>a+fresh(d),0));
 assert.equal(k('revenue').value,cur.reduce((a,d)=>a+revenue(d),0));assert.equal(k('revenue').unit,'currency:RUB');
 assert.equal(k('arpdau').value,cur.reduce((a,d)=>a+revenue(d),0)/cur.reduce((a,d)=>a+dau(d),0));
 assert.equal(k('d1').value,0.4);
 assert.deepEqual(b.anomalies.map(a=>[a.date,a.metric,a.direction]),[['2026-11-04','dau','down']],'only the planted outage');
 assert.equal(b.chart.dates.length,14);assert.equal(b.chart.lines.length,3);assert.equal(b.chart.lines[0].previous.length,14);
 assert.equal(b.retention.rows.length,6);
 const full=b.retention.rows.find(x=>x.d30);assert.equal(full.d1.value,0.4);assert.equal(full.d7.value,0.15);assert.equal(full.d30.value,0.06);
 assert.equal(b.retention.rows[0].d30,null,'the newest week has no D30 yet');
 assert.deepEqual(b.versions,['1.4.2','1.4.1']);
 assert.match(r.text,/^AppMetrica · Bunker Wars, за 7 дней: DAU в среднем \d/);assert.match(r.text,/Необычные дни: 4 нояб\. — DAU ниже нормы\./);
 assert.equal(calls.filter(c=>c.url.pathname==='/api/chat').length,0,'no model chosen, no model call');

 // Filters, focus and «вчера».
 ({s,calls}=services());
 r=await app.metricsTurn(s,'сколько новых игроков вчера на iOS версии 1.4.2',NOW);
 const f=find(calls,(p,path)=>path==='/stat/v1/data/bytime'&&p.get('metrics').startsWith('ym:u:')).url.searchParams;
 assert.equal(f.get('filters'),"ym:u:operatingSystemInfo=='iOS' AND ym:u:appVersion=='1.4.2'");
 assert.equal(find(calls,(p,path)=>path==='/stat/v1/data/bytime'&&p.get('metrics').startsWith('ym:r2:')).url.searchParams.get('filters'),"ym:r2:operatingSystemInfo=='iOS' AND ym:r2:appVersion=='1.4.2'");
 assert.match(r.text,/^AppMetrica · Bunker Wars, вчера: Новые игроки 1\s045 \(−16,1% к позавчера\)/);
 assert.equal(r.extensionData.metricsCard.platform,'ios');

 // Revenue refused (no in-app revenue configured): the rest of the card stays.
 ({s}=services({over:{'/stat/v1/data/bytime ym:r2:revenue<currency> ':()=>{throw Object.assign(Error('Сервис вернул HTTP 400'),{status:400,detail:JSON.stringify({errors:[{message:'Wrong metric'}]})});}}}));
 r=await app.metricsTurn(s,'как выручка после ивента',NOW);
 const nb=r.extensionData.metricsCard.sources[0];
 assert.ok(!nb.kpis.some(x=>x.id==='revenue'));assert.ok(nb.kpis.some(x=>x.id==='dau'));
 assert.match(nb.unavailable[0].reason,/^Выручка недоступна: AppMetrica не приняла запрос: Wrong metric/);
 assert.match(r.text,/Выручка недоступна/);
 // Retention refused: degrades too.
 ({s}=services({over:{'/stat/v1/data ym:u:activeUsers ym:u:profileInstallDate,ym:u:date':()=>{throw Object.assign(Error('HTTP 400'),{status:400});}}}));
 r=await app.metricsTurn(s,'ретеншн D1 D7 D30',NOW);
 assert.equal(r.extensionData.metricsCard.sources[0].retention,null);assert.match(r.text,/Ретеншн недоступен/);
 // Wrong token: an error the user can act on, through kit.failure.
 ({s}=services({over:{'/stat/v1/data/bytime ym:u:activeUsers,ym:u:newUsers ':()=>{throw Object.assign(Error('Сервис вернул HTTP 401'),{status:401});}}}));
 r=await app.turn(s,'DAU за неделю');assert.equal(r.error,true);assert.match(r.text,/AppMetrica не приняла OAuth-токен/);

 // A second source is merged as its own block; a failing one is listed, not fatal.
 ({s}=services());
 const am=registry.load().find(x=>x.id==='appmetrica');
 const fake={id:'gamestats',extension:'gamestats',setting:'',name:'GameStats',source:{ready:()=>true,fetch:async(_,q)=>({series:[{metric:'dau',unit:'users',series:days(q.from,q.to).map(d=>({date:d,value:500}))}],unavailable:[]})}};
 const broken={id:'zz',extension:'zz',setting:'',name:'Broken',source:{ready:()=>true,fetch:async()=>{throw Error('нет связи');}}};
 app.useSources(registry.create(s,{sources:[am,fake,broken]}));
 r=await app.metricsTurn(s,'DAU за неделю',NOW);
 const merged=r.extensionData.metricsCard;
 assert.deepEqual(merged.sources.map(x=>x.id),['appmetrica','gamestats']);assert.equal(merged.sources[1].kpis[0].value,500);
 assert.deepEqual(merged.failed,[{id:'zz',name:'Broken',error:'нет связи'}]);assert.match(r.text,/Не ответил: Broken \(нет связи\)/);
 assert.match(merged.sources[1].unavailable[0].reason,/не отдаёт когорты/);
 app.reset();

 // The model's line is kept only without numbers.
 ({s,calls}=services({over:{model:()=>({message:{content:JSON.stringify({line:'Аудитория стабильна, но в среду был провал'})}})}}));
 s.settings.model='qwen';
 r=await app.metricsTurn(s,'DAU за неделю',NOW);assert.equal(r.extensionData.metricsCard.comment,'Аудитория стабильна, но в среду был провал');
 ({s}=services({over:{model:()=>({message:{content:JSON.stringify({line:'DAU вырос на 12% за неделю'})}})}}));
 s.settings.model='qwen';
 r=await app.metricsTurn(s,'DAU за неделю',NOW);assert.equal(r.extensionData.metricsCard.comment,'','a line with numbers is dropped');

 // --- AppMetrica settings and registry ---
 assert.throws(()=>amFeature.validate({appmetricaApps:'12,abc'}),/числа через запятую/);
 const next={appmetricaApps:' 12, 12 ,34',appmetricaCurrency:'USD',appmetricaAppNames:'{"12":"Game","x":"bad"}'};amFeature.validate(next);
 assert.equal(next.appmetricaApps,'12,34');assert.equal(next.appmetricaAppNames,'{"12":"Game"}');
 assert.throws(()=>amFeature.validate({appmetricaCurrency:'BTC'}),/RUB, USD или EUR/);
 assert.deepEqual(amFeature.secrets,['appmetricaToken']);
 ({s}=services());
 assert.deepEqual(await amFeature.setup(s).ipc.applications(),[{id:'4242',name:'Bunker Wars'},{id:'77',name:'Other'}]);
 assert.equal(amClient.connected({appmetricaToken:'t',appmetricaApps:''}),false);
 assert.deepEqual(links.scan().filter(x=>x.kind==='metrics-source').map(x=>x.extension),['appmetrica'],'declared through provides');
 assert.ok(!links.load().some(x=>x.kind==='metrics-source'),'not a card link');

 // --- Offers ---
 const all=offers.load();
 const offered=t=>{const d=offers.decide(offers.candidates(t,{offers:all,settings:{}}));return d?d.one?[d.one.offer.id]:d.tie.map(x=>x.offer.id):[];};
 for(const t of ['DAU за неделю','ретеншн D1 D7 D30','сколько новых игроков вчера','как выручка после ивента','DAU из AppMetrica'])assert.deepEqual(offered(t),['metrics'],t);
 assert.deepEqual(offered('подключи AppMetrica'),['appmetrica']);
 for(const t of ['метрики команды','велосити','крэши за неделю','отзывы за неделю','ANR за неделю','метрики сервера'])assert.ok(!offered(t).includes('metrics'),t);
 console.log('Game metrics: routing, sources registry, AppMetrica requests, KPIs, 3σ anomalies, retention cohorts, graceful degradation, merged sources, model guard and offers passed');
})().catch(e=>{console.error(e);process.exit(1);});
