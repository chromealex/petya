// «Генератор уровней»: what is remembered per company (<dataRoot>/rts-levels.json): the RTS project folder chosen
// for each Petya project, and map drafts as recipes (so card buttons keep working after a restart).
const fs=require('node:fs'),path=require('node:path');
const MAX_DRAFTS=40;
const file=root=>path.join(root,'rts-levels.json');
function read(root){
 if(!root)return {projects:{},drafts:{}};
 try{const v=JSON.parse(fs.readFileSync(file(root),'utf8'));return {projects:v?.projects&&typeof v.projects==='object'?v.projects:{},drafts:v?.drafts&&typeof v.drafts==='object'?v.drafts:{}};}
 catch{return {projects:{},drafts:{}};}
}
function write(root,data){
 if(!root)return;
 fs.mkdirSync(root,{recursive:true});
 const ids=Object.keys(data.drafts).sort((a,b)=>(data.drafts[b].at||0)-(data.drafts[a].at||0));
 for(const id of ids.slice(MAX_DRAFTS))delete data.drafts[id];
 const tmp=file(root)+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,1),{mode:0o600});fs.renameSync(tmp,file(root));
}
// The Petya project of the active chat (or the selected one).
function project(s){
 const state=s.dialogue?.state||{},topic=s.dialogue?.active?.();
 const id=topic?.projectId||state.activeProjectId||'general';
 const row=(state.projects||[]).find(p=>p.id===id);
 return {id,name:row?.name||(id==='general'?'Общий':'Проект'),row};
}
const isGame=dir=>{try{return fs.statSync(path.join(dir,'game.json')).isFile();}catch{return false;}};
// The folder to use: the one chosen for this Petya project, else a folder of the Petya project that is an RTS project.
function folder(s){
 const p=project(s),saved=read(s.dataRoot).projects[p.id]?.folder;
 if(saved&&isGame(saved))return saved;
 for(const dir of projectFolders(s))if(isGame(dir))return dir;
 return '';
}
function projectFolders(s){
 const p=project(s);if(!p.row)return [];
 try{return require('../../project-folders.cjs').projectFolders(p.row,s.projectMemory?.get?.(p.row.memoryId)).filter(Boolean);}catch{return [];}
}
function setFolder(s,dir){
 const full=path.resolve(String(dir||'').trim().replace(/^~(?=$|[\\/])/,require('node:os').homedir()));
 if(!isGame(full))throw Error('В этой папке нет game.json — это не проект RTS-движка.');
 const data=read(s.dataRoot),p=project(s);
 data.projects[p.id]={folder:full,at:Date.now()};write(s.dataRoot,data);
 return full;
}
function getDraft(s,id){const d=read(s.dataRoot).drafts[String(id)];return d?{...d}:null;}
function putDraft(s,draft){const data=read(s.dataRoot);const {kinds,generated,...rest}=draft;data.drafts[draft.id]={...rest,kinds,generated,at:Date.now()};write(s.dataRoot,data);}
function dropDraft(s,id){const data=read(s.dataRoot);delete data.drafts[String(id)];write(s.dataRoot,data);}
module.exports={read,write,project,folder,setFolder,projectFolders,isGame,getDraft,putDraft,dropDraft,file};
