// «Конвертер»: Petya's own static ffmpeg, downloaded only when the user agrees. Every archive is pinned: an exact
// URL of a fixed release and its SHA-256; a download that does not match is thrown away. Sources:
//  - Windows x64: gyan.dev «essentials» release build (the build linked from ffmpeg.org/download.html for Windows),
//    https://www.gyan.dev/ffmpeg/builds/ — versioned package 8.1.2, SHA-256 from its published .sha256 file.
//  - macOS arm64 / x64: Martin Riedl's FFmpeg build server (static, per-architecture release builds),
//    https://ffmpeg.martin-riedl.de/ — release 9.0.2. Its .sha256 values could not be read from the build
//    environment (robots-protected), so they are left to pin: until `sha256` is filled the Mac download is refused
//    and Petya suggests Homebrew. `node src/extensions/converter/pin-ffmpeg.cjs` prints the values to paste.
const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFile}=require('node:child_process');
const exec=require('node:util').promisify(execFile);
const {pipeline}=require('node:stream/promises');

const VERSION={win32:'8.1.2',darwin:'9.0.2'};
// `bytes`: exact size when known, otherwise `max` caps the download. Each item: archive with ffmpeg (and ffprobe).
const SOURCES={
 'win32-x64':[{url:'https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip',sha256:'db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec',bytes:null,max:160e6,approx:109e6}],
 'darwin-arm64':[
  {url:'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffmpeg.zip',sha256:null,bytes:null,max:80e6,approx:35e6},
  {url:'https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2/ffprobe.zip',sha256:null,bytes:null,max:80e6,approx:35e6,optional:true}],
 'darwin-x64':[
  {url:'https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2/ffmpeg.zip',sha256:null,bytes:null,max:80e6,approx:34e6},
  {url:'https://ffmpeg.martin-riedl.de/download/macos/amd64/1789931006_9.0.2/ffprobe.zip',sha256:null,bytes:null,max:80e6,approx:34e6,optional:true}]
};
const key=(platform=process.platform,arch=process.arch)=>platform+'-'+arch;
const sources=(platform,arch)=>SOURCES[key(platform,arch)]||null;
// Where Petya keeps its ffmpeg: <userData>/converter/ffmpeg-<version>/.
const folder=(userData,platform=process.platform)=>path.join(userData,'converter','ffmpeg-'+(VERSION[platform]||'none'));
const exe=platform=>platform==='win32'?'.exe':'';
const installed=(userData,platform=process.platform)=>{try{const f=path.join(folder(userData,platform),'ffmpeg'+exe(platform));return fs.statSync(f).size>0;}catch{return false;}};

async function download(item,file,{signal,progress,fetchImpl=fetch}){
 const response=await fetchImpl(item.url,{signal,redirect:'follow'});
 if(!response.ok||!response.body)throw Error('Не удалось скачать ffmpeg (HTTP '+response.status+').');
 const total=Number(response.headers.get('content-length'))||item.bytes||item.approx||0;
 const limit=item.bytes||item.max;
 if(total>limit)throw Error('Размер загрузки ffmpeg больше ожидаемого — загрузка остановлена.');
 const hash=createHash('sha256');let bytes=0;
 await pipeline(response.body,async function*(chunks){for await(const chunk of chunks){bytes+=chunk.length;if(bytes>limit)throw Error('Размер загрузки ffmpeg больше ожидаемого — загрузка остановлена.');hash.update(chunk);progress(bytes,total);yield chunk;}},fs.createWriteStream(file,{flags:'wx',mode:0o600}),{signal});
 if(item.bytes&&bytes!==item.bytes||hash.digest('hex')!==item.sha256)throw Error('Архив ffmpeg не прошёл проверку целостности (SHA-256). Файл удалён, повторите позже.');
 return bytes;
}
async function extract(zip,dir,platform,signal){
 if(platform==='win32')await exec(path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe'),['-xf',zip,'-C',dir],{signal,windowsHide:true});
 else await exec('/usr/bin/ditto',['-x','-k',zip,dir],{signal});
}
function findBinary(dir,name,depth=0){
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,e.name);
  if(e.isFile()&&e.name.toLowerCase()===name)return full;
  if(e.isDirectory()&&depth<4){const hit=findBinary(full,name,depth+1);if(hit)return hit;}
 }
 return null;
}
// Downloads, checks, unpacks and verifies (`ffmpeg -version`) into a staging folder, then moves it in place.
// `confirm(bytes)` asks the user; `status(text, fraction)` reports progress.
async function install({userData,platform=process.platform,arch=process.arch,signal,confirm,status=()=>{},fetchImpl,unpack=extract,verify}){
 const items=sources(platform,arch);
 if(!items)throw Error('Автозагрузка ffmpeg есть для macOS и Windows x64. Установите ffmpeg вручную и повторите.');
 if(items.some(i=>!i.optional&&!i.sha256))throw Error('Загрузка ffmpeg для этого компьютера ещё не закреплена в Пете (нет проверенной контрольной суммы). Установите ffmpeg сами: на Mac — «brew install ffmpeg», затем повторите.');
 const wanted=items.filter(i=>i.sha256);
 const total=wanted.reduce((a,i)=>a+(i.bytes||i.approx),0);
 if(!await confirm(total))throw Object.assign(Error('Загрузка ffmpeg отменена.'),{cancelled:true});
 signal?.throwIfAborted();
 const target=folder(userData,platform),root=path.dirname(target);
 await fsp.mkdir(root,{recursive:true,mode:0o700});
 const space=await fsp.statfs(root).catch(()=>null);
 if(space&&space.bavail*space.bsize<total*3)throw Error('Освободите хотя бы '+Math.ceil(total*3/1e6)+' МБ для ffmpeg.');
 const staging=await fsp.mkdtemp(path.join(root,'install-'));
 try{
  let done=0;
  for(const [i,item] of wanted.entries()){
   const zip=path.join(staging,'part-'+i+'.zip');
   const before=done;
   done+=await download(item,zip,{signal,fetchImpl,progress:(bytes)=>status('Скачиваю ffmpeg',Math.min(0.95,(before+bytes)/total))});
   status('Распаковываю ffmpeg',0.96);
   const out=path.join(staging,'part-'+i);await fsp.mkdir(out);
   await unpack(zip,out,platform,signal);await fsp.unlink(zip);
  }
  const bin=path.join(staging,'bin');await fsp.mkdir(bin);
  for(const name of ['ffmpeg','ffprobe']){
   const found=findBinary(staging,name+exe(platform));
   if(!found){if(name==='ffprobe')continue;throw Error('В архиве не нашёлся ffmpeg.');}
   await fsp.copyFile(found,path.join(bin,name+exe(platform)));await fsp.chmod(path.join(bin,name+exe(platform)),0o755);
  }
  status('Проверяю ffmpeg',0.99);
  await (verify||(file=>exec(file,['-version'],{signal,windowsHide:true,timeout:30000})))(path.join(bin,'ffmpeg'+exe(platform))).catch(cause=>{signal?.throwIfAborted();throw Error('Скачанный ffmpeg не запустился на этом компьютере.',{cause});});
  await fsp.rm(target,{recursive:true,force:true});
  await fsp.rename(bin,target);
  return {folder:target,version:VERSION[platform]};
 }finally{await fsp.rm(staging,{recursive:true,force:true});}
}
module.exports={SOURCES,VERSION,sources,folder,installed,install,download,key};
