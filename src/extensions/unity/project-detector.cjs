// Unity projects for Petya's generic project code (src/features/project-detectors.cjs): a folder with
// ProjectSettings/ProjectSettings.asset is a Unity project; its icon is the default player icon referenced by GUID
// in ProjectSettings.asset; its version is bundleVersion. Reads only files inside the project.
const fs=require('node:fs/promises'),path=require('node:path');
const IMAGE=/\.(png|jpe?g|webp)$/i;
const settingsFile=root=>path.join(root,'ProjectSettings','ProjectSettings.asset');
async function detect(dir){try{await fs.access(settingsFile(dir));return true;}catch{return false;}}
// The GUID of the default player icon (m_BuildTargetIcons → first m_Icon), or ''.
async function iconGuid(root){
 try{const text=await fs.readFile(settingsFile(root),'utf8');return text.match(/m_BuildTargetIcons:[\s\S]*?m_Icon:\s*\{fileID:\s*\d+,\s*guid:\s*([0-9a-f]{32})/)?.[1]||'';}catch{return '';}
}
// The image under Assets whose .meta has that GUID; folders named like icons are looked at first; at most 4000
// .meta files are read.
async function icon(project,{load,skip=new Set()}){
 const guid=await iconGuid(project);if(!guid)return null;
 const queue=[[path.join(project,'Assets'),0]];let entries=0,reads=0;
 while(queue.length&&entries<40000&&reads<4000){
  const [dir,depth]=queue.shift();let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   if(++entries>40000)break;const full=path.join(dir,item.name);
   if(item.isDirectory()){if(depth<8&&!skip.has(item.name)&&!item.name.startsWith('.')){const next=[full,depth+1];if(/icon/i.test(item.name))queue.unshift(next);else queue.push(next);}continue;}
   if(!item.isFile()||!IMAGE.test(item.name))continue;
   reads++;let meta='';try{meta=await fs.readFile(full+'.meta','utf8');}catch{}
   if(meta.includes('guid: '+guid)){const value=await load(full);if(value)return {value,file:full};}
  }
 }
 return null;
}
// In a Unity project the player icon wins, an app icon by its usual name stays, everything else is game art.
async function rank(root){
 const guid=await iconGuid(root),unity=await detect(root);
 if(!guid&&!unity)return null;
 return async(file,value)=>{
  if(guid&&value<100){try{const meta=await fs.readFile(file+'.meta','utf8');if(meta.includes('guid: '+guid))value=100;}catch{}}
  if(unity&&value<85)value=0;
  return value;
 };
}
async function versions(root){
 try{const text=await fs.readFile(settingsFile(root),'utf8');const m=text.match(/^\s*bundleVersion:\s*(.+)$/m);return m?['Версия Unity (bundleVersion): '+m[1].trim()]:[];}catch{return [];}
}
module.exports={id:'unity',name:'Unity',detect,icon,rank,versions};
