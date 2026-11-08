// «Место на диске»: platform paths (macOS/Windows), a bounded walk without symlinks or double-counted hard links,
// Ollama models from manifests, Unity Library folders, partial results on the time limit and on cancel, chat routing
// with near-misses, the Unity roots clarification, progress notifications, and cleanup only of listed items.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const scanner=require('../src/extensions/disk-usage/scan.cjs');
const cleanup=require('../src/extensions/disk-usage/cleanup.cjs');
const app=require('../src/extensions/disk-usage/feature.cjs');
const {InputRequired}=require('../src/input-required.cjs');
const offers=require('../src/features/extension-offers.cjs');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-disk-'));
const home=path.join(root,'home');
const put=(rel,bytes)=>{const p=path.join(home,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,Buffer.alloc(bytes));return p;};
const MB=1e6;
// A fake macOS home.
put('.ollama/models/blobs/sha256-aaa',3*MB);put('.ollama/models/blobs/sha256-bbb',1*MB);
fs.mkdirSync(path.join(home,'.ollama/models/manifests/registry.ollama.ai/library/llama3'),{recursive:true});
fs.writeFileSync(path.join(home,'.ollama/models/manifests/registry.ollama.ai/library/llama3/8b'),JSON.stringify({config:{size:500},layers:[{size:3*MB},{size:1000}]}));
fs.mkdirSync(path.join(home,'.ollama/models/manifests/hf.co/user/tiny'),{recursive:true});
fs.writeFileSync(path.join(home,'.ollama/models/manifests/hf.co/user/tiny/q4'),JSON.stringify({config:{size:100},layers:[{size:1*MB}]}));
put('Projects/Game/Assets/a.txt',10);fs.mkdirSync(path.join(home,'Projects/Game/ProjectSettings'));put('Projects/Game/Library/ShaderCache/big.bin',5*MB);
put('Projects/Tool/package.json',10);
put('Library/Developer/Xcode/DerivedData/App-abc/Build/x.o',4*MB);put('Library/Developer/Xcode/DerivedData/Other-def/y.o',2*MB);
// A symlink to a big folder outside is never followed; a hard link is counted once.
put('outside/huge.bin',20*MB);fs.symlinkSync(path.join(home,'outside'),path.join(home,'Library/Developer/Xcode/DerivedData/link'));
const original=put('.gradle/caches/modules-2/files/a.jar',2*MB);fs.linkSync(original,path.join(home,'.gradle/caches/modules-2/files/b.jar'));
put('.npm/_cacache/content-v2/x',1*MB);put('Library/Caches/pip/http/y',MB/2);
put('Downloads/movie.mp4',6*MB);put('.Trash/old.zip',MB);
const userData=path.join(root,'userData');fs.mkdirSync(path.join(userData,'coder-worktrees','repo-1'),{recursive:true});fs.writeFileSync(path.join(userData,'coder-worktrees','repo-1','f'),Buffer.alloc(MB));
const statfs=()=>({bsize:4096,blocks:250e9/4096,bfree:40e9/4096,bavail:38e9/4096});

(async()=>{
 // Platform locations: macOS and Windows are derived from home/env, so they can be checked here on Linux.
 const mac=scanner.locations({platform:'darwin',home:'/Users/a',env:{}});
 assert.equal(mac['xcode-derived'][0],'/Users/a/Library/Developer/Xcode/DerivedData');
 assert.equal(mac['unity-cache'][0],'/Users/a/Library/Unity/cache');
 assert.equal(mac.docker[0],'/Users/a/Library/Containers/com.docker.docker/Data/vms/0/data');
 assert.equal(mac.trash[0],'/Users/a/.Trash');
 const win=scanner.locations({platform:'win32',home:'C:\\Users\\a',env:{LOCALAPPDATA:'C:\\Users\\a\\AppData\\Local',OLLAMA_MODELS:'D:\\models'}});
 assert.equal(win.ollama[0],'D:\\models','OLLAMA_MODELS wins');
 assert.equal(win['unity-cache'][0],'C:\\Users\\a\\AppData\\Local\\Unity\\cache');
 assert.equal(win['android-images'][0],'C:\\Users\\a\\AppData\\Local\\Android\\Sdk\\system-images');
 assert.deepEqual(win['xcode-derived'],[],'no Xcode on Windows');
 assert.ok(win['package-caches'].includes('C:\\Users\\a\\AppData\\Local\\pip\\Cache'));
 assert.equal(scanner.unityHints({platform:'win32',home:'C:\\Users\\a',env:{APPDATA:'C:\\R'}}).hub,'C:\\R\\UnityHub\\projects-v1.json');

 // Volume: free bytes come from Petya's disk-space reader, total from the same statfs call.
 assert.deepEqual(scanner.volume(home,statfs),{path:home,total:250e9,free:38e9,used:210e9});

 // The whole scan on the fake macOS home.
 const stages=[];
 const result=await scanner.scan({platform:'darwin',home,env:{},userData,unityRoots:[path.join(home,'Projects')],statfs,apparent:true,progress:(stage,done,total)=>stages.push([stage,done,total])});
 const by=id=>result.categories.find(c=>c.id===id);
 assert.equal(result.partial,false);
 assert.equal(by('xcode-derived').bytes,6*MB,'symlink to a 20 MB folder is not followed');
 assert.deepEqual(by('xcode-derived').items.map(i=>i.name),['App-abc','Other-def'],'biggest subfolders first');
 assert.equal(by('gradle').bytes,2*MB,'hard link counted once');
 assert.equal(by('unity-library').bytes,5*MB);assert.equal(by('unity-library').items[0].path,path.join(home,'Projects/Game/Library'));
 assert.equal(by('unity-library').items.length,1,'a folder without Assets+ProjectSettings is not a Unity project');
 const ollama=by('ollama');
 assert.equal(ollama.bytes,4*MB,'Ollama total is the blobs folder');
 assert.deepEqual(ollama.items.map(m=>[m.name,m.bytes]),[['llama3:8b',3*MB+1500],['hf.co/user/tiny:q4',MB+100]]);
 assert.equal(by('package-caches').items.length,2);assert.equal(by('package-caches').bytes,1.5*MB);
 assert.equal(by('downloads').clean,null,'Downloads are never cleaned by Petya');
 assert.equal(by('petya').items[0].name,'coder-worktrees');
 assert.equal(by('trash').bytes,MB);
 assert.ok(result.categories.every((c,i,a)=>!i||a[i-1].bytes>=c.bytes),'sorted by size');
 assert.equal(stages[0][0],'Свободное место на диске');assert.ok(stages.some(s=>s[0]==='Ищу проекты Unity'));assert.deepEqual(stages.at(-1),['Готово',stages.at(-1)[2],stages.at(-1)[2]]);
 // Allocated blocks by default (sparse Docker images count what they hold).
 const sparse=path.join(root,'sparse.raw');fs.closeSync(fs.openSync(sparse,'w'));fs.truncateSync(sparse,500*MB);
 const b=new scanner.Budget({deadline:Date.now()+1000,platform:'darwin'});
 assert.ok(await scanner.size(sparse,b)<MB,'a sparse file counts its blocks, not its length');

 // Time limit and cancellation: partial results, marked as such.
 const late=await scanner.scan({platform:'darwin',home,env:{},userData,unityRoots:[],statfs,timeLimit:-1});
 assert.equal(late.partial,true);
 const controller=new AbortController();controller.abort();
 const stopped=await scanner.scan({platform:'darwin',home,env:{},userData,unityRoots:[],statfs,signal:controller.signal});
 assert.equal(stopped.cancelled,true);assert.equal(stopped.partial,true);

 // Cleanup: only listed items; symlinks refused; Ollama only via `ollama rm`.
 const derived=JSON.parse(JSON.stringify(by('xcode-derived')));
 const trashed=[];
 await assert.rejects(cleanup.clean(derived,['/etc'],{trashItem:p=>trashed.push(p)}),/Список изменился/);
 await assert.rejects(cleanup.clean(by('downloads'),[path.join(home,'Downloads/movie.mp4')],{trashItem:()=>{}}),/не чистит/);
 const cleaned=await cleanup.clean(derived,[path.join(home,'Library/Developer/Xcode/DerivedData/App-abc')],{trashItem:async p=>trashed.push(p)});
 assert.deepEqual(trashed,[path.join(home,'Library/Developer/Xcode/DerivedData/App-abc')]);assert.equal(cleaned.freed,4*MB);assert.equal(derived.bytes,2*MB);
 await assert.rejects(cleanup.clean(derived,[path.join(home,'Library/Developer/Xcode/DerivedData/App-abc')],{trashItem:()=>{}}),/Список изменился/,'already removed');
 const linkCategory={clean:'trash',items:[{path:path.join(home,'Library/Developer/Xcode/DerivedData/link'),bytes:1}],bytes:1};
 const refused=await cleanup.clean(linkCategory,[linkCategory.items[0].path],{trashItem:()=>assert.fail('symlink trashed')});
 assert.match(refused.failed[0].error,/ссылка/);
 const ran=[];
 const models=JSON.parse(JSON.stringify(ollama));
 const rm=await cleanup.clean(models,['llama3:8b'],{runner:async(file,args)=>ran.push([file,...args]),ollama:()=>'/usr/local/bin/ollama'});
 assert.deepEqual(ran,[['/usr/local/bin/ollama','rm','llama3:8b']]);assert.deepEqual(rm.removed,['llama3:8b']);
 assert.equal(cleanup.ollamaBinary({platform:'darwin',env:{PATH:''},exists:f=>f==='/Applications/Ollama.app/Contents/Resources/ollama'}),'/Applications/Ollama.app/Contents/Resources/ollama');
 assert.equal(cleanup.ollamaBinary({platform:'win32',env:{Path:'',LOCALAPPDATA:'C:\\L'},exists:f=>/Programs.Ollama.ollama\.exe$/.test(f)})!==null,true);

 // Chat: routing, not added, the roots question, the card, notifications, duplicate start.
 const topic={id:'t',title:'Чат',messages:[]};
 const sent=[];
 const s={settings:{diskUsageRoots:''},requestProgress:{report(){}},win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(channel,item)=>sent.push([channel,item])}},
  saveSettings(next){Object.assign(this.settings,next);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}}};
 Object.assign(app.deps,{home:()=>home,platform:()=>'darwin',env:()=>({}),userData:()=>userData,timeLimit:30000});
 assert.equal(await app.turn(s,'чем забит диск'),null,'not added: the offer handles it');
 s.settings['extension_disk-usage']='true';
 for(const miss of ['место встречи перенесли на Тверскую','есть ли свободное место в спринте?','диск в Google Drive переполнен','сколько места в машине','что можно почистить в коде этого модуля'])
  assert.equal(await app.turn(s,miss),null,'near-miss: '+miss);
 for(const phrase of ['чем забит диск','сколько места свободно','что можно почистить','освободи место','Сколько свободного места на маке?'])assert.ok(app.wanted(phrase),phrase);
 // No Unity roots known (fake home without Projects): one question, then the scan resumes with the answer.
 const bare=path.join(root,'bare');fs.mkdirSync(path.join(bare,'Work/Game/Assets'),{recursive:true});fs.mkdirSync(path.join(bare,'Work/Game/ProjectSettings'));fs.mkdirSync(path.join(bare,'Work/Game/Library'));fs.writeFileSync(path.join(bare,'Work/Game/Library/a'),Buffer.alloc(MB));
 app.deps.home=()=>bare;
 let question=null;
 try{await app.turn(s,'чем забит диск');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired,'asks where Unity projects are');assert.match(question.spec.text,/Где лежат проекты Unity/);assert.deepEqual(question.spec.options,['Без Unity']);
 const resumed=await question.resume('~/Work');
 assert.equal(s.settings.diskUsageRoots,JSON.stringify([path.join(bare,'Work')]));
 assert.equal(resumed.extensionData.diskUsage.categories.find(c=>c.id==='unity-library').items[0].name,'Game');
 // Next time no question: the saved answer is used. «Без Unity» is remembered as well.
 s.settings.diskUsageRoots='';
 try{await app.turn(s,'чем забит диск');}catch(e){question=e;}
 await question.resume('Без Unity');assert.equal(s.settings.diskUsageRoots,'-');
 const quiet=await app.turn(s,'сколько места свободно');assert.ok(quiet.handled);
 // Happy path on the full fake home.
 app.deps.home=()=>home;s.settings.diskUsageRoots=JSON.stringify([path.join(home,'Projects')]);sent.length=0;
 const reply=await app.turn(s,'чем забит диск');
 const card=reply.extensionData.diskUsage;
 assert.equal(topic.messages.at(-1).by,'Место на диске');
 assert.ok(card.scanId&&card.volume.total>0);assert.ok(card.categories.length>=8);
 assert.match(reply.text,/^Свободно .+ из .+\. Больше всего: /);assert.match(reply.text,/без вашего подтверждения ничего не удаляю/);
 const notices=sent.filter(([c,i])=>c==='extension-install-progress'&&i.id==='disk-usage-scan');
 assert.ok(notices.length>3,'progress published');assert.ok(notices.slice(0,-1).every(([,i])=>i.busy));
 assert.ok(notices.some(([,i])=>Number.isFinite(i.percent)));assert.equal(notices.at(-1)[1].busy,false);assert.match(notices.at(-1)[1].text,/^Готово: свободно/);
 assert.equal(new Set(notices.map(([,i])=>i.id)).size,1,'one stable notification id');
 // Card ipc: cleanup only of the stored scan's items, through the injected Trash.
 const ipc=app.setup(s).ipc;
 assert.equal(ipc.progress().id,'disk-usage-scan');
 const moved=[];app.deps.trashItem=async p=>moved.push(p);
 await assert.rejects(ipc.clean('nope','xcode-derived',['x']),/устарел/);
 await assert.rejects(ipc.clean(card.scanId,'xcode-derived',[path.join(home,'outside')]),/Список изменился/);
 const done=await ipc.clean(card.scanId,'xcode-derived',[path.join(home,'Library/Developer/Xcode/DerivedData/Other-def')]);
 assert.deepEqual(moved,[path.join(home,'Library/Developer/Xcode/DerivedData/Other-def')]);assert.match(done.text,/^В корзину перемещено: 1 · освобождено 2 МБ/);
 const shown=[];app.deps.showItem=p=>shown.push(p);ipc.reveal(card.scanId,'downloads','/etc');assert.deepEqual(shown,[path.join(home,'Downloads')],'reveal only scanned folders');
 // Duplicate start while a scan runs; a scan failure is reported as an error, not a crash.
 app.state.running='x';assert.match((await app.turn(s,'чем забит диск')).text,/Уже считаю/);app.state.running=null;
 app.deps.userData=()=>{throw Error('нет доступа');};
 const failed=await app.turn(s,'чем забит диск');assert.equal(failed.error,true);assert.match(failed.text,/нет доступа/);
 assert.equal(sent.at(-1)[1].kind,'error');
 // Offers: the subject is offered, near-misses are not.
 const offer=offers.load().find(o=>o.id==='disk-usage');
 const pick=text=>offers.candidates(text,{offers:[offer],settings:{}}).map(r=>r.offer.id);
 assert.deepEqual(pick('чем забит диск?'),['disk-usage']);assert.deepEqual(pick('освободи место на маке'),['disk-usage']);
 for(const miss of ['место встречи','свободное место в спринте','диск в Google Drive'])assert.deepEqual(pick(miss),[],miss);
 assert.equal(app.validate.length,1);const v={diskUsageRoots:'["relative"]'};app.validate(v);assert.equal(v.diskUsageRoots,'');
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Disk usage: mac/win paths, volume via disk-space, bounded walk (no symlinks, hard links once, sparse blocks), Ollama manifests, Unity Library, partial/cancel, routing and near-misses, roots question, notifications, guarded cleanup, offers passed');
})().catch(e=>{console.error(e);process.exit(1);});
