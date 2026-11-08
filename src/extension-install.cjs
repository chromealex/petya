// Installing an external extension: a folder or a .zip is copied into a private staging folder, checked like a
// bundled extension (src/extension-registry.cjs validate) and described for the review dialog. Nothing is put
// into <userData>/extensions/<id>/ until the user confirms the review (`commit`).
// Archives are read without third-party code: only stored and deflated entries, no encryption, no symlinks,
// no absolute or `..` paths, no duplicate names, bounded sizes.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{randomUUID}=require('node:crypto');
const registry=require('./extension-registry.cjs');
const LIMIT={archive:20*1024*1024,bytes:50*1024*1024,file:20*1024*1024,files:1000,depth:6};
const SKIP=/(?:^|\/)(?:__MACOSX|\.DS_Store|\.git)(?:\/|$)/;
const SEGMENT=/^[\p{L}\p{N}_@+][\p{L}\p{N} ._@+()-]*$/u;
const tooBig='Расширение слишком большое: до '+LIMIT.files+' файлов и 50 МБ.';

// A relative path from an archive or a folder, as safe segments: never absolute, never `..`, no drive letters.
function clean(name){
 const text=String(name).replace(/\\/g,'/');
 if(text.startsWith('/')||/^[A-Za-z]:/.test(text)||text.includes('\0'))throw Error('Небезопасный путь в архиве: '+name);
 const parts=text.split('/').filter(p=>p&&p!=='.');
 if(!parts.length||parts.some(p=>p==='..'||!SEGMENT.test(p)))throw Error('Небезопасный путь в архиве: '+name);
 if(parts.length>LIMIT.depth+1)throw Error('Слишком глубокая вложенность в архиве: '+name);
 return parts.join('/');
}

// Every file of a zip archive: [{name, data}].
function unzip(bytes){
 if(bytes.length>LIMIT.archive)throw Error('Архив больше 20 МБ.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Это не zip-архив.');
 const count=bytes.readUInt16LE(end+10);let pos=bytes.readUInt32LE(end+16),total=0;
 if(count>LIMIT.files)throw Error(tooBig);
 const out=[],seen=new Set();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Повреждён архив.');
  const flags=bytes.readUInt16LE(pos+8),method=bytes.readUInt16LE(pos+10),size=bytes.readUInt32LE(pos+20),expanded=bytes.readUInt32LE(pos+24);
  const n=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32),attributes=bytes.readUInt32LE(pos+38),offset=bytes.readUInt32LE(pos+42);
  const raw=bytes.subarray(pos+46,pos+46+n).toString('utf8');pos+=46+n+extra+comment;
  if(SKIP.test(raw.replace(/\\/g,'/')))continue;
  // Unix mode in the high 16 bits: a symlink entry would point outside the extension once extracted.
  if(((attributes>>>16)&0o170000)===0o120000)throw Error('Символьная ссылка в архиве: '+raw);
  if(raw.endsWith('/')||raw.endsWith('\\'))continue;
  if(flags&1)throw Error('Архив зашифрован.');
  const name=clean(raw),key=name.toLowerCase();
  if(seen.has(key))throw Error('Повторяющийся файл в архиве: '+name);seen.add(key);
  if(expanded>LIMIT.file||(total+=expanded)>LIMIT.bytes)throw Error(tooBig);
  if(offset+30>bytes.length||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Повреждён архив.');
  const start=offset+30+bytes.readUInt16LE(offset+26)+bytes.readUInt16LE(offset+28);
  if(start+size>bytes.length)throw Error('Повреждён архив.');
  const body=bytes.subarray(start,start+size);
  let data;
  try{data=method===0?body:method===8?zlib.inflateRawSync(body,{maxOutputLength:LIMIT.file}):null;}catch{throw Error(tooBig);}
  if(!data)throw Error('Неподдерживаемое сжатие в архиве.');
  if(data.length!==expanded)throw Error('Повреждён архив.');
  out.push({name,data});
 }
 return out;
}

// Every file of a folder (symlinks refused): [{name, data}].
function readFolder(dir){
 const out=[];let total=0;
 const visit=(at,rel,depth)=>{
  if(depth>LIMIT.depth)throw Error('Слишком глубокая вложенность папок.');
  for(const e of fs.readdirSync(at,{withFileTypes:true})){
   const name=rel?rel+'/'+e.name:e.name;
   if(SKIP.test(name))continue;
   if(e.isSymbolicLink())throw Error('Символьная ссылка в папке расширения: '+name);
   if(e.isDirectory()){visit(path.join(at,e.name),name,depth+1);continue;}
   if(!e.isFile())continue;
   const data=fs.readFileSync(path.join(at,e.name));
   if(data.length>LIMIT.file||(total+=data.length)>LIMIT.bytes||out.length>=LIMIT.files)throw Error(tooBig);
   out.push({name:clean(name),data});
  }
 };
 visit(dir,'',0);
 return out;
}

// Copies the package into <root>/.staging/<token>/ and validates it. extension.json may sit at the top or one
// folder down (archives often wrap everything in a folder).
function stage(source,root){
 const stat=fs.statSync(source);
 const files=stat.isDirectory()?readFolder(source):/\.zip$/i.test(source)?unzip(fs.readFileSync(source)):null;
 if(!files)throw Error('Выберите папку расширения или .zip-архив.');
 const manifest=files.map(f=>f.name).filter(n=>/(?:^|\/)extension\.json$/.test(n)).sort((a,b)=>a.split('/').length-b.split('/').length)[0];
 if(!manifest)throw Error('В расширении нет extension.json.');
 if(manifest.split('/').length>2)throw Error('extension.json должен лежать в корне или в одной папке.');
 const prefix=manifest.slice(0,-'extension.json'.length);
 const token=randomUUID(),dir=path.join(root,'.staging',token,'package');
 try{
  let bytes=0,count=0;
  for(const f of files){
   if(!f.name.startsWith(prefix))continue;
   const out=path.join(dir,...f.name.slice(prefix.length).split('/'));
   if(!registry.inside(dir,out))throw Error('Небезопасный путь: '+f.name);
   fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,f.data,{mode:0o644});
   bytes+=f.data.length;count++;
  }
  let d;
  try{d=registry.validate(dir,{external:true});}
  catch(error){throw Error(error instanceof SyntaxError?'extension.json: '+error.message:error.message);}
  if(fs.existsSync(path.join(registry.BUNDLED,d.id)))throw Error('«'+d.id+'» — встроенное расширение Пети. Стороннее расширение не может его заменить: выберите другой id.');
  return {token,dir,descriptor:d,files:count,bytes,at:Date.now()};
 }catch(error){fs.rmSync(path.join(root,'.staging',token),{recursive:true,force:true});throw error;}
}

// 1.10.0 > 1.9.2; missing parts count as 0.
function compare(a,b){
 const x=String(a||'0').split('.').map(Number),y=String(b||'0').split('.').map(Number);
 for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}
 return 0;
}

// What the review dialog shows: everything the extension declares about itself, and what it replaces.
function review(staged,installed){
 const d=staged.descriptor,groups=registry.categories();
 const category=groups.categories.find(c=>c.id===d.category);
 const update=installed?{from:installed.version||'',to:d.version||'',order:compare(d.version,installed.version),origin:installed.origin}:null;
 return {token:staged.token,id:d.id,name:d.name,description:d.description,version:d.version||'',author:d.author||'',
  category:category?.name||d.category,hue:category?.hue??200,files:staged.files,bytes:staged.bytes,connects:d.connects||'',
  provides:Object.keys(d.provides||{}),uses:d.uses||[],
  downloads:(d.downloads||[]).map(i=>({name:i.name,bytes:typeof i.bytes==='object'?(i.bytes[process.platform]??Math.max(...Object.values(i.bytes))):i.bytes,optional:!!i.optional})),
  feature:!!d.feature,scripts:d.scripts.length,settings:!!d.settings,iconSvg:d.iconSvg||'',update};
}

// Moves the reviewed package into place, keeping the previous copy until the new one is in.
function commit(staged,root){
 const target=path.join(root,staged.descriptor.id);
 const old=fs.existsSync(target)?path.join(root,'.staging','replaced-'+staged.token):null;
 if(old)fs.renameSync(target,old);
 try{fs.renameSync(staged.dir,target);}
 catch(error){if(old)fs.renameSync(old,target);throw error;}
 if(old)fs.rmSync(old,{recursive:true,force:true});
 discard(staged,root);
 return target;
}
function discard(staged,root){fs.rmSync(path.join(root,'.staging',staged.token),{recursive:true,force:true});}
// Leftovers of interrupted installs.
function sweep(root){try{fs.rmSync(path.join(root,'.staging'),{recursive:true,force:true});}catch{}}

module.exports={LIMIT,clean,unzip,readFolder,stage,review,commit,discard,sweep,compare};
