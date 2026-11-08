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
 if(/^(icon|logo)(@\d+x|[-_]?\d+)?\.(png|jpe?g|webp)$/.test(name))return 75;
 if(/^(apple-touch-icon|android-chrome-\d+x\d+)\.png$/.test(name))return 70;
 if(/^favicon(-\d+x\d+)?\.png$/.test(name))return 55;
 if(/(^|[-_.])(app[-_]?icon|logo)([-_.]|$)/.test(name))return 45;
 if(/(^|[-_.])icon([-_.]|$)/.test(name)&&!/(arrow|close|menu|check|chevron|button|btn)/.test(name))return 30;
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

async function search(root,nativeImage){
 const unityGuid=await unityIconGuid(root),found=[],queue=[[root,0]];let entries=0;
 while(queue.length&&entries<MAX_ENTRIES){
  const [dir,depth]=queue.shift();let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   if(++entries>MAX_ENTRIES)break;
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(depth<MAX_DEPTH&&!SKIP.has(item.name)&&!item.name.startsWith('.')||item.name==='.github'&&depth<MAX_DEPTH)queue.push([full,depth+1]);continue;}
   if(!item.isFile()||!IMAGE.test(item.name))continue;
   const relative=path.relative(root,full);let value=score(relative);
   if(unityGuid&&value<100){try{const meta=await fs.readFile(full+'.meta','utf8');if(meta.includes('guid: '+unityGuid))value=100;}catch{}}
   if(value)found.push({full,value,depth});
  }
 }
 found.sort((a,b)=>b.value-a.value||a.depth-b.depth);
 for(const candidate of found.slice(0,12)){const value=await load(candidate.full,root,nativeImage);if(value)return value;}
 return '';
}

async function projectIcon(folder,nativeImage){
 if(!folder)return '';
 const saved=cache.get(folder);if(saved&&Date.now()-saved.at<TTL)return saved.value;
 let value='';
 try{
  const root=await fs.realpath(folder);
  quick:for(const dir of QUICK_DIRS)for(const name of QUICK_NAMES){value=await load(path.join(root,dir,name),root,nativeImage);if(value)break quick;}
  if(!value)value=await search(root,nativeImage);
 }catch{}
 cache.set(folder,{at:Date.now(),value});if(cache.size>100)cache.delete(cache.keys().next().value);return value;
}
// First icon found among the project's context folders (own folders come before inherited ones).
async function projectIconFrom(folders,nativeImage){for(const folder of folders||[]){const value=await projectIcon(folder,nativeImage);if(value)return value;}return '';}
module.exports={projectIcon,projectIconFrom,score};
