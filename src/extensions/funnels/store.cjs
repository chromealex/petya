// «Воронки»: saved funnels per project, in the company folder (<dataRoot>/funnels.json). A saved funnel keeps its
// name and steps (events), so «воронка «Магазин»» later repeats exactly these steps.
const fs=require('node:fs'),path=require('node:path');
const MAX=40;
const file=root=>path.join(root,'funnels.json');
function read(root){
 if(!root)return {projects:{}};
 try{const v=JSON.parse(fs.readFileSync(file(root),'utf8'));return v&&typeof v==='object'&&v.projects&&typeof v.projects==='object'?v:{projects:{}};}catch{return {projects:{}};}
}
function write(root,data){
 if(!root)throw Error('Нет папки компании для сохранения воронки.');
 fs.mkdirSync(root,{recursive:true});
 const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,1),{mode:0o600});fs.renameSync(tmp,file(root));
}
// The project of the active chat (or the selected project), as other per-project apps resolve it.
function project(s){
 const state=s.dialogue?.state||{},topic=s.dialogue?.active?.();
 const id=topic?.projectId||state.activeProjectId||'general';
 const row=(state.projects||[]).find(p=>p.id===id);
 return {id,name:row?.name||(id==='general'?'Общий':'Проект')};
}
const clean=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,60);
function list(s){return (read(s.dataRoot).projects[project(s).id]||[]).slice();}
function find(s,name){const n=clean(name).toLowerCase();return n?list(s).find(f=>f.name.toLowerCase()===n)||null:null;}
function save(s,{name,steps,preset=null}){
 const n=clean(name);if(!n)throw Error('У воронки нет названия.');
 if(!Array.isArray(steps)||steps.length<2||steps.length>10)throw Error('В воронке должно быть от 2 до 10 шагов.');
 const clean2=steps.map(x=>({event:String(x.event||'').slice(0,80),label:String(x.label||x.event||'').slice(0,80)}));
 if(clean2.some(x=>!x.event))throw Error('У шага воронки нет события.');
 const data=read(s.dataRoot),p=project(s),rows=(data.projects[p.id]||[]).filter(f=>f.name.toLowerCase()!==n.toLowerCase());
 const row={id:require('node:crypto').randomUUID(),name:n,steps:clean2,preset,at:Date.now()};
 data.projects[p.id]=[row,...rows].slice(0,MAX);write(s.dataRoot,data);
 return {...row,project:p.name};
}
function remove(s,id){
 const data=read(s.dataRoot),p=project(s),rows=data.projects[p.id]||[];
 const next=rows.filter(f=>f.id!==id);if(next.length===rows.length)return false;
 data.projects[p.id]=next;write(s.dataRoot,data);return true;
}
module.exports={read,list,find,save,remove,project,file};
