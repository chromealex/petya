// Project icon from the project's folders: a quick look at the usual places, then a bounded search
// for app icons (Xcode AppIcon, Android launcher, Unity player icon, app-icon/logo/favicon files).
const fs=require('node:fs/promises'),path=require('node:path');
const cache=new Map();
const TTL=10*60000,MAX_DEPTH=7,MAX_ENTRIES=5000,MAX_BYTES=2*1024*1024;
const SKIP=new Set(['node_modules','.git','.svn','.hg','Library','Temp','Logs','obj','bin','Pods','DerivedData','.venv','venv','__pycache__','.gradle','.idea','.vscode','.next','.nuxt','vendor','Packages','PackageCache','intermediates','generated','coverage','.cache','tmp','test','tests','__tests__','fixtures','node']);
const IMAGE=/\.(png|jpe?g|webp)$/i;
const QUICK_DIRS=['','assets','public','resources','icons','Assets','Assets/Icons','build','static','src/assets','app/src/main','app/src/main/res/mipmap-xxxhdpi','app/src/main/res/mipmap-xxhdpi','.github'];
const QUICK_NAMES=['app-icon.png','icon.png','logo.png','favicon.png','ic_launcher-playstore.png','ic_launcher.png','ic_launcher_round.png','logo.webp','logo.jpg'];

// Higher is better; 0 means "not an icon".
function score(relative){
 const name=path.basename(relative).toLowerCase(),dir=path.dirname(relative).toLowerCase();
 if(/appicon\.appiconset$/.test(dir))return 95;
 if(name==='ic_launcher-playstore.png')return 94;
 if(/^ic_launcher(_round)?\.(png|webp)$/.test(name))return /xxxhdpi/.test(dir)?90:/xxhdpi/.test(dir)?88:80;
 if(/^(app[-_]?icon|appicon)(@\d+x)?\.(png|jpe?g|webp)$/.test(name))return 85;
 if(/^(icon|logo)(@\d+x|[-_]?\d+)?\.(png|jpe?g|webp)$/.test(name))return /(^|\/)assets\/(?!icons?(\/|$))/.test(dir+'/')&&dir.split('/').length>2?0:75;
 if(/^(apple-touch-icon|android-chrome-\d+x\d+)\.png$/.test(name))return 70;
 if(/^favicon(-\d+x\d+)?\.png$/.test(name))return 55;
 // Files that merely contain «icon» or «logo» («coin_icon.png», «logo_partner.png») are game or UI art, not the
 // app icon: they are no longer used.
 return 0;
}

async function load(file,root,nativeImage){
 try{
  const real=await fs.realpath(file);if(real!==root&&!real.startsWith(root+path.sep))return '';
  const stat=await fs.stat(real);if(!stat.isFile()||stat.size>MAX_BYTES)return '';
  const image=nativeImage.createFromBuffer(await fs.readFile(real));if(image.isEmpty())return '';
  const size=image.getSize?.();if(size&&(size.width<16||size.height<16||Math.max(size.width,size.height)/Math.min(size.width,size.height)>1.5))return '';
  return image.resize({width:32,height:32,quality:'good'}).toDataURL();
 }catch{return '';}
}

// Unity: the default player icon is referenced by GUID in ProjectSettings.asset.
async function unityIconGuid(root){
 try{const text=await fs.readFile(path.join(root,'ProjectSettings','ProjectSettings.asset'),'utf8');return text.match(/m_BuildTargetIcons:[\s\S]*?m_Icon:\s*\{fileID:\s*\d+,\s*guid:\s*([0-9a-f]{32})/)?.[1]||'';}catch{return '';}
}

async function isUnity(root){try{await fs.access(path.join(root,'ProjectSettings','ProjectSettings.asset'));return true;}catch{return false;}}
// A repository often holds the Unity game one or two folders down («Client/», «Game/») next to tools with their
// own «icon.png». The game's player icon (its GUID from ProjectSettings) is the project's icon then.
async function unityRoots(root){
 const out=[],queue=[[root,0]];
 while(queue.length&&out.length<4){
  const [dir,depth]=queue.shift();
  if(await isUnity(dir)){out.push(dir);continue;}
  if(depth>=2)continue;let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items)if(item.isDirectory()&&!SKIP.has(item.name)&&!item.name.startsWith('.'))queue.push([path.join(dir,item.name),depth+1]);
 }
 return out;
}
async function unityPlayerIcon(project,root,nativeImage){
 const guid=await unityIconGuid(project);if(!guid)return null;
 // Folders named like icons are looked at first; at most 4000 .meta files are read.
 const queue=[[path.join(project,'Assets'),0]];let entries=0,reads=0;
 while(queue.length&&entries<40000&&reads<4000){
  const [dir,depth]=queue.shift();let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   if(++entries>40000)break;const full=path.join(dir,item.name);
   if(item.isDirectory()){if(depth<8&&!SKIP.has(item.name)&&!item.name.startsWith('.')){const next=[full,depth+1];if(/icon/i.test(item.name))queue.unshift(next);else queue.push(next);}continue;}
   if(!item.isFile()||!IMAGE.test(item.name))continue;
   reads++;let meta='';try{meta=await fs.readFile(full+'.meta','utf8');}catch{}
   if(meta.includes('guid: '+guid)){const value=await load(full,root,nativeImage);if(value)return {value,file:full};}
  }
 }
 return null;
}
async function search(root,nativeImage){
 const unityGuid=await unityIconGuid(root),unity=await isUnity(root),found=[],queue=[[root,0]];let entries=0;
 while(queue.length&&entries<MAX_ENTRIES){
  const [dir,depth]=queue.shift();let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   if(++entries>MAX_ENTRIES)break;
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(depth<MAX_DEPTH&&!SKIP.has(item.name)&&!item.name.startsWith('.')||item.name==='.github'&&depth<MAX_DEPTH)queue.push([full,depth+1]);continue;}
   if(!item.isFile()||!IMAGE.test(item.name))continue;
   const relative=path.relative(root,full);let value=score(relative);
   if(unityGuid&&value<100){try{const meta=await fs.readFile(full+'.meta','utf8');if(meta.includes('guid: '+unityGuid))value=100;}catch{}}
   // A Unity project: its player icon, or an app icon by its usual name; everything else is game art.
   if(unity&&value<85)value=0;
   if(value)found.push({full,value,depth});
  }
 }
 found.sort((a,b)=>b.value-a.value||a.depth-b.depth);
 for(const candidate of found.slice(0,12)){const value=await load(candidate.full,root,nativeImage);if(value)return {value,file:candidate.full};}
 return null;
}

// {value, file}: the icon and the file it came from (shown to the user, so a wrong pick is easy to spot).
async function projectIconInfo(folder,nativeImage){
 if(!folder)return {value:'',file:''};
 const saved=cache.get(folder);if(saved&&Date.now()-saved.at<TTL)return saved.info;
 let info={value:'',file:''};
 try{
  const root=await fs.realpath(folder);
  for(const project of await unityRoots(root)){const found=await unityPlayerIcon(project,root,nativeImage);if(found){info=found;break;}}
  if(!info.value)quick:for(const dir of QUICK_DIRS)for(const name of QUICK_NAMES){const file=path.join(root,dir,name),value=await load(file,root,nativeImage);if(value){info={value,file};break quick;}}
  if(!info.value){const found=await search(root,nativeImage);if(found)info=found;}
 }catch{}
 cache.set(folder,{at:Date.now(),info});if(cache.size>100)cache.delete(cache.keys().next().value);return info;
}
async function projectIcon(folder,nativeImage){return (await projectIconInfo(folder,nativeImage)).value;}
// First icon found among the project's context folders (own folders come before inherited ones).
async function projectIconFromInfo(folders,nativeImage){for(const folder of folders||[]){const info=await projectIconInfo(folder,nativeImage);if(info.value)return info;}return {value:'',file:''};}
async function projectIconFrom(folders,nativeImage){return (await projectIconFromInfo(folders,nativeImage)).value;}
// A picture the user chose for the project: any image inside one of its folders.
async function chosenIcon(file,folders,nativeImage){
 for(const folder of folders||[]){try{const root=await fs.realpath(folder);const value=await load(file,root,nativeImage);if(value)return value;}catch{}}
 return '';
}
// The project's icon: off, the chosen picture, or the automatic one.
async function iconFor(project,folders,nativeImage){
 if(project.iconOff)return {value:'',file:'',mode:'none'};
 if(project.iconFile){const value=await chosenIcon(project.iconFile,folders,nativeImage);if(value)return {value,file:project.iconFile,mode:'file'};}
 return {...await projectIconFromInfo(folders,nativeImage),mode:'auto'};
}
function forget(){cache.clear();}
module.exports={projectIcon,projectIconFrom,projectIconInfo,projectIconFromInfo,iconFor,chosenIcon,forget,score};
