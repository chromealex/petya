// Skill packages imported from public repositories (anthropics/skills, mattpocock/skills): a folder with SKILL.md
// and its own files — references, scripts, templates, fonts, licences. Petya picks them like the built-in skills by
// a Russian description (ru.json) and gives the model the SKILL.md instructions plus the package's reference texts
// and a list of its files. Scripts are not run from here.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.join(__dirname,'packages');
const NAME=/^[a-z][a-z0-9-]{0,63}$/;
// Names already taken by Petya's own skills get the author's prefix.
const RENAME={'mattpocock:code-review':'matt-code-review','mattpocock:retro':'matt-retro'};
// SKILL.md front matter: name and description (plain, quoted, or a > / | block); other fields are ignored.
function frontMatter(markdown){
 const m=String(markdown).replace(/^﻿/,'').replace(/\r\n/g,'\n').match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
 if(!m)return null;
 const fields={};let block=null;
 for(const line of m[1].split('\n')){
  if(block&&(/^\s+\S/.test(line)||!line.trim())){fields[block]+=(fields[block]&&line.trim()?' ':'')+line.trim();continue;}
  block=null;
  const f=/^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);if(!f)continue;
  let value=f[2].trim();
  if(/^[>|][-+]?$/.test(value)){block=f[1];fields[block]='';continue;}
  if(/^".*"$/.test(value)){try{value=JSON.parse(value);}catch{value=value.slice(1,-1);}}
  else if(/^'.*'$/.test(value))value=value.slice(1,-1).replace(/''/g,"'");
  fields[f[1]]=value;
 }
 return {name:fields.name,description:String(fields.description||'').trim(),body:m[2].trim()};
}
const walk=(dir,base=dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),base):[path.relative(base,path.join(dir,e.name))]);
let cache=null;
function packages(){
 if(cache)return cache;
 const ru=JSON.parse(fs.readFileSync(path.join(ROOT,'ru.json'),'utf8'));
 const out=[];
 for(const source of fs.readdirSync(ROOT,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort()){
  for(const dir of fs.readdirSync(path.join(ROOT,source),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort()){
   const folder=path.join(ROOT,source,dir),file=path.join(folder,'SKILL.md');if(!fs.existsSync(file))continue;
   const parsed=frontMatter(fs.readFileSync(file,'utf8'));if(!parsed?.name)continue;
   const name=RENAME[source+':'+parsed.name]||parsed.name;if(!NAME.test(name))continue;
   const skill={name,original:parsed.name,source,folder,description:String(ru[name]||parsed.description).slice(0,500),english:parsed.description.slice(0,1000),raw:parsed.body,
    files:walk(folder).filter(f=>f!=='SKILL.md').sort(),builtin:true,package:true,enabled:true};
   Object.defineProperty(skill,'body',{get:()=>body(skill),enumerable:false});out.push(skill);
  }
 }
 return cache=out;
}
// The full instructions of a package: SKILL.md, every reference text it mentions and the list of its files.
// Nothing is cut here; src/skill-library/context.cjs fits them to one request.
const TEXT=/\.(?:md|txt)$/i;
const bodies=new WeakMap();
function body(skill){
 if(bodies.has(skill))return bodies.get(skill);
 let text=skill.raw;
 const refs=skill.files.filter(f=>TEXT.test(f)&&!/licen[cs]e|notice/i.test(f)&&(skill.raw.includes(f)||skill.raw.includes(path.basename(f))));
 for(const f of refs){try{text+='\n\n## Файл '+f+'\n'+fs.readFileSync(path.join(skill.folder,f),'utf8');}catch{/* A missing reference is listed, not invented. */}}
 if(skill.files.length)text+='\n\nФайлы навыка (в папке '+skill.source+'/'+skill.original+'): '+skill.files.filter(f=>!/\.(?:ttf|otf|xsd)$/i.test(f)).join(', ')+'.'+require('./scripts.cjs').note(skill);
 text+='\n\nИсточник: '+skill.source+' (лицензия в папке навыка). Отвечай по-русски, если пользователь пишет по-русски.';
 bodies.set(skill,text);return text;
}
module.exports={packages,frontMatter,body,ROOT};
