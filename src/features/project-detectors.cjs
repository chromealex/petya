// Project detectors: what kind of project a folder holds (a game engine's project, an app of some platform), told
// by the app that knows that kind, so Petya's generic project code (icon, version, onboarding guesses) names none.
// An app declares
//   "provides": { "project-detector": "<file>.cjs" }
// and the file exports {id, name?, async detect(dir) → bool, async icon?(project, {root, load, skip}),
// async rank?(root) → (async (file, value) → value) | null, async versions?(root) → [text]}:
// - `detect(dir)` — the folder is the root of such a project (reads only files inside it);
// - `icon(project, {root, load, skip})` — the project's own app icon, {value, file} or null; `load(file)` reads and
//   checks an image inside `root` (the folder the user gave), `skip` is the set of heavy folder names to pass by;
// - `rank(root)` — when `root` is such a project, a scorer for image files found by the generic icon search
//   (higher wins, 0 drops a file); null otherwise;
// - `versions(root)` — version lines the project declares («Версия …: 1.2.3»), for «какая версия проекта».
// Detectors only read the project's own files on disk, so they apply whether or not their app is added (an
// installed extension's detector only while it is added). A detector that throws is skipped.
const KIND='project-detector';
const registry=()=>require('../extension-registry.cjs');
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.id)||typeof p.detect!=='function'||['icon','rank','versions'].some(k=>p[k]!==undefined&&typeof p[k]!=='function')){
   const error=Error('Invalid project detector '+x.extension+'/'+x.file+': {id, detect(dir), icon?, rank?, versions?}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,origin:x.origin||'bundled',detector:p}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
// Bundled detectors always; an installed or development one only while its app is added (settings when known).
function list({detectors,settings}={}){
 let all=[];try{all=detectors||load();}catch{return [];}
 return all.filter(x=>x.origin==='bundled'||!x.setting||settings?.[x.setting]==='true');
}
const safe=async(work,fallback)=>{try{return await work();}catch{return fallback;}};
// Folders under `root` (itself included, up to `depth` levels down, at most `limit`) that `detector` recognises:
// a repository often holds the game one or two folders down («Client/», «Game/») next to its tools.
async function roots(x,root,{skip=new Set(),depth=2,limit=4}={}){
 const fs=require('node:fs/promises'),path=require('node:path');
 const out=[],queue=[[root,0]];
 while(queue.length&&out.length<limit){
  const [dir,level]=queue.shift();
  if(await safe(()=>x.detector.detect(dir),false)){out.push(dir);continue;}
  if(level>=depth)continue;let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items)if(item.isDirectory()&&!skip.has(item.name)&&!item.name.startsWith('.'))queue.push([path.join(dir,item.name),level+1]);
 }
 return out;
}
// The first app icon a detector finds for a project inside `root`, or null.
async function icon(root,{load:read,skip,detectors,settings}={}){
 for(const x of list({detectors,settings})){
  if(typeof x.detector.icon!=='function')continue;
  for(const project of await roots(x,root,{skip})){const found=await safe(()=>x.detector.icon(project,{root,load:read,skip}),null);if(found?.value)return found;}
 }
 return null;
}
// Scorers of the detectors that recognise `root`, chained: each gets the previous value.
async function ranker(root,{detectors,settings}={}){
 const scorers=[];
 for(const x of list({detectors,settings}))if(typeof x.detector.rank==='function'){const f=await safe(()=>x.detector.rank(root),null);if(typeof f==='function')scorers.push(f);}
 return scorers.length?async(file,value)=>{for(const f of scorers)value=await safe(()=>f(file,value),value);return value;}:null;
}
// Version lines all detectors read in `root`.
async function versions(root,{detectors,settings}={}){
 const out=[];
 for(const x of list({detectors,settings}))if(typeof x.detector.versions==='function'){const lines=await safe(()=>x.detector.versions(root),[]);for(const line of Array.isArray(lines)?lines:[])if(typeof line==='string'&&line.trim())out.push(line.trim().slice(0,200));}
 return out;
}
// Ids of the detectors that recognise `dir` itself.
async function detect(dir,{detectors,settings}={}){
 const out=[];for(const x of list({detectors,settings}))if(await safe(()=>x.detector.detect(dir),false))out.push(x.id);return out;
}
module.exports={KIND,load,list,roots,icon,ranker,versions,detect};
