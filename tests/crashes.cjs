// «Крэши» (source-agnostic): routing incl. near-misses that belong to other apps, filters, the crash-source registry
// (declarations, added/ready, named sources, normalization), not added / no source ready → the offer question,
// a named source not connected, the merged card of three sources (totals per source, chart by issue and by source,
// per-source rows, «новый», resolve only where supported), source filters by name, one source failing, every source
// failing, notes, release dates from the sources, onlyNew, the model line, resolve/reopen ipc and the offer.
// No network: sources are stubs. Real sources have their own tests (sentry.cjs, google-play-crashes.cjs, crashlytics.cjs).
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/crashes/feature.cjs');
const query=require('../src/extensions/crashes/query.cjs');
const offer=require('../src/extensions/crashes/offer.cjs');
const registry=require('../src/features/crash-sources.cjs');
const offers=require('../src/features/extension-offers.cjs');

const NOW=new Date('2026-11-08T10:00:00Z');
const DAY=86400000;
const today=Date.UTC(2026,10,8);
const days14=values=>values.map((v,i)=>({day:new Date(today-(13-i)*DAY).toISOString().slice(0,10),count:v}));
const issue=(id,title,events,users,isNew,values,extra={})=>({id,title,culprit:'Player.Update',level:'fatal',events,users,firstSeen:isNew?'2026-11-05T12:00:00Z':'2026-09-01T00:00:00Z',lastSeen:'2026-11-08T09:00:00Z',
 platform:'Android',project:'game',url:'https://example.test/'+id,daily:days14(values),isNew,...extra});

// Three fake sources shaped like the registry's load(): a resolvable one, an Android-only one, a third.
function fakes(over={}){
 const calls=[];
 const make=(id,name,setting,list,extra={})=>({id,extension:id,setting,name,color:'#123456',service:'',source:{
  names:[new RegExp(name.split(' ')[id==='alpha'?0:1],'iu')],ready:s=>s[id+'Key']==='1',
  async issues(s,q){calls.push([id,q]);if(over[id])return over[id](q);return {issues:list,url:'https://'+id+'.test/list',scope:id+'-scope'};},
  ...extra}});
 const sources=[
  make('alpha','Alpha Crash','extension_alpha',[issue('a1','NullReferenceException',540,120,false,[10,12,9,20,30,25,40,50,60,70,80,90,100,105]),issue('a2','IndexOutOfRange',300,80,true,[0,0,0,0,0,0,0,0,0,0,40,80,90,90])],
   {async release(s,name){calls.push(['alpha-release',name]);return name==='1.4.2'?{name,versions:['g@1.4.2+102'],date:'2026-11-04T08:00:00Z'}:null;},
    async crashFree(s,q){return q.found?{sessions:0.9871,users:0.9712,total:52000}:null;},
    async resolve(s,id){calls.push(['resolve',id]);return {text:'Отмечено решённым в Alpha'};},async reopen(s,id){calls.push(['reopen',id]);return {text:'Снова открыто в Alpha'};}}),
  make('beta','Beta Play','',[issue('b1','java.lang.IllegalStateException',200,90,false,[1,1,1,1,1,1,5,5,5,5,5,5,5,5]),issue('b2','SIGSEGV libunity.so',60,30,true,[0,0,0,0,0,0,0,0,0,0,0,10,20,30])]),
  make('gamma','Gamma Lytics','extension_gamma',[issue('g1','EXC_BAD_ACCESS',90,40,false,[2,2,2,2,2,2,2,3,3,3,3,3,3,3],{platform:'iOS'})])
 ];
 return {sources,calls};
}
function services({settings={},over,offersStub}={}){
 const topic={id:'t',title:'Чат',messages:[]};
 const {sources,calls}=fakes(over);
 const s={settings:{model:'',ollamaUrl:'http://127.0.0.1:11434/api/chat',extension_crashes:'true',extension_alpha:'true',alphaKey:'1',betaKey:'1',extension_gamma:'true',gammaKey:'1',...settings},
  requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  async request(url,options={}){if(String(url).endsWith('/api/chat'))return {message:{content:JSON.stringify({common:'Все в игровом цикле Unity'})}};throw Error('unexpected request '+url);}};
 s.crashSources=registry.create(s,{sources});
 if(offersStub)s.extensionOffers=offersStub;
 return {s,topic,calls};
}

(async()=>{
 // --- Routing: crash requests; ANR, red builds, «сервер упал», fixes, Jira and Firebase products are not ---
 for(const p of ['какие крэши за неделю','топ крэшей','новые крэши после релиза 1.4.2','что с крэшами на андроиде','сколько падений вчера','покажи краши на iOS'])
  assert.ok(query.about(p),'should trigger: '+p);
 assert.ok(query.about('что в Sentry за сутки',{standalone:true}));assert.ok(query.about('Sentry',{standalone:true}));
 assert.ok(query.about('крэши в Google Play',{named:true}),'a crash word with a named source is a request');
 assert.ok(!query.about('крэши в Google Play'),'without a named source the bare phrase is not a request');
 for(const p of ['ANR за неделю','какие ANR на андроиде','сколько ANR вчера','упала сборка','сборка опять упала','почему упала сборка 1.4.2','сервер упал','сервер упал, что делать','падение продаж за неделю','какой вылет рейса',
  'исправь крэш в PlayerController','Исправь баг в коде — крэш из Sentry: NRE в Player.Update','Создай задачу в Jira: Крэш GAME-1 — NRE','что такое крэш-репорт','зависания на андроиде','у меня всё крашится иногда','пиши крэш-тесты','',
  'что в Firebase Analytics за неделю','настрой Firebase Remote Config','крэши и ANR в Google Play'])
  assert.ok(!query.about(p),'should not trigger: '+p);
 // Filters: every period has start and end; statsPeriod for relative ones.
 const yesterday=query.period('сколько падений вчера',new Date(2026,10,8,15,0));
 assert.equal(yesterday.label,'вчера');assert.equal(new Date(yesterday.start).getDate(),7);assert.equal(Date.parse(yesterday.end)-Date.parse(yesterday.start),DAY);
 const week=query.period('крэши за неделю',NOW);assert.equal(week.statsPeriod,'7d');assert.equal(Date.parse(week.end)-Date.parse(week.start),7*DAY);
 assert.equal(query.period('крэши за 3 дня').statsPeriod,'3d');assert.equal(query.period('крэши за сутки').statsPeriod,'24h');assert.equal(query.period('крэши за 12 часов').statsPeriod,'12h');assert.equal(query.period('топ крэшей'),null);
 assert.equal(query.release('новые крэши после релиза 1.4.2'),'1.4.2');assert.equal(query.release('крэши в версии v2.0.1-rc1'),'2.0.1-rc1');assert.equal(query.release('крэши в Google Play versionCode 10422'),'10422');assert.equal(query.release('топ крэшей за 7 дней'),null);
 assert.equal(query.platform('что с крэшами на андроиде'),'Android');assert.equal(query.platform('крэши на айфоне'),'iOS');assert.equal(query.platform('крэши game-ios'),null);
 assert.equal(query.environment('крэши в проде'),'production');assert.equal(query.environment('топ крэшей'),'');

 // --- Registry: real declarations, each only while its extension is added and connected ---
 const real=registry.load();
 assert.deepEqual(real.map(x=>[x.id,x.extension,x.setting,x.service]),[['crashlytics','crashlytics','extension_crashlytics',''],['google-play','google-play','module_googleplay',' googleplay'.trim()],['sentry','sentry','extension_sentry','']]);
 const live=registry.create({settings:{}});
 assert.deepEqual(live.list(),[],'a new user has no crash source');
 assert.deepEqual(live.named('крэши в Google Play'),['google-play']);assert.deepEqual(live.named('только Sentry'),['sentry']);assert.deepEqual(live.named('что в Crashlytics'),['crashlytics']);
 assert.deepEqual(live.named('крэши в гугл плей и Firebase'),['crashlytics','google-play']);assert.deepEqual(live.named('топ крэшей'),[]);
 assert.equal(live.standalone('что в Sentry'),true);assert.equal(live.standalone('крэши в Google Play'),false,'Google Play alone is the ANR card or reviews');
 const liveSettings={extension_sentry:'true',sentryToken:'t',sentryOrg:'o',module_googleplay:'true',googlePlayCredential:'{}'};
 assert.deepEqual(registry.create({settings:liveSettings}).list().map(x=>x.id),['google-play','sentry']);
 assert.deepEqual(registry.create({settings:{...liveSettings,module_googleplay:'false',extension_sentry:'false'}}).list(),[],'a removed extension or a switched-off service is not read');
 assert.equal(registry.create({settings:liveSettings}).find('sentry').canResolve,true);assert.equal(registry.create({settings:liveSettings}).find('google-play').canResolve,false);
 // Invalid declarations are refused.
 const dirs=[];
 const fake=code=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-crash-sources-'));dirs.push(dir);
  fs.mkdirSync(path.join(dir,'bad'));fs.writeFileSync(path.join(dir,'bad','extension.json'),JSON.stringify({id:'bad',name:'Bad',setting:'extension_bad',provides:{'crash-source':'crash-source.cjs'}}));
  fs.writeFileSync(path.join(dir,'bad','crash-source.cjs'),code);return dir;};
 assert.throws(()=>registry.load(fake('module.exports={ready:()=>true};')),/Invalid crash source bad/);
 assert.throws(()=>registry.load(fake('module.exports={ready:()=>true,issues:async()=>[],resolve:1};')),/Invalid crash source/);
 assert.throws(()=>registry.load(fake('module.exports={ready:()=>true,issues:async()=>[],names:["sentry"]};')),/Invalid crash source/);
 const dir=fake("module.exports={name:'Bad',ready:()=>true,async issues(){return {issues:[{id:'x',title:'<b>t</b>',events:'12',users:-3,level:'boom',url:'javascript:alert(1)',daily:[{day:'nope',count:1},{day:'2026-11-08',count:'4'}]}],more:1}}};");
 const one=registry.create({settings:{extension_bad:'true'}},{sources:registry.load(dir)});
 const got=await one.issues('bad',{});
 assert.deepEqual(got.issues[0],{id:'x',source:'bad',title:'<b>t</b>',culprit:'',level:'error',events:12,users:0,firstSeen:null,lastSeen:null,versions:[],platform:'',project:'',shortId:'',daily:[{day:'2026-11-08',count:4}],isNew:false,url:'',unhandled:false},'normalized, unsafe links dropped');
 assert.equal(got.more,true);
 await assert.rejects(registry.create({settings:{}},{sources:registry.load(dir)}).issues('bad',{}),/не добавлен или не подключён/);
 for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});

 // --- Not added: nothing here (the offer handles it) ---
 let {s,topic,calls}=services({settings:{extension_crashes:'false'}});
 assert.equal(await app.turn(s,'какие крэши за неделю'),null);
 // Added, no source ready: the offer card lists every source to connect; without the offers service, a plain question.
 const proposed=[];
 const offersStub={propose(command,ids,text,by){proposed.push({command,ids,text,by});return {handled:true,question:true,text,by,extensionData:{extensionOffer:{items:ids.map(id=>({ext:id}))}}};}};
 ({s,calls}=services({settings:{alphaKey:'',betaKey:'',gammaKey:''},offersStub}));
 const none=await app.turn(s,'какие крэши за неделю');
 assert.equal(none.question,true);assert.deepEqual(proposed[0].ids,['alpha','beta','gamma']);assert.equal(proposed[0].by,'Крэши');
 assert.equal(proposed[0].text,'Крэши пока неоткуда взять: подключите источник — Alpha Crash, Beta Play или Gamma Lytics. Какой подключить?');
 assert.equal(calls.length,0,'nothing read');
 ({s,calls}=services({settings:{alphaKey:'',betaKey:'',gammaKey:''}}));
 const plain=await app.turn(s,'какие крэши за неделю');assert.equal(plain.question,true);assert.match(plain.text,/подключите источник/);
 // A named source that is not connected: offered by itself, even when others are ready.
 proposed.length=0;({s,calls}=services({settings:{gammaKey:''},offersStub}));
 const lytics=await app.turn(s,'крэши в Lytics за неделю');
 assert.equal(lytics.question,true);assert.deepEqual(proposed[0].ids,['gamma']);assert.equal(proposed[0].text,'«Gamma Lytics» ещё не подключён к «Крэшам». Подключить?');assert.equal(calls.length,0);
 // Near-misses are not claimed even when added.
 ({s,calls}=services());
 for(const p of ['ANR за неделю','упала сборка','сервер упал','что в Firebase Analytics за неделю'])assert.equal(await app.turn(s,p),null,p);

 // --- Merged card of three sources ---
 ({s,topic,calls}=services());
 const merged=await app.crashesTurn(s,'какие крэши за неделю',NOW);
 const card=merged.extensionData.crashCard;
 assert.deepEqual(calls.map(c=>c[0]),['alpha','beta','gamma'],'every ready source is read once');
 const q=calls[0][1];assert.equal(q.period.label,'за неделю');assert.equal(q.period.statsPeriod,'7d');assert.equal(q.text,'какие крэши за неделю');assert.equal(q.release,null);assert.equal(q.since,Date.parse(q.period.start));
 assert.deepEqual(card.sources.map(x=>[x.id,x.name,x.issues,x.events,x.users,x.fresh,x.canResolve]),[['alpha','Alpha Crash',2,840,200,1,true],['beta','Beta Play',2,260,120,1,false],['gamma','Gamma Lytics',1,90,40,0,false]]);
 assert.deepEqual(card.totals,{issues:5,more:false,events:1190,users:360,fresh:2});
 assert.deepEqual(card.issues.map(i=>i.source+':'+i.id),['alpha:a1','alpha:a2','beta:b1','beta:b2','gamma:g1'],'rows by source, most events first inside');
 assert.deepEqual(card.issues.map(i=>i.canResolve),[true,true,false,false,false],'«Решено» only where the source supports it');
 assert.equal(card.chart.days.length,7);assert.equal(card.chart.days.at(-1),'2026-11-08');
 assert.deepEqual(card.chart.series.map(x=>x.id),['alpha:a1','alpha:a2','beta:b1','gamma:g1','beta:b2'],'five issues across sources, no rest');
 assert.deepEqual(card.chart.bySource.map(x=>x.id),['alpha','beta','gamma']);
 assert.deepEqual(card.chart.bySource[1].values,[5,5,5,5,15,25,35],'Beta per day: b1 + b2');
 assert.deepEqual(card.chart.bySource.map(x=>x.values.reduce((a,b)=>a+b,0)).reduce((a,b)=>a+b,0),card.chart.series.reduce((n,x)=>n+x.values.reduce((a,b)=>a+b,0),0),'both splits sum to the same events');
 assert.equal(card.issues[0].spark.length,14);assert.equal(card.issues[0].spark.at(-1),105);assert.equal(card.issues[0].days,undefined);assert.equal(card.issues[0].daily,undefined);
 assert.equal(card.crashFree,undefined);assert.equal(card.sources[0].crashFree,null);assert.deepEqual(card.notes,[]);assert.equal(card.common,'');
 assert.match(merged.text,/^За неделю: 5 крэшей \(Alpha Crash — 2, Beta Play — 2, Gamma Lytics — 1\), 1\s190 событий, затронуто до 360 пользователей\. Чаще всего — «NullReferenceException» \(Alpha Crash, 540\)\. Новых: 2\.$/u);
 assert.equal(topic.messages.at(-1).by,'Крэши');
 assert.deepEqual(topic.messages.at(-1).sources.map(x=>x.url),['https://alpha.test/list','https://beta.test/list','https://gamma.test/list']);
 assert.ok(!JSON.stringify(card).includes('"daily"'),'raw daily buckets are not stored in the chat');
 // Source filters by name: only the named source is read.
 ({s,calls}=services());
 const onlyBeta=await app.turn(s,'крэши только Play за неделю');
 assert.deepEqual(calls.map(c=>c[0]),['beta']);assert.deepEqual(onlyBeta.extensionData.crashCard.sources.map(x=>x.id),['beta']);
 assert.match(onlyBeta.text,/^За неделю: 2 крэша, 260 событий/);
 ({s,calls}=services());await app.turn(s,'топ крэшей Alpha и Lytics');assert.deepEqual(calls.map(c=>c[0]),['alpha','gamma']);
 // A source that fails does not hide the others: its error is a note and its strip says so.
 ({s,calls}=services({over:{beta:()=>{throw Error('Google не выдал доступ к отчётам.');}}}));
 const partial=(await app.crashesTurn(s,'топ крэшей',NOW)).extensionData.crashCard;
 assert.deepEqual(partial.notes,[{source:'beta',text:'Beta Play: Google не выдал доступ к отчётам.',error:true}]);
 assert.equal(partial.sources[1].error,'Google не выдал доступ к отчётам.');assert.equal(partial.totals.issues,3);
 // Every source failing: an error reply naming each.
 ({s,calls}=services({settings:{gammaKey:''},over:{alpha:()=>{throw Error('нет сети');},beta:()=>{throw Error('нет доступа');}}}));
 const failed=await app.turn(s,'топ крэшей');
 assert.equal(failed.error,true);assert.equal(failed.text,'Крэши · Alpha Crash: нет сети Beta Play: нет доступа');
 // Nothing anywhere but explanations: a question with the notes.
 ({s,calls}=services({settings:{betaKey:'',gammaKey:''},over:{alpha:()=>({issues:[],note:'В Alpha нет релиза «9.9.9».'})}}));
 const unknown=await app.crashesTurn(s,'новые крэши после релиза 9.9.9',NOW);
 assert.equal(unknown.question,true);assert.equal(unknown.text,'В Alpha нет релиза «9.9.9».');
 // Empty result: an empty card, not a question.
 ({s,calls}=services({over:{alpha:()=>({issues:[]}),beta:()=>({issues:[]}),gamma:()=>({issues:[]})}}));
 const empty=await app.crashesTurn(s,'какие крэши за неделю',NOW);
 assert.equal(empty.text,'Крэшей за неделю нет (Alpha Crash, Beta Play, Gamma Lytics).');assert.equal(empty.extensionData.crashCard.issues.length,0);

 // --- Release: the date from a source that knows releases; only new ones; crash-free per source ---
 ({s,calls}=services());
 const rel=await app.crashesTurn(s,'новые крэши после релиза 1.4.2',NOW);
 const rc=rel.extensionData.crashCard;
 assert.deepEqual(calls.filter(c=>c[0]==='alpha-release').map(c=>c[1]),['1.4.2']);
 const rq=calls.find(c=>c[0]==='alpha')[1];
 assert.equal(rq.period.start,'2026-11-04T08:00:00.000Z');assert.equal(rq.period.label,'после релиза 1.4.2');assert.equal(rq.since,Date.parse('2026-11-04T08:00:00Z'));
 assert.deepEqual(rq.found,{name:'1.4.2',versions:['g@1.4.2+102'],date:'2026-11-04T08:00:00Z'});assert.equal(calls.find(c=>c[0]==='beta')[1].found,null,'sources without releases get the name only');
 assert.equal(calls.find(c=>c[0]==='beta')[1].release,'1.4.2');
 assert.deepEqual(rc.issues.map(i=>i.id),['a2','b2'],'only new issues');
 assert.deepEqual(rc.sources[0].crashFree,{sessions:0.9871,users:0.9712,total:52000});assert.equal(rc.sources[1].crashFree,null);
 assert.equal(rc.release.name,'1.4.2');assert.equal(rc.period.label,'после релиза 1.4.2');
 assert.match(rel.text,/^После релиза 1\.4\.2: 2 новых крэша \(Alpha Crash — 1, Beta Play — 1\)/);
 // Platform, environment and yesterday reach the sources as parsed values.
 ({s,calls}=services());await app.crashesTurn(s,'сколько падений вчера на андроиде в проде',NOW);
 assert.equal(calls[0][1].platform,'Android');assert.equal(calls[0][1].environment,'production');assert.equal(calls[0][1].period.label,'вчера');

 // --- With a model: one «что общего» line; broken answers are dropped ---
 ({s,calls}=services());s.settings.model='qwen3:4b';
 assert.equal((await app.crashesTurn(s,'топ крэшей',NOW)).extensionData.crashCard.common,'Все в игровом цикле Unity');
 ({s,calls}=services());s.settings.model='qwen3:4b';s.request=async()=>({message:{content:'not json'}});
 assert.equal((await app.crashesTurn(s,'топ крэшей',NOW)).extensionData.crashCard.common,'');

 // --- «Решено» and undo through ipc, dispatched to the issue's source; unsupported sources refuse ---
 ({s,calls}=services());
 const ipc=app.setup(s).ipc;
 assert.deepEqual(await ipc.resolve('alpha','a1'),{source:'alpha',id:'a1',status:'resolved',text:'Отмечено решённым в Alpha'});
 assert.deepEqual(await ipc.reopen('alpha','a1'),{source:'alpha',id:'a1',status:'unresolved',text:'Снова открыто в Alpha'});
 assert.deepEqual(calls,[['resolve','a1'],['reopen','a1']]);
 await assert.rejects(ipc.resolve('beta','b1'),/не умеет отмечать/);
 await assert.rejects(ipc.resolve('nope','1'),/Нет такого источника/);
 await assert.rejects(ipc.resolve('alpha',{}),/Некорректный/);
 s.settings.alphaKey='';await assert.rejects(ipc.resolve('alpha','a1'),/не подключён/);
 s.settings.extension_crashes='false';await assert.rejects(ipc.resolve('alpha','a1'),/не добавлено/);
 assert.deepEqual(app.setup(s).ipc.sources().map(x=>[x.id,x.ready]),[['alpha',false],['beta',true],['gamma',true]]);
 // Chat turns never write.
 ({s,calls}=services());for(const p of ['какие крэши за неделю','новые крэши после релиза 1.4.2'])await app.turn(s,p);
 assert.ok(!calls.some(c=>c[0]==='resolve'||c[0]==='reopen'));

 // --- Offer: generic pitch, never for ANR or red builds; sources have their own offers ---
 const list=offers.load();
 const settings={};
 const pick=t=>offers.candidates(t,{offers:list,settings}).map(r=>r.offer.id);
 for(const p of ['какие крэши за неделю','топ крэшей','сколько падений вчера'])assert.deepEqual(pick(p),['crashes'],'offered for: '+p);
 for(const p of ['ANR за неделю','упала сборка','сервер упал','падение продаж за неделю'])assert.ok(!pick(p).includes('crashes'),'not offered for: '+p);
 assert.match(offer.pitch,/Sentry, Firebase Crashlytics, Google Play/);
 assert.equal(offer.connect,'install');
 assert.equal(offer.ready({extension_crashes:'true'}),false,'added without a source is not ready');
 assert.equal(offer.ready({extension_crashes:'true',extension_sentry:'true',sentryToken:'x',sentryOrg:'o'}),true);
 assert.equal(offer.connected({module_googleplay:'true',googlePlayCredential:'{}'}),true,'the catalog sees a connected source before «Крэши» is added');
 console.log('Crashes: routing and near-misses, filters, crash-source registry, no source/named source offers, merged card of three sources, source filters, partial and total failures, notes, release, model line, resolve/reopen ipc and the offer passed');
 // The real sources have their own files; run them here so `npm test` covers them.
 for(const file of ['sentry.cjs','google-play-crashes.cjs','crashlytics.cjs'])if(require('node:fs').existsSync(require('node:path').join(__dirname,file)))await require('./'+file);
})().catch(e=>{console.error(e);process.exit(1);});
