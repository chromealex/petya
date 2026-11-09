// «Конвертер»: phrases → plan (kind, formats, parameters, files from attachments, paths and folder masks),
// near-misses that are not files, tool choice and output names that never overwrite, a real run with fake tool
// binaries on PATH (progress, before/after sizes, originals untouched, cancel), the chat turn with its
// clarification, card edits, ffmpeg download pinning and integrity, and the offer gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const planner=require('../src/extensions/converter/plan.cjs');
const ops=require('../src/extensions/converter/ops.cjs');
const runner=require('../src/extensions/converter/run.cjs');
const tools=require('../src/extensions/converter/tools.cjs');
const install=require('../src/extensions/converter/ffmpeg-install.cjs');
const app=require('../src/extensions/converter/feature.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-converter-'));
const bin=path.join(root,'bin'),work=path.join(root,'work');
fs.mkdirSync(bin);fs.mkdirSync(work);
// Fake tools: Node scripts that write their output (a third of the input) and talk like the real ones.
const fake=(name,body)=>{const f=path.join(bin,name);fs.writeFileSync(f,'#!/usr/bin/env node\nconst fs=require("fs"),path=require("path");const a=process.argv.slice(2);fs.appendFileSync('+JSON.stringify(path.join(root,'calls.log'))+',JSON.stringify(['+JSON.stringify(name)+',...a])+"\\n");\n'+body);fs.chmodSync(f,0o755);};
fake('ffmpeg',`const i=a.indexOf('-i');const input=a[i+1];
if(i===a.length-2){process.stderr.write('Input #0\\n  Duration: 00:00:20.00, start: 0.000000, bitrate: 800 kb/s\\n');process.exit(1);}
const out=a.at(-1);if(fs.existsSync(out)&&!a.includes('-y')){process.stderr.write('exists');process.exit(1);}
const slow=Number(process.env.FAKE_SLOW||0);let t=0;
const step=()=>{t+=5;process.stdout.write('out_time_us='+(t*1e6)+'\\nprogress=continue\\n');if(t<20)setTimeout(step,slow);else{fs.writeFileSync(out,Buffer.alloc(Math.max(1,Math.floor(fs.statSync(input).size/3))));process.stdout.write('progress=end\\n');}};step();`);
fake('ffprobe',`process.stdout.write('20.000000\\n');`);
fake('cwebp',`const out=a[a.indexOf('-o')+1];const input=a[a.indexOf('-o')-1];fs.writeFileSync(out,Buffer.alloc(Math.floor(fs.statSync(input).size/4)));`);
fake('soffice',`const dir=a[a.indexOf('--outdir')+1];const input=a.at(-1);fs.writeFileSync(path.join(dir,path.basename(input,path.extname(input))+'.pdf'),'%PDF-1.7 fake');`);
fake('sips',`const out=a[a.indexOf('--out')+1];fs.writeFileSync(out,Buffer.alloc(100));`);
fake('broken',`process.stderr.write('Invalid data found when processing input\\n');process.exit(1);`);
const png=(w,h,extra=4000)=>{const b=Buffer.alloc(33+extra);b.writeUInt32BE(0x89504e47,0);b.writeUInt32BE(0x0d0a1a0a,4);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;};
const put=(name,data)=>{const f=path.join(work,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,data);return f;};
const a=put('photos/a.png',png(4000,3000,90000)),b=put('photos/b.png',png(800,600,20000)),c=put('photos/c.jpg',Buffer.alloc(30000,1));
put('photos/.hidden.png',png(10,10));put('photos/notes.txt','x');put('photos/deep/d.png',png(2000,1000,1000));
const clip=put('clip.mov',Buffer.alloc(600000,2)),doc=put('Отчёт Q3.docx',Buffer.alloc(5000,3)),song=put('song.wav',Buffer.alloc(200000,4));
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const originals=Object.fromEntries([a,b,c,clip,doc,song].map(f=>[f,hash(f)]));

(async()=>{
 // Requests that are files, and neighbours that are not.
 for(const p of ['сожми видео до 10 МБ','конвертни png в webp','сделай гифку из видео','переведи docx в pdf','уменьши картинки в папке до 1024','сконвертируй mov в mp4','убери метаданные из фото','нормализуй громкость в аудио','сожми эти фото'])assert.equal(planner.wanted(p),true,p);
 for(const p of ['конвертер валют','переведи текст на английский','сожми ответ','переведи 100 долларов в рубли','переведи это письмо','сожми пересказ встречи','переведи задачу в другой статус','сделай скриншот','скриншоты стора','конвертируй километры в мили','привет'])assert.equal(planner.wanted(p),false,p);
 // Parameters.
 assert.deepEqual(planner.paramsFrom('сожми видео до 10 МБ','video'),{targetBytes:10*1024*1024});
 assert.deepEqual(planner.paramsFrom('уменьши картинки в папке до 1024','image'),{maxSide:1024});
 assert.deepEqual(planner.paramsFrom('сделай гифку из видео с 0:05 до 0:12, 15 fps, 720p','video'),{height:720,fps:15,trim:{start:5,end:12}});
 assert.deepEqual(planner.paramsFrom('обрежь первые 30 секунд и убери метаданные','video'),{trim:{start:0,end:30},strip:true});
 assert.deepEqual(planner.paramsFrom('нормализуй громкость','audio'),{normalize:true});
 assert.equal(planner.targetIn('конвертни png в webp'),'webp');assert.equal(planner.targetIn('сделай гифку из видео'),'gif');assert.equal(planner.targetIn('переведи docx в PDF'),'pdf');assert.equal(planner.targetIn('в джипег'),'jpg');
 assert.deepEqual(planner.pathsIn('сожми «~/Мои видео/clip.mov» и ~/a.png',('/home/u')),[{path:'/home/u/Мои видео/clip.mov'},{path:'/home/u/a.png'}]);
 assert.deepEqual(planner.pathsIn('конвертни ~/Pictures/*.png в webp','/home/u'),[{path:'/home/u/Pictures',glob:'*.png'}]);
 assert.equal(planner.globRe('*.{jpg,jpeg}').test('A.JPEG'),true);assert.equal(planner.globRe('*.png').test('a.png.txt'),false);
 // Plans from phrases with files.
 let plan=planner.plan('конвертни png в webp в папке '+path.join(work,'photos'));
 assert.equal(plan.kind,'image');assert.equal(plan.from,'png');assert.equal(plan.to,'webp');assert.deepEqual(plan.files,[a,b],'only png, no hidden files, not recursive');
 plan=planner.plan('уменьши картинки в папке '+path.join(work,'photos')+' до 1024 рекурсивно');
 assert.deepEqual(plan.files.map(f=>path.basename(f)),['a.png','b.png','c.jpg','d.png'],'all images, recursive on request');assert.equal(plan.params.maxSide,1024);assert.equal(plan.to,null);
 plan=planner.plan('сожми видео до 10 МБ',{attachments:[{path:clip}]});
 assert.equal(plan.kind,'video');assert.deepEqual(plan.files,[clip]);assert.equal(plan.params.targetBytes,10485760);
 plan=planner.plan('сделай гифку из видео '+clip);assert.equal(plan.to,'gif');assert.equal(plan.kind,'video');
 plan=planner.plan('переведи docx в pdf '+JSON.stringify(doc).replace(/"/g,'«').replace(/«$/,'»'));assert.equal(plan.kind,'document');assert.equal(plan.to,'pdf');assert.deepEqual(plan.files,[doc]);
 plan=planner.plan('конвертни '+path.join(work,'photos')+'/*.png в webp');assert.deepEqual(plan.files,[a,b]);assert.equal(plan.glob,'*.png');

 // Tools: PATH first; macOS-only tools only on macOS.
 const env={PATH:bin};
 const onPath=tools.detect({platform:'linux',env});for(const n of ['cwebp','ffmpeg','ffprobe','soffice'])assert.equal(onPath[n],path.join(bin,n),n+' from PATH');assert.equal(onPath.sips,undefined,'no sips outside macOS');
 assert.ok(tools.detect({platform:'darwin',env}).sips,'sips counts on macOS');
 // Output names: next to the source with a suffix, never the source, never an existing file.
 assert.equal(ops.outputFor(a,{to:'webp'}),path.join(work,'photos','a.webp'));
 assert.equal(ops.outputFor(a,{to:'png',suffix:'1024px'}),path.join(work,'photos','a-1024px.png'));
 assert.equal(ops.outputFor(a,{to:'png'}),path.join(work,'photos','a (2).png'),'same format and no suffix: not the source');
 assert.equal(ops.outputFor(a,{to:'png',suffix:'x',exists:f=>f.endsWith('a-x.png')}),path.join(work,'photos','a-x (2).png'));
 assert.deepEqual(ops.dimensions(a),{width:4000,height:3000});
 // Tool choice.
 const only=t=>Object.fromEntries(Object.entries(t).filter(([,f])=>f.startsWith(bin)));const linux=only(tools.detect({platform:'linux',env})),mac=only(tools.detect({platform:'darwin',env}));
 assert.equal(path.basename(ops.command(a,{kind:'image',to:'webp',params:{maxSide:1024}},linux).steps[0].bin),'cwebp');
 assert.deepEqual(ops.command(a,{kind:'image',to:'webp',params:{maxSide:1024}},linux).steps[0].args.slice(3,6),['-resize','1024','0']);
 assert.equal(path.basename(ops.command(a,{kind:'image',to:'jpg',params:{maxSide:800}},mac,{platform:'darwin'}).steps[0].bin),'sips');
 assert.equal(path.basename(ops.command(a,{kind:'image',to:'jpg',params:{}},linux).steps[0].bin),'ffmpeg');
 const sized=ops.command(clip,{kind:'video',to:'mp4',params:{targetBytes:10*1048576}},linux,{duration:20});
 assert.equal(sized.steps[0].args[sized.steps[0].args.indexOf('-b:v')+1],String(Math.floor(10*1048576*8*0.95/20-96000)),'bitrate from target size and length');
 assert.throws(()=>ops.command(clip,{kind:'video',to:'mp4',params:{targetBytes:1e7}},linux,{duration:null}),/длительность/);
 assert.match(ops.command(clip,{kind:'video',to:'gif',params:{fps:10}},linux).steps[0].args.join(' '),/fps=10,scale=480:-1.*palettegen.*paletteuse/);
 assert.throws(()=>ops.command(clip,{kind:'video',to:'mp4',params:{}},{}),e=>e.missing==='ffmpeg');
 assert.throws(()=>ops.command(doc,{kind:'document',to:'pdf',params:{}},{}),e=>e.missing==='soffice');
 assert.equal(ops.needs({kind:'video',to:'gif',params:{},files:[clip]},{}),'ffmpeg');assert.equal(ops.needs({kind:'image',to:'webp',params:{},files:[a]},linux),null);
 // Estimates: 4000×3000 png → 1024 webp is much smaller; target size is the target.
 assert.ok(ops.estimate(a,{kind:'image',to:'webp',params:{maxSide:1024}})<fs.statSync(a).size/10);
 assert.equal(ops.estimate(clip,{kind:'video',to:'mp4',params:{targetBytes:100000}}),100000);
 assert.equal(ops.estimate(clip,{kind:'video',to:'gif',params:{}}),null);

 // A real run with the fake tools: per-file progress, sizes, originals untouched, outputs beside them.
 const seen=[];
 let job={id:'j1',files:[a,b].map(f=>({input:f,name:path.basename(f),before:fs.statSync(f).size,state:'waiting',percent:0}))};
 await runner.run(job,{kind:'image',to:'webp',params:{maxSide:1024},files:[a,b]},linux,{platform:'linux',publish:j=>seen.push(j.files.map(f=>f.state).join())});
 assert.deepEqual(job.files.map(f=>f.state),['done','done']);
 assert.equal(job.files[0].output,path.join(work,'photos','a-1024px.webp'));assert.equal(job.files[0].after,Math.floor(fs.statSync(a).size/4));
 assert.ok(seen.includes('running,waiting')&&seen.includes('done,running'),'progress per file');
 job={id:'j2',files:[{input:clip,name:'clip.mov',before:fs.statSync(clip).size,state:'waiting',percent:0}]};
 const percents=[];
 await runner.run(job,{kind:'video',to:'mp4',params:{targetBytes:200000},files:[clip]},linux,{platform:'linux',publish:j=>percents.push(j.files[0].percent)});
 assert.equal(job.files[0].state,'done');assert.ok(percents.includes(25)&&percents.includes(75),'ffmpeg progress from out_time: '+percents);
 assert.equal(path.basename(job.files[0].output),'clip-195kb.mp4');
 job={id:'j3',files:[{input:doc,name:'Отчёт Q3.docx',before:5000,state:'waiting',percent:0}]};
 await runner.run(job,{kind:'document',to:'pdf',params:{},files:[doc]},linux,{platform:'linux'});
 assert.equal(job.files[0].state,'done');assert.equal(fs.readFileSync(path.join(work,'Отчёт Q3.pdf'),'utf8'),'%PDF-1.7 fake','LibreOffice output moved next to the source');
 // A failing tool: error with the tool's words, no partial file left.
 job={id:'j4',files:[{input:song,name:'song.wav',before:1,state:'waiting',percent:0}]};
 await runner.run(job,{kind:'audio',to:'mp3',params:{},files:[song]},{ffmpeg:path.join(bin,'broken')},{platform:'linux'});
 assert.equal(job.files[0].state,'error');assert.match(job.files[0].error,/Invalid data found/);assert.equal(fs.existsSync(path.join(work,'song.mp3')),false);
 // Cancel: the running tool is killed, its output removed, the rest marked cancelled.
 process.env.FAKE_SLOW='400';
 const controller=new AbortController();
 job={id:'j5',files:[song,clip].map(f=>({input:f,name:path.basename(f),before:1,state:'waiting',percent:0}))};
 const running=runner.run(job,{kind:'audio',to:'ogg',params:{normalize:true},files:[song,clip]},linux,{platform:'linux',signal:controller.signal});
 setTimeout(()=>controller.abort(),300);await running;delete process.env.FAKE_SLOW;
 assert.deepEqual(job.files.map(f=>f.state),['cancelled','cancelled']);assert.equal(job.cancelled,true);assert.equal(fs.existsSync(path.join(work,'song-normalized.ogg')),false);
 for(const [f,h] of Object.entries(originals))assert.equal(hash(f),h,'original untouched: '+f);

 // Chat turns.
 const topic={id:'t',title:'Чат',messages:[]};
 const s={settings:{},requestProgress:{report(){}},win:null,
  dialogue:{active:()=>topic,persist(){},rememberAction(cmd,text){topic.messages.push({role:'user',text:cmd},{role:'assistant',text});},state:{topics:[topic]}},
  attachments:{list:()=>[{id:'f1',name:'clip.mov'}],pending:new Map([['f1',{localSourcePath:clip}]])}};
 app.deps.platform=()=>'linux';app.deps.userData=()=>root;app.deps.tools=()=>only(tools.detect({platform:'linux',env:process.env}));
 const realPath=process.env.PATH;process.env.PATH=bin+':'+realPath;
 assert.equal(await app.turn(s,'сожми видео до 10 МБ'),null,'not added: the offer handles it');
 s.settings.extension_converter='true';
 assert.equal(await app.turn(s,'конвертер валют'),null);assert.equal(await app.turn(s,'переведи текст на английский'),null);assert.equal(await app.turn(s,'сожми ответ'),null);
 const r=await app.turn(s,'сожми видео до 10 МБ');
 const cardData=r.extensionData.converterCard;
 assert.equal(cardData.kind,'video');assert.equal(cardData.count,1);assert.equal(cardData.files[0].name,'clip.mov');assert.equal(cardData.needs,null);assert.equal(cardData.estimate,600000,'target above the source: no growth');
 assert.match(r.text,/^Видео \(до 10 МБ\) · 1 файл, 586 КБ → ≈ 586 КБ\. Нажмите «Конвертировать»/);
 assert.equal(topic.messages.at(-1).by,'Конвертер');
 // No files anywhere: one clarification, resumed with a path.
 s.attachments.list=()=>[];
 let question;try{await app.turn(s,'конвертни png в webp');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired);assert.match(question.spec.text,/Какие файлы конвертировать/);
 const resumed=await question.resume(path.join(work,'photos'));
 assert.equal(resumed.extensionData.converterCard.count,2);assert.equal(resumed.extensionData.converterCard.label,'PNG → WEBP');
 // Only parameters with no format and nothing to do: asks the format with choices.
 try{await app.turn(s,'конвертни картинки '+b);}catch(e){question=e;}
 assert.deepEqual(question.spec.options,['PNG','JPG','WEBP','TIFF','GIF']);
 const chosen=await question.resume('WEBP');assert.equal(chosen.extensionData.converterCard.to,'webp');
 // ffmpeg missing: the card says so, start refuses.
 process.env.PATH=realPath;
 const noFfmpeg=await app.turn(s,'сделай гифку из видео '+clip);
 assert.equal(noFfmpeg.extensionData.converterCard.needs,'ffmpeg');assert.match(noFfmpeg.text,/нужен ffmpeg/);
 const ipc=app.setup(s).ipc;
 assert.throws(()=>ipc.start(noFfmpeg.extensionData.converterCard.id),/скачайте ffmpeg/);
 process.env.PATH=bin+':'+realPath;
 // Card edits: validated, re-estimated; then the run from the card's button.
 const id=resumed.extensionData.converterCard.id;
 assert.throws(()=>ipc.update(id,{to:'mp3'}),/не подходит/);assert.throws(()=>ipc.update(id,{params:{maxSide:5}}),/Некорректное/);
 const edited=ipc.update(id,{params:{maxSide:512,quality:70}});assert.equal(edited.params.maxSide,512);assert.ok(edited.estimate<resumed.extensionData.converterCard.estimate);
 const started=ipc.start(id);assert.equal(started.running,true);assert.throws(()=>ipc.start(id),/уже идёт/);
 for(let i=0;i<100&&ipc.status(started.id).running;i++)await new Promise(r=>setTimeout(r,30));
 const done=ipc.status(started.id);assert.deepEqual(done.files.map(f=>[f.state,f.output]),[['done','a-512px.webp'],['done','b-512px.webp']]);
 await new Promise(r=>setTimeout(r,20));
 const message=topic.messages.find(m=>m.extensionData?.converterCard?.id===id);assert.equal(message.extensionData.converterCard.result.files.length,2,'result kept in the message');
 const shown=[];app.deps.showItem=p=>shown.push(p);
 ipc.reveal(started.id,0);assert.deepEqual(shown,[path.join(work,'photos','a-512px.webp')]);
 assert.throws(()=>ipc.reveal(started.id,7),/не найден/);
 assert.ok(ipc.progress().some(n=>n.id==='converter:'+started.id&&!n.busy&&/Готово: 2 из 2/.test(n.text)),'notification center has the result');
 process.env.PATH=realPath;

 // ffmpeg download: pinned sources, integrity, approval, unpack, verify.
 assert.equal(install.sources('linux','x64'),null);
 assert.match(install.sources('win32','x64')[0].url,/^https:\/\/www\.gyan\.dev\/ffmpeg\/builds\/packages\/ffmpeg-8\.1\.2-essentials_build\.zip$/);
 assert.match(install.sources('win32','x64')[0].sha256,/^[0-9a-f]{64}$/);
 for(const k of ['darwin-arm64','darwin-x64'])assert.match(install.SOURCES[k][0].url,/^https:\/\/ffmpeg\.martin-riedl\.de\/download\/macos\/(?:arm64|amd64)\/\d+_9\.0\.2\/ffmpeg\.zip$/);
 await assert.rejects(install.install({userData:root,platform:'darwin',arch:'arm64',confirm:async()=>true}),/ещё не закреплена.*brew install ffmpeg/,'an unpinned archive is never downloaded');
 const payload=Buffer.from('fake ffmpeg zip');
 const fetchOk=async()=>new Response(payload,{headers:{'content-length':String(payload.length)}});
 const pinned=install.SOURCES['win32-x64'][0];const savedHash=pinned.sha256;
 await assert.rejects(install.install({userData:root,platform:'win32',arch:'x64',confirm:async()=>true,fetchImpl:fetchOk,unpack:async()=>{}}),/SHA-256/,'a different archive is thrown away');
 pinned.sha256=crypto.createHash('sha256').update(payload).digest('hex');
 await assert.rejects(install.install({userData:root,platform:'win32',arch:'x64',confirm:async()=>false,fetchImpl:fetchOk}),e=>e.cancelled,'declined → nothing downloaded');
 const statuses=[];
 const result=await install.install({userData:root,platform:'win32',arch:'x64',confirm:async bytes=>{assert.equal(bytes,pinned.approx);return true;},fetchImpl:fetchOk,
  unpack:async(zip,dir)=>{fs.mkdirSync(path.join(dir,'ffmpeg-8.1.2-essentials_build','bin'),{recursive:true});for(const n of ['ffmpeg.exe','ffprobe.exe'])fs.writeFileSync(path.join(dir,'ffmpeg-8.1.2-essentials_build','bin',n),'exe');},
  verify:async()=>{},status:(t,f)=>statuses.push(t)});
 assert.equal(result.folder,path.join(root,'converter','ffmpeg-8.1.2'));assert.ok(fs.existsSync(path.join(result.folder,'ffmpeg.exe'))&&fs.existsSync(path.join(result.folder,'ffprobe.exe')));
 assert.ok(install.installed(root,'win32'));assert.ok(statuses.includes('Скачиваю ffmpeg')&&statuses.includes('Проверяю ffmpeg'));
 const big=async()=>new Response(payload,{headers:{'content-length':String(5e9)}});
 await assert.rejects(install.install({userData:fs.mkdtempSync(path.join(root,'u-')),platform:'win32',arch:'x64',confirm:async()=>true,fetchImpl:big}),/больше ожидаемого/);
 pinned.sha256=savedHash;
 // The catalog's download size matches the pinned sources.
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../src/extensions/converter/extension.json'),'utf8'));
 assert.equal(manifest.downloads[0].id,'ffmpeg');assert.equal(manifest.downloads[0].bytes.win32,install.SOURCES['win32-x64'][0].approx);
 assert.equal(manifest.downloads[0].bytes.darwin,install.SOURCES['darwin-arm64'].reduce((a,i)=>a+i.approx,0));
 // downloads.cjs outside Electron: present only when a system ffmpeg is on PATH.
 process.env.PATH=realPath;assert.deepEqual(await require('../src/extensions/converter/downloads.cjs').present(),tools.detect().ffmpeg?['ffmpeg']:[]);

 // The offer: the converter's subjects, not currency or text translation.
 const offer=require('../src/extensions/converter/offer.cjs');
 const subject=t=>!offer.avoid.some(r=>r.test(t))&&(offer.names.some(r=>r.test(t))||offer.topics.some(r=>r.test(t)));
 for(const p of ['сожми видео до 10 МБ','конвертни png в webp','сделай гифку из видео','переведи docx в pdf','уменьши картинки в папке до 1024'])assert.equal(subject(p),true,p);
 for(const p of ['конвертер валют','переведи текст','сожми ответ','переведи задачу в работу'])assert.equal(subject(p),false,p);
 assert.equal(offer.ready({extension_converter:'true'}),true);
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Converter: phrases and near-misses, plans from attachments/paths/masks, tool choice, no overwrite, run with fake tools (progress, sizes, cancel, errors), turn with clarifications, card edits and start, pinned ffmpeg download with SHA-256, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
