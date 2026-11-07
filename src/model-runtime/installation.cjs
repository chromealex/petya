// Internal resolver: the application supplies a reviewed, bundled release catalog.
// Catalog entries and the runtime executable must never come from IPC/MCP arguments.
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inside=(root,target)=>{const relative=path.relative(root,target);return relative!==''&&!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
function createInstallationResolver({installRoot,runtimePython,releases,model='petya-v1',platform=process.platform,arch=process.arch}){
 if(!path.isAbsolute(installRoot||'')||!path.isAbsolute(runtimePython||'')||!Array.isArray(releases))throw Error('Неверная конфигурация установки модели.');
 // Snapshot trusted metadata so later caller mutations cannot change release selection.
 const catalog=JSON.parse(JSON.stringify(releases));
 const keys=new Set();
 for(const entry of catalog){
  if(!entry||Object.keys(entry).sort().join(',')!=='arch,digest,directory,evidenceSha256,manifestSha256,model,platform'||
     typeof entry.directory!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(entry.directory)||
     typeof entry.model!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(entry.model)||
     !['darwin','win32','linux'].includes(entry.platform)||!['arm64','x64'].includes(entry.arch)||
     ![entry.digest,entry.manifestSha256,entry.evidenceSha256].every(digest))throw Error('Неверный каталог выпусков модели.');
  const key=JSON.stringify([entry.model,entry.platform,entry.arch]);
  if(keys.has(key))throw Error('Неоднозначный каталог выпусков модели.');keys.add(key);
 }
 return async function resolveInstallation({signal}={}){
  signal?.throwIfAborted();
  const entry=catalog.find(item=>item.model===model&&item.platform===platform&&item.arch===arch);
  if(!entry)throw Error('Проверенный выпуск модели для этой системы пока недоступен.');
  const root=await fs.realpath(installRoot);
  async function confined(relative,type){
   signal?.throwIfAborted();
   const target=await fs.realpath(path.join(root,relative));
   if(!inside(root,target))throw Error('Файлы модели находятся вне папки установки.');
   const stat=await fs.stat(target);
   if(type==='directory'?!stat.isDirectory():!stat.isFile())throw Error('Неполная установка модели.');
   return {target,stat};
  }
  const directory=await confined(entry.directory,'directory');
  async function pinned(name,expected){
   const file=await confined(path.join(entry.directory,name),'file');
   if(!inside(directory.target,file.target)||file.stat.size>1024*1024)throw Error('Неверные метаданные выпуска модели.');
   const bytes=await fs.readFile(file.target,{signal});
   if(bytes.length>1024*1024||hash(bytes)!==expected)throw Error('Установка не соответствует проверенному выпуску модели.');
   return {target:file.target,bytes};
  }
  const manifest=await pinned('manifest.json',entry.manifestSha256);
  // The pinned evidence is reviewed before catalog admission. Hash equality is not quality evaluation.
  await pinned('release-evidence.json',entry.evidenceSha256);
  const metadata=JSON.parse(manifest.bytes.toString('utf8'));
  if(metadata.name!==model||metadata.qualification!=='release')throw Error('Экспериментальная модель не допущена к выпуску.');
  const base=await confined(path.join(entry.directory,'base'),'directory');
  const adapter=await confined(path.join(entry.directory,'adapter'),'directory');
  if(!inside(directory.target,base.target)||!inside(directory.target,adapter.target))throw Error('Файлы относятся к другой установке модели.');
  if(!(await fs.stat(runtimePython)).isFile())throw Error('Среда модели не установлена.');
  await fs.access(runtimePython,fs.constants.X_OK);
  signal?.throwIfAborted();
  return {python:runtimePython,config:{manifest:manifest.target,base:base.target,adapter:adapter.target,model,digest:entry.digest,allow_development:false}};
 };
}
module.exports={createInstallationResolver};
