// «Docker», the command line layer: finds the local `docker` binary and runs it without a shell, with a timeout
// and a capped output. Failures are classified so the chat can tell «Docker не установлен» (no binary),
// «Docker не запущен» (the CLI cannot reach the engine socket or pipe) and a timeout apart from real errors.
// Only fixed subcommands built by this extension ever reach the CLI: no exec, no run, no user-supplied arguments.
const fs=require('node:fs');
const path=require('node:path');
const {execFile}=require('node:child_process');

// PATH first (a fake binary in tests, Homebrew/Colima), then the usual install locations: an app started from
// Finder or the Start menu has a short PATH.
function binary({platform=process.platform,env=process.env,exists=fs.existsSync}={}){
 const exe=platform==='win32'?'docker.exe':'docker';
 const dirs=[...String(env.PATH||env.Path||'').split(path.delimiter).filter(Boolean),
  ...(platform==='darwin'?['/usr/local/bin','/opt/homebrew/bin','/Applications/Docker.app/Contents/Resources/bin',path.join(env.HOME||'','.docker','bin')]:[]),
  ...(platform==='win32'?[path.join(env.ProgramFiles||'C:\\Program Files','Docker','Docker','resources','bin')]:[]),
  ...(platform==='linux'?['/usr/bin','/usr/local/bin']:[])];
 for(const dir of dirs){const file=path.join(dir,exe);try{if(exists(file)&&!fs.statSync(file).isDirectory())return file;}catch{/* unreadable dir */}}
 return null;
}

const NOT_RUNNING=/Cannot connect to the Docker daemon|failed to connect to the docker API|Is the docker daemon running|error during connect|docker daemon is not running|dockerDesktopLinuxEngine|docker_engine.*(?:cannot find|The system cannot find)|open \/\/\.\/pipe\/docker|connect: no such file or directory|connect: connection refused.*docker\.sock/i;
const DENIED=/permission denied while trying to connect|Got permission denied/i;

class DockerError extends Error{
 constructor(kind,message,detail=''){super(message);this.name='DockerError';this.kind=kind;this.detail=String(detail).slice(0,2000);}
}
function classify(error,stderr=''){
 const text=String(stderr||'')+'\n'+String(error?.message||'');
 if(error?.code==='ENOENT')return new DockerError('missing','Команда docker не найдена.',text);
 if(error?.killed||error?.signal==='SIGTERM'&&/timed? ?out/i.test(text)||error?.code==='ETIMEDOUT')return new DockerError('timeout','Docker не ответил вовремя.',text);
 if(NOT_RUNNING.test(text))return new DockerError('stopped','Docker не запущен.',text);
 if(DENIED.test(text))return new DockerError('denied','Нет доступа к Docker: у пользователя нет прав на сокет Docker.',text);
 const line=String(stderr||error?.message||'').trim().split('\n').filter(Boolean).at(-1)||'ошибка docker';
 return new DockerError('failed',line.replace(/^Error(?: response from daemon)?:\s*/i,'').slice(0,400),text);
}

// One CLI call. `runner` is replaceable in tests; the default is execFile without a shell.
function exec(file,args,{timeout=20000,cwd,maxBuffer=8*1024*1024}={}){
 return new Promise((resolve,reject)=>{
  execFile(file,args,{timeout,cwd,maxBuffer,windowsHide:true,shell:false,env:{...process.env,DOCKER_CLI_HINTS:'false'}},(error,stdout,stderr)=>{
   if(error){error.stderr=String(stderr||'');error.stdout=String(stdout||'');if(error.killed&&!error.signal)error.signal='SIGTERM';if(error.killed)error.message+=' (timed out)';reject(error);}
   else resolve({stdout:String(stdout||''),stderr:String(stderr||'')});
  });
 });
}

function create({find=binary,runner=exec}={}){
 async function run(args,{timeout=20000,cwd}={}){
  if(!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw Error('Invalid docker arguments');
  const file=find();
  if(!file)throw new DockerError('missing','Команда docker не найдена.');
  try{return await runner(file,args,{timeout,cwd});}
  catch(e){throw classify(e,e.stderr);}
 }
 // `--format json` prints one object per line (ps, images, stats, volume ls, system df) or one array (compose ls).
 async function json(args,opts){
  const {stdout}=await run(args,opts);
  return parseLines(stdout);
 }
 return {run,json,binary:find};
}
function parseLines(text){
 const s=String(text||'').trim();
 if(!s)return [];
 if(s.startsWith('[')){try{const v=JSON.parse(s);return Array.isArray(v)?v:[v];}catch{/* line by line below */}}
 const out=[];
 for(const line of s.split(/\r?\n/)){const t=line.trim();if(!t)continue;try{const v=JSON.parse(t);if(Array.isArray(v))out.push(...v);else out.push(v);}catch{/* a warning line */}}
 return out;
}

// Docker prints sizes both ways: «1.2GB», «45.3MB», «12.5kB» (decimal) and «25.3MiB / 7.66GiB» (binary).
const UNITS={b:1,kb:1e3,mb:1e6,gb:1e9,tb:1e12,pb:1e15,kib:1024,mib:1024**2,gib:1024**3,tib:1024**4};
function bytes(text){
 const m=/^\s*([\d.]+)\s*([kmgtp]i?b|b)?\s*$/i.exec(String(text||''));
 if(!m)return 0;
 return Math.round(Number(m[1])*(UNITS[(m[2]||'b').toLowerCase()]||1));
}
function human(n){
 const v=Number(n)||0;
 for(const [d,u] of [[1e12,'ТБ'],[1e9,'ГБ'],[1e6,'МБ'],[1e3,'КБ']])if(v>=d)return (v/d).toLocaleString('ru-RU',{maximumFractionDigits:v/d>=100?0:1})+' '+u;
 return v+' Б';
}
// Memory is told the way Docker and the OS do: in 1024-based units (a 256 MiB limit is «256 МБ»).
function memory(n){
 const v=Number(n)||0;
 for(const [d,u] of [[1024**3,'ГБ'],[1024**2,'МБ'],[1024,'КБ']])if(v>=d)return (v/d).toLocaleString('ru-RU',{maximumFractionDigits:v/d>=100?0:1})+' '+u;
 return v+' Б';
}
module.exports={binary,create,classify,exec,parseLines,bytes,human,memory,DockerError};
