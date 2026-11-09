// «Уборка загрузок» card in the real chat: the stacked bar of the folder, groups as rows with their files (preview for
// screenshots, why each file is there), and «В папку «Разобрано»» that asks with the exact count and size, moves real
// files of a temp Downloads folder, and puts them back from the undo list. Names never become HTML.
process.env.PETYA_SMOKE_TEST='1';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
require.cache[require.resolve('./smoke.cjs')]={exports:async win=>{
 const js=code=>win.webContents.executeJavaScript(code);
 const wait=async(test,label)=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+(label||test));};
 await js('window.chatNavigationReady');
 win.setContentSize(1180,1500);
 const app=require('../src/extensions/tidy-downloads/feature.cjs');
 const groups=require('../src/extensions/tidy-downloads/groups.cjs');
 // A real temp Downloads folder.
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'petya-tidy-ui-'));
 const now=Date.now(),DAY=86400000;
 const put=(name,bytes,age,fill=name.length)=>{const p=path.join(root,name);fs.writeFileSync(p,Buffer.alloc(bytes,fill));const t=new Date(now-age*DAY);fs.utimesSync(p,t,t);};
 put('Docker.dmg',3000,40);put('UnityHubSetup.dmg',2000,30);put('Отчёт за октябрь.pdf',1500,12,7);put('Отчёт за октябрь (1).pdf',1500,4,7);
 put('ui-kit.zip',2500,20);fs.mkdirSync(path.join(root,'ui-kit'));put('Bunker Wars 1.4.2.apk',9000,95);
 put('Снимок экрана 2026-11-02 в 14.21.07.png',800,7);put('Screenshot 2026-10-28 at 10.02.44.png',900,12);put('Снимок экрана 2026-11-05 в 09.12.31.png',700,4);
 put('Снимок экрана <img src=x onerror=alert(1)>.png',600,3);
 const result=await groups.scan({root,platform:'darwin',installed:['Docker','Unity Hub'],largeBytes:5000,days:30,now});
 // Realistic sizes for the picture (the actions use the real files).
 const sizes={duplicates:184e6,installers:[1.1e9,412e6],archives:[268e6],large:[2.3e9],screenshots:[4.2e6,3.1e6,2.8e6,1.2e6]};
 for(const g of result.groups){g.items.forEach((it,i)=>{it.bytes=Array.isArray(sizes[g.id])?sizes[g.id][i]||1e6:sizes[g.id];});g.bytes=g.items.reduce((a,i)=>a+i.bytes,0);}
 result.total=18.4e9;
 const scanId='ui-scan';app.state.scans.set(scanId,result);
 const card={scanId,at:now-60000,root,total:result.total,files:result.files,folders:result.folders,days:30,partial:false,cancelled:false,skipped:0,elapsedMs:2400,platform:'darwin',
  groups:result.groups.map(g=>({id:g.id,label:g.label,note:g.note,bytes:g.bytes,items:g.items})),undo:[]};
 assert.deepEqual(card.groups.map(g=>g.id),['duplicates','installers','archives','large','screenshots']);
 // Screenshot previews: a small picture drawn in the page, served by the app's thumbnail call.
 const thumb=await js(`(()=>{const c=document.createElement('canvas');c.width=160;c.height=100;const g=c.getContext('2d');g.fillStyle='#24303a';g.fillRect(0,0,160,100);g.fillStyle='#c9ed9d';g.fillRect(12,14,90,10);g.fillStyle='#86a8e0';g.fillRect(12,34,136,52);return c.toDataURL('image/png');})()`);
 app.deps.thumbnail=async()=>thumb;
 await js(`view('home');showDialogueMessages([{role:'user',text:'разбери загрузки'},{role:'assistant',text:'В «Загрузках» 18,4 ГБ.',by:'Уборка загрузок',extensionData:{tidyDownloads:${JSON.stringify(card)}}}],'Загрузки')`);
 await wait("document.querySelectorAll('.tidy-card').length===1",'card');
 await js("document.querySelectorAll('.onb').forEach(n=>n.style.display='none')");
 assert.equal(await js("document.querySelectorAll('.tidy-group').length"),5);
 assert.equal(await js("document.querySelectorAll('.tidy-seg').length"),5,'one segment per group');
 assert.equal(await js("document.querySelectorAll('.tidy-card img[onerror], .tidy-card img[src=x]').length"),0,'names are never HTML');
 assert.equal(await js("document.querySelector('.tidy-group .tidy-group-name').textContent"),'Дубликаты');
 assert.match(await js("document.querySelector('.tidy-total-head').textContent"),/18,4 ГБ/);
 await require('./card-shot.cjs')(win,'.tidy-card','petya-tidy-downloads-collapsed');
 // Open the duplicates and the screenshots: why each file is there, previews loaded on opening.
 await js("document.querySelector('.tidy-group[data-group=duplicates]').open=true");
 assert.match(await js("document.querySelector('.tidy-group[data-group=duplicates] .tidy-why').textContent"),/^копия файла Отчёт за октябрь\.pdf$/);
 await js("document.querySelector('.tidy-group[data-group=installers]').open=true");
 assert.match(await js("document.querySelector('.tidy-group[data-group=installers] .tidy-why').textContent"),/^установлено: (?:Docker|Unity Hub)$/);
 await js("document.querySelector('.tidy-group[data-group=screenshots]').open=true");
 await wait("[...document.querySelectorAll('.tidy-group[data-group=screenshots] .tidy-thumb img')].every(i=>i.src.startsWith('data:image/png'))",'previews');
 assert.equal(await js("document.querySelector('.tidy-group[data-group=large] .tidy-file input')?.checked??null"),false,'large files start unchecked');
 await require('./card-shot.cjs')(win,'.tidy-card','petya-tidy-downloads');
 // Move the screenshots: a confirmation with count and size, then real files move, then «Вернуть».
 const shots=result.groups.find(g=>g.id==='screenshots').items.map(i=>i.path);
 await js("for(const g of document.querySelectorAll('.tidy-group:not([data-group=screenshots])'))g.open=false");
 await js("document.querySelector('.tidy-group[data-group=screenshots] .tidy-move').click()");
 assert.match(await js("document.querySelector('.tidy-group[data-group=screenshots] .tidy-confirm p').textContent"),/^Переместить 4 файла \(11,3 МБ\) в папку «Загрузки\/Разобрано»\?/);
 assert.ok(shots.every(p=>fs.existsSync(p)),'nothing moved before the confirmation');
 await require('./card-shot.cjs')(win,'.tidy-card','petya-tidy-downloads-confirm');
 await js("document.querySelector('.tidy-group[data-group=screenshots] .tidy-confirm .primary').click()");
 await wait("document.querySelectorAll('.tidy-group[data-group=screenshots] .tidy-file.removed').length===4",'moved');
 assert.ok(shots.every(p=>!fs.existsSync(p)));
 assert.equal(fs.readdirSync(path.join(root,'Разобрано','Скриншоты')).length,4);
 await wait("!document.querySelector('.tidy-undo').hidden&&document.querySelectorAll('.tidy-undo-item').length===1",'undo list');
 assert.match(await js("document.querySelector('.tidy-undo-what').textContent"),/^В «Разобрано» · 4 файла · /);
 await require('./card-shot.cjs')(win,'.tidy-card','petya-tidy-downloads-undo');
 await js("document.querySelector('.tidy-undo-item button').click()");
 await wait("!!document.querySelector('.tidy-undo-item.undone')",'restored');
 assert.ok(shots.every(p=>fs.existsSync(p)),'files back in Downloads');
 // A stale card refuses to act.
 app.state.scans.delete(scanId);
 await js("document.querySelector('.tidy-group[data-group=duplicates] .tidy-trash').click()");
 await js("document.querySelector('.tidy-group[data-group=duplicates] .tidy-confirm .primary').click()");
 await wait("!!document.querySelector('.kit-toast.error')",'stale toast');
 assert.match(await js("document.querySelector('.kit-toast.error').textContent"),/устарел/);
 assert.ok(fs.existsSync(path.join(root,'Отчёт за октябрь (1).pdf')),'nothing trashed');
 fs.rmSync(root,{recursive:true,force:true});
 console.log('Tidy downloads card: stacked bar, groups with reasons and previews, confirmation, real move and undo, stale scan refused passed');
}};
require('../src/main.cjs');
