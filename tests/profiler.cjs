// «Профайлер»: phrases and near-misses, not installed / no files, the readers on fixture files (Unity Profile Analyzer
// marker table + frame times with «;», an older «,» table with a Thread column, the Compare view table, Chrome trace
// JSON, dumpsys gfxinfo framestats, a memory CSV, binary .data refused with export steps), budget shares and the
// stacked bar, spikes and GC, before/after diff with regressions, explanations grounded in the capture (model stub:
// an invented marker is dropped; without a model the reference is used), the «Что оптимизировать?» follow-up, fps from
// the request, file hints from the project folder, and the Unity live reading through a stubbed Unity app.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const app=require('../src/extensions/profiler/feature.cjs');
const parse=require('../src/extensions/profiler/parse.cjs');
const analyze=require('../src/extensions/profiler/analyze.cjs');
const explain=require('../src/extensions/profiler/explain.cjs');
const unity=require('../src/extensions/profiler/unity.cjs');
const offer=require('../src/extensions/profiler/offer.cjs');
const DIR=path.join(__dirname,'fixtures/profiler');
const F=n=>path.join(DIR,n);

function services({installed=true,files=[],model='',answer=null,folders=[]}={}){
 const topic={id:'t',title:'Чат',messages:[],attachments:[]};
 const pending=new Map(files.map((f,i)=>[String(i),{id:String(i),name:path.basename(f),localSourcePath:f,text:'',note:'Текст прочитан.'}]));
 const calls=[];
 const s={settings:{...installed?{extension_profiler:'true'}:{},model,ollamaUrl:'http://127.0.0.1:11434/api/chat',profilerTargetFps:'60'},requestProgress:{report(){}},calls,
  dialogue:{state:{projects:[{id:'p',name:'Game',folders}],activeProjectId:'p'},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{list:()=>[...pending.values()].map(f=>({id:f.id,name:f.name})),pending,take:ids=>ids.map(id=>structuredClone(pending.get(id))),info:f=>({id:f.id,name:f.name}),remove:id=>pending.delete(id)},
  saveSettings(patch){Object.assign(s.settings,patch);},
  async request(url,options){const body=JSON.parse(options.body);calls.push(body);return {message:{content:JSON.stringify(typeof answer==='function'?answer(body):answer)}};}};
 return {s,topic};
}

(async()=>{
 // Phrases and near-misses (text only, nothing attached).
 const {s:plain}=services();
 for(const p of ['разбери профайлер','что жрёт кадр','сравни профайл до и после','почему фризы','разбери профайлер при 30 fps','что съедает кадр на андроиде','разбери трассу chrome','просадки fps в бою'])assert.equal(app.wanted(plain,p),true,p);
 for(const p of ['профиль пользователя','профайлер памяти браузера','профиль в Slack','открой мой профиль','разбери видео созвона','сделай гифку из видео','тест упал','разбери плейтест','где игрок застрял','привет'])assert.equal(app.wanted(plain,p),false,p);
 assert.equal(await app.turn(services({installed:false}).s,'разбери профайлер'),null,'not installed → not this app');
 assert.equal(await app.turn(plain,'что такое профайлер?'),null,'a definition question is ordinary talk');

 // Nothing attached → a question where to get the export.
 {const {s}=services();const r=await app.turn(s,'разбери профайлер');assert.equal(r.question,true);assert.match(r.text,/Profile Analyzer/);assert.match(r.text,/gfxinfo/);}

 // CSV basics: separators, quotes, decimal commas.
 assert.deepEqual(parse.csv('"a;b";c\n1,5;2'),[['a;b','c'],['1,5','2']]);assert.equal(parse.num('1,5'),1.5);assert.equal(parse.separator('a,b;c;d'),';');
 assert.equal(parse.threadGroup('Render Thread'),'render');assert.equal(parse.threadGroup('Job.Worker 3'),'jobs');assert.equal(parse.threadGroup('GameThread'),'main');assert.equal(parse.threadGroup('Audio Mixer'),'other');
 assert.equal(analyze.targetFps('профайлер при 30 fps','60'),30);assert.equal(analyze.targetFps('разбери','120'),120);assert.equal(analyze.targetFps('разбери','7'),60);

 // Unity marker table + frame times (one capture, merged).
 {const {s,topic}=services({files:[F('before-markerTable.csv'),F('before-frameTime.csv')]});
  const r=await app.turn(s,'разбери профайлер');
  const c=r.extensionData.profiler;
  assert.equal(c.mode,'single');assert.equal(c.fps,60);assert.equal(c.budget,16.67);
  assert.ok(Math.abs(c.frame.ms-17.2)<0.3,'median frame from the frame-times table');assert.equal(c.frame.count,300);
  const phys=c.groups.main.find(m=>m.name==='Physics.Simulate');assert.equal(phys.median,6.2);assert.equal(phys.share,37.2,'6.2 ms is 37% of 16.67 ms');
  assert.ok(!c.groups.main.some(m=>m.name==='PlayerLoop'),'the frame wrapper is not a hog');
  assert.deepEqual(c.bar.parts.map(p=>p.name),['FixedUpdate.PhysicsFixedUpdate','PostLateUpdate.FinishFrameRendering','Update.ScriptRunBehaviourUpdate','PreLateUpdate.DirectorUpdateAnimationBegin'],'one level below PlayerLoop');
  assert.ok(c.bar.parts.reduce((a,p)=>a+p.ms,0)<=c.frame.ms*1.02,'segments fit in the frame');
  assert.equal(c.spikes.length,4);assert.equal(c.spikes[0].ms,48.2);assert.equal(c.spikes[0].gc,180000);
  assert.equal(c.timeline.length,300);
  assert.equal(c.gc.collect.max,17.6);assert.equal(c.gc.allocs[0].name,'Update.ScriptRunBehaviourUpdate');assert.ok(!c.gc.allocs.some(a=>a.name==='GC.Alloc'));
  assert.equal(c.groups.main.find(m=>m.name==='EnemyAI.Update() [Invoke]').count,40,'calls per frame, not the total');
  assert.match(r.text,/Кадр ~17,2 мс при бюджете 16,7 мс \(60 fps\) — не укладывается/);
  assert.equal(c.explainedBy,'reference','no model: the built-in reference');
  assert.ok(c.explain.some(x=>x.marker==='Physics.Simulate'&&/физика/.test(x.why)&&/37% от 16,7 мс бюджета/.test(x.fact)));
  assert.equal(s.attachments.pending.size,0,'used attachments move into the chat');assert.equal(topic.attachments.length,2);
  // The follow-up «Что оптимизировать?» explains the last card; with nothing new attached.
  const advice=await app.turn(s,'Что оптимизировать по этому профайлу?');
  assert.match(advice.text,/Physics\.Simulate 6,2 мс — 37% от 16,7 мс бюджета: физика/);
  // «почему фризы» later in the same chat reads the captures attached earlier.
  const again=await app.turn(s,'почему фризы');assert.equal(again.extensionData.profiler.spikes.length,4);
 }
 // fps from the request.
 {const {s}=services({files:[F('before-markerTable.csv')]});const c=(await app.turn(s,'разбери профайлер при 30 fps')).extensionData.profiler;assert.equal(c.fps,30);assert.equal(c.budget,33.33);
  assert.equal(c.frame.ms,16.9,'without frame times the frame is the PlayerLoop median');assert.equal(c.frame.from,'marker');}

 // Before/after: two marker tables given in reverse order; names decide the order.
 {const {s}=services({files:[F('after-markerTable.csv'),F('before-markerTable.csv')]});
  const r=await app.turn(s,'сравни профайл до и после');const d=r.extensionData.profiler;
  assert.equal(d.mode,'diff');assert.deepEqual(d.names,['before-markerTable.csv','after-markerTable.csv']);
  assert.equal(d.frame.before,16.9);assert.equal(d.frame.after,15.6);
  const canvas=d.rows.find(r=>r.name==='Canvas.BuildBatch');assert.equal(canvas.kind,'worse');assert.equal(canvas.delta,1.7);
  assert.ok(d.rows.find(r=>r.name==='ShopWindow.Refresh() [Invoke]').added);
  assert.equal(d.rows.find(r=>r.name==='Physics.Simulate').kind,'better');assert.equal(d.rows.find(r=>r.name==='EnemyAI.Update() [Invoke]').kind,'same','0.1 ms / 5% is noise');
  assert.equal(d.rows[0].kind,'worse','regressions first');assert.equal(d.worse,2);
  assert.match(r.text,/Хуже стало: Canvas\.BuildBatch 0,7 → 2,4 мс/);
 }
 // Profile Analyzer Compare view table: both sides in one file.
 {const {s}=services({files:[F('tableComparison.csv')]});const d=(await app.turn(s,'разбери профайлер')).extensionData.profiler;assert.equal(d.mode,'diff');assert.equal(d.worse,2);assert.equal(d.rows.find(r=>r.name==='Camera.Render').kind,'same');}
 // Older comma table with a Thread column: threads grouped.
 {const c=analyze.single(parse.parse('m.csv',fs.readFileSync(F('render-markers-comma.csv'),'utf8')),60);assert.deepEqual(Object.keys(c.groups).sort(),['jobs','main','render']);assert.equal(c.groups.render[0].name,'RenderLoop.Draw');}
 // Chrome trace: frames from «Frame» spans, B/E pairs, thread names, per-frame sums.
 {const {s}=services({files:[F('trace.json')]});const c=(await app.turn(s,'разбери трассу chrome')).extensionData.profiler;
  assert.equal(c.frame.count,60);assert.equal(c.frame.ms,16);assert.equal(c.spikes.length,2);assert.equal(c.spikes[0].ms,41);
  assert.equal(c.groups.render[0].name,'Draw Scene');assert.equal(c.groups.jobs[0].name,'Animation Job');assert.equal(c.groups.main.find(m=>m.name==='Slate UI').median,3,'B/E pairs');
  assert.deepEqual(c.bar.parts.map(p=>p.name),['Tick World','Slate UI'],'children of the frame only');}
 {const c=analyze.single(parse.chromeTrace([{ph:'X',name:'Work',pid:1,tid:1,ts:0,dur:2000},{ph:'X',name:'Work',pid:1,tid:1,ts:5000,dur:4000}],'t.json'),60);assert.equal(c.perCall,true);assert.equal(c.groups.main[0].median,3,'mean per call without frames');assert.equal(c.bar.parts.length,0);}
 assert.throws(()=>parse.chromeTrace({foo:1},'x.json'),/traceEvents/);
 // gfxinfo framestats: flagged rows dropped, phases on UI / RenderThread, summary kept, SurfaceView note.
 {const {s}=services({files:[F('gfxinfo.txt')]});const c=(await app.turn(s,'разбери framestats')).extensionData.profiler;
  assert.equal(c.frame.count,39);assert.equal(c.meta.janky,18);assert.equal(c.meta.package,'com.example.game');
  assert.equal(c.groups.main[0].name,'Measure/Layout');assert.equal(c.groups.render[0].name,'Отправка команд на GPU');assert.match(c.notes.join(' '),/SurfaceView/);}
 // Memory table.
 {const c=analyze.single(parse.parse('memory.csv',fs.readFileSync(F('memory.csv'),'utf8')),60);assert.equal(c.memory[0].name,'Texture2D');assert.equal(Math.round(c.memory[0].bytes/1048576*10)/10,412.5);}
 // Binary Unity capture: no decoding, the export steps.
 {const {s}=services({files:[F('capture.data')]});const r=await app.turn(s,'разбери профайлер');assert.equal(r.question,true);assert.match(r.text,/Profile Analyzer.*Export/);assert.equal(r.extensionData,undefined);}
 // Unknown CSV and missing file are errors, not guesses.
 {const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-prof-'));fs.writeFileSync(path.join(tmp,'sales.csv'),'month,revenue\njan,10\n');
  const {s}=services({files:[path.join(tmp,'sales.csv')]});const r=await app.turn(s,'разбери профайлер');assert.equal(r.error,true);assert.match(r.text,/не узнал формат/);
  const {s:s2}=services();const r2=await app.turn(s2,'разбери профайлер "/nope/markerTable.csv"');assert.equal(r2.error,true);assert.match(r2.text,/Не нашёл файл/);}

 // Model explanations: only markers from the capture survive; the summary naming an unknown marker is dropped.
 {const {s}=services({files:[F('before-markerTable.csv')],model:'qwen3.5:9b',answer:{items:[{marker:'Physics.Simulate',explanation:'Слишком много шагов физики.'},{marker:'Terrain.Heightmap',explanation:'Выдумано.'}],summary:'Начните с Terrain.Heightmap.'}});
  const c=(await app.turn(s,'разбери профайлер')).extensionData.profiler;
  assert.equal(c.explainedBy,'model');assert.equal(c.explain.find(x=>x.marker==='Physics.Simulate').why,'Слишком много шагов физики.');
  assert.ok(!c.explain.some(x=>x.marker==='Terrain.Heightmap'));assert.equal(c.summary,'');
  const sent=JSON.parse(s.calls[0].messages[1].content);assert.ok(sent.markers.every(m=>typeof m.ms==='number'),'the model gets code-computed numbers');}

 // File hints: classes from marker names and their .cs files in the project folder.
 {const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-prof-proj-'));fs.mkdirSync(path.join(root,'Assets/Scripts/AI'),{recursive:true});fs.writeFileSync(path.join(root,'Assets/Scripts/AI/EnemyAI.cs'),'class EnemyAI{}');
  fs.mkdirSync(path.join(root,'Library'),{recursive:true});fs.writeFileSync(path.join(root,'Library/EnemyAI.cs'),'');
  const {s}=services({files:[F('before-markerTable.csv')],folders:[root]});const c=(await app.turn(s,'разбери профайлер')).extensionData.profiler;
  assert.deepEqual(c.hints.classes,['EnemyAI'],'classes of the ranked markers only');assert.deepEqual(c.hints.files,[path.join(path.basename(root),'Assets/Scripts/AI/EnemyAI.cs')],'Library is skipped');}
 assert.deepEqual(explain.classes(['Physics.Simulate','Camera.Render','Foo.Bar() [Invoke]']),['Foo']);

 // fps chip setting.
 {const {s}=services();const ipc=app.setup(s).ipc;assert.deepEqual(ipc.setFps(120),{fps:120});assert.equal(s.settings.profilerTargetFps,'120');assert.throws(()=>ipc.setFps(75),/30, 60 или 120/);
  const next={profilerTargetFps:'75'};app.validate(next);assert.equal(next.profilerTargetFps,'60');}

 // Unity live reading: only through the Unity Editor app's invoke; a server without manage_profiler is explained.
 {const {s}=services();assert.equal(unity.usable(s),false);await assert.rejects(()=>unity.live(s),/Unity Editor/);
  const seen=[];s.settings.module_unity='true';
  s.unity={invoke:async(topicId,tool,args)=>{seen.push([topicId,tool,args]);return {content:[{type:'text',text:JSON.stringify({success:true,data:{cpu_frame_time:21.4,cpu_main_thread_frame_time:18.2,cpu_render_thread_frame_time:9.1,gpu_frame_time:12.5}})}]};}};
  const r=await unity.live(s);assert.deepEqual(seen[0],['t','call_tool',{name:'manage_profiler',arguments:{action:'get_frame_timing'}}]);
  assert.equal(r.frame,21.4);assert.deepEqual(r.parts.map(p=>[p.label,p.ms]),[['CPU: основной поток',18.2],['CPU: рендер-поток',9.1],['GPU',12.5]]);
  s.unity.invoke=async()=>{throw Error('Этот инструмент не опубликован в подключённом Unity Editor.');};await assert.rejects(()=>unity.live(s),/manage_profiler.*Profile Analyzer/);
  assert.throws(()=>unity.reading({content:[{type:'text',text:'{}'}]}),/FrameTimingManager/);}

 // Offer gate.
 const hit=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
 for(const p of ['разбери профайлер','что жрёт кадр','почему фризы','сравни профайл до и после'])assert.ok(hit(p),p);
 for(const p of ['профиль пользователя','профайлер памяти браузера','профиль в Slack','разбери плейтест'])assert.ok(!hit(p),p);
 assert.equal(offer.ready({extension_profiler:'true'}),true);assert.equal(offer.ready({}),false);
 console.log('Profiler: phrases and near-misses, Unity CSV / compare / Chrome trace / gfxinfo / memory readers, budget bar, spikes, GC, before/after diff, grounded explanations, file hints, Unity live timing passed');
})().catch(e=>{console.error(e);process.exit(1);});
