// «Уборка загрузок»: routing and near-misses, the groups in a temp Downloads folder (installed installers, duplicates
// by hash, extracted archives, large unopened files, screenshots), the turn and its card, actions only on the scan's
// own files, the Trash through a stubbed trashItem (a freedesktop Trash in the temp home) and the undo list that puts
// files back, moves into «Разобрано» and back, and «Место на диске» leaving Downloads-named requests alone.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const app=require('../src/extensions/tidy-downloads/feature.cjs');
const groups=require('../src/extensions/tidy-downloads/groups.cjs');
const actions=require('../src/extensions/tidy-downloads/actions.cjs');
const disk=require('../src/extensions/disk-usage/feature.cjs');
const DAY=86400000;

(async()=>{
 // --- Routing --------------------------------------------------------------------------------------------------------
 for(const t of ['разбери загрузки','Что можно удалить из загрузок?','дубликаты в загрузках','почисти папку Downloads','наведи порядок в загрузках','разбери загрузки: что не открывал 60 дней'])assert.ok(app.wanted(t),t);
 for(const t of ['очисти диск','чем забит диск','загрузки приложения за неделю','скорость загрузки','время загрузки уровня','покажи загрузки моделей','загрузи файл в Google Drive','что такое загрузки','сколько загрузок у игры','загрузка сервера высокая'])assert.ok(!app.wanted(t),t);
 assert.equal(app.daysIn('разбери загрузки: что не открывал 60 дней'),60);
 assert.equal(app.daysIn('что в загрузках старше двух месяцев можно удалить'),60);
 assert.equal(app.daysIn('разбери загрузки, не трогал полгода'),180);
 assert.equal(app.daysIn('разбери загрузки'),30);
 // «Место на диске» keeps the whole disk, the Downloads folder named on its own is not its request.
 assert.ok(disk.wanted('очисти диск'));assert.ok(disk.wanted('чем забит диск'));
 assert.ok(!disk.wanted('что можно удалить из загрузок'));assert.ok(!disk.wanted('разбери загрузки'));
 console.log('Tidy downloads routing: own requests, near-misses, days, disk usage leaves Downloads passed');

 // --- Installer names ------------------------------------------------------------------------------------------------
 const installed=['Docker','Unity Hub','Unity','Google Chrome','Slack','Visual Studio Code','Telegram'];
 assert.equal(groups.installedApp('Docker.dmg',installed),'Docker');
 assert.equal(groups.installedApp('UnityHubSetup.exe',installed),'Unity Hub');
 assert.equal(groups.installedApp('googlechrome.dmg',installed),'Google Chrome');
 assert.equal(groups.installedApp('Slack-4.41.97-macOS.dmg',installed),'Slack');
 assert.equal(groups.installedApp('Figma-124.5.dmg',installed),'');
 assert.equal(groups.installedApp('setup-x64.exe',installed),'');
 console.log('Tidy downloads installers: names matched to installed programs, unknown and generic ones left out passed');

 // --- The folder ------------------------------------------------------------------------------------------------------
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'petya-tidy-'));
 const root=path.join(home,'Downloads');fs.mkdirSync(root);
 const now=Date.now();
 const put=(name,content,ageDays=0,{atimeDays}={})=>{const p=path.join(root,name);fs.writeFileSync(p,content);const m=new Date(now-ageDays*DAY),a=new Date(now-(atimeDays??ageDays)*DAY);fs.utimesSync(p,a,m);return p;};
 put('Docker.dmg',Buffer.alloc(5000,1),20);
 put('Figma-124.5.dmg',Buffer.alloc(4000,2),20);
 put('Отчёт.pdf',Buffer.from('отчёт за октябрь '.repeat(200)),10);
 put('Отчёт (1).pdf',Buffer.from('отчёт за октябрь '.repeat(200)),5);
 put('Отчёт copy.pdf',Buffer.from('отчёт за октябрь '.repeat(200)),3);
 put('Другой.pdf',Buffer.from('отчёт за ноябрь! '.repeat(200)),3);
 put('assets.zip',Buffer.alloc(9000,3),30);fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets','a.txt'),'x'.repeat(100));
 put('fresh.zip',Buffer.alloc(800,4),1);fs.mkdirSync(path.join(root,'fresh'));
 put('lonely.zip',Buffer.alloc(700,5),40);
 put('build-old.apk',Buffer.alloc(30000,6),90,{atimeDays:80});
 put('build-new.apk',Buffer.alloc(30000,7),90,{atimeDays:2});
 put('Снимок экрана 2026-11-01 в 10.00.00.png',Buffer.alloc(1200,8),8);
 put('Screenshot 2026-10-30 at 18.22.11.png',Buffer.alloc(1300,9),9);
 put('photo.png',Buffer.alloc(1100,10),9);
 fs.symlinkSync(path.join(root,'Docker.dmg'),path.join(root,'link.dmg'));
 const result=await groups.scan({root,platform:'darwin',installed,days:30,largeBytes:20000,now,timeLimit:10000});
 const ids=result.groups.map(g=>g.id);
 assert.deepEqual(ids,['duplicates','installers','archives','large','screenshots']);
 const of=id=>result.groups.find(g=>g.id===id).items.map(i=>i.name).sort();
 assert.deepEqual(of('duplicates'),['Отчёт (1).pdf','Отчёт copy.pdf'],'copies only, the original stays');
 assert.equal(result.groups[0].items[0].original,'Отчёт.pdf');
 assert.deepEqual(of('installers'),['Docker.dmg']);
 assert.equal(result.groups[1].items[0].app,'Docker');
 assert.deepEqual(of('archives'),['assets.zip'],'fresh and not extracted archives stay');
 assert.equal(result.groups[2].items[0].folder,'assets');
 assert.deepEqual(of('large'),['build-old.apk'],'a large file opened two days ago stays');
 assert.deepEqual(of('screenshots'),['Screenshot 2026-10-30 at 18.22.11.png','Снимок экрана 2026-11-01 в 10.00.00.png']);
 assert.ok(!result.groups.some(g=>g.items.some(i=>i.name==='link.dmg')),'symlinks are never listed');
 assert.ok(result.total>0&&result.files===14&&result.folders===2,'files '+result.files);
 // Spotlight's «last used» wins over atime when it is known (macOS).
 const recent=await groups.scan({root,platform:'darwin',installed,days:30,largeBytes:20000,now,lastUsed:async files=>Object.fromEntries(files.map(f=>[f,now-DAY]))});
 assert.ok(!recent.groups.some(g=>g.id==='large'));
 // Linux installers are other files; a missing folder is a clear error.
 assert.ok(!(await groups.scan({root,platform:'linux',installed,largeBytes:20000,now})).groups.some(g=>g.id==='installers'));
 await assert.rejects(groups.scan({root:path.join(home,'nope')}),/Папки «Загрузки» нет/);
 console.log('Tidy downloads groups: duplicates by hash with the original kept, installed installers, extracted old archives, large unopened files, screenshots, no symlinks passed');

 // --- The turn and the card ------------------------------------------------------------------------------------------------
 const topic={id:'t',title:'Чат',messages:[]};
 const sent=[];
 const s={settings:{'extension_tidy-downloads':'true'},dataRoot:path.join(home,'company'),requestProgress:{report(){}},
  dialogue:{active:()=>topic,persist(){},rememberAction(c,text){topic.messages.push({role:'user',text:c},{role:'assistant',text});}},
  win:{isDestroyed:()=>false,webContents:{isDestroyed:()=>false,send:(ch,item)=>sent.push(item)}}};
 // A freedesktop Trash in the temp home: trashItem moves the file there and writes its .trashinfo.
 const trashDir=path.join(home,'.local','share','Trash');fs.mkdirSync(path.join(trashDir,'files'),{recursive:true});fs.mkdirSync(path.join(trashDir,'info'),{recursive:true});
 const trashed=[];
 Object.assign(app.deps,{downloads:()=>root,installed:()=>installed,lastUsed:async()=>({}),platform:()=>'linux',home:()=>home,env:()=>({}),now:()=>now,
  trashItem:async p=>{trashed.push(p);const name=path.basename(p);fs.renameSync(p,path.join(trashDir,'files',name));fs.writeFileSync(path.join(trashDir,'info',name+'.trashinfo'),'[Trash Info]\nPath='+encodeURI(p)+'\nDeletionDate=2026-11-09T10:00:00\n');},
  openTrash:()=>{throw Error('not expected');},showItem:()=>{}});
 assert.equal(await app.turn({...s,settings:{}},'разбери загрузки'),null,'not added → null');
 assert.equal(await app.turn(s,'чем забит диск'),null,'the disk is not ours');
 const reply=await app.turn(s,'разбери загрузки');
 const card=reply.extensionData.tidyDownloads;
 assert.match(reply.text,/^В «Загрузках» .+: файлов — 14, папок — 2\. Можно убрать около .+: дубликаты — /);
 assert.match(reply.text,/только после вашего подтверждения/);
 assert.deepEqual(card.groups.map(g=>g.id),['duplicates','archives','screenshots'],'large needs 100 MB; .dmg is not a Linux installer');
 assert.ok(sent.some(n=>n.id==='tidy-downloads-scan'&&n.busy)&&sent.at(-1).busy===false&&sent.at(-1).kind==='success','progress in the notification center');
 const ipc=app.setup(s).ipc;
 // Only the scan's own files, never a forged path or a stale scan.
 await assert.rejects(ipc.trash(card.scanId,'duplicates',[path.join(root,'Отчёт.pdf')]),/Список изменился/);
 await assert.rejects(ipc.trash('old','duplicates',[card.groups[0].items[0].path]),/устарел/);
 await assert.rejects(ipc.trash(card.scanId,'duplicates',[]),/Ничего не выбрано/);
 await assert.rejects(ipc.trash(card.scanId,'nope',['x']),/Такой группы нет/);
 // In the Trash, then back with «Вернуть».
 const copies=card.groups[0].items.map(i=>i.path);
 const done=await ipc.trash(card.scanId,'duplicates',copies);
 assert.deepEqual(done.removed.sort(),copies.sort());assert.match(done.text,/^В Корзину: 2 файла · /);
 assert.deepEqual(trashed.sort(),copies.sort(),'through trashItem only');
 assert.ok(copies.every(p=>!fs.existsSync(p)));
 await assert.rejects(ipc.trash(card.scanId,'duplicates',copies),/Список изменился/,'already removed');
 const list=ipc.actions();assert.equal(list.length,1);assert.equal(list[0].kind,'trash');assert.equal(list[0].items.length,2);
 assert.ok(fs.existsSync(path.join(s.dataRoot,'extensions','tidy-downloads','undo.json')));
 const back=await ipc.undo(list[0].id);
 assert.match(back.text,/^Вернул на место: 2 файла/);assert.ok(copies.every(p=>fs.existsSync(p)));
 assert.equal(fs.readdirSync(path.join(trashDir,'info')).length,0,'the Trash record is gone with the file');
 assert.ok(ipc.actions()[0].undone);
 await assert.rejects(ipc.undo(list[0].id),/уже отменено/);
 // Into «Разобрано» and back; a name taken again is never overwritten.
 const shots=card.groups.find(g=>g.id==='screenshots').items.map(i=>i.path);
 const moved=await ipc.move(card.scanId,'screenshots',shots);
 assert.match(moved.text,/^Перемещено в «Разобрано»: 2 файла/);
 const folder=path.join(root,actions.FOLDER,'Скриншоты');
 assert.deepEqual(fs.readdirSync(folder).sort(),shots.map(p=>path.basename(p)).sort());
 const moveAction=ipc.actions()[0];assert.equal(moveAction.kind,'move');
 fs.writeFileSync(shots[0],'новый файл с тем же именем');
 const partly=await ipc.undo(moveAction.id);
 assert.equal(partly.back.length,1);assert.match(partly.failed[0].error,/уже есть файл/);
 assert.equal(fs.readFileSync(shots[0],'utf8'),'новый файл с тем же именем','never overwritten');
 assert.equal(ipc.actions()[0].items.length,1,'the action keeps what is still to return');
 // Restore when the Trash has no record: the user is sent to the Trash.
 let opened=0;
 const missing=await actions.restore({from:path.join(root,'gone.txt'),name:'gone.txt'},{platform:'linux',home,env:{},openTrash:()=>{opened++;}});
 assert.equal(missing.ok,false);assert.equal(missing.manual,true);assert.equal(opened,1);
 // macOS: Finder's renamed copy of the same size is found.
 const macHome=path.join(home,'mac');fs.mkdirSync(path.join(macHome,'.Trash'),{recursive:true});fs.writeFileSync(path.join(macHome,'.Trash','note 2.txt'),'12345');
 const mac=await actions.restore({from:path.join(root,'note.txt'),name:'note.txt',size:5},{platform:'darwin',home:macHome});
 assert.equal(mac.ok,true);assert.equal(fs.readFileSync(path.join(root,'note.txt'),'utf8'),'12345');
 // Paths outside Downloads are refused by the actions themselves.
 await assert.rejects(actions.trash([{path:path.join(home,'secret.txt'),bytes:1}],{root,trashItem:async()=>{},group:'x'}),/вне папки/);
 assert.equal(actions.inside(root,root),false);assert.equal(actions.inside(root,path.join(root,'..','x')),false);
 // The thumbnail is served only for listed files.
 app.deps.thumbnail=async()=>'data:image/png;base64,AAAA';
 assert.equal(await ipc.thumb(card.scanId,path.join(home,'secret.png')),'');
 assert.equal(await ipc.thumb(card.scanId,shots[1]),'data:image/png;base64,AAAA');
 // A Downloads folder without access is a clear message, not a crash.
 app.deps.downloads=()=>path.join(home,'missing');
 const failed=await app.turn(s,'разбери загрузки');assert.equal(failed.error,true);assert.match(failed.text,/Папки «Загрузки» нет/);
 assert.equal(sent.at(-1).kind,'error');
 fs.rmSync(home,{recursive:true,force:true});
 console.log('Tidy downloads actions: scan-only files, Trash through trashItem with undo from the Trash, move to «Разобрано» and back without overwriting, manual fallback, thumbnails of listed files only passed');
})().catch(e=>{console.error(e);process.exit(1);});
