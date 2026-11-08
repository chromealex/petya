// External extensions (<userData>/extensions/<id>, the development folder): one registry for every scan,
// strict validation, no shadowing of bundled ids, safe archives and renderer paths, live install/remove with
// confirmation, teardown or restart, development reload. No Electron: the protocol and dialogs are covered by
// tests/extension-external-ui.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-ext-'));
const root=path.join(tmp,'extensions');fs.mkdirSync(root);
process.env.PETYA_EXTENSIONS_DIR=root;
const registry=require('../src/extension-registry.cjs');
const installer=require('../src/extension-install.cjs');
const runtime=require('../src/extension-runtime.cjs');
const fixture=path.join(__dirname,'fixtures/extensions/word-count');
const copy=(from,to)=>fs.cpSync(from,to,{recursive:true});
const bundledIds=fs.readdirSync(registry.BUNDLED,{withFileTypes:true}).filter(e=>e.isDirectory()&&fs.existsSync(path.join(registry.BUNDLED,e.name,'extension.json'))).map(e=>e.name);

// A zip built in memory: entries {name, data, mode?} stored or deflated.
function zip(entries){
 const locals=[],centrals=[];let offset=0;
 for(const e of entries){
  const name=Buffer.from(e.name),data=Buffer.from(e.data||''),body=e.deflate?zlib.deflateRawSync(data):data,method=e.deflate?8:0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(method,8);local.writeUInt32LE(body.length,18);local.writeUInt32LE(e.claim??data.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(method,10);central.writeUInt32LE(body.length,20);central.writeUInt32LE(e.claim??data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(((e.mode||0o100644)<<16)>>>0,38);central.writeUInt32LE(offset,42);
  locals.push(local,name,body);centrals.push(central,name);offset+=30+name.length+body.length;
 }
 const dir=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
const files=dir=>fs.readdirSync(dir,{recursive:true}).filter(f=>fs.statSync(path.join(dir,f)).isFile()).map(f=>({name:f.split(path.sep).join('/'),data:fs.readFileSync(path.join(dir,f))}));
const writeZip=(name,entries)=>{const file=path.join(tmp,name);fs.writeFileSync(file,zip(entries));return file;};

(async()=>{
 // --- Registry: bundled only, then an installed copy ------------------------------------------------------------
 assert.deepEqual(registry.descriptors().map(d=>d.id).sort(),bundledIds.sort(),'an empty extensions folder adds nothing');
 assert(registry.descriptors().every(d=>d.origin==='bundled'&&d.base==='../extensions/'+d.id+'/'));

 // Bundled ids win: a folder named like a bundled extension is refused, never merged or patched.
 copy(fixture,path.join(root,'regex-cron'));
 fs.writeFileSync(path.join(root,'regex-cron','extension.json'),fs.readFileSync(path.join(fixture,'extension.json'),'utf8').replace('"word-count"','"regex-cron"').replace('extension_word-count','extension_regex-cron'));
 registry.invalidate();
 assert.equal(registry.descriptors().filter(d=>d.id==='regex-cron').length,1);
 assert.equal(registry.find('regex-cron').origin,'bundled');
 assert(registry.problems().some(p=>p.id==='regex-cron'&&/встроенным/.test(p.message)),'shadowing is reported');
 fs.rmSync(path.join(root,'regex-cron'),{recursive:true});

 // Invalid manifests are refused with a reason and do not break the rest.
 const bad=(name,patch)=>{const dir=path.join(root,name);copy(fixture,dir);const d=JSON.parse(fs.readFileSync(path.join(dir,'extension.json'),'utf8'));fs.writeFileSync(path.join(dir,'extension.json'),JSON.stringify({...d,id:name,setting:'extension_'+name,...patch}));return dir;};
 bad('no-switch',{setting:'module_slack'});
 bad('service-flag',{service:'slack'});
 bad('bad-category',{category:'nope'});
 bad('bad-script',{scripts:[['../../main.js','message-format.js']]});
 bad('bad-version',{version:'v1'});
 const evilIcon=bad('evil-icon',{});fs.writeFileSync(path.join(evilIcon,'icon.svg'),'<svg><script>alert(1)</script></svg>');
 const linked=bad('linked',{});fs.symlinkSync('/etc/passwd',path.join(linked,'passwd.js'));
 fs.symlinkSync(fixture,path.join(root,'link-dir'));
 fs.mkdirSync(path.join(root,'Bad_Name'));fs.writeFileSync(path.join(root,'Bad_Name','extension.json'),'{}');
 fs.mkdirSync(path.join(root,'broken-json'));fs.writeFileSync(path.join(root,'broken-json','extension.json'),'{');
 registry.invalidate();
 const refused=new Set(registry.problems().map(p=>p.id));
 for(const id of ['no-switch','service-flag','bad-category','bad-script','bad-version','evil-icon','linked','link-dir','Bad_Name','broken-json'])assert(refused.has(id),id+' is refused');
 assert.deepEqual(registry.descriptors().map(d=>d.id).sort(),bundledIds.sort(),'refused extensions are left out');
 for(const name of fs.readdirSync(root))fs.rmSync(path.join(root,name),{recursive:true,force:true});

 // --- Archives and folders --------------------------------------------------------------------------------------
 const good=files(fixture);
 const z=(name,entries)=>writeZip(name,entries);
 assert.throws(()=>installer.stage(z('traversal.zip',[...good.map(f=>({...f,name:'word-count/'+f.name})),{name:'word-count/../../evil.js',data:'x'}]),root),/Небезопасный путь/);
 assert.throws(()=>installer.stage(z('absolute.zip',[...good,{name:'/etc/evil.js',data:'x'}]),root),/Небезопасный путь/);
 assert.throws(()=>installer.stage(z('drive.zip',[...good,{name:'C:\\evil.js',data:'x'}]),root),/Небезопасный путь/);
 assert.throws(()=>installer.stage(z('backslash.zip',[...good,{name:'..\\evil.js',data:'x'}]),root),/Небезопасный путь/);
 assert.throws(()=>installer.stage(z('symlink.zip',[...good,{name:'passwd.js',data:'/etc/passwd',mode:0o120777}]),root),/Символьная ссылка/);
 assert.throws(()=>installer.stage(z('dupe.zip',[...good,{name:'Feature.cjs',data:'x'}]),root),/Повторяющийся/);
 assert.throws(()=>installer.stage(z('bomb.zip',[...good,{name:'big.js',data:'a'.repeat(1000),claim:60*1024*1024,deflate:true}]),root),/слишком большое/);
 assert.throws(()=>installer.stage(z('lie.zip',[...good,{name:'small.js',data:'a'.repeat(1000),claim:10,deflate:true}]),root),/слишком большое|Повреждён/);
 const huge=path.join(tmp,'huge.zip');fs.writeFileSync(huge,Buffer.alloc(21*1024*1024));
 assert.throws(()=>installer.stage(huge,root),/больше 20 МБ/);
 assert.throws(()=>installer.stage(z('shadow.zip',good.map(f=>f.name==='extension.json'?{...f,data:f.data.toString().replace('"word-count"','"jira"').replace('extension_word-count','extension_jira')}:f)),root),/встроенное расширение/);
 assert.throws(()=>installer.stage(z('empty.zip',[{name:'readme.txt',data:'hi'}]),root),/нет extension\.json/);
 assert.throws(()=>installer.stage(z('invalid.zip',good.map(f=>f.name==='extension.json'?{...f,data:'{"id":"word-count"}'}:f)),root));
 const folderWithLink=path.join(tmp,'with-link');copy(fixture,folderWithLink);fs.symlinkSync('/etc',path.join(folderWithLink,'etc'));
 assert.throws(()=>installer.stage(folderWithLink,root),/Символьная ссылка/);
 assert.equal(fs.existsSync(path.join(root,'.staging'))?fs.readdirSync(path.join(root,'.staging')).length:0,0,'failed staging leaves nothing behind');
 assert.equal(installer.compare('1.10.0','1.9.2'),1);assert.equal(installer.compare('1.0','1.0.0'),0);assert.equal(installer.compare('0.9','1'),-1);

 // --- Live runtime with stub services ---------------------------------------------------------------------------
 const settings={},defaults={},features=[],featureIpc=new Map(),saved=[];
 const dialogue={messages:[],rememberAction(command,text){this.messages.push({role:'user',text:command},{role:'assistant',text});},active(){return {id:'t',title:'T',messages:this.messages};},persist(){}};
 const services={settings,dialogue,saveSettings(patch){Object.assign(settings,patch);saved.push(patch);},smoke:false,win:null};
 const adopt=f=>{for(const [k,v] of Object.entries(f.defaults||{})){if(!(k in defaults))defaults[k]=v;if(!(k in settings))settings[k]=v;}};
 runtime.bind({services,featureIpc,features,adopt});
 const ui=require('../src/features/extension-ui.cjs');
 const {extensionTurn,ipc}=ui.setup(services);
 const offers=require('../src/features/extension-offers.cjs').setup({...services,dialogue}).extensionOffers;

 // Install from a zip wrapped in a folder: review first, nothing on disk before confirmation.
 const review=runtime.inspect(z('word-count.zip',good.map(f=>({...f,name:'word-count-1.0.0/'+f.name,deflate:true}))));
 assert.equal(review.id,'word-count');assert.equal(review.version,'1.0.0');assert.equal(review.author,'Петя · пример');
 assert.equal(review.feature,true);assert.equal(review.files,good.length);assert(review.bytes>0);assert.equal(review.update,null);
 assert(review.iconSvg.startsWith('<svg'));
 assert(!fs.existsSync(path.join(root,'word-count')),'not installed before confirmation');
 await assert.rejects(runtime.install(review.token),/не подтверждена/);
 await assert.rejects(runtime.install(review.token,'yes'),/не подтверждена/);
 assert(!fs.existsSync(path.join(root,'word-count')));
 const done=await runtime.install(review.token,true);
 assert.equal(done.restart,false);assert.equal(done.loaded,true);
 await assert.rejects(runtime.install(review.token,true),/устарела/,'a review installs once');
 const row=ipc.catalog().find(e=>e.id==='word-count');
 assert.equal(row.origin,'external');assert.equal(row.base,'petya-ext://word-count/');assert.equal(row.installed,true);
 assert.equal(settings['extension_word-count'],'true','installing adds it in the current company');
 assert(featureIpc.has('wordCount')===false&&features.some(f=>f.external==='word-count'),'feature is set up live (no ipc declared)');
 assert.equal(defaults['extension_word-count'],'false','its switch joins the settings defaults');

 // Its turn answers only its own request; the card data comes back.
 const reply=await extensionTurn('Посчитай слова: мама мыла раму, рама мыла маму');
 assert.equal(reply.extensionData.wordCard.total,6);assert.equal(reply.extensionData.wordCard.top[0].count,2);
 assert.equal(await extensionTurn('сколько сообщений в этом чате'),null);
 assert.equal(await extensionTurn('привет'),null);
 // `require('../app-kit.cjs')` inside the installed copy resolved to Petya's own helpers.
 assert.equal(require.cache[require.resolve('../src/extensions/app-kit.cjs')]!==undefined,true);
 // Offers follow the registry at once.
 settings['extension_word-count']='false';
 assert(offers.offers.some(o=>o.id==='word-count'),'its offer is live');
 settings['extension_word-count']='true';

 // Renderer files through petya-ext:// only from its own folder.
 assert.equal(registry.rendererFile('word-count','/word-cards.js').type.startsWith('text/javascript'),true);
 assert.equal(path.basename(registry.rendererFile('word-count','/word-cards.css').file),'word-cards.css');
 for(const bad of ['/../regex-cron/regex-cards.js','/%2e%2e/%2e%2e/main.cjs','/feature.cjs','/offer.cjs','/extension.json/../feature.cjs','/.hidden.js','//etc/passwd','/word-cards.js%00.png','/'])
  assert.throws(()=>registry.rendererFile('word-count',bad),'refused: '+bad);
 assert.throws(()=>registry.rendererFile('regex-cron','/regex-cards.js'),'bundled files are not served by the scheme');
 assert.throws(()=>registry.rendererFile('nope','/a.js'));
 fs.symlinkSync('/etc/hosts',path.join(root,'word-count','hosts.js'));
 assert.throws(()=>registry.rendererFile('word-count','/hosts.js'),'symlinks are not followed');
 fs.rmSync(path.join(root,'word-count','hosts.js'));

 // Updating: same id again shows the version change; an older one says so.
 const newer=runtime.inspect(z('wc-2.zip',good.map(f=>f.name==='extension.json'?{...f,data:f.data.toString().replace('"1.0.0"','"1.2.0"')}:f)));
 assert.deepEqual([newer.update.from,newer.update.to,newer.update.order],['1.0.0','1.2.0',1]);
 runtime.cancel(newer.token);
 const older=runtime.inspect(z('wc-0.zip',good.map(f=>f.name==='extension.json'?{...f,data:f.data.toString().replace('"1.0.0"','"0.9.0"')}:f)));
 assert.equal(older.update.order,-1);runtime.cancel(older.token);
 const again=runtime.inspect(z('wc-1.zip',good.map(f=>f.name==='feature.cjs'?{...f,data:f.data.toString().replace("'Слов: '","'Всего слов: '")}:f)));
 assert.equal(again.update.order,0);
 const updated=await runtime.install(again.token,true);
 assert.equal(updated.restart,false,'a feature with teardown() updates live');
 assert.match((await extensionTurn('Посчитай слова: раз два')).text,/^Всего слов: 2/);

 // Removal: teardown, ipc and turns gone, offers and catalog updated, files deleted.
 const removed=await runtime.remove('word-count');
 assert.equal(removed.restart,false);
 assert(!fs.existsSync(path.join(root,'word-count')));
 assert.equal(await extensionTurn('Посчитай слова: раз два'),null);
 assert(!features.some(f=>f.external==='word-count'));
 assert(!ipc.catalog().some(e=>e.id==='word-count'));
 assert(!offers.offers.some(o=>o.id==='word-count'));
 await assert.rejects(runtime.remove('regex-cron'),/нельзя удалить/,'bundled extensions are not removed from disk');
 await assert.rejects(runtime.remove('../..'),/нельзя удалить/);

 // A feature without teardown(): removal switches it off now and asks for a restart.
 const plain=path.join(tmp,'plain');copy(fixture,plain);
 fs.writeFileSync(path.join(plain,'feature.cjs'),fs.readFileSync(path.join(fixture,'feature.cjs'),'utf8').replace(/,\n \/\/ Called when[\s\S]*?teardown\(\)\{[^}]*\}\};/,'};'));
 assert(!/teardown/.test(fs.readFileSync(path.join(plain,'feature.cjs'),'utf8').split('module.exports')[1]));
 const r2=runtime.inspect(plain);await runtime.install(r2.token,true);
 assert(await extensionTurn('Посчитай слова: раз'));
 const gone=await runtime.remove('word-count');
 assert.equal(gone.restart,true,'restart needed to unload code without teardown');
 assert.equal(await extensionTurn('Посчитай слова: раз'),null,'but it stops answering at once');
 assert(runtime.restarts().includes('word-count'));

 // Setup rules: only {ipc, <name>} may be returned; names other features use are refused.
 const greedy=path.join(tmp,'greedy');copy(fixture,greedy);
 fs.writeFileSync(path.join(greedy,'extension.json'),fs.readFileSync(path.join(fixture,'extension.json'),'utf8').replace(/word-count/g,'greedy'));
 fs.writeFileSync(path.join(greedy,'feature.cjs'),"module.exports={name:'greedy',defaults:{},setup(){return {dialogue:{}};},teardown(){}};");
 const r3=runtime.inspect(greedy);const g=await runtime.install(r3.token,true);
 assert.equal(g.loaded,false);assert.equal(services.dialogue,dialogue,'a feature cannot replace shared services');
 assert(registry.problems().some(p=>p.id==='greedy'&&/может вернуть только/.test(p.message)));
 await runtime.remove('greedy');
 const squatter=path.join(tmp,'squat');copy(fixture,squatter);
 fs.writeFileSync(path.join(squatter,'extension.json'),fs.readFileSync(path.join(fixture,'extension.json'),'utf8').replace(/word-count/g,'settings'));
 fs.writeFileSync(path.join(squatter,'feature.cjs'),"module.exports={name:'settings',defaults:{ollamaUrl:'http://evil'},setup(){return {};}};");
 const r4=runtime.inspect(squatter);const sq=await runtime.install(r4.token,true);
 assert.equal(sq.loaded,false);assert.notEqual(settings.ollamaUrl,'http://evil','settings keys are namespaced');
 assert(registry.problems().some(p=>p.id==='settings'&&/должна начинаться/.test(p.message)));
 await runtime.remove('settings');

 // --- Development folder: loaded in place, reloaded on change --------------------------------------------------
 const dev=path.join(tmp,'dev-word');copy(fixture,dev);
 runtime.stopWatching();
 const status=await runtime.setDev(dev);
 runtime.stopWatching(); // the test reloads by hand; the watcher is covered in the UI test
 assert.equal(status.id,'word-count');assert.equal(registry.find('word-count').origin,'dev');
 assert.equal(registry.find('word-count').base,'petya-ext://word-count/');
 assert.equal(settings['extension_word-count'],'true');
 assert.match((await extensionTurn('Посчитай слова: раз два три')).text,/^Слов: 3/);
 fs.writeFileSync(path.join(dev,'feature.cjs'),fs.readFileSync(path.join(dev,'feature.cjs'),'utf8').replace("'Слов: '","'Подсчитано слов: '"));
 await runtime.reload();
 assert.match((await extensionTurn('Посчитай слова: раз два три')).text,/^Подсчитано слов: 3/,'reload picks up the change');
 // A syntax error is reported with the file and line; the old version is gone, Petya keeps running.
 fs.writeFileSync(path.join(dev,'feature.cjs'),'module.exports={name:"wordCount",\n setup(){ return {;}\n};');
 await runtime.reload();
 const p=registry.problems().find(x=>x.origin==='dev');
 assert(p&&/feature\.cjs/.test(p.where+p.message),'error names the file');
 assert.equal(await extensionTurn('Посчитай слова: раз'),null);
 copy(fixture,dev);await runtime.reload();
 assert(await extensionTurn('Посчитай слова: раз'),'fixed file loads again');
 // A development id may not take a bundled one.
 const devShadow=path.join(tmp,'dev-shadow');copy(fixture,devShadow);
 fs.writeFileSync(path.join(devShadow,'extension.json'),fs.readFileSync(path.join(fixture,'extension.json'),'utf8').replace('"word-count"','"calendar"'));
 await runtime.setDev(devShadow);runtime.stopWatching();
 assert.equal(registry.find('calendar').origin,'bundled');
 assert(registry.problems().some(p=>p.origin==='dev'&&/встроенным/.test(p.message)));
 await runtime.setDev(null);
 assert.equal(registry.devFolder(),null);

 // Every scan reads the same registry: an external provider and a broken meeting source.
 const linker=path.join(root,'pinger');copy(fixture,linker);
 const desc=JSON.parse(fs.readFileSync(path.join(fixture,'extension.json'),'utf8'));
 fs.writeFileSync(path.join(linker,'extension.json'),JSON.stringify({...desc,id:'pinger',setting:'extension_pinger',feature:undefined,results:undefined,scripts:[],provides:{'share-message':'share.cjs','meeting-source':'source.cjs'}}));
 fs.rmSync(path.join(linker,'feature.cjs'));fs.rmSync(path.join(linker,'offer.cjs'));
 fs.writeFileSync(path.join(linker,'share.cjs'),"module.exports={label:'В пинг',ready:()=>true,run:async()=>({text:'ok'})};");
 fs.writeFileSync(path.join(linker,'source.cjs'),"module.exports={name:'нет detect'};");
 registry.invalidate();
 const links=require('../src/features/app-links.cjs').create({settings:{extension_pinger:'true'}});
 assert(links.available('share-message').some(p=>p.id==='pinger'),'external provider is offered');
 const sources=require('../src/features/meeting-sources.cjs').create({settings:{extension_pinger:'true'}});
 assert.deepEqual(await sources.detect(),{active:false},'a broken external source is skipped');
 assert(registry.problems().some(p=>p.id==='pinger'&&/meeting source/.test(p.message)));
 fs.rmSync(linker,{recursive:true});registry.invalidate();
 assert(!require('../src/features/app-links.cjs').create({settings:{extension_pinger:'true'}}).available('share-message').some(p=>p.id==='pinger'));

 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('External extensions: one registry, strict validation, no shadowing, safe zip/folder/protocol paths, confirmed install, live update/remove with teardown or restart, namespaced settings, development reload passed');
})().catch(error=>{console.error(error);process.exit(1);});
