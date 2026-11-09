// «Идеи для ивентов»: the project's own events — planned ones (after «Создать задачу» or «Сохранить в план») and past
// ones the user recorded — in the company folder (<dataRoot>/event-ideas.json, mode 600), per project. A planned event
// whose dates have passed becomes a past event: its metrics are read for the next ideas.
const fs=require('node:fs'),path=require('node:path');
const MAX=60;
const file=root=>path.join(root,'event-ideas.json');
function read(root){
 if(!root)return {projects:{}};
 try{const v=JSON.parse(fs.readFileSync(file(root),'utf8'));return v&&v.projects&&typeof v.projects==='object'?v:{projects:{}};}catch{return {projects:{}};}
}
function write(root,data){
 if(!root)throw Error('Нет папки компании для сохранения ивента.');
 fs.mkdirSync(root,{recursive:true});
 const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,1),{mode:0o600});fs.renameSync(tmp,file(root));
}
function project(s){
 const state=s.dialogue?.state||{},topic=s.dialogue?.active?.();
 const id=topic?.projectId||state.activeProjectId||'general';
 return {id,name:(state.projects||[]).find(p=>p.id===id)?.name||(id==='general'?'Общий':'Проект')};
}
const DATE=/^\d{4}-\d{2}-\d{2}$/;
function list(s){return (read(s.dataRoot).projects[project(s).id]||[]).slice();}
function save(s,ev){
 const name=String(ev.name||'').replace(/\s+/g,' ').trim().slice(0,80);
 if(!name||!DATE.test(ev.start)||!DATE.test(ev.end)||ev.end<ev.start)throw Error('У ивента нет названия или дат.');
 const data=read(s.dataRoot),p=project(s);
 const rows=(data.projects[p.id]||[]).filter(x=>!(x.name.toLowerCase()===name.toLowerCase()&&x.start===ev.start));
 const row={id:require('node:crypto').randomUUID(),name,start:ev.start,end:ev.end,mechanic:ev.mechanic||null,holiday:ev.holiday||null,planned:!!ev.planned,at:Date.now()};
 data.projects[p.id]=[row,...rows].slice(0,MAX);write(s.dataRoot,data);
 return {...row,project:p.name};
}
module.exports={read,list,save,project,file};
