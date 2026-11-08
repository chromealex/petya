// The monitor-source foundation (src/features/monitor-sources.cjs), independent of any app: declarations are
// validated, sources count only while their extension is added and connected, answers are normalized, services
// from several sources and alerts are merged, the shared service identity, the one write (silence) refuses vague
// matchers, a failing or slow source does not break the snapshot, and state changes are deduplicated and
// protected against flapping on a fake clock.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const M=require('../src/features/monitor-sources.cjs');
(async()=>{
 // --- Declarations through `provides` ---
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-monitor-sources-'));
 const ext=(id,files,extra={})=>{fs.mkdirSync(path.join(dir,id));fs.writeFileSync(path.join(dir,id,'extension.json'),JSON.stringify({id,name:id.toUpperCase(),setting:'extension_'+id,provides:{'monitor-source':Object.keys(files)},...extra}));for(const [f,src] of Object.entries(files))fs.writeFileSync(path.join(dir,id,f),src);};
 ext('alpha',{'a.cjs':`module.exports={id:'alpha',name:'Alpha',ready:s=>!!s.alphaUrl,
  async services(s,q){return [{name:'API',status:'ok',since:'2026-11-09T10:00:00Z',signals:{errorRate:'0.002',latencyP95:0.2,rps:40},series:{rps:[[2,1],[1,2],['x',3]]}},{name:'db',status:'bogus'}];},
  async alerts(s,q){return [{labels:{alertname:'HighErrors',severity:'page',job:'api',instance:'api-1:8080'},annotations:{summary:'5xx > 5%'},startsAt:'2026-11-09T11:00:00Z'},{labels:{alertname:'DiskFull',app:'db',severity:'warning'},startsAt:'2026-11-09T09:00:00Z',silenced:true}];},
  async history(){return [{service:'api',from:'2026-11-08T10:00:00Z',to:'2026-11-08T10:30:00Z',title:'down',kind:'uptime'},{service:'x'}];},
  async silence(s,b){globalThis.__silence=b;return {id:'sil-1'};}};`});
 ext('beta',{'b.cjs':`module.exports={ready:()=>true,async services(){return [{name:'api',status:'critical',since:'2026-11-09T11:30:00Z',signals:{latencyP95:2.5}}];},
  async alerts(){return [{labels:{alertname:'HighErrors',severity:'critical',service:'api',instance:'api-1:8080',job:'api'},startsAt:'2026-11-09T10:59:00Z'}];}};`});
 ext('slow',{'c.cjs':`module.exports={ready:()=>true,async services(){await new Promise(r=>setTimeout(r,400));return [];},async alerts(){throw Error('нет доступа');}};`});
 ext('broken',{'d.cjs':`module.exports={ready:()=>true};`},{});
 assert.throws(()=>M.load(dir),/Invalid monitor source broken/,'a source must answer at least one of services/alerts/history');
 fs.rmSync(path.join(dir,'broken'),{recursive:true});
 const sources=M.load(dir);
 assert.deepEqual(sources.map(x=>[x.id,x.extension,x.setting]),[['alpha','alpha','extension_alpha'],['beta','beta','extension_beta'],['slow','slow','extension_slow']]);
 // The real declarations: four sources of «Мониторинг».
 assert.deepEqual(M.load().map(x=>x.id),['alertmanager','grafana','prometheus','uptime']);
 assert.ok(M.load().every(x=>x.extension==='monitoring'&&x.setting==='extension_monitoring'));

 // --- Ready = added + connected, read at call time ---
 const settings={};const s={settings};
 const reg=M.create(s,{sources,timeoutMs:150});
 assert.deepEqual(reg.list(),[]);
 settings.extension_alpha='true';assert.deepEqual(reg.list(),[],'added but not connected');
 settings.alphaUrl='https://x';assert.deepEqual(reg.list().map(x=>x.id),['alpha']);
 assert.equal(reg.find('alpha').canSilence,true);assert.deepEqual(reg.find('alpha').has,['services','alerts','history','silence']);
 await assert.rejects(()=>reg.services('beta',{}),/не добавлен или не подключён/);

 // --- Normalization ---
 const svc=await reg.services('alpha',{now:Date.parse('2026-11-09T12:00:00Z')});
 assert.deepEqual(svc[0].signals,{errorRate:0.002,latencyP95:0.2,rps:40,saturation:null});
 assert.equal(svc[0].name,'api','names are lowercased');
 assert.deepEqual(svc[0].series.rps,[[1,2],[2,1]],'series sorted, junk points dropped');
 assert.equal(svc[1].status,'unknown','an unknown status becomes «unknown»');
 const al=await reg.alerts('alpha',{});
 assert.equal(al[0].severity,'critical','«page» is critical');assert.equal(al[0].service,'api','service from the job label');
 assert.equal(al[1].service,'db');assert.equal(al[1].severity,'warning');assert.equal(al[1].silenced,true);
 assert.equal((await reg.history('alpha',{})).length,1,'an event without a start is dropped');

 // --- Service identity (shared with the log-source foundation) ---
 assert.equal(M.serviceOf({service:'Payments'}),'payments');
 assert.equal(M.serviceOf({app_kubernetes_io_name:'checkout',job:'kubernetes-pods'}),'checkout');
 assert.equal(M.serviceOf({job:'kubernetes-pods',instance:'10.0.0.5:9100'}),'10.0.0.5','generic scrape jobs are skipped');
 assert.equal(M.serviceOf({job:'node-exporter',instance:'web-1.prod:9100'}),'web-1.prod');
 assert.equal(M.serviceOf({job:'api-prod'},M.parseAliases('api-prod = api')),'api','aliases');
 assert.deepEqual(M.parseAliases('a=b, c -> d\ne → f'),{a:'b',c:'d',e:'f'});
 assert.equal(M.findService('почему лежит api?',['api','api-gateway','db']),'api');
 assert.equal(M.findService('что с api-gateway',['api','api-gateway']),'api-gateway','the longest name wins');
 assert.equal(M.findService('как там погода',['api']),'');

 // --- Snapshot: merge, dedupe, per-source failures and timeouts ---
 settings.extension_beta='true';settings.extension_slow='true';
 const snap=await reg.snapshot({now:Date.parse('2026-11-09T12:00:00Z'),from:Date.parse('2026-11-09T06:00:00Z')});
 const api=snap.services.find(x=>x.name==='api');
 assert.equal(api.status,'critical','the worst status wins');assert.equal(api.since,'2026-11-09T10:59:00.000Z','a critical alert that started earlier moves «since»');
 assert.equal(api.signals.rps,40);assert.equal(api.signals.latencyP95,0.2,'the first known value of a signal is kept');
 assert.deepEqual(api.sources.sort(),['alpha','beta']);
 assert.equal(snap.services[0].name,'api','worst first');
 const db=snap.services.find(x=>x.name==='db');assert.equal(db.status,'unknown','a silenced warning does not change the status');
 assert.equal(snap.alerts.filter(a=>a.name==='HighErrors').length,1,'the same alert from two sources is one row');
 assert.equal(snap.alerts.find(a=>a.name==='HighErrors').startsAt,'2026-11-09T10:59:00.000Z','earliest start');
 const slow=snap.sources.find(x=>x.id==='slow');assert.match(slow.error,/не ответил вовремя|нет доступа/);
 assert.equal(snap.sources.find(x=>x.id==='alpha').error,'');
 // Only the asked sources.
 assert.deepEqual((await reg.snapshot({},{only:['beta']})).sources.map(x=>x.id),['beta']);

 // --- The one write: exact matchers and a bounded duration ---
 const t0=Date.parse('2026-11-09T12:00:00Z'),iso=ms=>new Date(ms).toISOString();
 await assert.rejects(()=>reg.silence('alpha',{matchers:[{name:'alertname',value:'.*',isRegex:true}],startsAt:iso(t0),endsAt:iso(t0+3600000)}),/точным условиям/);
 await assert.rejects(()=>reg.silence('alpha',{matchers:[{name:'alertname',value:'X'},{name:'job',value:''}],startsAt:iso(t0),endsAt:iso(t0+3600000)}),/Пустое значение/);
 await assert.rejects(()=>reg.silence('alpha',{matchers:[{name:'alertname',value:'X'}],startsAt:iso(t0),endsAt:iso(t0)}),/на сколько/);
 await assert.rejects(()=>reg.silence('alpha',{matchers:[{name:'alertname',value:'X'}],startsAt:iso(t0),endsAt:iso(t0+8*86400000)}),/7 дней/);
 await assert.rejects(()=>reg.silence('beta',{matchers:[{name:'alertname',value:'X'}],startsAt:iso(t0),endsAt:iso(t0+3600000)}),/не умеет глушить/);
 const r=await reg.silence('alpha',{matchers:[{name:'alertname',value:'HighErrors'},{name:'bad name',value:'x'}],startsAt:iso(t0),endsAt:iso(t0+3600000)});
 assert.deepEqual(r,{id:'sil-1',source:'alpha'});
 assert.deepEqual(globalThis.__silence.matchers,[{name:'alertname',value:'HighErrors',isRegex:false,isEqual:true}],'invalid label names are dropped');
 assert.equal(globalThis.__silence.createdBy,'Petya');

 // --- Transitions: dedupe and flapping on a fake clock ---
 let now=0;const MIN=60000;
 const tr=M.transitions({now:()=>now,confirm:2,flapLimit:4,flapWindow:30*MIN});
 const step=(st,dt=MIN)=>{now+=dt;return tr.observe('api',st);};
 assert.equal(step('ok'),null,'baseline ok says nothing');
 assert.equal(step('critical'),null,'one bad probe is not «down»');
 assert.equal(step('ok'),null,'and it recovered');
 assert.equal(step('critical'),null);assert.equal(step('critical').type,'down','two in a row → down');
 assert.equal(step('critical'),null,'no repeat while down');assert.equal(step('unknown'),null,'unknown is ignored');
 assert.equal(step('warn'),null);const rec=step('warn');assert.equal(rec.type,'recovered','warn counts as up');
 assert.equal(step('ok'),null,'warn → ok is not news');
 // Flapping: changes 1 (down), 2 (recovered) above; two more within 30 minutes → one «flapping».
 assert.equal(step('critical'),null);assert.equal(step('critical').type,'down');
 step('ok');const flap=step('ok');assert.equal(flap.type,'flapping');assert.equal(flap.changes,4);
 for(let i=0;i<6;i++){assert.equal(step(i%2?'ok':'critical'),null,'silent while flapping');}
 assert.equal(tr.status('api'),'flapping');
 // Settles down for 30 minutes → one «down» (the last told was «recovered» before flapping).
 const states=[];for(let i=0;i<31;i++)states.push(step('critical'));
 assert.deepEqual(states.filter(Boolean).map(e=>[e.type,e.settled]),[['down',true]]);
 // Restart: the state survives, nothing is told again.
 const tr2=M.transitions({now:()=>now});tr2.restore(tr.state());
 now+=MIN;assert.equal(tr2.observe('api','critical'),null);now+=MIN;assert.equal(tr2.observe('api','critical'),null);
 // A service first seen down is told after confirmation.
 now+=MIN;assert.equal(tr2.observe('db','critical'),null);now+=MIN;assert.equal(tr2.observe('db','critical').type,'down');
 fs.rmSync(dir,{recursive:true,force:true});
 console.log('Monitor sources foundation: declarations, ready = added + connected, normalization, service identity, merge and dedupe, per-source failures, exact silences, dedupe and flapping on a fake clock passed');
})().catch(e=>{console.error(e);process.exit(1);});
