// Unpacks an engine package (.zip from the engine's `builds` branch) with Node only, so no system unzip is needed on
// macOS or Windows. Stored and deflated entries; refuses absolute paths, `..`, drive letters, symlinks, duplicates,
// encryption and archives bigger than the limits. Unix permission bits from the archive are kept (the engine's
// tools are executables).
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const zlib=require('node:zlib');

const LIMITS={packed:400*1024*1024,unpacked:1536*1024*1024,files:20000,entry:512*1024*1024};

function entries(buf){
 let end=-1;
 for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Архив движка повреждён: нет оглавления ZIP.');
 const count=buf.readUInt16LE(end+10);let off=buf.readUInt32LE(end+16);
 if(count===0xffff||off===0xffffffff)throw Error('Архив движка в формате ZIP64 не поддерживается.');
 const list=[];
 for(let n=0;n<count;n++){
  if(buf.readUInt32LE(off)!==0x02014b50)throw Error('Архив движка повреждён: неверная запись оглавления.');
  const flags=buf.readUInt16LE(off+8),method=buf.readUInt16LE(off+10),packed=buf.readUInt32LE(off+20),size=buf.readUInt32LE(off+24);
  const nameLen=buf.readUInt16LE(off+28),extraLen=buf.readUInt16LE(off+30),commentLen=buf.readUInt16LE(off+32);
  const madeBy=buf.readUInt16LE(off+4)>>8,external=buf.readUInt32LE(off+38),local=buf.readUInt32LE(off+42);
  const name=buf.toString(flags&0x800?'utf8':'latin1',off+46,off+46+nameLen);
  list.push({name,flags,method,packed,size,local,mode:madeBy===3?(external>>>16)&0xffff:0});
  off+=46+nameLen+extraLen+commentLen;
 }
 return list;
}
// The relative path an entry unpacks to, or an error for anything that could leave the target folder.
function safeName(name){
 const clean=name.replace(/\\/g,'/');
 if(!clean||clean.startsWith('/')||/^[a-z]:/i.test(clean)||clean.split('/').some(p=>p==='..'))throw Error('Небезопасный путь в архиве движка: '+name);
 if(/[\0]/.test(clean))throw Error('Небезопасное имя в архиве движка.');
 return clean;
}
function data(buf,e){
 if(buf.readUInt32LE(e.local)!==0x04034b50)throw Error('Архив движка повреждён: неверный локальный заголовок.');
 const start=e.local+30+buf.readUInt16LE(e.local+26)+buf.readUInt16LE(e.local+28);
 const raw=buf.subarray(start,start+e.packed);
 if(e.method===0)return raw;
 if(e.method===8)return zlib.inflateRawSync(raw,{maxOutputLength:LIMITS.entry});
 throw Error('Неизвестное сжатие в архиве движка (метод '+e.method+').');
}
// Extracts `zip` into `dir` (which must exist). `progress(done, total)` per file; `signal` stops between files.
async function extract(zip,dir,{signal,progress=()=>{},limits=LIMITS}={}){
 const stat=await fsp.stat(zip);
 if(stat.size>limits.packed)throw Error('Архив движка больше ожидаемого.');
 const buf=await fsp.readFile(zip);
 const list=entries(buf);
 if(list.length>limits.files)throw Error('В архиве движка слишком много файлов.');
 const seen=new Set();let total=0;
 for(const e of list){
  e.rel=safeName(e.name);
  const key=e.rel.replace(/\/$/,'').toLowerCase();
  if(seen.has(key))throw Error('В архиве движка повторяется файл: '+e.name);seen.add(key);
  if(e.flags&1)throw Error('Архив движка зашифрован.');
  if((e.mode&0o170000)===0o120000)throw Error('В архиве движка есть символическая ссылка: '+e.name);
  total+=e.size;
 }
 if(total>limits.unpacked)throw Error('Распакованный движок больше ожидаемого.');
 const root=path.resolve(dir);
 let done=0;
 for(const e of list){
  signal?.throwIfAborted();
  const target=path.resolve(root,e.rel);
  if(target!==root&&!target.startsWith(root+path.sep))throw Error('Небезопасный путь в архиве движка: '+e.name);
  if(e.rel.endsWith('/')){await fsp.mkdir(target,{recursive:true});}
  else{
   await fsp.mkdir(path.dirname(target),{recursive:true});
   const bytes=data(buf,e);
   if(bytes.length!==e.size)throw Error('Архив движка повреждён: размер файла '+e.name+' не совпадает.');
   const mode=e.mode&0o111?0o755:0o644;
   await fsp.writeFile(target,bytes,{flag:'wx',mode});
   if(process.platform!=='win32')await fsp.chmod(target,mode);
  }
  progress(++done,list.length);
 }
 return {files:done,bytes:total};
}
module.exports={extract,entries,safeName,LIMITS};
