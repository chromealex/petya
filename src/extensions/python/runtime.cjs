const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs');
const exec=promisify(execFile);
const IMAGE='python:3.12-slim';
const LIMITS={timeoutMs:15000,memoryMB:256,outputBytes:65536,inputBytes:262144,codeBytes:24000};
const BOOTSTRAP='import json,sys,os\npayload=json.load(sys.stdin)\nfiles=payload["files"]\nos.chdir("/work")\nfor name,text in files.items():\n with open(name,"w",encoding="utf-8") as f: f.write(text)\nexec(compile(payload["code"],"<petya-python>","exec"),{"__name__":"__main__","files":files})';
function dockerBinary(){
  const paths=process.platform==='darwin'?['/Applications/Docker.app/Contents/Resources/bin/docker','/usr/local/bin/docker']:process.platform==='win32'?[`${process.env.ProgramFiles||'C:\\Program Files'}\\Docker\\Docker\\resources\\bin\\docker.exe`]:['/usr/bin/docker','/usr/local/bin/docker'];
  return paths.find(p=>fs.existsSync(p))||'docker';
}
function validate({code,files={}}){
  if(typeof code!=='string'||!code.trim()||Buffer.byteLength(code)>LIMITS.codeBytes)throw Error('Python: код должен занимать от 1 до 24000 байт.');
  if(!files||Array.isArray(files)||typeof files!=='object'||Object.keys(files).length>5||Object.entries(files).some(([k,v])=>!k||k==='.'||k==='..'||/[/\\\x00-\x1f]/.test(k)||k.length>180||typeof v!=='string'))throw Error('Передайте до пяти текстовых файлов: имя → содержимое.');
  const input=JSON.stringify({code,files});
  if(Buffer.byteLength(input)>LIMITS.inputBytes)throw Error('Слишком много данных для Python (максимум 256 КиБ).');
  return input;
}
class PythonRuntime {
  constructor({binary=dockerBinary(),execute=exec,spawnProcess=spawn}={}){Object.assign(this,{binary,execute,spawnProcess});this.active=false;}
  async cli(args){return this.execute(this.binary,args,{timeout:10000,maxBuffer:128*1024,windowsHide:true,shell:false});}
  async environment(){
    // Resolve once and pin a local endpoint: a remote Docker context must never receive chat data.
    const context=JSON.parse((await this.cli(['context','inspect'])).stdout)[0];
    const host=context?.Endpoints?.docker?.Host;
    if(typeof host!=='string'||!(/^(unix:\/\/\/|npipe:\/\/)/.test(host)))throw Error('Для Python нужен локальный Docker Desktop, без удалённого Docker context.');
    const base=['--host',host];
    const image=JSON.parse((await this.cli([...base,'image','inspect',IMAGE])).stdout)[0];
    if(image?.Os!=='linux'||!/^sha256:[a-f0-9]{64}$/.test(image?.Id))throw Error('Нужен Linux-образ '+IMAGE+'.');
    const info=JSON.parse((await this.cli([...base,'info','--format','{{json .}}'])).stdout);
    if(info.OSType!=='linux'||!info.MemoryLimit||!info.PidsLimit)throw Error('Docker должен поддерживать ограничения памяти и числа процессов Linux.');
    return {base,image:image.Id};
  }
  async status(){try{await this.environment();return {ready:true,image:IMAGE,limits:LIMITS};}catch(error){return {ready:false,image:IMAGE,limits:LIMITS,message:'Запустите локальный Docker Desktop с Linux-контейнерами и загрузите образ командой docker pull '+IMAGE+'.',detail:error.message.slice(0,1000)};}}
  async run(args,{signal,check=()=>{}}={}){
    const input=validate(args);check();signal?.throwIfAborted();
    if(this.active)throw Error('Python уже выполняет задачу. Дождитесь результата.');
    this.active=true;
    const name='petya-python-'+randomUUID();let base,created=false;
    try{
      const env=await this.environment();base=env.base;check();signal?.throwIfAborted();
      // No mounts or inherited environment; only stdin crosses into this container.
      const options=['create','--name',name,'--label','com.petya.python=true','--pull=never','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=65534:65534','--memory=256m','--memory-swap=256m','--cpus=1','--pids-limit=32','--ulimit','nofile=64:64','--ulimit','core=0:0','--tmpfs','/work:rw,noexec,nosuid,nodev,size=16m,mode=1777','--workdir=/work','--log-driver=none','--init','-i',env.image,'python','-I','-S','-u','-c',BOOTSTRAP];
      await this.cli([...base,...options]);created=true;check();signal?.throwIfAborted();
      const result=await this.attached(base,name,input,signal,check);check();return result;
    }finally{
      try{if(base){try{await this.cli([...base,'rm','--force',name]);}catch(e){if(created||!String(e.stderr||e.message).includes('No such container'))throw Error('Не удалось удалить контейнер Python '+name+'. Проверьте Docker Desktop.');}}}finally{this.active=false;}
    }
  }
  attached(base,name,input,signal,check){
    return new Promise((resolve,reject)=>{
      const child=this.spawnProcess(this.binary,[...base,'start','--attach','--interactive',name],{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});
      let stdout=[],stderr=[],bytes=0,failure;
      const stop=error=>{if(failure)return;failure=error;child.kill('SIGKILL');};
      const abort=()=>stop(Error('Выполнение Python остановлено.'));
      const timer=setTimeout(()=>stop(Error('Python превысил лимит 15 секунд.')),LIMITS.timeoutMs);
      const guard=setInterval(()=>{try{check();signal?.throwIfAborted();}catch(e){stop(e);}},100);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      const receive=target=>chunk=>{bytes+=chunk.length;if(bytes>LIMITS.outputBytes)stop(Error('Python превысил лимит вывода 64 КиБ.'));else target.push(chunk);};
      child.stdout.on('data',receive(stdout));child.stderr.on('data',receive(stderr));
      child.stdin.on('error',()=>{});
      child.once('error',error=>{failure=error;});
      child.once('close',(exitCode,exitSignal)=>{
        clearTimeout(timer);clearInterval(guard);signal?.removeEventListener('abort',abort);
        if(failure)return reject(failure);
        resolve({stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8'),exitCode,signal:exitSignal,ok:exitCode===0});
      });
      child.stdin.end(input);
    });
  }
}
module.exports={PythonRuntime,validate,LIMITS,IMAGE};
