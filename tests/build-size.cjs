// «Размер билда»: ZIP central directory (incl. ZIP64) without loading the archive, manifests of APK/AAB/IPA,
// categories, two-build diff with older/newer detection, warnings, chat routing with near-misses, inputs from
// attachments, written paths and the project folder, «Что сжать?» advice, and the offer when not added.
// No model and no network: s.request throws if called.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const zip=require('../src/extensions/build-size/zip.cjs');
const meta=require('../src/extensions/build-size/meta.cjs');
const analyze=require('../src/extensions/build-size/analyze.cjs');
const app=require('../src/extensions/build-size/feature.cjs');
const offer=require('../src/extensions/build-size/offer.cjs');
const offers=require('../src/features/extension-offers.cjs');
const FIX=path.join(__dirname,'fixtures/build-size');

// A ZIP64 archive with one 5 GB entry, built by hand: only the directory records exist, no data.
function zip64(file){
 const name=Buffer.from('assets/bin/Data/data.unity3d');
 const extra=Buffer.alloc(4+24);extra.writeUInt16LE(1,0);extra.writeUInt16LE(24,2);extra.writeBigUInt64LE(5n*1024n**3n,4);extra.writeBigUInt64LE(4n*1024n**3n,12);extra.writeBigUInt64LE(0n,20);
 const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(0xffffffff,20);central.writeUInt32LE(0xffffffff,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(extra.length,30);central.writeUInt32LE(0xffffffff,42);
 const cd=Buffer.concat([central,name,extra]);const cdOffset=64;
 const eocd64=Buffer.alloc(56);eocd64.writeUInt32LE(0x06064b50,0);eocd64.writeBigUInt64LE(44n,4);eocd64.writeBigUInt64LE(1n,24);eocd64.writeBigUInt64LE(1n,32);eocd64.writeBigUInt64LE(BigInt(cd.length),40);eocd64.writeBigUInt64LE(BigInt(cdOffset),48);
 const locator=Buffer.alloc(20);locator.writeUInt32LE(0x07064b50,0);locator.writeBigUInt64LE(BigInt(cdOffset+cd.length),8);locator.writeUInt32LE(1,16);
 const eocd=Buffer.alloc(22);eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(0xffff,8);eocd.writeUInt16LE(0xffff,10);eocd.writeUInt32LE(0xffffffff,12);eocd.writeUInt32LE(0xffffffff,16);
 fs.writeFileSync(file,Buffer.concat([Buffer.alloc(cdOffset),cd,eocd64,locator,eocd]));
}

(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'petya-build-size-'));
 // --- ZIP reader ---
 const apk15=path.join(FIX,'towers-1.5.0.apk'),apk14=path.join(FIX,'towers-1.4.0.apk'),aab=path.join(FIX,'towers-1.5.0.aab'),ipa=path.join(FIX,'towers-1.5.0.ipa');
 const listed=await zip.list(apk15);
 assert.equal(listed.entries.length,21);
 const lib=listed.entries.find(e=>e.name==='lib/arm64-v8a/libil2cpp.so');assert.equal(lib.method,0);assert.equal(lib.compressed,lib.size);
 assert.ok(listed.entries.find(e=>e.name==='classes.dex').compressed<listed.entries.find(e=>e.name==='classes.dex').size/3,'compressed and uncompressed sizes are both read');
 const big=path.join(tmp,'huge.apk');zip64(big);
 const huge=await zip.list(big);
 assert.equal(huge.entries[0].size,5*1024**3,'ZIP64 sizes come from the extra field');assert.equal(huge.entries[0].compressed,4*1024**3);
 fs.writeFileSync(path.join(tmp,'broken.apk'),'not a zip at all, just text');
 await assert.rejects(zip.list(path.join(tmp,'broken.apk')),/не ZIP/);
 // --- Manifests ---
 assert.deepEqual(meta.apkManifest(await zip.read(apk15,listed.entries.find(e=>e.name==='AndroidManifest.xml'))),{id:'com.petya.towers',version:'1.5.0',build:'150'});
 const b15=await analyze.inspect(apk15),b14=await analyze.inspect(apk14),bAab=await analyze.inspect(aab),bIpa=await analyze.inspect(ipa);
 assert.deepEqual([bAab.version,bAab.build,bIpa.version,bIpa.build,bIpa.id],['1.5.0','150','1.5.0','150','com.petya.towers']);
 // --- Categories ---
 assert.equal(analyze.classify('apk','lib/arm64-v8a/libil2cpp.so').cat,'native:arm64-v8a');
 assert.equal(analyze.classify('apk','assets/bin/Data/data.unity3d').cat,'unity');
 assert.equal(analyze.classify('apk','assets/aa/Android/x.bundle').cat,'addressables');
 assert.equal(analyze.classify('apk','classes3.dex').cat,'dex');
 assert.equal(analyze.classify('apk','resources.arsc').cat,'resources');
 assert.deepEqual(analyze.classify('aab','feature_maps/lib/arm64-v8a/libmaps.so'),{cat:'native:arm64-v8a',module:'feature_maps'});
 assert.equal(analyze.classify('aab','base/dex/classes.dex').cat,'dex');
 assert.equal(analyze.classify('ipa','Payload/Towers.app/Towers').cat,'binary');
 assert.equal(analyze.classify('ipa','Payload/Towers.app/Frameworks/UnityFramework.framework/UnityFramework').cat,'frameworks');
 assert.equal(analyze.classify('ipa','Payload/Towers.app/Data/Raw/intro.mp4').cat,'streaming');
 assert.equal(analyze.classify('ipa','Payload/Towers.app/Data/Raw/aa/iOS/a.bundle').cat,'addressables');
 assert.equal(analyze.classify('ipa','Payload/Towers.app.dSYM/Contents/Resources/DWARF/Towers').cat,'debug');
 // --- Single build ---
 const one=await analyze.single(bAab);
 assert.deepEqual(one.modules.map(m=>m.name),['base','UnityDataAssetPack'],'AAB modules');
 assert.match(one.note,/split APK/);
 assert.ok(one.warnings.some(w=>w.kind==='debug'&&w.level==='info'),'AAB symbols in BUNDLE-METADATA are info, not a warning');
 const iosCard=await analyze.single(bIpa);
 assert.ok(iosCard.categories.some(c=>c.key==='frameworks')&&iosCard.categories.some(c=>c.key==='binary'));
 assert.ok(iosCard.warnings.some(w=>w.kind==='debug'&&w.level==='warn'),'dSYM inside an IPA is a warning');
 assert.match(iosCard.note,/App Thinning/);
 // --- Diff: older/newer by versionCode whatever the argument order ---
 const d=await analyze.diff(b15,b14);
 assert.deepEqual(d.builds.map(b=>b.name),['towers-1.4.0.apk','towers-1.5.0.apk']);assert.equal(d.basis,'по versionCode');
 assert.equal(d.grown[0].path,'assets/bin/Data/data.unity3d');
 assert.ok(d.grown.some(r=>r.path==='assets/aa/Android/season2_assets_all.bundle'&&r.status==='new'&&r.before===0));
 assert.ok(d.grown.length<=15);
 const x86=d.categories.find(c=>c.key==='native:x86_64');assert.equal(x86.before.compressed,0);assert.ok(x86.compressed>0);
 const kinds=d.warnings.map(w=>w.kind);
 for(const k of ['stored-so','abi','duplicates','debug'])assert.ok(kinds.includes(k),'warning '+k);
 assert.ok(d.warnings.some(w=>/libil2cpp\.so не очищена.*\.symtab/.test(w.text)),'ELF symbol sections found in an uncompressed .so');
 assert.match(analyze.text(d),/^Старый: towers-1\.4\.0\.apk 1\.4\.0 \(140\), новый: towers-1\.5\.0\.apk 1\.5\.0 \(150\) \(по versionCode\)\. Билд вырос на/);
 // Order by name numbers, then by mtime.
 const fake=(name,mtime)=>({name,kind:'apk',build:'',version:'',mtime});
 assert.equal(analyze.order(fake('game-2.10.apk',1),fake('game-2.9.apk',2)).newer.name,'game-2.10.apk');
 assert.equal(analyze.order(fake('release.apk',5),fake('old.apk',9)).basis,'по дате изменения файла');
 assert.match(analyze.advice(d),/^Что сжать в towers-1\.5\.0\.apk[\s\S]*Нативные библиотеки — /);
 // --- Chat ---
 const root=path.join(tmp,'Towers');fs.mkdirSync(path.join(root,'Builds/Android'),{recursive:true});fs.mkdirSync(path.join(root,'Builds/iOS'),{recursive:true});fs.mkdirSync(path.join(root,'Library'),{recursive:true});
 const now=Date.now()/1000;
 const put=(src,rel,age)=>{const to=path.join(root,rel);fs.copyFileSync(path.join(FIX,src),to);fs.utimesSync(to,now-age,now-age);return to;};
 put('towers-1.4.0.apk','Builds/Android/towers-1.4.0.apk',3*86400);put('towers-1.5.0.ipa','Builds/iOS/towers-1.5.0.ipa',2*86400);
 put('towers-1.5.0.aab','Builds/Android/towers-1.5.0.aab',86400);const newest=put('towers-1.5.0.apk','Builds/Android/towers-1.5.0.apk',60);
 put('towers-1.5.0.apk','Library/cached.apk',0);// skipped folder: never picked even though it is the newest
 const topic={id:'t',title:'Чат',projectId:'p',messages:[]};
 let pending=new Map(),removed=[];
 const s={settings:{},requestProgress:{report(){}},projectMemory:{get:()=>null},
  dialogue:{state:{projects:[{id:'p',name:'Towers',folders:[]}],activeProjectId:'p'},active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  attachments:{pending,list:()=>[...pending.values()].map(({id,name})=>({id,name})),take:ids=>ids.map(id=>structuredClone(pending.get(id))),remove(id){removed.push(id);pending.delete(id);},info:f=>({id:f.id,name:f.name})},
  async request(){throw Error('the model must not be called');}};
 assert.equal(await app.turn(s,'размер билда'),null,'not added: nothing here');
 s.settings['extension_build-size']='true';
 for(const miss of ['размер команды','какой размер экрана у iPhone 15','сборка упала','почему сборка упала на CI','время сборки выросло','билд собирается дольше на 5 минут','перевод денег'])
  assert.equal(await app.turn(s,miss),null,'near-miss: '+miss);
 for(const hit of ['почему билд вырос','сравни размер этих двух apk','из чего состоит ipa','размер билда','сколько весит apk'])assert.ok(app.wanted(s,hit),'phrase: '+hit);
 // No project folder and nothing attached: one question.
 const nothing=await app.turn(s,'размер билда');
 assert.equal(nothing.question,true);assert.match(nothing.text,/Прикрепите APK, AAB или IPA/);
 // Project folder: newest build, two newest of the same type for «вырос», a type named in the request.
 s.dialogue.state.projects[0].folders=[root];
 const latest=await app.turn(s,'размер билда');
 assert.equal(latest.extensionData.buildSize.mode,'single');assert.equal(latest.extensionData.buildSize.builds[0].path,newest);
 assert.match(latest.text,/Взял из папки проекта: Builds\/Android\/towers-1\.5\.0\.apk/);
 assert.equal(topic.messages.at(-1).by,'Размер билда');
 const grew=await app.turn(s,'почему билд вырос?');
 assert.equal(grew.extensionData.buildSize.mode,'diff');assert.deepEqual(grew.extensionData.buildSize.builds.map(b=>b.name),['towers-1.4.0.apk','towers-1.5.0.apk']);
 assert.match(grew.text,/^Старый: towers-1\.4\.0\.apk/);
 assert.equal((await app.turn(s,'из чего состоит ipa')).extensionData.buildSize.builds[0].kind,'ipa');
 // «Что сжать?» from the card: advice from the last card, no new reading.
 const advice=await app.turn(s,'Что сжать в этом билде?');
 assert.match(advice.text,/^Что сжать в towers-1\.5\.0\.ipa[\s\S]*Frameworks — /);assert.equal(advice.extensionData,undefined);
 // Paths in the request: quoted absolute paths and a bare name found in the project.
 const pair=await app.turn(s,'сравни размер этих двух apk «'+path.join(FIX,'towers-1.5.0.apk')+'» и «'+path.join(FIX,'towers-1.4.0.apk')+'»');
 assert.equal(pair.extensionData.buildSize.mode,'diff');assert.equal(pair.extensionData.buildSize.builds[1].path,path.join(FIX,'towers-1.5.0.apk'));
 assert.equal((await app.turn(s,'размер towers-1.5.0.aab')).extensionData.buildSize.kind,'aab');
 const missing=await app.turn(s,'размер билда /nowhere/game.apk');
 assert.equal(missing.error,true);assert.match(missing.text,/Файл не найден: \/nowhere\/game\.apk/);
 const notZip=await app.turn(s,'размер билда '+path.join(tmp,'broken.apk'));
 assert.equal(notZip.error,true);assert.match(notZip.text,/не ZIP/);
 const mixed=await app.turn(s,'сравни размер "'+apk15+'" и "'+ipa+'"');
 assert.equal(mixed.error,true);assert.match(mixed.text,/одного типа/);
 // Attachments: picked from disk (path known) → used and moved into the chat; one attachment + «вырос» pairs with the project.
 s.dialogue.state.projects[0].folders=[];
 pending.set('a1',{id:'a1',name:'towers-1.5.0.apk',owner:'t',localSourcePath:apk15});pending.set('a2',{id:'a2',name:'towers-1.4.0.apk',owner:'t',localSourcePath:apk14});
 const fromFiles=await app.turn(s,'сравни их размер');
 assert.equal(fromFiles.extensionData.buildSize.mode,'diff');assert.deepEqual(removed,['a1','a2']);
 assert.deepEqual(topic.messages.at(-2).attachments.map(f=>f.name),['towers-1.5.0.apk','towers-1.4.0.apk']);assert.equal(topic.attachments.length,2);
 pending.set('a3',{id:'a3',name:'big.ipa',owner:'t'});
 const blind=await app.turn(s,'из чего состоит этот билд');
 assert.equal(blind.question,true);assert.match(blind.text,/прикреплён без пути/);
 pending.clear();
 // The offer: a direct request when not added; neighbours' subjects are not offered.
 const settings={};
 const direct=t=>offers.candidates(t,{offers:[offer],settings}).filter(r=>r.direct).length>0;
 assert.ok(direct('почему билд вырос'));assert.ok(direct('сравни размер этих двух apk'));assert.ok(direct('из чего состоит ipa'));
 for(const miss of ['сборка упала','собери apk и выложи в стор','размер команды','почему билд красный','крэши в apk 1.5'])assert.equal(direct(miss),false,'offer near-miss: '+miss);
 fs.rmSync(tmp,{recursive:true,force:true});
 console.log('Build size: ZIP/ZIP64 directory, APK/AAB/IPA manifests, categories, diff order and top grown, warnings (stored .so, x86, duplicates, symbols), routing and near-misses, project/attachments/paths, advice, offer passed');
})().catch(e=>{console.error(e);process.exit(1);});
