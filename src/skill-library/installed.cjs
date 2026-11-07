// Skills the user installed with their files: a folder or a .zip / .skill archive with SKILL.md and its
// references, scripts, templates and settings. They are kept in <userData>/skill-packages/<name>/ and chosen like
// the built-in skills; their files are listed to the model, scripts are not run from here.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {frontMatter,body}=require('./packages.cjs');
const NAME=/^[a-z][a-z0-9-]{0,63}$/,LIMIT={files:500,bytes:50*1024*1024,file:20*1024*1024};
let cache=null;
const walk=(dir,base=dir,depth=0)=>depth>6?[]:fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.isSymbolicLink()).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name),base,depth+1):[path.relative(base,path.join(dir,e.name))]);
function list(root){
 if(cache?.root===root&&cache.stamp===stamp(root))return cache.skills;
 const skills=[];let entries=[];try{entries=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory());}catch{}
 for(const e of entries){const folder=path.join(root,e.name),file=path.join(folder,'SKILL.md');try{const parsed=frontMatter(fs.readFileSync(file,'utf8'));if(!parsed?.name||!NAME.test(e.name))continue;
  const skill={name:e.name,original:parsed.name,source:'установлен',folder,description:String(parsed.description||'').slice(0,500),english:String(parsed.description||'').slice(0,1000),raw:parsed.body,
   files:walk(folder).filter(f=>f!=='SKILL.md').sort(),builtin:false,installed:true,package:true,enabled:true};
  Object.defineProperty(skill,'body',{get:()=>body(skill),enumerable:false});skills.push(skill);}catch{}}
 cache={root,stamp:stamp(root),skills};return skills;
}
function stamp(root){try{return fs.statSync(root).mtimeMs+':'+fs.readdirSync(root).length;}catch{return '0';}}
// Every file of a zip archive (stored or deflated), with safe relative paths.
function unzip(bytes){
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Это не zip-архив скилла.');const count=bytes.readUInt16LE(end+10);let pos=bytes.readUInt32LE(end+16),total=0;if(count>LIMIT.files*2)throw Error('В архиве слишком много файлов.');
 const out=[];
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Повреждён архив скилла.');
  const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),size=bytes.readUInt32LE(pos+20),expanded=bytes.readUInt32LE(pos+24),n=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),offset=bytes.readUInt32LE(pos+42),name=bytes.subarray(pos+46,pos+46+n).toString('utf8');pos+=46+n+extra+comment;
  if(name.endsWith('/')||/(?:^|\/)(?:__MACOSX|\.DS_Store)(?:\/|$)/.test(name))continue;if(flags&1)throw Error('Архив зашифрован.');
  const clean=path.posix.normalize(name.replace(/\\/g,'/'));if(clean.startsWith('../')||path.posix.isAbsolute(clean))throw Error('Небезопасный путь в архиве: '+name);
  if(expanded>LIMIT.file||(total+=expanded)>LIMIT.bytes||out.length>=LIMIT.files)throw Error('Скилл слишком большой (до 500 файлов и 50 МБ).');
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28),raw=bytes.subarray(start,start+size);
  const data=method===0?raw:method===8?zlib.inflateRawSync(raw,{maxOutputLength:LIMIT.file}):null;if(!data)throw Error('Неподдерживаемое сжатие в архиве.');
  out.push({name:clean,data});
 }
 return out;
}
function readFolder(dir){const files=walk(dir);if(files.length>LIMIT.files)throw Error('Скилл слишком большой (до 500 файлов).');let total=0;
 return files.filter(f=>!/(?:^|\/)(?:\.git|node_modules|\.DS_Store)(?:\/|$)/.test(f)).map(f=>{const data=fs.readFileSync(path.join(dir,f));if((total+=data.length)>LIMIT.bytes)throw Error('Скилл слишком большой (до 50 МБ).');return {name:f.split(path.sep).join('/'),data};});}
// Installs from a folder or an archive; SKILL.md may sit at the top or one folder down.
function install(root,source,taken=new Set()){
 const files=fs.statSync(source).isDirectory()?readFolder(source):unzip(fs.readFileSync(source));
 const skillFile=files.map(f=>f.name).filter(n=>/(?:^|\/)SKILL\.md$/.test(n)).sort((a,b)=>a.split('/').length-b.split('/').length)[0];
 if(!skillFile)throw Error('В скилле нет SKILL.md.');if(skillFile.split('/').length>2)throw Error('SKILL.md должен лежать в корне или в одной папке.');
 const prefix=skillFile.slice(0,-'SKILL.md'.length),parsed=frontMatter(files.find(f=>f.name===skillFile).data.toString('utf8'));
 if(!parsed?.name||!parsed.description)throw Error('В SKILL.md нужны name и description.');
 let name=String(parsed.name).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64);if(!NAME.test(name))throw Error('Имя скилла: латиница, цифры и дефис.');
 if(taken.has(name))name=('my-'+name).slice(0,64);
 const target=path.join(root,name),temp=target+'.tmp-'+process.pid;fs.rmSync(temp,{recursive:true,force:true});
 for(const f of files){if(!f.name.startsWith(prefix))continue;const rel=f.name.slice(prefix.length);const out=path.join(temp,...rel.split('/'));if(!out.startsWith(temp+path.sep))throw Error('Небезопасный путь.');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,f.data,{mode:/\.(?:sh|py|js|rb|pl)$/.test(rel)?0o700:0o600});}
 fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(root,{recursive:true});fs.renameSync(temp,target);cache=null;
 return list(root).find(s=>s.name===name);
}
function remove(root,name){if(!NAME.test(name))throw Error('Некорректное имя скилла.');fs.rmSync(path.join(root,name),{recursive:true,force:true});cache=null;return list(root);}
module.exports={list,install,remove,unzip};
