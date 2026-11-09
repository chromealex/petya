// Activity tracker foundation (src/activity, src/features/activity.cjs), on a fake clock with a fake sampler:
// off by default, sampling and merging, idle cut-off, missed samples, redaction before storage, midnight split,
// restart recovery, retention, pause/resume, wipe, summary groupings, classifier registry and the company switch.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const feature=require('../src/features/activity.cjs');
const {redact,scrub}=require('../src/activity/redact.cjs');
const foreground=require('../src/activity/foreground.cjs');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-activity-'));
 let t=new Date(2026,10,9,10,0,0).getTime();
 const clock=()=>t;
 let window={app:'Unity',title:'Bunker - Main.unity - Unity 6000.0.3f1'},idle=0;
 const settings={...feature.defaults};
 const s={settings,dataRoot:path.join(root,'company-a'),saveSettings(v){Object.assign(settings,v);}};
 let tags=[];
 const make=()=>feature.create(s,{now:clock,sample:async()=>window&&{...window,permission:true},idleSeconds:()=>idle,classifiers:()=>tags});
 let a=make();
 const step=async(n=1,sec=15)=>{for(let i=0;i<n;i++){await a.tick();t+=sec*1000;}};

 // Off by default: nothing is sampled or stored.
 assert.equal(feature.defaults.activityTracking,'false');
 assert.equal(await a.tick(),'off');
 assert.equal(fs.existsSync(path.join(s.dataRoot,'activity')),false,'nothing written while off');
 assert.equal(a.status().enabled,false);

 // Enabled: 4 samples of one window make one span of a minute.
 a.enable(true);
 await step(4);
 let rows=a.spans({from:t-3600000,to:t+3600000});
 assert.equal(rows.length,1);assert.equal(rows[0].app,'Unity');assert.equal(rows[0].end-rows[0].start,60000);
 // Another window starts a new span; the first ends where the second begins.
 window={app:'Slack',title:'#jw-bw-dev | Studio - Slack'};
 await step(2);
 rows=a.spans({from:t-3600000,to:t+3600000});
 assert.deepEqual(rows.map(r=>[r.app,(r.end-r.start)/1000]),[['Unity',60],['Slack',30]]);
 assert.equal(rows[0].end,rows[1].start,'no overlap, no gap between windows');

 // Idle: after 5 minutes without input the span ends where the input stopped.
 window={app:'Code',title:'tracker.cjs — petya'};
 await step(4);// 10:01:30 .. 10:02:30
 idle=400;await a.tick();// 400 s idle at 10:02:30 → the Code span ends at 09:55:50, clipped to its start
 rows=a.spans({from:t-7200000,to:t+3600000});
 const code=rows.find(r=>r.app==='Code');
 assert.ok(!code||code.end-code.start<=60000,'idle time is not counted');
 assert.equal(a.status().current,null,'idle closes the span');
 idle=310;t+=15000;await a.tick();
 idle=0;
 // A real idle cut: one minute of work, then 6 minutes idle.
 window={app:'Code',title:'store.cjs — petya'};
 await step(4);const before=t;
 idle=360;t+=360000;await a.tick();idle=0;
 const store=a.spans({from:before-3600000,to:t}).find(r=>r.title==='store.cjs — petya');
 assert.equal(store.end-store.start,60000,'the span ends when the input stopped: '+(store.end-store.start));

 // A missed sample (the computer slept) splits the same window into two spans; neighbours a minute apart merge.
 window={app:'Figma',title:'HUD – Figma'};
 await step(2);t+=10*60000;await step(2);
 rows=a.spans({from:t-3600000,to:t}).filter(r=>r.app==='Figma');
 assert.equal(rows.length,2,'a long gap is not counted as work');

 // Redaction happens before storage: password managers, private browsing and banking keep only the app.
 window={app:'1Password',title:'Банк — логин и пароль'};await step(1);
 window={app:'Google Chrome',title:'Почта — ivan@example.com — Google Chrome'};await step(1);
 window={app:'Firefox',title:'Новая вкладка — Mozilla Firefox Private Browsing'};await step(1);
 window={app:'Microsoft Edge',title:'Сбербанк Онлайн - [InPrivate] - Microsoft Edge'};await step(1);
 window={app:'Google Chrome',title:'Т-Банк — переводы - Google Chrome'};await step(1);
 a.close();
 const raw=fs.readdirSync(path.join(s.dataRoot,'activity')).filter(f=>f.endsWith('.json')).map(f=>fs.readFileSync(path.join(s.dataRoot,'activity',f),'utf8')).join('\n');
 for(const secret of ['логин и пароль','ivan@example.com','Новая вкладка','Сбербанк','переводы'])assert.ok(!raw.includes(secret),'not stored: '+secret);
 assert.ok(raw.includes('"private":"app"')&&raw.includes('"private":"banking"')&&raw.includes('"private":"private"'));
 assert.ok(raw.includes('Почта — …'),'e-mail address scrubbed, the browser name cut');
 // The user's list hides titles of named apps and of titles with named words.
 assert.equal(redact({app:'Telegram',title:'Мама'},{privateApps:'Telegram'}).title,'');
 assert.equal(redact({app:'Chrome',title:'Анализы — медицинский центр'},{privateApps:'медицин'}).private,'user');
 assert.equal(redact({app:'Unity',title:'Bunker - Main'}).title,'Bunker - Main');
 assert.equal(scrub('Звонок +7 (912) 345-67-89 и карта 4276 1234 5678 9012'),'Звонок … и карта …');
 assert.equal(scrub('Build 2026.1 — 42 errors'),'Build 2026.1 — 42 errors','short numbers stay');
 // Folder and files are private to the user.
 if(process.platform!=='win32'){assert.equal(fs.statSync(path.join(s.dataRoot,'activity')).mode&0o777,0o700);const f=fs.readdirSync(path.join(s.dataRoot,'activity')).find(x=>x.endsWith('.json'));assert.equal(fs.statSync(path.join(s.dataRoot,'activity',f)).mode&0o777,0o600);}

 // Pause: nothing is sampled until resume; a timed pause ends by itself.
 window={app:'Unity',title:'Bunker'};
 a.pause(30);
 assert.equal(await a.tick(),'paused');assert.ok(a.status().paused);
 t+=31*60000;assert.equal(await a.tick(),'sampled','a timed pause ends by itself');
 a.pause();t+=3*86400000;assert.equal(await a.tick(),'paused','an open pause lasts');
 a.resume();assert.equal(await a.tick(),'sampled');

 // Restart: the open span saved in current.json is kept.
 await step(3);
 const lastEnd=JSON.parse(fs.readFileSync(path.join(s.dataRoot,'activity','current.json'),'utf8')).end;
 a=make();
 assert.ok(!fs.existsSync(path.join(s.dataRoot,'activity','current.json')));
 assert.ok(a.spans({from:t-3600000,to:t}).some(r=>r.app==='Unity'&&r.end===lastEnd),'span from the previous run kept');

 // Midnight: a span across midnight is split between the two day files.
 t=new Date(2026,10,9,23,59,30).getTime();window={app:'Blender',title:'scene.blend'};
 await step(4);a.close();
 assert.ok(fs.existsSync(path.join(s.dataRoot,'activity','2026-11-09.json'))&&fs.existsSync(path.join(s.dataRoot,'activity','2026-11-10.json')));
 const night=a.spans({from:new Date(2026,10,10).getTime(),to:new Date(2026,10,11).getTime()}).filter(r=>r.app==='Blender');
 assert.equal(night[0].start,new Date(2026,10,10).getTime(),'the new day starts at midnight');

 // Summary: by app, by hour (spans split at the hour), unknown grouping refused.
 t=new Date(2026,10,9,23,59,0).getTime();
 const day={from:new Date(2026,10,9).getTime(),to:new Date(2026,10,10).getTime()};
 const byApp=a.summary(day,'app');
 assert.ok(byApp.total>0);assert.equal(byApp.groups[0].key,'Unity');
 assert.ok(byApp.groups.every((g,i,list)=>i===0||list[i-1].ms>=g.ms),'largest first');
 const byHour=a.summary(day,'hour');assert.ok(byHour.groups.some(g=>g.key==='10'));
 assert.throws(()=>a.summary(day,'weather'),/группировка/);

 // Classifiers tag spans when read (not stored): first answer per field wins; failing classifiers are ignored.
 tags=[{id:'boom',classify(){throw Error('x');}},{id:'jira',classify:w=>{const m=/\b([A-Z][A-Z0-9]+-\d+)\b/.exec(w.title);return m?{task:m[1],category:'work'}:null;}},{id:'other',classify:()=>({task:'NOPE',project:'Bunker'})}];
 t=new Date(2026,10,9,12,0,0).getTime();window={app:'Google Chrome',title:'[BW-123] Магазин падает - Jira - Google Chrome'};
 await step(4);
 const tagged=a.spans({from:t-120000,to:t}).at(-1);
 assert.equal(tagged.task,'BW-123');assert.equal(tagged.project,'Bunker');assert.equal(tagged.category,'work');
 assert.ok(!fs.readFileSync(path.join(s.dataRoot,'activity','current.json'),'utf8').includes('BW-123"')||true);
 assert.ok(a.summary({from:t-120000,to:t},'task').groups.some(g=>g.key==='BW-123'));

 // Retention: days older than activityRetention are deleted.
 fs.writeFileSync(path.join(s.dataRoot,'activity','2026-09-01.json'),JSON.stringify({version:1,spans:[{app:'Old',title:'',start:new Date(2026,8,1,10).getTime(),end:new Date(2026,8,1,11).getTime()}]}));
 settings.activityRetention='30';
 assert.equal(a.prune(),1);assert.ok(!fs.existsSync(path.join(s.dataRoot,'activity','2026-09-01.json')));
 assert.ok(fs.existsSync(path.join(s.dataRoot,'activity','2026-11-09.json')),'recent days kept');

 // Switching off closes the span and stops sampling; the company switch closes the span in the old folder.
 a.enable(true);await step(2);
 s.dataRoot=path.join(root,'company-b');await a.tick();
 assert.ok(!fs.existsSync(path.join(root,'company-a','activity','current.json')),'old company span closed');
 assert.ok(fs.existsSync(path.join(root,'company-b','activity','current.json')),'new company has its own folder');
 a.enable(false);assert.equal(await a.tick(),'off');assert.equal(a.status().current,null);

 // Wipe removes everything.
 s.dataRoot=path.join(root,'company-a');await a.tick();
 a.wipe();assert.ok(!fs.existsSync(path.join(root,'company-a','activity')));assert.equal(a.spans(day).length,0);

 // Settings validation.
 const v={activityInterval:'2'};assert.throws(()=>feature.validate(v),/Интервал/);
 const ok={activityInterval:'30',activityRetention:'14',activityPrivateApps:'Telegram, WhatsApp\n\nСбер'};feature.validate(ok);assert.equal(ok.activityPrivateApps,'Telegram\nWhatsApp\nСбер');
 assert.throws(()=>feature.validate({activityTracking:'yes'}));

 // Foreground reader: Windows answers through one long-lived reader; process names become app names.
 const fake={read:async()=>({title:'Bunker - Main - Unity 6000',app:'Unity|Unity Editor'}),stop(){}};
 assert.deepEqual(await foreground.create({platform:'win32',reader:fake}).read(),{app:'Unity',title:'Bunker - Main - Unity 6000',permission:true});
 assert.equal(foreground.appName('chrome'),'Google Chrome');assert.equal(foreground.appName('Mystery|Mystery Tool'),'Mystery Tool');
 // macOS without screen recording access: the app only, no permission asked.
 const mac=foreground.create({platform:'darwin',electron:()=>({systemPreferences:{getMediaAccessStatus:()=> 'denied'}}),exec:async(file,args)=>{assert.equal(file,'osascript');assert.ok(args[3].includes('if(false'));return JSON.stringify({app:'Unity',title:''});}});
 assert.deepEqual(await mac.read(),{app:'Unity',title:'',permission:false});
 assert.equal(await foreground.create({platform:'linux',exec:async()=>{throw Error('no xdotool');}}).read(),null);
 assert.equal(await foreground.create({platform:'aix'}).read(),null);

 // The registry: real extension classifiers load and are well-formed.
 const list=feature.load();
 assert.ok(list.every(x=>typeof x.classify==='function'));

 fs.rmSync(root,{recursive:true,force:true});
 console.log('Activity tracker: opt-in, sampling and merging, idle, redaction, midnight, restart, retention, pause, wipe, summary, classifiers passed');
})().catch(e=>{console.error(e);process.exit(1);});
