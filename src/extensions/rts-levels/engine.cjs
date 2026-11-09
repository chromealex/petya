// «Генератор уровней»: where the RTS engine (rtsmcp, the editor) is on this computer, and Petya's own copy of it.
// An engine the user already has always wins and nothing is downloaded: the folder or rtsmcp set in settings, an
// `rtsmcp` on PATH, ~/RTSEngine. Otherwise Petya downloads the ready package from the engine's `builds` branch
// (github.com/chromealex/rts-engine), checks it — sha256 from index.json when the branch has one, else the git
// blob SHA-1 the GitHub contents API reports — unpacks it with Node and keeps exactly one version in
// <userData>/rts-levels/engine-<version>-<commit>/RTSEngine. A newer commit in the index is offered as «Обновить».
const fs=require('node:fs');
const fsp=fs.promises;
const os=require('node:os');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {pipeline}=require('node:stream/promises');
const unzip=require('./unzip.cjs');

const REPO='chromealex/rts-engine',BRANCH='builds';
const RAW=`https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
const API=`https://api.github.com/repos/${REPO}/contents/`;
const NAME=/^(?:[a-z]+\/)?RTSEngine-([0-9.]+)-([0-9a-f]+)-(\w+)\.zip$/;
const MAX_PACKAGE=300*1024*1024;
const PLATFORM={darwin:'macos',win32:'windows',linux:'linux'};
const ARCH={x64:'x86_64',arm64:'arm64'};
// Packages listed only in index.txt carry no architecture: the published macOS build is arm64, Windows x86_64.
const TXT_ARCH={macos:'arm64',windows:'x86_64',linux:'x86_64'};
const exe=platform=>platform==='win32'?'.exe':'';

// ---- detection -------------------------------------------------------------------------------------------------
const isFile=f=>{try{return fs.statSync(f).isFile();}catch{return false;}};
const isDir=f=>{try{return fs.statSync(f).isDirectory();}catch{return false;}};
// The same test the engine's tools use (engine/platform/EngineDir.h).
const looksLikeEngine=d=>isDir(path.join(d,'templates'))&&isDir(path.join(d,'engine','assets'));
function engineAbove(file){
 let d=path.dirname(file);
 for(let i=0;i<5;i++){if(looksLikeEngine(d))return d;const up=path.dirname(d);if(up===d)break;d=up;}
 return '';
}
function editorNear(bin,platform){
 const list=platform==='darwin'?['RTSEditor.app']:platform==='win32'?['rts_editor.exe','Release/rts_editor.exe']:['rts_editor'];
 for(const name of list){const f=path.join(bin,name);if(name.endsWith('.app')?isDir(f):isFile(f))return f;}
 return '';
}
// An engine from a path the user gave: the engine folder, its bin/, or rtsmcp itself.
function fromPath(p,platform=process.platform){
 const raw=String(p||'').trim().replace(/^~(?=$|[\\/])/,os.homedir());
 if(!raw)return null;
 const full=path.resolve(raw);
 const candidates=isFile(full)?[full]:[path.join(full,'rtsmcp'+exe(platform)),path.join(full,'bin','rtsmcp'+exe(platform)),path.join(full,'RTSEngine','bin','rtsmcp'+exe(platform))];
 const rtsmcp=candidates.find(isFile);
 if(!rtsmcp)return null;
 const engine=engineAbove(rtsmcp);
 return {rtsmcp,engine,editor:editorNear(path.dirname(rtsmcp),platform)};
}
function onPath(env=process.env,platform=process.platform){
 const sep=platform==='win32'?';':':';
 for(const dir of String(env.PATH||env.Path||'').split(sep).filter(Boolean)){const f=path.join(dir,'rtsmcp'+exe(platform));if(isFile(f))return f;}
 return '';
}
const root=userData=>path.join(userData,'rts-levels');
function readInstalled(userData){
 try{
  const dir=root(userData);
  for(const name of fs.readdirSync(dir)){
   if(!/^engine-/.test(name))continue;
   const info=JSON.parse(fs.readFileSync(path.join(dir,name,'installed.json'),'utf8'));
   const base=path.join(dir,name,'RTSEngine');
   if(isDir(base))return {...info,dir:path.join(dir,name),base};
  }
 }catch{/* none */}
 return null;
}
// Every engine found, best first. `settingsPath` is the user's choice; `userData` holds Petya's own copy.
function detect({settingsPath='',userData='',env=process.env,platform=process.platform,home=os.homedir()}={}){
 const out=[];
 if(settingsPath){const e=fromPath(settingsPath,platform);out.push(e?{source:'settings',...e}:{source:'settings',missing:true,path:settingsPath});}
 const which=onPath(env,platform);
 if(which){const e=fromPath(which,platform);if(e)out.push({source:'path',...e});}
 const homeEngine=fromPath(path.join(home,'RTSEngine'),platform);
 if(homeEngine)out.push({source:'home',...homeEngine});
 const own=userData?readInstalled(userData):null;
 if(own){const e=fromPath(own.base,platform);if(e)out.push({source:'download',version:own.version,commit:own.commit,file:own.file,...e});}
 return out;
}
const best=found=>found.find(e=>!e.missing&&e.rtsmcp)||null;

// ---- the builds index ------------------------------------------------------------------------------------------
async function getText(fetchImpl,url,signal){
 const r=await fetchImpl(url,{signal,redirect:'follow',headers:{'User-Agent':'Petya','Accept':'application/vnd.github+json, text/plain, */*'}});
 if(!r.ok)throw Object.assign(Error('HTTP '+r.status+' — '+url),{status:r.status});
 return r.text();
}
const parseName=file=>{const m=NAME.exec(String(file||'').split('/').pop());return m?{version:m[1],commit:m[2],platform:m[3]}:null;};
// The newest package for this computer: {file, url, size, version, commit, platform, arch, sha256 | blobSha}, or
// {unsupported:text} when there is none for this OS / CPU.
async function latest({platform=process.platform,arch=process.arch,fetchImpl=fetch,signal,raw=RAW,api=API}={}){
 const want=PLATFORM[platform],cpu=ARCH[arch]||arch;
 let packages=null;
 try{
  const index=JSON.parse(await getText(fetchImpl,raw+'index.json',signal));
  if(index&&Array.isArray(index.packages))packages=index.packages.map(p=>({...p,source:'index.json'}));
 }catch(e){if(signal?.aborted)throw e;/* no index.json yet: index.txt below */}
 if(!packages){
  const lines=(await getText(fetchImpl,raw+'index.txt',signal)).split(/\r?\n/).map(l=>l.trim()).filter(l=>NAME.test(l));
  packages=lines.map(file=>{const n=parseName(file);return {file,platform:n.platform,arch:TXT_ARCH[n.platform]||null,version:n.version,commit:n.commit,source:'index.txt'};});
 }
 const mine=packages.filter(p=>p.platform===want);
 if(!mine.length)return {unsupported:want==='linux'?'Готовой сборки движка для Linux пока нет. Укажите в настройках папку движка или путь к rtsmcp.':'Для этой системы нет готовой сборки движка. Укажите в настройках папку установленного движка.'};
 const fit=mine.find(p=>!p.arch||p.arch==='universal'||p.arch===cpu);
 if(!fit)return {unsupported:want==='macos'&&cpu==='x86_64'?'Готовая сборка движка есть только для Mac на Apple Silicon (arm64), для Mac на Intel её нет. Укажите в настройках папку движка, собранного на этом компьютере.':'Готовой сборки движка для процессора '+cpu+' нет. Укажите в настройках папку установленного движка.'};
 const pkg={file:fit.file,version:fit.version,commit:fit.commit,platform:fit.platform,arch:fit.arch||null,source:fit.source,rtsmcpInside:fit.rtsmcp||null,editorInside:fit.editor||null};
 if(fit.sha256&&Number.isSafeInteger(fit.size)){
  if(!/^[0-9a-f]{64}$/.test(fit.sha256))throw Error('index.json: неверная контрольная сумма пакета.');
  return {...pkg,size:fit.size,sha256:fit.sha256,url:safeUrl(fit.url)||raw+fit.file};
 }
 // index.txt: size and the git blob SHA-1 from the contents API (the hash git stores for the file).
 const meta=JSON.parse(await getText(fetchImpl,api+fit.file.split('/').map(encodeURIComponent).join('/')+'?ref='+BRANCH,signal));
 if(!/^[0-9a-f]{40}$/.test(meta?.sha||'')||!Number.isSafeInteger(meta?.size))throw Error('GitHub не сообщил контрольную сумму пакета движка.');
 return {...pkg,size:meta.size,blobSha:meta.sha,url:safeUrl(meta.download_url)||raw+fit.file};
}
// Only GitHub's own hosts serve the package.
function safeUrl(u){try{const url=new URL(u);return url.protocol==='https:'&&/(^|\.)(githubusercontent\.com|github\.com)$/.test(url.hostname)?url.href:'';}catch{return '';}}

// ---- download, verify, install ---------------------------------------------------------------------------------
async function download(pkg,file,{signal,progress=()=>{},fetchImpl=fetch}){
 if(!(pkg.size>0&&pkg.size<=MAX_PACKAGE))throw Error('Неожиданный размер пакета движка.');
 const r=await fetchImpl(pkg.url,{signal,redirect:'follow',headers:{'User-Agent':'Petya'}});
 if(!r.ok||!r.body)throw Error('Не удалось скачать движок (HTTP '+r.status+').');
 const sha256=pkg.sha256?createHash('sha256'):null,sha1=pkg.blobSha?createHash('sha1'):null;
 if(sha1)sha1.update('blob '+pkg.size+'\0');
 let bytes=0;
 const tooBig=()=>Error('Пакет движка больше заявленного — загрузка остановлена.');
 await pipeline(r.body,async function*(chunks){for await(const chunk of chunks){bytes+=chunk.length;if(bytes>pkg.size)throw tooBig();sha256?.update(chunk);sha1?.update(chunk);progress(bytes,pkg.size);yield chunk;}},fs.createWriteStream(file,{flags:'wx',mode:0o600}),{signal});
 const ok=bytes===pkg.size&&(sha256?sha256.digest('hex')===pkg.sha256:sha1.digest('hex')===pkg.blobSha);
 if(!ok)throw Object.assign(Error('Пакет движка не прошёл проверку целостности ('+(pkg.sha256?'SHA-256':'SHA-1 из GitHub')+'). Файл удалён, повторите позже.'),{integrity:true});
 return bytes;
}
// Removes the quarantine mark on macOS (best effort: Petya writes the files itself, so usually there is none).
async function unquarantine(dir,platform){
 if(platform!=='darwin')return;
 await new Promise(r=>require('node:child_process').execFile('/usr/bin/xattr',['-dr','com.apple.quarantine',dir],()=>r()));
}
// Download → verify → unpack into a staging folder → check rtsmcp answers → swap in; older engine folders go.
// `confirm(bytes)` asks the user; `status(stage, fraction|null)`; `verify(engine)` checks the unpacked rtsmcp.
async function install({userData,pkg,signal,confirm=async()=>true,status=()=>{},fetchImpl=fetch,verify,platform=process.platform}){
 if(!pkg||pkg.unsupported)throw Error(pkg?.unsupported||'Нет пакета движка для этого компьютера.');
 if(!await confirm(pkg.size))throw Object.assign(Error('Загрузка движка отменена.'),{cancelled:true});
 signal?.throwIfAborted();
 const base=root(userData);
 await fsp.mkdir(base,{recursive:true,mode:0o700});
 const space=await fsp.statfs(base).catch(()=>null);
 if(space&&space.bavail*space.bsize<pkg.size*6)throw Error('Освободите хотя бы '+Math.ceil(pkg.size*6/1e6)+' МБ для движка.');
 const staging=await fsp.mkdtemp(path.join(base,'install-'));
 try{
  const zip=path.join(staging,'package.zip');
  status('download',0);
  await download(pkg,zip,{signal,fetchImpl,progress:(b,t)=>status('download',b/t)});
  status('unpack',null);
  const out=path.join(staging,'unpacked');await fsp.mkdir(out);
  await unzip.extract(zip,out,{signal});
  await fsp.unlink(zip);
  const engineDir=path.join(out,'RTSEngine');
  const bin=path.join(engineDir,'bin');
  if(!isFile(path.join(bin,'rtsmcp'+exe(platform))))throw Error('В пакете движка нет rtsmcp.');
  // Node writes the modes from the archive; set the executable bits of the tools explicitly anyway.
  if(platform!=='win32'){
   for(const name of fs.readdirSync(bin)){const f=path.join(bin,name);if(isFile(f))await fsp.chmod(f,0o755);}
   const macos=path.join(bin,'RTSEditor.app','Contents','MacOS');
   if(isDir(macos))for(const name of fs.readdirSync(macos))await fsp.chmod(path.join(macos,name),0o755);
  }
  await unquarantine(engineDir,platform);
  status('verify',null);
  if(verify)await verify({rtsmcp:path.join(bin,'rtsmcp'+exe(platform)),engine:engineDir});
  const info={version:pkg.version,commit:pkg.commit,file:pkg.file,size:pkg.size,checked:pkg.sha256?'sha256':'git-blob-sha1',hash:pkg.sha256||pkg.blobSha,at:new Date().toISOString()};
  await fsp.writeFile(path.join(out,'installed.json'),JSON.stringify(info,null,1));
  const target=path.join(base,'engine-'+pkg.version+'-'+pkg.commit);
  await fsp.rm(target,{recursive:true,force:true});
  await fsp.rename(out,target);
  // Only the current version stays.
  for(const name of fs.readdirSync(base))if(/^engine-/.test(name)&&path.join(base,name)!==target)await fsp.rm(path.join(base,name),{recursive:true,force:true}).catch(()=>{});
  return {...info,dir:target,base:path.join(target,'RTSEngine')};
 }finally{await fsp.rm(staging,{recursive:true,force:true}).catch(()=>{});}
}
// Leftovers of an interrupted install (staging folders) are removed at startup.
function cleanup(userData){
 try{for(const name of fs.readdirSync(root(userData)))if(/^install-/.test(name))fs.rmSync(path.join(root(userData),name),{recursive:true,force:true});}catch{/* none */}
}
// The arguments Petya starts rtsmcp with: always --engine (published binaries carry the build machine's path),
// --no-editor (never launch the editor by itself) and port 0, which nothing can listen on: rtsmcp tries the editor
// before every call and falls back to its own workspace, so Petya works on its own in-memory document and never
// changes the map open in the user's editor window (port 0 is refused at once, without the 300 ms connect wait).
function mcpArgs(engine){return [...(engine.engine?['--engine',engine.engine]:[]),'--no-editor','--port','0'];}
module.exports={REPO,BRANCH,RAW,API,detect,best,fromPath,onPath,looksLikeEngine,latest,download,install,cleanup,readInstalled,root,parseName,mcpArgs,safeUrl,PLATFORM};
