// «Место на диске», scanner: where the space went on macOS and Windows. Every path is derived from injectable
// {platform, home, env, userData}, so the same code is tested on Linux with a fake home.
// The walk is async, bounded by a deadline and an AbortSignal, never follows symlinks, never crosses into another
// volume, counts hard-linked files once and skips folders it may not read (they are counted as «skipped»).
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {inspectSpace}=require('../../disk-space.cjs');

// Categories: tag safe = «можно удалить безопасно», regen = «пересоздастся», caution = «осторожно».
// clean: 'trash' (items go to the Trash after confirmation), 'ollama' (`ollama rm`), null (only shown, with a hint).
const SPECS=[
 {id:'ollama',label:'Модели Ollama',tag:'caution',clean:'ollama',note:'Удаляются только через «ollama rm»; модель придётся скачать заново.'},
 {id:'unity-library',label:'Unity: папки Library',tag:'regen',clean:'trash',note:'Library пересоздаётся Unity при открытии проекта, займёт время.'},
 {id:'unity-editors',label:'Unity Hub: редакторы',tag:'caution',clean:null,note:'Установленные версии Unity — удаляйте через Unity Hub, чтобы он о них знал.'},
 {id:'unity-cache',label:'Unity: кэш',tag:'regen',clean:'trash',note:'Кэш пакетов и ассетов Unity, скачается заново при необходимости.'},
 {id:'xcode-derived',label:'Xcode: DerivedData',tag:'safe',clean:'trash',note:'Промежуточные файлы сборки — Xcode пересоберёт их сам.'},
 {id:'xcode-archives',label:'Xcode: Archives',tag:'caution',clean:'trash',note:'Архивы релизов с dSYM — нужны, чтобы разбирать крэши старых версий.'},
 {id:'xcode-device-support',label:'iOS DeviceSupport',tag:'regen',clean:'trash',note:'Символы для подключённых iPhone, Xcode скачает их снова при подключении.'},
 {id:'xcode-simulators',label:'Симуляторы iOS',tag:'caution',clean:null,note:'Удаляйте в Xcode или командой «xcrun simctl delete unavailable».'},
 {id:'gradle',label:'Gradle: кэши',tag:'regen',clean:'trash',note:'Скачанные зависимости и кэш сборок — первая сборка после очистки будет долгой.'},
 {id:'android-avd',label:'Android: эмуляторы (AVD)',tag:'caution',clean:'trash',note:'Эмуляторы вместе с их данными; пересоздаются в Android Studio.'},
 {id:'android-images',label:'Android SDK: system-images',tag:'regen',clean:'trash',note:'Образы систем для эмуляторов, скачиваются заново в SDK Manager.'},
 {id:'package-caches',label:'Кэши npm, Yarn, pnpm, pip',tag:'safe',clean:'trash',note:'Кэши загрузок пакетов — менеджеры скачают пакеты заново.'},
 {id:'docker',label:'Docker Desktop: диск',tag:'caution',clean:null,note:'Образ диска Docker — чистите через «docker system prune» или настройки Docker Desktop.'},
 {id:'petya',label:'Данные Пети',tag:'caution',clean:null,note:'Среда модели, рабочие копии Программиста и настройки Пети — рабочие копии закрываются в карточках Программиста.'},
 {id:'downloads',label:'Загрузки',tag:'caution',clean:null,note:'Ваши файлы — проверьте сами, Петя их не удаляет.'},
 {id:'trash',label:'Корзина',tag:'safe',clean:null,note:'Уже удалённые файлы — очистите Корзину в Finder или Проводнике.'}
];

// Where each category lives on this platform. Returns {id: [root, …]} for the plain folder categories.
function locations({platform=process.platform,home,env={},userData=''}){
 const j=(...p)=>(platform==='win32'?path.win32:path.posix).join(...p);
 const mac=platform==='darwin',win=platform==='win32';
 const local=env.LOCALAPPDATA||j(home,'AppData','Local'),roaming=env.APPDATA||j(home,'AppData','Roaming');
 const sdk=env.ANDROID_HOME||env.ANDROID_SDK_ROOT||(mac?j(home,'Library','Android','sdk'):win?j(local,'Android','Sdk'):j(home,'Android','Sdk'));
 const L={
  ollama:[env.OLLAMA_MODELS||j(home,'.ollama','models')],
  'unity-editors':mac?['/Applications/Unity/Hub/Editor']:win?[j(env.ProgramFiles||'C:\\Program Files','Unity','Hub','Editor')]:[],
  'unity-cache':mac?[j(home,'Library','Unity','cache')]:win?[j(local,'Unity','cache')]:[],
  'xcode-derived':mac?[j(home,'Library','Developer','Xcode','DerivedData')]:[],
  'xcode-archives':mac?[j(home,'Library','Developer','Xcode','Archives')]:[],
  'xcode-device-support':mac?[j(home,'Library','Developer','Xcode','iOS DeviceSupport')]:[],
  'xcode-simulators':mac?[j(home,'Library','Developer','CoreSimulator','Devices')]:[],
  gradle:[j(env.GRADLE_USER_HOME||j(home,'.gradle'),'caches')],
  'android-avd':[env.ANDROID_AVD_HOME||j(home,'.android','avd')],
  'android-images':[j(sdk,'system-images')],
  'package-caches':mac?[j(home,'.npm','_cacache'),j(home,'Library','Caches','Yarn'),j(home,'Library','pnpm','store'),j(home,'Library','Caches','pip')]:
   win?[j(local,'npm-cache','_cacache'),j(roaming,'npm-cache','_cacache'),j(local,'Yarn','Cache'),j(local,'pnpm','store'),j(local,'pip','Cache')]:
   [j(home,'.npm','_cacache'),j(home,'.cache','yarn'),j(home,'.local','share','pnpm','store'),j(home,'.cache','pip')],
  docker:mac?[j(home,'Library','Containers','com.docker.docker','Data','vms','0','data')]:win?[j(local,'Docker','wsl')]:[],
  petya:userData?[userData]:[],
  downloads:[j(home,'Downloads')],
  trash:mac?[j(home,'.Trash')]:[]
 };
 if(env.npm_config_cache)L['package-caches'].unshift(j(env.npm_config_cache,'_cacache'));
 if(env.PIP_CACHE_DIR)L['package-caches'].push(env.PIP_CACHE_DIR);
 return L;
}
// Unity Hub's own list of projects and the places people usually keep them.
function unityHints({platform=process.platform,home,env={}}){
 const P=platform==='win32'?path.win32:path.posix;
 const hub=platform==='darwin'?P.join(home,'Library','Application Support','UnityHub','projects-v1.json'):platform==='win32'?P.join(env.APPDATA||P.join(home,'AppData','Roaming'),'UnityHub','projects-v1.json'):P.join(home,'.config','UnityHub','projects-v1.json');
 const folders=['Projects','Unity Projects',P.join('Documents','Projects'),P.join('Documents','Unity Projects'),P.join('Documents','Unity')].map(p=>P.join(home,p));
 return {hub,folders};
}
function hubProjects(file){
 try{const data=JSON.parse(fs.readFileSync(file,'utf8'))?.data||{};return Object.values(data).map(p=>p?.path).filter(p=>typeof p==='string'&&path.isAbsolute(p));}catch{return [];}
}

class Budget {
 constructor({deadline,signal,apparent=false,platform=process.platform}){Object.assign(this,{deadline,signal,apparent,platform});this.seen=new Set();this.partial=false;this.skipped=0;}
 get stopped(){if(this.signal?.aborted||Date.now()>this.deadline){this.partial=true;return true;}return false;}
 // Bytes on disk: allocated blocks (a sparse Docker.raw counts what it really holds), each hard link once.
 bytes(st){
  if(st.nlink>1&&st.ino){const key=st.dev+':'+st.ino;if(this.seen.has(key))return 0;this.seen.add(key);}
  return !this.apparent&&this.platform!=='win32'&&Number.isFinite(st.blocks)?st.blocks*512:st.size;
 }
}
const exists=p=>{try{return fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isFile();}catch{return false;}};
async function lstat(p){try{return await fsp.lstat(p);}catch{return null;}}
const PARALLEL=48;

// Size of a folder (or a file). Folders on another volume, symlinks and unreadable folders are not entered.
async function size(target,budget,dev){
 const st=await lstat(target);
 if(!st){budget.skipped++;return 0;}
 if(st.isSymbolicLink())return 0;
 if(st.isFile())return budget.bytes(st);
 if(!st.isDirectory()||dev!==undefined&&st.dev!==dev)return 0;
 let total=0;const dirs=[target];
 while(dirs.length){
  if(budget.stopped)break;
  const dir=dirs.pop();let names;
  try{names=await fsp.readdir(dir,{withFileTypes:true});}catch{budget.skipped++;continue;}
  const files=[];
  for(const d of names){if(d.isSymbolicLink())continue;const p=path.join(dir,d.name);if(d.isDirectory())files.push([p,true]);else if(d.isFile())files.push([p,false]);}
  for(let i=0;i<files.length&&!budget.stopped;i+=PARALLEL){
   const stats=await Promise.all(files.slice(i,i+PARALLEL).map(async([p,isDir])=>[p,isDir,await lstat(p)]));
   for(const [p,isDir,s] of stats){
    if(!s){budget.skipped++;continue;}
    if(isDir){if(s.dev===st.dev&&!s.isSymbolicLink())dirs.push(p);}
    else if(s.isFile())total+=budget.bytes(s);
   }
  }
 }
 return total;
}
// A root folder split into its immediate children (the «biggest subfolders» of a row).
async function children(root,budget){
 const st=await lstat(root);if(!st||!st.isDirectory())return null;
 let names;try{names=await fsp.readdir(root,{withFileTypes:true});}catch{budget.skipped++;return {bytes:0,items:[],denied:true};}
 const items=[];let loose=0;
 for(const d of names){
  if(budget.stopped)break;
  if(d.isSymbolicLink())continue;
  const p=path.join(root,d.name);
  if(d.isDirectory())items.push({name:d.name,path:p,bytes:await size(p,budget,st.dev)});
  else if(d.isFile()){const s=await lstat(p);if(s)loose+=budget.bytes(s);}
 }
 return {bytes:items.reduce((a,i)=>a+i.bytes,0)+loose,items};
}

// Ollama: per model from the manifests (layers + config); the blobs folder is the real total (layers are shared).
async function ollamaModels(root,budget){
 const manifests=path.join(root,'manifests'),models=[];
 const walk=async(dir,parts)=>{
  let names;try{names=await fsp.readdir(dir,{withFileTypes:true});}catch{return;}
  for(const d of names){
   if(budget.stopped)return;
   const p=path.join(dir,d.name);
   if(d.isDirectory())await walk(p,[...parts,d.name]);
   else if(d.isFile()&&parts.length===3){
    try{
     const m=JSON.parse(await fsp.readFile(p,'utf8'));
     const bytes=[...(m.layers||[]),m.config].filter(Boolean).reduce((a,l)=>a+(Number(l.size)||0),0);
     const [host,ns,model]=parts;
     const name=(host==='registry.ollama.ai'?(ns==='library'?'':ns+'/'):host+'/'+ns+'/')+model+':'+d.name;
     models.push({name,path:p,bytes,model:true});
    }catch{budget.skipped++;}
   }
  }
 };
 await walk(manifests,[]);
 const blobs=path.join(root,'blobs');
 const total=exists(blobs)?await size(blobs,budget):models.reduce((a,m)=>a+m.bytes,0);
 return {bytes:total,items:models};
}

const SKIP=new Set(['node_modules','.git','Library','Temp','Logs','obj','Build','Builds','.gradle','Pods','DerivedData']);
// Unity projects under the roots: a folder with Assets/ and ProjectSettings/ (searched 3 levels deep, bounded).
async function unityProjects(roots,budget,{depth=3,limit=4000}={}){
 const found=new Set();let visited=0;
 const visit=async(dir,level)=>{
  if(budget.stopped||visited++>limit)return;
  let names;try{names=await fsp.readdir(dir,{withFileTypes:true});}catch{return;}
  const dirs=new Set(names.filter(d=>d.isDirectory()&&!d.isSymbolicLink()).map(d=>d.name));
  if(dirs.has('Assets')&&dirs.has('ProjectSettings')){found.add(dir);return;}
  if(level>=depth)return;
  for(const name of dirs)if(!name.startsWith('.')&&!SKIP.has(name))await visit(path.join(dir,name),level+1);
 };
 for(const root of roots)await visit(root,0);
 return [...found].sort();
}

// The system volume: free bytes through Petya's own disk-space reader, plus the total from the same statfs call.
function volume(home,statfs=fs.statfsSync){
 let stat=null;
 const space=inspectSpace(home,0,p=>{stat=statfs(p);return stat;});
 const total=Number(stat.blocks)*Number(stat.bsize);
 return {path:home,total,free:space.available,used:Math.max(0,total-Number(stat.bfree)*Number(stat.bsize))};
}

// The whole scan. `progress(stage, done, total)` reports real stages; the result is marked partial when the
// deadline or a cancellation cut it short.
async function scan({platform=process.platform,home,env={},userData='',unityRoots=[],signal,timeLimit=30000,apparent=false,statfs,progress=()=>{}}){
 const started=Date.now();
 const budget=new Budget({deadline:started+timeLimit,signal,apparent,platform});
 const L=locations({platform,home,env,userData});
 const specs=SPECS.filter(s=>s.id==='unity-library'||(L[s.id]||[]).length);
 const total=specs.length+1;let done=0;
 progress('Свободное место на диске',done,total);
 let vol=null;try{vol=volume(home,statfs);}catch{vol=null;}
 done++;
 const categories=[];
 for(const spec of specs){
  if(budget.stopped)break;
  progress(spec.label,done,total);
  const before={skipped:budget.skipped,partial:budget.partial};budget.partial=false;
  let bytes=0,items=[],roots=[];
  if(spec.id==='ollama'){
   roots=L.ollama.filter(exists);
   if(roots.length){const r=await ollamaModels(roots[0],budget);bytes=r.bytes;items=r.items;}
  }else if(spec.id==='unity-library'){
   progress('Ищу проекты Unity',done,total);
   const projects=await unityProjects(unityRoots.filter(exists),budget);
   for(const project of projects){
    if(budget.stopped)break;
    const lib=path.join(project,'Library');
    if(exists(lib))items.push({name:path.basename(project),path:lib,project,bytes:await size(lib,budget)});
   }
   roots=projects;bytes=items.reduce((a,i)=>a+i.bytes,0);
  }else{
   roots=L[spec.id].filter(exists);
   if(roots.length===1){
    const st=await lstat(roots[0]);
    const r=st?.isDirectory()?await children(roots[0],budget):null;
    if(r){bytes=r.bytes;items=r.items;}
   }else{
    for(const root of roots){if(budget.stopped)break;items.push({name:root.replace(home,'~'),path:root,bytes:await size(root,budget)});}
    bytes=items.reduce((a,i)=>a+i.bytes,0);
   }
  }
  const partial=budget.partial;budget.partial=before.partial||partial;
  done++;
  if(!roots.length&&!bytes)continue;
  items.sort((a,b)=>b.bytes-a.bytes);
  categories.push({...spec,bytes,roots,partial,skipped:budget.skipped-before.skipped,
   items:items.filter(i=>i.bytes>0||spec.id==='ollama').slice(0,spec.id==='unity-library'||spec.id==='ollama'?40:12)});
 }
 if(budget.stopped)budget.partial=true;
 categories.sort((a,b)=>b.bytes-a.bytes);
 progress('Готово',total,total);
 return {volume:vol,categories,partial:budget.partial,cancelled:!!signal?.aborted,skipped:budget.skipped,
  missing:specs.filter(s=>!categories.some(c=>c.id===s.id)).map(s=>s.id),elapsedMs:Date.now()-started,platform};
}

// «12,4 ГБ», «830 МБ» (decimal units, as Finder and the Windows «Параметры» storage page show them).
function human(bytes){
 const n=Number(bytes)||0;
 const units=[[1e12,'ТБ'],[1e9,'ГБ'],[1e6,'МБ'],[1e3,'КБ']];
 for(const [d,u] of units)if(n>=d)return (n/d).toLocaleString('ru-RU',{maximumFractionDigits:n/d>=100?0:1})+' '+u;
 return n+' Б';
}
module.exports={SPECS,locations,unityHints,hubProjects,unityProjects,ollamaModels,size,children,volume,scan,human,Budget};
