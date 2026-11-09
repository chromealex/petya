// «Уборка загрузок», scanner: the Downloads folder in groups the user can clear at once — installers of programs
// that are already installed, duplicates (same size, then the same SHA-256), archives already extracted next to
// themselves, large files not opened for N days, and screenshots. Sizes, the deadline and the «never follow
// symlinks, count hard links once» rules come from «Место на диске» (src/extensions/disk-usage/scan.cjs).
// Only the folder's top level is grouped (a subfolder is the user's own structure); subfolders count in the total.
// Everything is injectable ({root, platform, installed, lastUsed, now}), so the same code is tested in a temp folder.
const fsp=require('node:fs/promises');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const scanner=require('../disk-usage/scan.cjs');
const DAY=86400000;

// Group order is also the priority when a file fits several: a duplicate is listed as a duplicate.
const GROUPS=[
 {id:'duplicates',label:'Дубликаты',note:'Одинаковые по содержимому файлы. Оригинал остаётся, предлагаются только копии.'},
 {id:'installers',label:'Установщики уже установленных программ',note:'Программа уже стоит на компьютере, установщик больше не нужен.'},
 {id:'archives',label:'Распакованные архивы',note:'Рядом лежит папка с тем же именем — архив уже распакован.'},
 {id:'large',label:'Большие файлы, которые давно не открывали',note:'Файлы больше 100 МБ, которые не открывали дольше выбранного срока.'},
 {id:'screenshots',label:'Скриншоты',note:'Снимки экрана, сохранённые в «Загрузки».'}
];
const INSTALLERS={darwin:/\.(?:dmg|pkg|mpkg)$/i,win32:/\.(?:exe|msi|msix|msixbundle|appx|appxbundle)$/i,linux:/\.(?:deb|rpm|appimage|flatpakref)$/i};
const ARCHIVE=/\.(?:tar\.gz|tar\.xz|tar\.bz2|tar\.zst|zip|rar|7z|tar|tgz|txz|tbz2|xip)$/i;
const IMAGE=/\.(?:png|jpe?g|heic|webp|gif|bmp|tiff?)$/i;
const SHOT=/^(?:screen ?shot|снимок экрана|скриншот|cleanshot|capture d.écran|bildschirmfoto|captura de pantalla|schermata|snímek obrazovky)/iu;
// Words in installer names that are not the program's name.
const NOISE=/^(?:setup|installer|install|x64|x86|x86_64|amd64|arm64|aarch64|universal|intel|apple|silicon|win|win32|win64|windows|mac|macos|os|osx|darwin|linux|latest|release|stable|full|offline|online|user|system|signed|beta|portable|v?\d[\w.]*)$/i;
// «report (1).pdf», «report copy.pdf», «report копия 2.pdf», «report-1.pdf»: a copy's name.
const COPY=/(?:\s\(\d+\)|\s(?:copy|копия)(?:\s\d+)?|-\d)$/iu;

const stemOf=name=>name.replace(ARCHIVE,'').replace(/\.[^.]+$/,'');
function appTokens(name){
 return name.replace(/\.[^.]+$/,'').replace(/([a-z])([A-Z])/g,'$1 $2').split(/[\s._\-+()[\]]+/).filter(t=>t&&!NOISE.test(t));
}
const compact=v=>String(v||'').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,'');
// The installed program an installer belongs to, or ''. «UnityHubSetup.exe» → «Unity Hub», «Docker.dmg» → «Docker».
function installedApp(name,installed){
 const want=compact(appTokens(name).join(''));
 if(want.length<3)return '';
 let best='';
 for(const app of installed||[]){
  const have=compact(app);if(!have)continue;
  const bare=have.replace(/\d+$/,'');
  if(have===want||bare===want)return app;
  if(want.length>=4&&have.startsWith(want)&&!best)best=app;
 }
 return best;
}

async function sha256(file,{signal,limit=Infinity}={}){
 const hash=crypto.createHash('sha256');let read=0;
 const stream=fs.createReadStream(file,{highWaterMark:1<<20});
 for await (const chunk of stream){
  if(signal?.aborted){stream.destroy();throw Object.assign(Error('остановлено'),{aborted:true});}
  hash.update(chunk);read+=chunk.length;if(read>=limit){stream.destroy();break;}
 }
 return hash.digest('hex');
}

// Files of equal size, then equal first megabyte, then equal content. Bounded by `hashBytes` and the budget.
async function duplicates(files,budget,{hashBytes=20e9,signal}={}){
 const bySize=new Map();
 for(const f of files)if(f.bytes>0){const list=bySize.get(f.size)||[];list.push(f);bySize.set(f.size,list);}
 const sets=[];let hashed=0,partial=false;
 for(const list of [...bySize.values()].filter(l=>l.length>1).sort((a,b)=>b[0].size-a[0].size)){
  if(budget.stopped||hashed+list[0].size*list.length>hashBytes){partial=true;continue;}
  const head=new Map();
  for(const f of list){try{const h=await sha256(f.path,{signal,limit:1<<20});head.set(h,[...(head.get(h)||[]),f]);}catch(e){if(e.aborted)throw e;budget.skipped++;}}
  for(const same of head.values()){
   if(same.length<2)continue;
   const full=new Map();
   for(const f of same){try{const h=f.size<=1<<20?'s':await sha256(f.path,{signal});hashed+=f.size;full.set(h,[...(full.get(h)||[]),f]);}catch(e){if(e.aborted)throw e;budget.skipped++;}}
   for(const group of full.values())if(group.length>1)sets.push(group);
  }
 }
 // The original: a name without a copy marker, then the oldest.
 return {partial,sets:sets.map(group=>{
  const sorted=[...group].sort((a,b)=>(COPY.test(stemOf(a.name))?1:0)-(COPY.test(stemOf(b.name))?1:0)||a.mtime-b.mtime||a.name.length-b.name.length);
  return {original:sorted[0],copies:sorted.slice(1)};
 })};
}

// Last time a file was opened: the platform's own record when there is one (macOS Spotlight), else max(atime, mtime).
const lastUsedOf=f=>Math.max(f.atime||0,f.mtime||0);

async function scan({root,platform=process.platform,installed=[],lastUsed=null,days=30,largeBytes=100e6,archiveDays=7,now=Date.now(),
 signal,timeLimit=30000,hashBytes=20e9,progress=()=>{}}={}){
 if(!root)throw Error('Не нашёл папку «Загрузки».');
 let names;
 try{names=await fsp.readdir(root,{withFileTypes:true});}
 catch(e){throw Error(e.code==='ENOENT'?'Папки «Загрузки» нет: '+root:e.code==='EPERM'||e.code==='EACCES'?'Нет доступа к папке «Загрузки». Разрешите Пете доступ к ней в настройках системы и повторите.':e.message);}
 const started=Date.now();
 const budget=new scanner.Budget({deadline:started+timeLimit,signal,platform});
 const rootStat=await fsp.lstat(root);
 progress('Читаю «Загрузки»',0,4);
 const files=[],dirs=new Map();let total=0,folders=0;
 for(const d of names){
  if(budget.stopped)break;
  if(d.name.startsWith('.')||d.isSymbolicLink())continue;
  const p=path.join(root,d.name);
  let st;try{st=await fsp.lstat(p);}catch{budget.skipped++;continue;}
  if(st.isDirectory()){
   const bytes=await scanner.size(p,budget,rootStat.dev);total+=bytes;folders++;
   dirs.set(d.name.toLocaleLowerCase(),{name:d.name,path:p,bytes,mtime:st.mtimeMs});
  }else if(st.isFile()){
   const bytes=budget.bytes(st);total+=bytes;
   files.push({name:d.name,path:p,bytes,size:st.size,mtime:st.mtimeMs,atime:st.atimeMs,birth:st.birthtimeMs||st.mtimeMs});
  }
 }
 progress('Ищу дубликаты',1,4);
 const taken=new Set(),groups=Object.fromEntries(GROUPS.map(g=>[g.id,[]]));
 const add=(id,f,extra={})=>{if(taken.has(f.path))return;taken.add(f.path);groups[id].push({name:f.name,path:f.path,bytes:f.bytes,size:f.size,mtime:f.mtime,lastUsed:f.lastUsed||lastUsedOf(f),...extra});};
 let partial=false;
 try{
  const dup=await duplicates(files,budget,{hashBytes,signal});partial=dup.partial;
  for(const set of dup.sets)for(const c of set.copies)add('duplicates',c,{original:set.original.name});
 }catch(e){if(!e.aborted)throw e;}
 progress('Сверяю установщики и архивы',2,4);
 const installer=INSTALLERS[platform]||INSTALLERS.linux;
 for(const f of files){
  if(installer.test(f.name)){const app=installedApp(f.name,installed);if(app)add('installers',f,{app});continue;}
  if(ARCHIVE.test(f.name)&&now-f.mtime>=archiveDays*DAY){
   const stem=stemOf(f.name).replace(/\s\(\d+\)$/,'').toLocaleLowerCase();
   const folder=dirs.get(stem)||dirs.get(stem+' 2');
   if(folder)add('archives',f,{folder:folder.name});
  }
 }
 for(const f of files)if(IMAGE.test(f.name)&&SHOT.test(f.name))add('screenshots',f);
 progress('Проверяю, что давно не открывали',3,4);
 const big=files.filter(f=>!taken.has(f.path)&&f.bytes>=largeBytes);
 let used={};try{used=lastUsed?await lastUsed(big.map(f=>f.path))||{}:{};}catch{used={};}
 for(const f of big){
  const at=Number.isFinite(used[f.path])?Math.max(used[f.path],f.mtime):lastUsedOf(f);
  if(now-at>=days*DAY)add('large',{...f,lastUsed:at});
 }
 progress('Готово',4,4);
 if(budget.stopped)partial=true;
 const out=GROUPS.map(g=>{const items=groups[g.id].sort((a,b)=>b.bytes-a.bytes);return {...g,bytes:items.reduce((a,i)=>a+i.bytes,0),items};}).filter(g=>g.items.length);
 return {root,total,files:files.length,folders,groups:out,days,partial:partial||budget.partial,cancelled:!!signal?.aborted,skipped:budget.skipped,elapsedMs:Date.now()-started};
}

// macOS: when each file was last opened, from Spotlight (`mdls`), for the few large files only. Null when unknown.
function spotlight(files,{run=require('../disk-usage/cleanup.cjs').run}={}){
 if(!files.length)return Promise.resolve({});
 return run('/usr/bin/mdls',['-raw','-name','kMDItemLastUsedDate',...files],{timeout:10000}).then(out=>{
  const parts=out.split('\0'),result={};
  files.forEach((f,i)=>{const t=Date.parse(String(parts[i]||'').trim().replace(' +0000','Z').replace(' ','T'));if(Number.isFinite(t))result[f]=t;});
  return result;
 },()=>({}));
}
module.exports={GROUPS,scan,duplicates,installedApp,appTokens,sha256,spotlight,stemOf,human:scanner.human,DAY};
