// «Генератор уровней»: routing and near-misses, request → generator parameters checked against the preset schema
// (with and without the model), the stdio MCP client against a fake rtsmcp (tools, errors, timeout, exit), engine
// detection (settings, PATH, ~/RTSEngine, Petya's download — an existing engine wins), the builds index from a fake
// GitHub (index.txt + git blob SHA-1, index.json + sha256, Intel Mac / Linux without a package), download with
// verification, a mismatching hash, cancel, update (one version kept), unsafe archives, and the chat turns end to end
// on the fake rtsmcp: no engine → engine card, project question, draft card, edits with undo, save that asks before
// overwriting, balance, discard. No network: the HTTP server is local.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const zlib=require('node:zlib');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const intent=require('../src/extensions/rts-levels/intent.cjs');
const engine=require('../src/extensions/rts-levels/engine.cjs');
const unzip=require('../src/extensions/rts-levels/unzip.cjs');
const maps=require('../src/extensions/rts-levels/maps.cjs');
const {McpClient}=require('../src/extensions/rts-levels/mcp-client.cjs');
const app=require('../src/extensions/rts-levels/feature.cjs');
const offer=require('../src/extensions/rts-levels/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const {InputRequired}=require('../src/input-required.cjs');

const FAKE=path.join(__dirname,'fixtures','fake-rtsmcp.cjs');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-rts-levels-'));
const fakeSpawn=(cmd,args,opts)=>spawn(process.execPath,[FAKE,...args],opts);
const log=path.join(root,'calls.log');process.env.FAKE_RTSMCP_LOG=log;
const calls=()=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];

// A packaged engine folder like the builds zips: RTSEngine/{bin/rtsmcp, templates/, engine/assets/}.
function engineDir(base,{editor=false}={}){
 for(const d of ['bin','templates/skirmish','engine/assets'])fs.mkdirSync(path.join(base,d),{recursive:true});
 fs.writeFileSync(path.join(base,'bin','rtsmcp'),'#!/bin/sh\n');fs.chmodSync(path.join(base,'bin','rtsmcp'),0o755);
 if(editor)fs.writeFileSync(path.join(base,'bin','rts_editor'),'#!/bin/sh\n');
 return base;
}
function project(name){const dir=path.join(root,'projects',name);fs.mkdirSync(path.join(dir,'maps'),{recursive:true});fs.writeFileSync(path.join(dir,'game.json'),JSON.stringify({name,maps:[{file:'maps/valley.json'}]}));fs.writeFileSync(path.join(dir,'maps','valley.json'),'{}');return dir;}
// A zip (stored entries, unix modes) as package_engine.py writes them.
function zip(files){
 const local=[],central=[];let off=0;
 for(const [name,body,mode=0o644] of files){
  const data=Buffer.from(body),nameBuf=Buffer.from(name),crc=zlib.crc32(data);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(nameBuf.length,26);
  local.push(h,nameBuf,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x031e,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt32LE(((name.endsWith('/')?0o40755:0o100000|mode)<<16)>>>0,38);c.writeUInt32LE(off,42);
  central.push(c,nameBuf);off+=30+nameBuf.length+data.length;
 }
 const cd=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(files.length,8);e.writeUInt16LE(files.length,10);e.writeUInt32LE(cd.length,12);e.writeUInt32LE(off,16);
 return Buffer.concat([...local,cd,e]);
}
const pkgZip=tag=>zip([['RTSEngine/',''],['RTSEngine/bin/',''],['RTSEngine/bin/rtsmcp','#!/bin/sh\n# '+tag+'\n',0o755],['RTSEngine/bin/rts_headless','x',0o755],['RTSEngine/templates/skirmish/game.json','{}'],['RTSEngine/engine/assets/a.txt','a'],['RTSEngine/README.md','# '+tag]]);
const blob=b=>crypto.createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');

// ---- a fake GitHub: raw files of the builds branch and the contents API ----
const site={files:{},api:{},slow:false,hits:[]};
const server=http.createServer((req,res)=>{
 site.hits.push(req.url);
 const u=new URL(req.url,'http://x');
 if(u.pathname.startsWith('/api/')){const meta=site.api[decodeURIComponent(u.pathname.slice(5))];if(!meta||u.searchParams.get('ref')!=='builds'){res.writeHead(404);return res.end('{}');}res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(meta));}
 const body=site.files[decodeURIComponent(u.pathname.slice(5))];
 if(body===undefined){res.writeHead(404);return res.end('404');}
 res.writeHead(200,{'content-length':body.length});
 if(!site.slow||body.length<1000)return res.end(body);
 let i=0;const step=()=>{if(i>=body.length)return res.end();res.write(body.subarray(i,i+=4096));setTimeout(step,15);};step();
});

(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const RAW=base+'/raw/',API=base+'/api/';

 // ---- routing ----
 const own=['сгенерируй карту 2 на 2 с рекой посередине','сделай симметричную карту для 4 игроков, побольше руды','сгенерируй карту для RTS','сделай карту для 3 игроков с островами','покажи мои RTS-проекты'];
 for(const p of own)assert.ok(intent.classify(p,{}),'ours: '+p);
 const nobody=['сгенерируй картинку с замком','сгенерируй картинку карты','сделай карту сайта','сгенерируй карту сайта для 4 разделов','найди кафе на карте в Google Maps','открой карту в гугл картах','какой уровень логирования на проде','поставь уровень логирования debug','какой уровень игрока нужен для арены','сгенерируй уровень игрока 30','сделай баланс юнитов','сгенерируй уровень в Unity','сделай карту для 2 игроков в Unity','сделай уровень в Godot с рекой','сделай mind map проекта','привет','что такое RTS','карта лояльности'];
 for(const p of nobody){assert.equal(intent.classify(p,{}),null,'not ours: '+p);assert.equal(intent.classify(p,{rtsProject:true}),null,'not ours even with a project: '+p);}
 // A bare «сгенерируй уровень» is ours only when this Petya project has an RTS project; Unity never.
 assert.equal(intent.classify('сгенерируй уровень',{}),null);
 assert.equal(intent.classify('сгенерируй уровень',{rtsProject:true}).kind,'generate');
 assert.equal(intent.classify('сгенерируй уровень в Unity',{rtsProject:true}),null);
 // Edits only with a draft in the chat.
 assert.equal(intent.classify('сделай реку шире',{}),null);
 assert.equal(intent.classify('сделай реку шире',{draft:true}).edit.op,'river-wider');
 assert.deepEqual(intent.classify('добавь ещё 2 месторождения у центра',{draft:true}).edit,{op:'resources-add',count:2,place:'centre',label:'Ещё 2 месторожд.'});
 assert.equal(intent.classify('добавь 3 рудника у баз',{draft:true}).edit.place,'bases');
 assert.equal(intent.classify('отмени',{draft:true}).kind,'undo');
 // A new map described in full is a new draft even next to one; «побольше руды» alone edits the draft.
 assert.equal(intent.classify('сделай симметричную карту для 4 игроков, побольше руды',{draft:true}).kind,'generate');
 assert.equal(intent.classify('больше руды',{draft:true}).edit.op,'params');
 assert.equal(intent.classify('сделай карту побольше',{draft:true}).edit.grow,1.25);
 assert.equal(intent.classify('ещё вариант',{draft:true}).kind,'variant');
 // The neighbours' own requests are never ours.
 for(const p of ['сделай гифку из видео','сожми видео до 10 МБ','составь крон на каждый будний день в 9','какие крэши за неделю','сверь баланс с конфигами','DAU за неделю','придумай название для ивента на Хэллоуин','фокус на 50 минут над картой уровня','разбери плейтест'])assert.equal(intent.classify(p,{rtsProject:true,draft:true}),null,p);
 // Offers: precise, and the near-misses offer nothing of ours.
 const pick=t=>{const d=offers.decide(offers.candidates(t,{offers:[offer],settings:{}}));return d?.one?.offer.id||null;};
 assert.equal(pick('сгенерируй карту 2 на 2 с рекой посередине'),'rts-levels');
 for(const p of ['сгенерируй картинку с замком','карта сайта','карта в Google Maps','уровень логирования','уровень игрока','сгенерируй уровень в Unity'])assert.equal(pick(p),null,p);

 // ---- parameters: rules, model, schema ----
 assert.deepEqual(intent.parseRequest('сгенерируй карту 2 на 2 с рекой посередине'),{players:4,teams:[2,2],river:'middle'});
 assert.deepEqual(intent.parseRequest('сделай симметричную карту для 4 игроков, побольше руды'),{players:4,symmetric:true,resources:1.6});
 assert.deepEqual(intent.parseRequest('карта 128 на 96 для двух игроков').size,[128,96]);
 assert.equal(intent.parseRequest('маленькая карта для двух игроков без воды').water,0);
 const presets={presets:[{id:'classic',title:'Классика',source:'engine',params:{shape:'classic',size:[64,64]}},{id:'islands',title:'Архипелаг',source:'engine',params:{shape:'islands',size:[96,96]}},{id:'rocky',title:'Планета',genre:'planet',params:{shape:'planet'}}],params:'shape, size [w,h], water 0..1, rivers 0..1, levels 0..9, trees, resources (multipliers)'};
 let v=intent.validate(intent.parseRequest('сгенерируй карту 2 на 2 с рекой посередине'),presets,{seed:5});
 assert.deepEqual(v.gen,{preset:'classic',seed:5,players:4,symmetry:'mirror4',params:{rivers:0.15}});
 assert.deepEqual(v.teams,[2,2]);assert.deepEqual(v.river,{width:4,fords:3});
 v=intent.validate(intent.parseRequest('сделай симметричную карту для 4 игроков, побольше руды'),presets,{seed:5});
 assert.equal(v.gen.symmetry,'rot4');assert.equal(v.gen.params.resources,1.6);
 v=intent.validate({players:2,symmetric:true,preset:'rocky',water:7,levels:3.4,islands:3,bogus:1},presets,{seed:1});
 assert.equal(v.gen.preset,'classic','planet presets are not offered for flat maps');assert.equal(v.gen.symmetry,'point');
 assert.deepEqual(v.gen.params,{water:1,levels:3},'clamped, unknown and out-of-schema keys dropped');
 assert.throws(()=>intent.validate({size:[8,8]},presets),/от 16 до 1024/);
 assert.equal(intent.validate({players:12},presets).gen.players,8);
 // The model only fills what the rules left out.
 const merged=intent.merge({players:4,teams:[2,2]},{players:6,preset:'islands',teamA:3,teamB:3,riverMiddle:true,water:0.3});
 assert.deepEqual(merged,{players:4,teams:[2,2],preset:'islands',river:'middle',water:0.3});
 assert.deepEqual(intent.merge({},null),{});
 // Game presets come first.
 assert.equal(intent.defaultPreset({presets:[...presets.presets,{id:'my_valley',title:'Долина',source:'game',params:{size:[40,40]}}]}).id,'my_valley');
 // Teams from the starts: the left side is team 1.
 assert.deepEqual(maps.teamsOf([[6,6],[58,6],[58,58],[6,58]],[2,2],'x'),[1,2,2,1]);
 assert.equal(maps.checkFile('maps/gen_a.json'),'maps/gen_a.json');
 for(const bad of ['../x.json','maps/../game.json','/etc/x.json','maps/a b.json','rules.json'])assert.throws(()=>maps.checkFile(bad),/maps\//,bad);
 assert.deepEqual(maps.issuesOf({issues:[{error:false,text:"map.generated: unknown key, did you mean 'generate'?"},{error:true,text:'tree: стоит на непроходимой клетке'},{error:true,text:'tree: стоит на непроходимой клетке'}]}),[{text:'tree: стоит на непроходимой клетке',error:true,count:2}],'the generator summary warning is not shown');

 // ---- MCP client ----
 const mcp=new McpClient({command:'rtsmcp',args:['--no-editor'],spawnImpl:fakeSpawn,timeout:3000});
 assert.equal((await mcp.listTools()).some(t=>t.name==='map_generate'),true);
 assert.equal(mcp.info.serverInfo.name,'rtsengine');
 assert.deepEqual((await mcp.call('list_projects',{})).templates.length,2);
 await assert.rejects(mcp.call('map_info',{}),/no game open/,'a tool error is an error');
 await assert.rejects(mcp.request('nope/method',{}),/method not found/);
 await assert.rejects(mcp.call('slow',{ms:2000},{timeout:150}),/не ответил/);
 const ac=new AbortController();const pending=mcp.call('slow',{ms:2000},{signal:ac.signal});ac.abort();await assert.rejects(pending,/Отменено/);
 await assert.rejects(mcp.call('crash',{}),/завершился с кодом 3/,'a dead server rejects pending calls');
 assert.equal(mcp.alive,false);
 mcp.close();
 assert.ok(calls().some(c=>c.method==='notifications/initialized'),'initialized notification sent');

 // ---- detection: an engine the user has wins ----
 const home=path.join(root,'home');fs.mkdirSync(home);
 const userData=path.join(root,'userData');fs.mkdirSync(userData);
 assert.deepEqual(engine.detect({userData,env:{PATH:''},home,platform:'linux'}),[]);
 const homeEngine=engineDir(path.join(home,'RTSEngine'),{editor:true});
 let found=engine.detect({userData,env:{PATH:''},home,platform:'linux'});
 assert.equal(found[0].source,'home');assert.equal(found[0].engine,homeEngine);assert.equal(found[0].editor,path.join(homeEngine,'bin','rts_editor'));
 const onPath=engineDir(path.join(root,'opt','RTSEngine'));
 found=engine.detect({userData,env:{PATH:path.join(onPath,'bin')},home,platform:'linux'});
 assert.deepEqual(found.map(e=>e.source),['path','home']);assert.equal(found[0].engine,onPath);
 const custom=engineDir(path.join(root,'custom'));
 found=engine.detect({settingsPath:path.join(custom,'bin','rtsmcp'),userData,env:{PATH:path.join(onPath,'bin')},home,platform:'linux'});
 assert.equal(engine.best(found).source,'settings');assert.equal(engine.best(found).engine,custom);
 assert.equal(engine.detect({settingsPath:path.join(root,'nowhere'),userData,env:{PATH:''},home:path.join(root,'nohome')})[0].missing,true);
 assert.deepEqual(engine.mcpArgs({engine:custom}),['--engine',custom,'--no-editor','--port','0']);

 // ---- the builds index ----
 const zipA=pkgZip('A'),zipB=pkgZip('B — newer');
 const fileA='macos/RTSEngine-0.2.0-aaaaaaaa-macos.zip',fileB='macos/RTSEngine-0.2.1-bbbbbbbb-macos.zip',fileW='windows/RTSEngine-0.2.0-aaaaaaaa-windows.zip';
 site.files['index.txt']=[fileW,fileA].join('\n')+'\n';site.files[fileA]=zipA;site.files[fileW]=zipA;
 site.api[fileA]={sha:blob(zipA),size:zipA.length,download_url:'https://evil.example/'+fileA};
 site.api[fileW]={sha:blob(zipA),size:zipA.length};
 let pkg=await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API});
 assert.deepEqual({file:pkg.file,version:pkg.version,commit:pkg.commit,size:pkg.size,blobSha:pkg.blobSha,url:pkg.url,source:pkg.source},{file:fileA,version:'0.2.0',commit:'aaaaaaaa',size:zipA.length,blobSha:blob(zipA),url:RAW+fileA,source:'index.txt'},'a download URL outside GitHub is never used');
 assert.match((await engine.latest({platform:'darwin',arch:'x64',raw:RAW,api:API})).unsupported,/только для Mac на Apple Silicon/);
 assert.match((await engine.latest({platform:'linux',arch:'x64',raw:RAW,api:API})).unsupported,/Linux пока нет/);
 assert.equal((await engine.latest({platform:'win32',arch:'x64',raw:RAW,api:API})).file,fileW);
 // index.json wins when the branch has one: sha256 and size from it, no contents API call.
 site.files['index.json']=JSON.stringify({schema:1,packages:[{platform:'macos',arch:'arm64',version:'0.2.1',commit:'bbbbbbbb',file:fileB,url:'https://raw.githubusercontent.com/chromealex/rts-engine/builds/'+fileB,size:zipB.length,sha256:sha256(zipB),rtsmcp:'RTSEngine/bin/rtsmcp'}]});
 site.files[fileB]=zipB;
 const before=site.hits.length;
 pkg=await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API});
 assert.equal(pkg.sha256,sha256(zipB));assert.equal(pkg.source,'index.json');assert.equal(pkg.url,'https://raw.githubusercontent.com/chromealex/rts-engine/builds/'+fileB);
 assert.ok(!site.hits.slice(before).some(h=>h.startsWith('/api/')),'no contents API with index.json');
 delete site.files['index.json'];

 // ---- download, verify, install, update, cancel, bad hash ----
 const verified=[];
 const fetchLocal=(url,o)=>fetch(String(url).replace('https://raw.githubusercontent.com/chromealex/rts-engine/builds/',RAW),o);
 const stages=[];
 const a=await engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal,status:(s,f)=>stages.push(s),verify:async e=>verified.push(e)});
 assert.equal(a.commit,'aaaaaaaa');assert.equal(a.checked,'git-blob-sha1');
 assert.ok(stages.includes('download')&&stages.includes('unpack')&&stages.includes('verify'));
 const exe=path.join(a.base,'bin','rtsmcp');
 assert.equal(fs.statSync(exe).mode&0o111,0o111,'tools are executable');
 assert.match(verified[0].engine,/install-.*[\\/]RTSEngine$/,'rtsmcp is checked before the engine is moved in place');
 found=engine.detect({userData,env:{PATH:''},home:path.join(root,'nohome'),platform:'linux'});
 assert.equal(found[0].source,'download');assert.equal(found[0].commit,'aaaaaaaa');assert.equal(found[0].engine,a.base);
 // Update: the newer package replaces the old one; one version stays.
 site.files['index.txt']=[fileB,fileA].join('\n');site.api[fileB]={sha:blob(zipB),size:zipB.length};
 const b=await engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal});
 assert.equal(b.commit,'bbbbbbbb');
 assert.deepEqual(fs.readdirSync(engine.root(userData)).sort(),['engine-0.2.1-bbbbbbbb']);
 assert.match(fs.readFileSync(path.join(b.base,'README.md'),'utf8'),/newer/);
 // A mismatching hash: nothing installed, nothing left over.
 site.api[fileB]={sha:'0'.repeat(40),size:zipB.length};
 await assert.rejects(engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal}),e=>e.integrity===true&&/проверку целостности/.test(e.message));
 assert.deepEqual(fs.readdirSync(engine.root(userData)).sort(),['engine-0.2.1-bbbbbbbb'],'the installed engine stays, staging removed');
 // A size that does not match stops the download too.
 site.api[fileB]={sha:blob(zipB),size:zipB.length-10};
 await assert.rejects(engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal}),/больше заявленного|целостности/);
 // Cancel in the middle of the download.
 const big=pkgZip('C'+'x'.repeat(200000));const fileC='macos/RTSEngine-0.2.2-cccccccc-macos.zip';
 site.files[fileC]=big;site.api[fileC]={sha:blob(big),size:big.length};site.files['index.txt']=fileC+'\n'+fileB;site.slow=true;
 const ctl=new AbortController();
 const run=engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal,signal:ctl.signal,status:(s,f)=>{if(s==='download'&&f>0.1)ctl.abort();}});
 await assert.rejects(run,e=>e.name==='AbortError'||/abort/i.test(e.message));
 site.slow=false;
 assert.deepEqual(fs.readdirSync(engine.root(userData)).sort(),['engine-0.2.1-bbbbbbbb'],'a cancelled download leaves the installed engine alone');
 // Declined confirmation downloads nothing.
 const hitsBefore=site.hits.filter(h=>h==='/raw/'+fileC).length;
 await assert.rejects(engine.install({userData,pkg:await engine.latest({platform:'darwin',arch:'arm64',raw:RAW,api:API}),platform:'linux',fetchImpl:fetchLocal,confirm:async()=>false}),e=>e.cancelled);
 assert.equal(site.hits.filter(h=>h==='/raw/'+fileC).length,hitsBefore);
 // Unsafe archives are refused.
 const evil=path.join(root,'evil.zip');fs.writeFileSync(evil,zip([['RTSEngine/../../escape.txt','x']]));
 const out=path.join(root,'evil-out');fs.mkdirSync(out);
 await assert.rejects(unzip.extract(evil,out),/Небезопасный путь/);
 assert.equal(fs.existsSync(path.join(root,'escape.txt')),false);
 const link=path.join(root,'link.zip');const lz=zip([['RTSEngine/l','/etc/passwd',0o120777]]);fs.writeFileSync(link,lz);
 await assert.rejects(unzip.extract(link,out),/символическая ссылка/);

 // ---- chat turns on the fake rtsmcp ----
 const gameDir=project('Iron Test');
 const topic={id:'t1',title:'Чат',projectId:'p1',messages:[]};
 const saved={};
 const s={settings:{'extension_rts-levels':'false',rtsLevelsEnginePath:''},dataRoot:path.join(root,'company'),win:null,
  saveSettings(patch){Object.assign(s.settings,patch);Object.assign(saved,patch);},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});},state:{topics:[topic],projects:[{id:'p1',name:'Железо'}],activeProjectId:'p1'}},
  async request(){throw Error('нет сети в тесте');}};
 const noUser=path.join(root,'userData2');fs.mkdirSync(noUser);
 Object.assign(app.deps,{userData:()=>noUser,platform:()=>'linux',arch:()=>'x64',env:()=>({PATH:''}),home:()=>path.join(root,'nohome'),spawn:fakeSpawn,seed:()=>41,raw:RAW,api:API,fetch:fetchLocal});
 const {ipc}=app.setup(s);
 assert.equal(await app.turn(s,'сгенерируй карту 2 на 2 с рекой посередине'),null,'not added → null');
 s.settings['extension_rts-levels']='true';
 for(const p of nobody)assert.equal(await app.turn(s,p),null,p);
 // No engine on Linux: an engine card that says why, nothing downloaded.
 let r=await app.turn(s,'сгенерируй карту 2 на 2 с рекой посередине');
 assert.equal(r.question,true);assert.equal(r.extensionData.rtsLevels.type,'engine');assert.match(r.extensionData.rtsLevels.unsupported,/Linux/);
 // macOS (arm64) without an engine: the card offers the download with its size.
 app.deps.platform=()=>'darwin';app.deps.arch=()=>'arm64';app.state.latest=null;
 r=await app.turn(s,'сгенерируй карту 2 на 2 с рекой посередине');
 assert.equal(r.extensionData.rtsLevels.type,'engine');assert.equal(r.extensionData.rtsLevels.size,big.length);assert.equal(r.extensionData.rtsLevels.unsupported,'');
 app.deps.platform=()=>'linux';app.deps.arch=()=>'x64';
 // An engine set in settings: used, nothing downloaded.
 const userEngine=engineDir(path.join(root,'user-engine'),{editor:true});
 await assert.rejects(ipc.setEnginePath(path.join(root,'nothing-here')),/нет rtsmcp/);
 let st=await ipc.setEnginePath(userEngine);
 assert.equal(saved.rtsLevelsEnginePath,userEngine);assert.equal(st.engine.source,'settings');
 const dl=await ipc.download();assert.deepEqual(dl,{present:true,source:'settings'},'an existing engine is never replaced by a download');
 fs.writeFileSync(log,'');
 // No project chosen: a question with the recent projects as choices; the answer is remembered.
 process.env.FAKE_RTSMCP_PROJECTS=gameDir;
 let question=null;
 try{await app.turn(s,'сгенерируй карту 2 на 2 с рекой посередине');}catch(e){question=e;}
 assert.ok(question instanceof InputRequired,'a project question');
 assert.deepEqual(question.spec.options,[gameDir]);
 assert.throws(()=>question.resume(path.join(root,'no-project')),/game\.json/);
 r=await question.resume(gameDir);
 const c=r.extensionData.rtsLevels;
 assert.equal(c.type,'map');assert.equal(c.players,4);assert.deepEqual(c.teams,[2,2]);assert.equal(c.symmetry,'mirror4');assert.equal(c.seed,41);
 assert.deepEqual(c.roster.map(p=>p.team),[1,2,2,1],'left side is one team');
 assert.ok(c.preview.rows.length===48&&c.preview.rows[0].length===48);
 assert.ok(c.preview.rows.every(row=>row.slice(22,26).replace(/[=n]/g,'~')==='~~~~'),'a river through the middle');
 assert.ok(c.preview.resources.length>0,'resources marked');
 assert.ok(!c.issues.some(i=>/map\.generated/.test(i.text)));
 assert.match(c.file,/^maps\/gen_classic_4p_2v2_s41\.json$/);
 assert.equal(c.saved,null);
 assert.match(r.text,/В проект ничего не записано/);
 assert.equal(fs.readdirSync(path.join(gameDir,'maps')).join(),'valley.json','nothing written before save');
 const args=calls().find(x=>x.method==='initialize').argv;
 assert.deepEqual(args,['--engine',userEngine,'--no-editor','--port','0']);
 const gen=calls().find(x=>x.name==='map_generate').args;
 assert.deepEqual(gen,{preset:'classic',seed:41,players:4,symmetry:'mirror4',params:{rivers:0.15},useTemplate:true});
 assert.ok(calls().some(x=>x.name==='map_open'&&x.args.file==='maps/valley.json'),'the project map is the template');
 assert.ok(calls().some(x=>x.name==='map_validate')&&calls().some(x=>x.name==='map_ascii'));
 topic.messages.at(-1).extensionData={rtsLevels:c};
 // Edits on the draft, then undo back to the generated map.
 r=await app.turn(s,'добавь ещё 2 месторождения у центра');
 let e1=r.extensionData.rtsLevels;topic.messages.at(-1).extensionData={rtsLevels:e1};
 assert.deepEqual(e1.edits,['Ещё 2 месторожд.']);assert.equal(e1.preview.resources.length,c.preview.resources.length+2);
 r=await app.turn(s,'сделай реку шире');let e2=r.extensionData.rtsLevels;topic.messages.at(-1).extensionData={rtsLevels:e2};
 assert.equal(e2.river.width,c.river.width+2);assert.equal(e2.edits.length,2);
 r=await app.turn(s,'отмени');let u1=r.extensionData.rtsLevels;topic.messages.at(-1).extensionData={rtsLevels:u1};
 assert.equal(u1.river.width,c.river.width);assert.deepEqual(u1.edits,['Ещё 2 месторожд.']);
 assert.deepEqual(u1.preview.rows,e1.preview.rows);
 const undoCalls=calls().filter(x=>x.name==='undo').length;assert.ok(undoCalls>=4,'rtsmcp undo per call of the edit');
 const card1=await ipc.undo(c.id);assert.deepEqual(card1.edits,[]);assert.deepEqual(card1.preview,c.preview,'back to the generated map');
 await assert.rejects(ipc.undo(c.id),/Правок нет/);
 // A parameter edit regenerates with the same seed.
 r=await app.turn(s,'больше руды');const p1=r.extensionData.rtsLevels;topic.messages.at(-1).extensionData={rtsLevels:p1};
 assert.equal(p1.params.resources,1.6);assert.equal(p1.seed,41);assert.ok(p1.preview.resources.length>c.preview.resources.length);
 // rtsmcp restarted (or another draft loaded): the draft is rebuilt from its recipe.
 app.state.session.client.close();app.state.session=null;
 const again=await ipc.refresh(c.id);assert.deepEqual(again.preview,p1.preview,'deterministic rebuild');
 // Save: a new file; the same file again needs the second confirmation (overwrite).
 const s1=await ipc.save(c.id,{});assert.equal(s1.saved,true);assert.equal(s1.card.saved.file,c.file);
 assert.ok(fs.existsSync(path.join(gameDir,c.file)));
 assert.ok(JSON.parse(fs.readFileSync(path.join(gameDir,'game.json'),'utf8')).maps.some(m=>m.file===c.file),'listed in game.json');
 const firstSave=fs.readFileSync(path.join(gameDir,c.file),'utf8');
 assert.deepEqual(await ipc.save(c.id,{}),{exists:true,file:c.file},'never overwrites without the second confirmation');
 assert.deepEqual(await ipc.save(c.id,{file:'maps/valley.json'}),{exists:true,file:'maps/valley.json'});
 assert.equal(fs.readFileSync(path.join(gameDir,'maps','valley.json'),'utf8'),'{}','the existing map untouched');
 await assert.rejects(ipc.save(c.id,{file:'../escape.json'}),/maps\//);
 const s2=await ipc.save(c.id,{overwrite:true});assert.equal(s2.card.saved.overwritten,true);
 assert.ok(firstSave.length>0);
 // «Ещё вариант»: the next seed, a new file name.
 const v2=await ipc.variant(c.id);assert.equal(v2.seed,42);assert.notEqual(v2.file,c.file);assert.equal(v2.saved,null);
 // Balance by bot matches.
 const bal=await ipc.balance(c.id,{runs:4});
 assert.equal(bal.balance.runs,4);assert.equal(bal.balance.players.length,4);assert.equal(bal.balance.seconds.median,410);
 assert.deepEqual(calls().filter(x=>x.name==='balance_batch').at(-1).args,{runs:4,seconds:900});
 // The editor opens with the project (and the saved map), never by itself.
 const launched=[];app.deps.launch=(cmd,a)=>launched.push([cmd,a]);
 await ipc.openEditor(c.id);
 assert.deepEqual(launched[0],[path.join(userEngine,'bin','rts_editor'),['--project',gameDir,'--engine',userEngine]]);
 // Discard: the draft goes, the saved map stays.
 const d=ipc.discard(c.id);assert.equal(d.discarded,true);
 assert.ok(fs.existsSync(path.join(gameDir,c.file)));
 await assert.rejects(ipc.refresh(c.id),/Черновик не найден/);
 // «покажи мои RTS-проекты»
 r=await app.turn(s,'покажи мои RTS-проекты');
 assert.equal(r.extensionData.rtsLevels.type,'projects');assert.equal(r.extensionData.rtsLevels.projects[0].dir,gameDir);assert.equal(r.extensionData.rtsLevels.projects[0].current,true);
 // With the model: its fields fill what the rules did not say; a broken answer falls back to the rules.
 s.settings.model='qwen3:8b';s.settings.ollamaUrl='http://127.0.0.1:11434/api/chat';
 s.request=async()=>({message:{content:JSON.stringify({preset:'islands',players:3})}});
 r=await app.turn(s,'сгенерируй карту для RTS');assert.equal(r.extensionData.rtsLevels.preset.id,'islands');assert.equal(r.extensionData.rtsLevels.players,3);
 s.request=async()=>({message:{content:'not json'}});
 r=await app.turn(s,'сгенерируй карту для 2 игроков');assert.equal(r.extensionData.rtsLevels.preset.id,'classic');assert.equal(r.extensionData.rtsLevels.players,2);
 // Mirror symmetry asked for 4 players becomes the 4-player mirror (rtsmcp refuses 'mirror' with 4).
 r=await app.turn(s,'сгенерируй карту 64 на 64 с зеркальной симметрией для 4 игроков');
 assert.equal(r.extensionData.rtsLevels.symmetry,'mirror4');assert.deepEqual(r.extensionData.rtsLevels.params.size,[64,64]);
 // A project folder that lost game.json: the project question again, before anything else.
 fs.rmSync(path.join(gameDir,'game.json'));
 await assert.rejects(app.turn(s,'сгенерируй карту для 2 игроков'),e=>e instanceof InputRequired);
 fs.writeFileSync(path.join(gameDir,'game.json'),JSON.stringify({name:'Iron Test',maps:[]}));
 // Status for settings.
 st=await ipc.status();assert.equal(st.engine.source,'settings');assert.equal(st.folder,gameDir);
 app.teardown();
 assert.equal(app.state.session,null);
 server.close();
 fs.rmSync(root,{recursive:true,force:true});
 console.log('RTS levels: routing and near-misses, schema-checked parameters (rules + model), MCP client, engine detection, builds index (index.txt + blob SHA, index.json + sha256), download, bad hash, cancel, update, unsafe zips, chat turns with edits, undo, save without overwrite, balance, editor, discard passed');
})().catch(e=>{console.error(e);server.close();process.exit(1);});
