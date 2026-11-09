// Folders «Поиск файлов по смыслу» indexes: the company's project folders (setting fileSearchProject, on by
// default) and the folders the user added (fileSearchFolders, a JSON list of absolute paths).
const fs=require('node:fs');
const path=require('node:path');

function extra(settings){
 try{const list=JSON.parse(settings?.fileSearchFolders||'[]');return Array.isArray(list)?list.filter(p=>typeof p==='string'&&path.isAbsolute(p)):[];}catch{return [];}
}
// Local folders of every project of the company (not only the open chat's), so the background index does not
// depend on which chat is selected.
function project(s){
 const out=[];
 try{
  for(const p of s.dialogue?.state?.projects||[]){
   if(p.archived)continue;
   const memory=s.projectMemory?.get?.(p.memoryId);
   for(const f of require('../../project-folders.cjs').projectFolders(p,memory))out.push({path:f,project:p.name||''});
  }
 }catch{/* no projects */}
 return out;
}
const isDir=p=>{try{return fs.statSync(p).isDirectory();}catch{return false;}};
// [{path, project?, own, exists}] without duplicates.
function roots(s,{all=false}={}){
 const list=[...(s.settings?.fileSearchProject!=='false'?project(s).map(x=>({...x,own:false})):[]),...extra(s.settings).map(p=>({path:p,own:true}))];
 const seen=new Set(),out=[];
 for(const r of list){const key=path.resolve(r.path);if(seen.has(key))continue;seen.add(key);const exists=isDir(key);if(exists||all)out.push({...r,path:key,exists});}
 return out;
}
const configured=settings=>extra(settings).length>0||settings?.fileSearchProject!=='false';
function inside(s,file){
 const abs=path.resolve(String(file||''));
 return roots(s).some(r=>abs===r.path||abs.startsWith(r.path+path.sep));
}

module.exports={extra,project,roots,configured,inside};
