// The isolated environment where a skill's scripts run: the local Docker Desktop that the Python extension
// already uses (src/extensions/python/runtime.cjs), with the same restrictions — no network, read-only image,
// no capabilities, an unprivileged user, memory/CPU/process limits, nothing from the computer mounted.
// Only stdin crosses in: the skill's folder (skill/), the user's files (input/) and the command. Files the
// script writes to out/ (PETYA_OUT) come back with its output. Packages a skill needs are installed once into
// an image of its own (petya-skill-<hash>), built with network only at that moment and with consent.
const {spawn}=require('node:child_process');
const {randomUUID,createHash}=require('node:crypto');
const {PythonRuntime,IMAGE}=require('./extensions/python/runtime.cjs');
const LIMITS={timeoutMs:120000,memory:'1g',inputBytes:64*1024*1024,outputBytes:48*1024*1024,outFiles:20*1024*1024,buildMs:15*60000};
const MARK='\n@@PETYA-RESULT@@';
const BOOTSTRAP=`import json,sys,os,base64,subprocess
p=json.load(sys.stdin)
for rel,data in p["files"].items():
    path=os.path.normpath(os.path.join("/work",rel))
    if not path.startswith("/work/"): continue
    os.makedirs(os.path.dirname(path),exist_ok=True)
    with open(path,"wb") as f: f.write(base64.b64decode(data))
for d in ("/work/out","/work/input","/work/skill"): os.makedirs(d,exist_ok=True)
env={"PATH":"/usr/local/bin:/usr/bin:/bin","HOME":"/work","TMPDIR":"/tmp","PETYA_OUT":"/work/out","PETYA_INPUT":"/work/input","PETYA_SKILL":"/work/skill","PYTHONDONTWRITEBYTECODE":"1","PYTHONIOENCODING":"utf-8","NODE_PATH":"/usr/local/lib/node_modules","LANG":"C.UTF-8","MPLCONFIGDIR":"/tmp"}
try:
    r=subprocess.run(p["command"],cwd="/work/skill",env=env,stdin=subprocess.DEVNULL,capture_output=True,timeout=p["timeout"])
    code,out,err=r.returncode,r.stdout,r.stderr
except subprocess.TimeoutExpired as e:
    code,out,err=-9,e.stdout or b"",(e.stderr or b"")+"\\nПревышено время выполнения.".encode()
except FileNotFoundError as e:
    code,out,err=127,b"",str(e).encode()
files,total,skipped={},0,[]
for root,_,names in os.walk("/work/out"):
    for n in sorted(names):
        fp=os.path.join(root,n);rel=os.path.relpath(fp,"/work/out");size=os.path.getsize(fp)
        if total+size>p["maxOut"]: skipped.append(rel); continue
        total+=size
        with open(fp,"rb") as f: files[rel]=base64.b64encode(f.read()).decode()
sys.stdout.write("${MARK.replace('\n','\\n')}"+json.dumps({"code":code,"stdout":out[-200000:].decode("utf-8","replace"),"stderr":err[-50000:].decode("utf-8","replace"),"files":files,"skipped":skipped}))
`;
// Package names that may go into a Dockerfile: no spaces, quotes or shell characters.
const PACKAGE=/^[A-Za-z0-9@][A-Za-z0-9._\/@-]*(?:\[[A-Za-z0-9,._-]+\])?(?:(?:==|>=|<=|~=|!=|>|<|@)[A-Za-z0-9.*+!_^~-]+)?(?:,(?:==|>=|<=|~=|!=|>|<)[A-Za-z0-9.*+!_-]+)*$/;
function dockerfile({pip=[],npm=[],node=false}){
 for(const p of [...pip,...npm])if(!PACKAGE.test(p)||p.length>120)throw Error('Недопустимое имя пакета навыка: '+String(p).slice(0,80));
 return 'FROM '+IMAGE+'\n'+(pip.length?'RUN pip install --no-cache-dir '+pip.map(p=>"'"+p+"'").join(' ')+'\n':'')+
  (node||npm.length?'RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*\n':'')+
  (npm.length?'RUN npm install -g --omit=dev '+npm.map(p=>"'"+p+"'").join(' ')+' && npm cache clean --force\n':'')+'LABEL com.petya.skill=true\n';
}
const imageName=need=>'petya-skill-'+createHash('sha256').update(dockerfile(need)).digest('hex').slice(0,16);
const empty=need=>!need.pip.length&&!need.npm.length&&!need.node;
class SkillSandbox{
 constructor({runtime=new PythonRuntime(),spawnProcess=spawn,publish=()=>{}}={}){Object.assign(this,{runtime,spawnProcess,publish});this.active=false;}
 async status(){return this.runtime.status();}
 // Whether the skill's own image exists (or none is needed).
 async ready(need){if(empty(need))return true;const {base}=await this.runtime.environment();try{await this.runtime.cli([...base,'image','inspect',imageName(need)]);return true;}catch{return false;}}
 // Builds the skill's image: the only step with network. Progress goes to the notification center.
 async prepare(need,{name='',signal}={}){
  if(empty(need))return IMAGE;
  const {base}=await this.runtime.environment(),tag=imageName(need),id='skill-env:'+tag,title='Среда навыка '+name;
  this.publish({id,title,text:'Устанавливаю пакеты: '+[...need.pip,...need.npm].slice(0,8).join(', ')+'…',busy:true,kind:'info'});
  try{
   await new Promise((resolve,reject)=>{
    const child=this.spawnProcess(this.runtime.binary,[...base,'build','--pull=false','-t',tag,'-'],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
    let log='';const keep=c=>{log=(log+c).slice(-4000);};child.stdout.on('data',keep);child.stderr.on('data',keep);
    const timer=setTimeout(()=>child.kill('SIGKILL'),LIMITS.buildMs);const abort=()=>child.kill('SIGKILL');signal?.addEventListener('abort',abort,{once:true});
    child.once('error',reject);child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);code===0?resolve():reject(Error('Не удалось установить пакеты навыка. '+log.trim().split('\n').slice(-3).join(' ').slice(0,400)));});
    child.stdin.end(dockerfile(need));
   });
   this.publish({id,title,text:'Пакеты установлены.',busy:false,kind:'success'});return tag;
  }catch(e){this.publish({id,title,text:e.message,busy:false,kind:'error'});throw e;}
 }
 // Runs one command. files: {relative path → Buffer|string}; command: [interpreter, script, ...args].
 async run({files,command,need={pip:[],npm:[],node:false},timeoutMs=LIMITS.timeoutMs},{signal,check=()=>{}}={}){
  const [bin,...args]=command||[];
  if(!['python','python3','bash','sh','node'].includes(bin))throw Error('Навык может запускать python, bash или node.');
  if(args.some(a=>typeof a!=='string'||a.length>4000)||args.length>40)throw Error('Некорректные аргументы скрипта.');
  if((bin==='node')&&!need.node&&!need.npm.length)need={...need,node:true};
  const payload={files:Object.fromEntries(Object.entries(files||{}).map(([k,v])=>[k,Buffer.from(v).toString('base64')])),command:[bin==='python3'?'python':bin,...args],timeout:Math.ceil(timeoutMs/1000),maxOut:LIMITS.outFiles};
  const input=JSON.stringify(payload);if(Buffer.byteLength(input)>LIMITS.inputBytes)throw Error('Файлы навыка и пользователя больше 48 МБ: разберите меньше файлов за раз.');
  if(this.active)throw Error('Скрипт навыка уже выполняется. Дождитесь результата.');
  this.active=true;const name='petya-skill-'+randomUUID();let base,created=false;
  try{
   const env=await this.runtime.environment();base=env.base;check();signal?.throwIfAborted();
   const image=empty(need)?env.image:imageName(need);
   const options=['create','--name',name,'--label','com.petya.python=true','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--memory='+LIMITS.memory,'--memory-swap='+LIMITS.memory,'--cpus=2','--pids-limit=128','--ulimit','nofile=256:256','--ulimit','core=0:0','--tmpfs','/work:rw,nosuid,nodev,size=512m,mode=1777','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777','--workdir=/work','--log-driver=none','--init','-i',image,'python','-I','-S','-u','-c',BOOTSTRAP];
   await this.runtime.cli([...base,...options]);created=true;check();signal?.throwIfAborted();
   return await this.attached(base,name,input,signal,check,timeoutMs+15000);
  }finally{
   try{if(base&&created)await this.runtime.cli([...base,'rm','--force',name]);}catch{/* Removed with Docker's own cleanup. */}finally{this.active=false;}
  }
 }
 attached(base,name,input,signal,check,timeoutMs){
  return new Promise((resolve,reject)=>{
   const child=this.spawnProcess(this.runtime.binary,[...base,'start','--attach','--interactive',name],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
   const out=[],err=[];let bytes=0,failure;
   const stop=e=>{if(failure)return;failure=e;child.kill('SIGKILL');};
   const timer=setTimeout(()=>stop(Error('Скрипт навыка превысил лимит времени.')),timeoutMs);
   const guard=setInterval(()=>{try{check();signal?.throwIfAborted();}catch(e){stop(e);}},200);
   child.stdout.on('data',c=>{bytes+=c.length;if(bytes>LIMITS.outputBytes)stop(Error('Скрипт навыка вернул слишком много данных.'));else out.push(c);});
   child.stderr.on('data',c=>{if(err.reduce((n,x)=>n+x.length,0)<65536)err.push(c);});
   child.stdin.on('error',()=>{});child.once('error',e=>{failure=e;});
   child.once('close',()=>{
    clearTimeout(timer);clearInterval(guard);if(failure)return reject(failure);
    const text=Buffer.concat(out).toString('utf8'),at=text.lastIndexOf(MARK.trim());
    if(at<0)return reject(Error('Среда навыка не запустилась: '+Buffer.concat(err).toString('utf8').slice(-400)));
    let r;try{r=JSON.parse(text.slice(at+MARK.trim().length));}catch{return reject(Error('Среда навыка вернула повреждённый результат.'));}
    resolve({ok:r.code===0,exitCode:r.code,stdout:r.stdout,stderr:r.stderr,skipped:r.skipped||[],files:Object.fromEntries(Object.entries(r.files||{}).map(([k,v])=>[k,Buffer.from(v,'base64')]))});
   });
   child.stdin.end(input);
  });
 }
}
module.exports={SkillSandbox,dockerfile,imageName,BOOTSTRAP,LIMITS,PACKAGE};
