// «Покупки в игре» (src/extensions/iap) and the `purchase-source` foundation (src/features/purchase-sources.cjs) against
// fake servers on localhost. Keys are generated at runtime (an EC P-256 .p8 for App Store Connect, an RSA service
// account for Google); nothing token-shaped is stored in the repository.
//  - App Store Connect: GET /v1/salesReports per day with an ES256 JWT (verified with the public key), gzip'd TSV,
//    404 = no sales; only IAP product types; negative units are refunds.
//  - Google Play: the OAuth JWT grant, then Cloud Storage objects sales/salesreport_YYYYMM.zip (built here), CSV with
//    quoted fields, refunds by financial status, a missing month is a note.
//  - The database: the purchases table found in the schema, the query (four dialects through the read-only check),
//    waiting for «Выполнить», then payers, new payers, first-purchase products and ARPPU.
//  - The card: per-currency blocks never added together, conversion to payers with DAU, ROAS with purchases and ads
//    per spend currency; routing with near-misses; not connected → question.
const assert=require('node:assert/strict');
const http=require('node:http'),zlib=require('node:zlib'),crypto=require('node:crypto');
const PS=require('../src/features/purchase-sources.cjs');
const app=require('../src/extensions/iap/feature.cjs');
const query=require('../src/extensions/iap/query.cjs');
const analysis=require('../src/extensions/iap/analysis.cjs');
const asc=require('../src/extensions/iap/appstore-source.cjs');
const gp=require('../src/extensions/iap/googleplay-source.cjs');
const zip=require('../src/extensions/iap/zip.cjs');
const sqlSource=require('../src/extensions/sql/purchase-source.cjs');
const V=require('../src/extensions/sql/validate.cjs');
const offer=require('../src/extensions/iap/offer.cjs');

// --- Keys made now -------------------------------------------------------------------------------------------------------
const ec=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const P8=ec.privateKey.export({type:'pkcs8',format:'pem'});
const rsa=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const SA=JSON.stringify({type:'service_account',project_id:'bw-test',client_email:'reports@bw-test.iam.gserviceaccount.com',private_key:rsa.privateKey.export({type:'pkcs8',format:'pem'})});
const ISSUER='69a6de7e-0000-4000-8000-00000000c0de',KEY_ID='ABCDE12345',VENDOR='85012345',BUCKET='pubsite_rev_01234567890123456789';

// --- Routing ---------------------------------------------------------------------------------------------------------------
for(const t of ['покупки в игре за неделю','выручка по продуктам','какие паки покупают лучше','конверсия в платящих','ARPPU за месяц','рефанды в App Store за месяц','ROAS с покупками за неделю','IAP за неделю','продажи в Google Play за неделю'])assert.equal(query.about(t),true,t);
for(const t of ['выручка за неделю','ARPDAU за неделю','выручка с рекламы за неделю','сколько потратили на закупку трафика','какой ROAS за неделю','воронка от установки до первой покупки','мои подписки','список покупок','сколько платящих в BigQuery за вчера','отзывы в App Store','что такое ARPPU','как настроить IAP в Unity','DAU за неделю'])assert.equal(query.about(t),false,t);
assert.equal(query.parse('рефанды за месяц').view,'refunds');assert.equal(query.parse('какие продукты берут первой покупкой').view,'first');assert.equal(query.parse('продажи в App Store').store,'appstore');
const offers=require('../src/features/extension-offers.cjs');
assert.deepEqual(offers.candidates('какие паки покупают лучше',{offers:[offer],settings:{}}).map(r=>r.offer.id),['iap']);
assert.deepEqual(offers.candidates('список покупок на неделю',{offers:[offer],settings:{}}),[]);

// --- Rows and summaries never mix currencies ---------------------------------------------------------------------------------
assert.deepEqual(PS.row({date:'2026-11-01',product:'gems_s',units:-2,amount:'-9.98',currency:'usd',country:'us',platform:'iPhone'},'x'),
 {date:'2026-11-01',store:'',product:'gems_s',title:'',type:'iap',kind:'refund',units:2,amount:9.98,currency:'USD',proceeds:null,proceedsCurrency:'',country:'US',platform:'ios',source:'x'});
const mixed=[PS.row({date:'2026-11-01',product:'a',amount:100,currency:'RUB'},'x'),PS.row({date:'2026-11-01',product:'a',amount:5,currency:'USD'},'x'),PS.row({date:'2026-11-02',product:'a',amount:50,currency:'RUB',kind:'refund'},'x')];
assert.deepEqual(PS.summarize(mixed).map(g=>[g.currency,g.amount,g.refunded,g.net]),[['RUB',100,50,50],['USD',5,0,5]]);

// --- Fake servers -------------------------------------------------------------------------------------------------------------
const NOW=Date.parse('2026-11-09T10:00:00Z');
const head=['Provider','Provider Country','SKU','Developer','Title','Version','Product Type Identifier','Units','Developer Proceeds','Begin Date','End Date','Customer Currency','Country Code','Currency of Proceeds','Apple Identifier','Customer Price','Promo Code','Parent Identifier','Subscription','Period','Category','CMB','Device','Supported Platforms','Proceeds Reason','Preserved Pricing','Client','Order Type'];
const line=o=>head.map(h=>o[h]??'').join('\t');
function ascReport(date){
 const [y,m,d]=date.split('-'),us=m+'/'+d+'/'+y;
 const base={Provider:'APPLE','Provider Country':'US',Developer:'Studio','Begin Date':us,'End Date':us,'Apple Identifier':'1','Parent Identifier':'bw'};
 return [head.join('\t'),
  line({...base,SKU:'bw.app',Title:'Bunker Wars','Product Type Identifier':'1F',Units:'40','Developer Proceeds':'0','Customer Currency':'USD','Country Code':'US','Currency of Proceeds':'USD','Customer Price':'0'}),
  line({...base,SKU:'gems_m',Title:'Кристаллы M','Product Type Identifier':'IA1',Units:'3','Developer Proceeds':'3.49','Customer Currency':'USD','Country Code':'US','Currency of Proceeds':'USD','Customer Price':'4.99'}),
  line({...base,SKU:'gems_m',Title:'Кристаллы M','Product Type Identifier':'IA1',Units:'2','Developer Proceeds':'240','Customer Currency':'RUB','Country Code':'RU','Currency of Proceeds':'RUB','Customer Price':'349'}),
  line({...base,SKU:'vip_month',Title:'VIP на месяц','Product Type Identifier':'IAY',Units:'1','Developer Proceeds':'6.99','Customer Currency':'USD','Country Code':'DE','Currency of Proceeds':'EUR','Customer Price':'9.99'}),
  ...(date==='2026-11-05'?[line({...base,SKU:'gems_m',Title:'Кристаллы M','Product Type Identifier':'IA1',Units:'-1','Developer Proceeds':'-3.49','Customer Currency':'USD','Country Code':'US','Currency of Proceeds':'USD','Customer Price':'4.99'})]:[])].join('\n')+'\n';
}
function zipOf(name,data){
 const body=zlib.deflateRawSync(data),nameBuf=Buffer.from(name),crc=zlib.crc32(data);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(0,42);
 const cdOffset=30+nameBuf.length+body.length,cdSize=46+nameBuf.length;
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(cdSize,12);end.writeUInt32LE(cdOffset,16);
 return Buffer.concat([local,nameBuf,body,central,nameBuf,end]);
}
const playCsv=['Order Number,Order Charged Date,Order Charged Timestamp,Financial Status,Device Model,Product Title,Product ID,Product Type,SKU ID,Currency of Sale,Item Price,Taxes Collected,Charged Amount,City of Buyer,State of Buyer,Postal Code of Buyer,Country of Buyer',
 'GPA.1,2026-11-03,1793000000,Charged,a10,"Кристаллы M (Bunker Wars)",com.studio.bw,inapp,gems_m,RUB,349.00,58.17,349.00,Москва,,101000,RU',
 'GPA.2,2026-11-04,1793000000,Charged,a10,"Starter pack, big (Bunker Wars)",com.studio.bw,inapp,starter,RUB,"1,290.00",0,"1,290.00",,,,RU',
 'GPA.3,2026-11-04,1793000000,Refund,a10,"Кристаллы M (Bunker Wars)",com.studio.bw,inapp,gems_m,RUB,-349.00,0,-349.00,,,,RU',
 'GPA.4,2026-11-06,1793000000,Charged,p8,"VIP (Bunker Wars)",com.studio.bw,subscription,vip_month,EUR,8.99,0,8.99,,,,DE',
 'GPA.5,2026-10-20,1793000000,Charged,p8,"Other game pack",com.studio.other,inapp,coins,RUB,99.00,0,99.00,,,,RU',
 'GPA.6,2026-11-07,1793000000,Cancelled,p8,"Кристаллы M (Bunker Wars)",com.studio.bw,inapp,gems_m,RUB,349.00,0,349.00,,,,RU'].join('\n');
const calls=[];
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x'),host=req.headers['x-host']||'';
 let body='';for await(const c of req)body+=c;
 calls.push({host,path:u.pathname,query:Object.fromEntries(u.searchParams),auth:req.headers.authorization||'',body});
 const json=(code,b)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(b));};
 if(host==='oauth2.googleapis.com'){
  const assertion=new URLSearchParams(body).get('assertion')||'';const [h,p,sig]=assertion.split('.');
  const ok=crypto.verify('RSA-SHA256',Buffer.from(h+'.'+p),rsa.publicKey,Buffer.from(sig,'base64url'));
  const claims=JSON.parse(Buffer.from(p,'base64url'));
  if(!ok||claims.scope!==gp.SCOPE)return json(400,{error:'invalid_grant'});
  return json(200,{access_token:'test-access-'+Date.now(),expires_in:3600});
 }
 if(u.pathname==='/v1/salesReports'){
  const [h,p,sig]=String(req.headers.authorization||'').replace(/^Bearer /,'').split('.');
  const header=JSON.parse(Buffer.from(h||'e30','base64url')),claims=JSON.parse(Buffer.from(p||'e30','base64url'));
  const ok=sig&&crypto.verify('SHA256',Buffer.from(h+'.'+p),{key:ec.publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'base64url'));
  if(!ok||header.alg!=='ES256'||header.kid!==KEY_ID||claims.iss!==ISSUER||claims.aud!=='appstoreconnect-v1')return json(401,{errors:[{status:'401',detail:'Authentication credentials are missing or invalid.'}]});
  const q=Object.fromEntries(u.searchParams);
  if(q['filter[vendorNumber]']!==VENDOR||q['filter[reportType]']!=='SALES'||q['filter[frequency]']!=='DAILY'||q['filter[version]']!=='1_0')return json(400,{errors:[{detail:'bad filter'}]});
  if(!['2026-11-03','2026-11-05','2026-11-08'].includes(q['filter[reportDate]']))return json(404,{errors:[{status:'404',code:'NOT_FOUND',detail:'There were no sales for the date specified.'}]});
  res.writeHead(200,{'Content-Type':'application/a-gzip'});return res.end(zlib.gzipSync(ascReport(q['filter[reportDate]'])));
 }
 if(u.pathname.startsWith('/storage/v1/b/')){
  if(!/^Bearer test-access-/.test(req.headers.authorization||''))return json(401,{});
  const [,bucket,object]=/^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/.exec(u.pathname).map(decodeURIComponent);
  if(bucket!==BUCKET||u.searchParams.get('alt')!=='media')return json(404,{});
  if(object==='sales/salesreport_202611.zip'){res.writeHead(200,{'Content-Type':'application/zip'});return res.end(zipOf('salesreport_202611.csv',Buffer.from(playCsv)));}
  return json(404,{error:{code:404,message:'No such object'}});
 }
 json(404,{});
});
let base='';
async function request(url,{timeoutMs,headers={},...o}={}){
 const u=new URL(url);
 const r=await fetch(base+u.pathname+u.search,{...o,headers:{...headers,'x-host':u.hostname}});
 if(!r.ok){const e=Error('Сервис вернул HTTP '+r.status);e.status=r.status;e.detail=(await r.text()).slice(0,500);throw e;}
 return r.json();
}
const services=(settings={})=>{const topic={id:'t',title:'Чат',messages:[]};return {settings:{extension_iap:'true',...settings},request,requestProgress:{report(){}},dataRoot:'',
 dialogue:{state:{topics:[topic]},active:()=>topic,persist(){},rememberAction(c,t){topic.messages.push({role:'user',text:c},{role:'assistant',text:t});}}};};
const ASC={iapAscIssuer:ISSUER,iapAscKeyId:KEY_ID,iapAscKey:P8,iapAscVendor:VENDOR};
const PLAY={iapPlayBucket:BUCKET,iapPlayPackages:'com.studio.bw',googlePlayCredential:SA};

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 asc.deps.base=base;gp.deps.base=base;
 app.deps.now=()=>NOW;app.deps.metrics=[];app.deps.ads=[];app.deps.ua={list:()=>[],fetchAll:async()=>({rows:[],used:[]})};
 const sources=PS.load();
 assert.deepEqual(sources.map(x=>x.id),['appstore','googleplay','sql-purchases']);
 try{
  // Not added → nobody; added without a source → the question.
  assert.equal(await app.turn({...services(),settings:{extension_iap:'false'}},'покупки в игре за неделю'),null);
  assert.equal(await app.turn(services(),'выручка с рекламы за неделю'),null);
  const q0=await app.turn(services(),'покупки в игре за неделю');
  assert.equal(q0.question,true);assert.match(q0.text,/App Store Connect/);assert.match(q0.text,/SQL по словам/);
  // The store key of «Отзывы в сторах» is used when this app has none.
  assert.equal(asc.key({storeReviewsAscIssuer:ISSUER,storeReviewsAscKeyId:KEY_ID,storeReviewsAscKey:P8}).shared,true);

  // App Store + Google Play, a week.
  const s=services({...ASC,...PLAY});
  const r=await app.turn(s,'покупки в игре за неделю');
  const c=r.extensionData.iapCard;
  assert.equal(c.state,'done');assert.deepEqual(c.period,{from:'2026-11-02',to:'2026-11-08',label:'за 7 дней',days:7});
  const days=calls.filter(x=>x.path==='/v1/salesReports').map(x=>x.query['filter[reportDate]']).sort();
  assert.deepEqual(days,['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
  assert.ok(calls.some(x=>x.path==='/storage/v1/b/'+BUCKET+'/o/sales%2Fsalesreport_202611.zip'&&x.query.alt==='media'));
  assert.deepEqual(c.currencies.map(b=>b.currency),['USD','RUB','EUR'],'by number of purchases');
  const usd=c.currencies.find(b=>b.currency==='USD'),rub=c.currencies.find(b=>b.currency==='RUB'),eur=c.currencies.find(b=>b.currency==='EUR');
  // USD: 3 days × (3 gems + 1 VIP) = 12, one refund of 4.99.
  assert.equal(usd.units,12);assert.equal(usd.amount,Math.round((3*3*4.99+3*9.99)*100)/100);assert.equal(usd.refunds,1);assert.equal(usd.refunded,4.99);
  assert.equal(usd.products.find(p=>p.product==='vip_month').type,'subscription');
  // RUB: App Store 3 days × 2 × 349 + Google Play 349 + 1290 (the other package and the cancelled order are left out).
  assert.equal(rub.amount,3*2*349+349+1290);assert.equal(rub.refunds,1);assert.equal(rub.refunded,349);
  assert.deepEqual(rub.stores.map(x=>x.store).sort(),['appstore','googleplay']);
  assert.equal(eur.amount,8.99);
  assert.ok(!c.currencies.some(b=>b.products.some(p=>p.product==='bw.app')),'app downloads are not purchases');
  assert.equal(c.payers,null);
  assert.match(r.text,/^Покупки в игре за 7 дней: 12 покупок на 74,88\s\$, возвратов 1 \(8,3%, 4,99\s\$\)\. Больше всего приносит «Кристаллы M»: 44,91\s\$ \(60%\)\. Ещё 3\s733\s₽, 8,99\s€ — валюты не складываю\./u);
  // A store that refuses: told apart, the other still shown.
  const bad=services({...ASC,iapAscKeyId:'ZZZZZ99999',...PLAY});
  const half=(await app.turn(bad,'покупки в игре за неделю')).extensionData.iapCard;
  assert.equal(half.sources.find(x=>x.id==='appstore').ok,false);assert.match(half.sources.find(x=>x.id==='appstore').error,/Issuer ID, Key ID/);
  assert.deepEqual(half.currencies.map(b=>b.currency),['RUB','EUR']);
  // Google Play: a month without a report is a note.
  const oct=(await app.turn(services(PLAY),'продажи в Google Play за 14 дней')).extensionData.iapCard;
  assert.ok(oct.sources[0].notes.some(n=>/2026-10 ещё нет/.test(n)));

  // --- The database: pending until «Выполнить» -----------------------------------------------------------------------------
  const ran=[];
  const SCHEMA={tables:[{name:'game.purchases',columns:[{name:'user_id',type:'String'},{name:'purchase_time',type:'DateTime'},{name:'product_id',type:'String'},{name:'price_usd',type:'Decimal(18,2)'},{name:'is_refund',type:'UInt8'},{name:'platform',type:'String'}]}]};
  const t=sqlSource.detect(SCHEMA);
  assert.equal(t.currency,null);assert.equal(t.currencyHint,'USD');
  for(const dialect of ['clickhouse','postgres','bigquery','mysql']){const checked=V.check(sqlSource.build(t,{dialect,start:'2026-10-10',end:'2026-11-08'}),{dialect,maxRows:5000});assert.deepEqual(V.tables(checked.sql,dialect).map(x=>x.name),['purchases','purchases'],dialect);}
  const sqlDeps=require('../src/extensions/sql/sources.cjs');
  const conn={id:'ch',name:'Аналитика',kind:'clickhouse',dialect:'clickhouse',label:'Аналитика'};
  const realAll=sqlDeps.all,realEngine=sqlDeps.engine;
  sqlDeps.all=async()=>[conn];
  sqlDeps.engine=()=>({schema:async()=>SCHEMA,estimate:async()=>({kind:'rows',value:812000}),run:async sql=>{ran.push(sql);return {columns:['part','d','product','currency','platform','refund','units','amount','payers'].map(name=>({name})),rows:[
   ['payers_total','','','','',0,0,0,410],['new_payers','','','','',0,0,0,120],['payers_cur','','','USD','',0,0,6120.5,410],
   ['payers_day','2026-11-02','','','',0,0,0,60],['payers_day','2026-11-03','','','',0,0,0,80],
   ['first_product','','starter','','',0,0,0,70],['first_product','','gems_s','','',0,0,0,50],
   ['sales','2026-11-02','starter','USD','ios',0,40,199.6,0],['sales','2026-11-03','gems_m','USD','android',0,300,1497,0],['sales','2026-11-03','gems_m','USD','android',1,6,29.94,0]]};}});
  app.deps.metrics=[{id:'appmetrica',name:'AppMetrica',source:{fetch:async()=>({series:[{metric:'dau',series:[{date:'2026-11-02',value:12000},{date:'2026-11-03',value:16000}]}]})}}];
  app.deps.ads=[{id:'max',name:'AppLovin MAX',source:{fetch:async()=>({rows:[{day:'2026-11-02',revenue:300},{day:'2026-11-03',revenue:200.5},{day:'2026-10-01',revenue:999}]})}}];
  app.deps.ua={list:()=>[{id:'applovin-ua'}],fetchAll:async()=>({rows:[{currency:'USD',spend:1500},{currency:'USD',spend:500},{currency:'EUR',spend:100}],used:[{name:'AppLovin'}]})};
  const d=services({extension_sql:'true',sqlConnections:JSON.stringify([{id:'ch',name:'Аналитика',kind:'clickhouse',url:'https://ch.example.com'}])});
  const pending=(await app.turn(d,'конверсия в платящих и ARPPU за неделю')).extensionData.iapCard;
  assert.equal(pending.state,'pending');assert.equal(ran.length,0,'nothing runs before «Выполнить»');
  assert.equal(pending.plan.table,'game.purchases');assert.match(pending.plan.sql,/uniqExact\(buyer\)/);assert.match(pending.plan.sql,/LIMIT 5000/);
  assert.deepEqual(pending.plan.estimate,{kind:'rows',value:812000});
  // The registry refuses to read a confirming source without the plan.
  await assert.rejects(()=>PS.create(d).fetch('sql-purchases',{start:'2026-11-02',end:'2026-11-08'}),/только после подтверждения/);
  const done=await app.run(d,pending.id);
  assert.equal(done.state,'done');assert.equal(ran.length,1);
  assert.equal(done.payers.total,410);assert.equal(done.payers.newPayers,120);
  assert.equal(done.payers.byCurrency[0].arppu,Math.round(6120.5/410*100)/100);
  assert.deepEqual(done.payers.first.map(f=>[f.product,f.share]),[['starter',0.5833],['gems_s',0.4167]]);
  assert.equal(done.payers.conversion.value,Math.round(((60/12000+80/16000)/2)*1e5)/1e5);
  assert.equal(done.currencies[0].currency,'USD');assert.equal(done.currencies[0].amount,1696.6);assert.equal(done.currencies[0].refunds,6);
  // ROAS per spend currency: USD = (IAP net + ads of the period) / USD spend; EUR has no purchases → only the spend.
  const usdRoas=done.blend.rows.find(x=>x.currency==='USD');
  assert.equal(usdRoas.spend,2000);assert.equal(usdRoas.iap,Math.round((1696.6-29.94)*100)/100);assert.equal(usdRoas.ads,500.5);
  assert.equal(usdRoas.roas,Math.round((1666.66+500.5)/2000*1e4)/1e4);
  assert.equal(done.blend.rows.find(x=>x.currency==='EUR'),undefined,'EUR spend without EUR revenue is not a 0% ROAS');assert.deepEqual(done.blend.spendLeft,['EUR']);
  await assert.rejects(()=>app.run(d,pending.id),/уже выполнен/);
  const stored=d.dialogue.state.topics[0].messages.at(-1);
  assert.match(stored.text,/Платящих 410, из них впервые 120, ARPPU 14,93\s\$, конверсия в платящих 0,5% в день/u);
  assert.match(stored.text,/ROAS с покупками и рекламой 108,4% \(2\s167\s\$ на 2\s000\s\$ закупки\)/);
  sqlDeps.all=realAll;sqlDeps.engine=realEngine;

  // Analysis alone: two currencies of payers stay apart.
  const a=analysis.analyse({sources:[{rows:mixed,payers:{total:3,newPayers:1,days:[],byCurrency:[{currency:'RUB',payers:2,amount:100},{currency:'USD',payers:1,amount:5}],first:[]}}],period:{start:'2026-11-01',end:'2026-11-02'}});
  assert.deepEqual(a.payers.byCurrency.map(x=>[x.currency,x.arppu]),[['RUB',50],['USD',5]]);
  // The ZIP reader refuses junk.
  assert.throws(()=>zip.file(Buffer.from('not a zip')),/не ZIP/);
  console.log('In-app purchases: routing and near-misses, offer, purchase-source rows never mixing currencies, App Store sales reports (ES256 JWT verified, gzip TSV, 404 days, refunds, IAP types only), Google Play reports in Cloud Storage (JWT grant, ZIP, CSV quotes, refunds, cancelled, packages, missing month), a failing store told apart, the database query pending until «Выполнить» then payers, ARPPU, first purchases, conversion with DAU and ROAS with purchases and ads per currency passed');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
