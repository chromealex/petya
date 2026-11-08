// Skills that live in a project's own folder: <root>/skills/*/SKILL.md, .claude/skills, .agents/skills, .codex/skills
// and .petya/skills. They join the library only for chats of that project and are chosen like the built-in ones;
// their scripts run only in the isolated sandbox, after the user allows them (src/features/skill-runtime.cjs).
// A project skill with a built-in name gets a prefix.
const fs=require('node:fs'),path=require('node:path');
const {frontMatter,body}=require('./packages.cjs');
const PLACES=['skills','.claude/skills','.agents/skills','.codex/skills','.petya/skills'];
const NAME=/^[a-z][a-z0-9-]{0,63}$/;
const cache=new Map();
const walk=(dir,base=dir,depth=0)=>depth>4?[]:fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.name.startsWith('.')&&!e.isSymbolicLink()).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),base,depth+1):[path.relative(base,path.join(dir,e.name))]).slice(0,200);
function stamp(root){return PLACES.map(p=>{try{return fs.statSync(path.join(root,p)).mtimeMs;}catch{return 0;}}).join(':');}
function load(root,taken=new Set()){
 const key=root+'|'+stamp(root),hit=cache.get(root);if(hit?.key===key)return hit.skills;
 const skills=[];
 for(const place of PLACES){
  const dir=path.join(root,place);let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink());}catch{continue;}
  for(const entry of entries.slice(0,100)){
   const folder=path.join(dir,entry.name),file=path.join(folder,'SKILL.md');
   try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>200000)continue;
    const parsed=frontMatter(fs.readFileSync(file,'utf8'));if(!parsed?.name||!parsed.description)continue;
    let name=String(parsed.name).toLowerCase();if(!NAME.test(name))continue;
    if(taken.has(name)||skills.some(s=>s.name===name))name=('project-'+name).slice(0,64);
    const skill={name,original:parsed.name,source:'проект '+path.basename(root),folder,description:parsed.description.slice(0,500),english:parsed.description.slice(0,1000),raw:parsed.body,
     files:walk(folder).filter(f=>f!=='SKILL.md').sort(),builtin:false,project:true,package:true,enabled:true};
    Object.defineProperty(skill,'body',{get:()=>body(skill),enumerable:false});skills.push(skill);
   }catch{/* An unreadable skill folder is skipped. */}
  }
 }
 cache.set(root,{key,skills});return skills;
}
// The skills of every folder bound to a project.
function forProject(project,taken){const roots=require('../project-folders.cjs').projectFolders(project);return roots.flatMap(root=>{try{return load(root,taken);}catch{return [];}});}
module.exports={load,forProject,PLACES};
