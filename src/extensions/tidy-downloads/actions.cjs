// «Уборка загрузок», actions: what the card does after the user confirmed the exact files — move them to the system
// Trash (shell.trashItem through the cleanup of «Место на диске», never a plain delete) or into a «Разобрано»
// subfolder of Downloads — and the undo list of those actions (last 30, in the company data folder).
// Undo: a move is moved back; a trashed file is put back from the Trash where the platform allows reading it:
//  - Linux (freedesktop Trash): files/<name> + info/<name>.trashinfo with the original Path;
//  - Windows: the Recycle Bin through Shell.Application (original folder + name), moved back with MoveHere;
//  - macOS: ~/.Trash/<name> (or Finder's «name 2.ext» / «name 12.34.56.ext») of the same size — reading the Trash may
//    need Full Disk Access; without it the Trash opens and the user puts the file back with «Вернуть».
// A target that exists again is never overwritten.
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {execFile}=require('node:child_process');
const cleanup=require('../disk-usage/cleanup.cjs');
const run=(file,args,{timeout=30000,env}={})=>new Promise((resolve,reject)=>execFile(file,args,{timeout,env,windowsHide:true},(error,stdout)=>error?reject(error):resolve(String(stdout||''))));
const KEEP=30;
const FOLDER='Разобрано';

function store(file){
 let list=[];try{list=JSON.parse(fs.readFileSync(file,'utf8')).actions||[];}catch{list=[];}
 const save=()=>{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,actions:list.slice(0,KEEP)}),{mode:0o600});fs.renameSync(file+'.tmp',file);};
 return {
  list:()=>list.slice(0,KEEP),
  add(action){list.unshift(action);list=list.slice(0,KEEP);save();return action;},
  get:id=>list.find(a=>a.id===id)||null,
  update(id,patch){const a=list.find(x=>x.id===id);if(a)Object.assign(a,patch);save();return a;}
 };
}

// A free name in `dir`: «file.zip», «file (2).zip», …
function freeName(dir,name){
 const ext=path.extname(name),base=name.slice(0,name.length-ext.length);
 for(let i=1;i<1000;i++){const n=i===1?name:base+' ('+i+')'+ext;if(!fs.existsSync(path.join(dir,n)))return n;}
 throw Error('Не нашлось свободного имени для '+name+'.');
}

// `items` are the scan's own entries the user confirmed ({path, bytes, name}); every path must be inside `root`.
function inside(root,p){const rel=path.relative(path.resolve(root),path.resolve(p));return !!rel&&!rel.startsWith('..')&&!path.isAbsolute(rel);}

async function trash(items,{root,trashItem,group}){
 for(const i of items)if(!inside(root,i.path))throw Error('Файл вне папки «Загрузки» — не трогаю.');
 const category={clean:'trash',note:'',bytes:items.reduce((a,i)=>a+i.bytes,0),items:items.map(i=>({...i}))};
 const result=await cleanup.clean(category,items.map(i=>i.path),{trashItem});
 const done=category.items.filter(i=>result.removed.includes(i.path));
 const action=done.length?{id:randomUUID(),kind:'trash',group,at:Date.now(),items:done.map(i=>({from:i.path,name:i.name||path.basename(i.path),bytes:i.bytes,size:i.size}))}:null;
 return {action,removed:result.removed,failed:result.failed,freed:result.freed};
}

async function move(items,{root,group,label}){
 const dir=path.join(root,FOLDER,label.replace(/[\\/:*?"<>|]+/g,' ').trim().slice(0,60)||group);
 const moved=[],failed=[];
 for(const i of items){
  try{
   if(!inside(root,i.path))throw Error('файл вне папки «Загрузки»');
   const st=await fsp.lstat(i.path);if(st.isSymbolicLink())throw Error('это ссылка, не трогаю');
   await fsp.mkdir(dir,{recursive:true});
   const to=path.join(dir,freeName(dir,path.basename(i.path)));
   await fsp.rename(i.path,to);moved.push({from:i.path,to,name:path.basename(i.path),bytes:i.bytes});
  }catch(e){failed.push({target:i.path,error:e.code==='ENOENT'?'уже нет на диске':e.message});}
 }
 return {action:moved.length?{id:randomUUID(),kind:'move',group,at:Date.now(),folder:dir,items:moved}:null,moved:moved.map(m=>m.from),failed};
}

// --- Putting files back from the Trash --------------------------------------------------------------------------------
async function fromFreedesktop(item,{home,env={}}){
 const base=path.join(env.XDG_DATA_HOME||path.join(home,'.local','share'),'Trash');
 let infos=[];try{infos=await fsp.readdir(path.join(base,'info'));}catch{return null;}
 const hits=[];
 for(const info of infos.filter(n=>n.endsWith('.trashinfo'))){
  let text='';try{text=await fsp.readFile(path.join(base,'info',info),'utf8');}catch{continue;}
  const m=/^Path=(.+)$/m.exec(text),when=/^DeletionDate=(.+)$/m.exec(text);
  if(!m)continue;let original='';try{original=decodeURIComponent(m[1].trim());}catch{continue;}
  if(path.resolve(original)===path.resolve(item.from))hits.push({info,at:Date.parse(when?.[1]||'')||0});
 }
 const hit=hits.sort((a,b)=>b.at-a.at)[0];if(!hit)return null;
 const name=hit.info.slice(0,-'.trashinfo'.length),file=path.join(base,'files',name);
 return {file,done:()=>fsp.unlink(path.join(base,'info',hit.info)).catch(()=>{})};
}
async function fromMacTrash(item,{home}){
 const dir=path.join(home,'.Trash');
 let names;try{names=await fsp.readdir(dir);}catch(e){return {denied:e.code==='EPERM'||e.code==='EACCES'};}
 const ext=path.extname(item.name),stem=item.name.slice(0,item.name.length-ext.length);
 const candidates=names.filter(n=>n===item.name||n.startsWith(stem+' ')&&n.endsWith(ext));
 for(const n of candidates.sort((a,b)=>(a===item.name?-1:0)-(b===item.name?-1:0))){
  const file=path.join(dir,n);try{const st=await fsp.lstat(file);if(!st.isFile()||st.size!==item.size&&item.size!==undefined)continue;}catch{continue;}
  return {file};
 }
 return null;
}
// Windows: the Recycle Bin item whose original folder and name match, moved back by the shell (it also drops the
// bin's own record). The paths go in through the environment, never through the script text.
const RESTORE_PS=String.raw`$ErrorActionPreference='Stop'
$sh=New-Object -ComObject Shell.Application;$bin=$sh.Namespace(10);$want=$env:PETYA_RESTORE_PATH
$dir=Split-Path -Parent $want;$name=Split-Path -Leaf $want
foreach($i in $bin.Items()){
 $from=$i.ExtendedProperty('System.Recycle.DeletedFrom')
 if($from -and ($from.TrimEnd('\') -ieq $dir.TrimEnd('\')) -and ($bin.GetDetailsOf($i,0) -ieq $name -or [IO.Path]::GetFileName($i.Path) -ieq $name)){
  $sh.Namespace($dir).MoveHere($i,0x14);Write-Output 'ok';exit 0
 }
}
Write-Output 'missing'`;

async function restore(item,{platform=process.platform,home,env=process.env,run:exec=run,openTrash=()=>{}}={}){
 if(fs.existsSync(item.from))return {ok:false,error:'на старом месте уже есть файл с таким именем'};
 if(platform==='win32'){
  const out=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',RESTORE_PS],{timeout:30000,env:{...env,PETYA_RESTORE_PATH:item.from}}).catch(e=>'error:'+e.message);
  if(/^ok/m.test(out)&&fs.existsSync(item.from))return {ok:true};
  openTrash();return {ok:false,manual:true,error:'не нашёл в Корзине — откройте её и верните файл сами'};
 }
 const hit=platform==='darwin'?await fromMacTrash(item,{home}):await fromFreedesktop(item,{home,env});
 if(!hit||hit.denied||!hit.file){openTrash();return {ok:false,manual:true,error:hit?.denied?'нет доступа к Корзине — откройте её и нажмите «Вернуть» у файла':'не нашёл в Корзине — откройте её и верните файл сами'};}
 await fsp.mkdir(path.dirname(item.from),{recursive:true});
 await fsp.rename(hit.file,item.from);await hit.done?.();
 return {ok:true};
}

async function undo(action,options={}){
 if(!action)throw Error('Такого действия нет в списке.');
 if(action.undone)throw Error('Это действие уже отменено.');
 const back=[],failed=[];
 for(const item of action.items){
  try{
   if(action.kind==='move'){
    if(fs.existsSync(item.from))throw Error('на старом месте уже есть файл с таким именем');
    await fsp.rename(item.to,item.from);back.push(item.from);
   }else{
    const r=await restore(item,options);if(r.ok)back.push(item.from);else failed.push({target:item.from,error:r.error,manual:!!r.manual});
   }
  }catch(e){failed.push({target:item.from,error:e.code==='ENOENT'?'файла уже нет':e.message});}
 }
 if(action.kind==='move')try{await fsp.rmdir(action.folder);}catch{/* other files are still there */}
 return {back,failed,manual:failed.some(f=>f.manual)};
}
module.exports={store,trash,move,undo,restore,freeName,inside,FOLDER,RESTORE_PS};
