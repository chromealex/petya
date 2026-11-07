// Internal process owner. Application/MCP authorization and release selection remain caller responsibilities.
const {EventEmitter}=require('node:events');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
class RuntimeSupervisor extends EventEmitter{
 constructor({python,spawnProcess=spawn,startTimeout=600000,stopTimeout=3000,killTimeout=2000}={}){
  super();
  if(typeof python!=='string'||!path.isAbsolute(python))throw Error('Нужен абсолютный путь к среде модели.');
  this.python=python;this.spawnProcess=spawnProcess;this.startTimeout=startTimeout;this.stopTimeout=stopTimeout;this.killTimeout=killTimeout;
  this.state={phase:'idle'};this.active=null;
 }
 snapshot(){return {...this.state};}
 publish(state){this.state={...state};this.emit('state',this.snapshot());}
 start(config){
  const {manifest,base,adapter,digest,model,allow_development=false}=config||{};
  if(![manifest,base,adapter].every(p=>typeof p==='string'&&path.isAbsolute(p))||
     !/^[a-f0-9]{64}$/.test(digest||'')||typeof model!=='string'||!model||model.length>256||typeof allow_development!=='boolean')
   return Promise.reject(Error('Неверная конфигурация модели.'));
  const key=JSON.stringify({manifest,base,adapter,digest,model,allow_development});
  if(this.active){
   if(this.active.key===key&&(this.state.phase==='starting'||this.state.phase==='ready'))return this.active.started;
   return Promise.reject(Error('Сначала останови текущую модель.'));
  }
  const job={key,token:randomBytes(32).toString('base64url'),buffer:'',timers:[],failure:null,settled:false,requestedStop:false,child:null};
  job.started=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  job.exited=new Promise(resolve=>{job.exitResolve=resolve;});
  this.active=job;this.publish({phase:'starting',stage:'starting'});
  const timer=(fn,delay)=>{const t=setTimeout(fn,delay);job.timers.push(t);return t;};
  const settleError=message=>{if(!job.settled){job.settled=true;job.reject(Error(message));}};
  const terminate=()=>{
   if(!job.child)return;
   try{job.child.stdin.end('{"command":"stop"}\n');}catch{}
   timer(()=>{if(this.active===job){job.child.kill('SIGTERM');timer(()=>{if(this.active===job)job.child.kill('SIGKILL');},this.killTimeout);}},this.stopTimeout);
  };
  const fail=message=>{
   if(job.failure)return;
   job.failure=message;settleError(message);this.publish({phase:'stopping',error:message});terminate();
  };
  job.stop=()=>{
   if(!job.requestedStop){job.requestedStop=true;settleError('Запуск сервиса отменён.');this.publish({phase:'stopping'});terminate();}
   return job.exited;
  };
  const closed=(code,signal)=>{
   if(this.active!==job)return;
   job.timers.forEach(clearTimeout);job.token=null;job.connection=null;this.active=null;
   if(!job.requestedStop&&!job.failure)job.failure='Процесс модели неожиданно остановился.';
   if(job.failure){settleError(job.failure);this.publish({phase:'error',error:job.failure});}
   else this.publish({phase:'stopped'});
   job.exitResolve(this.snapshot());
  };
  try{
   const child=job.child=this.spawnProcess(this.python,[path.join(__dirname,'bootstrap.py').replace(/([\\/])app\.asar([\\/])/,'$1app.asar.unpacked$2')],{stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
   child.once('error',()=>fail('Не удалось запустить среду модели.'));
   child.once('close',closed);
   child.stdin.on('error',()=>{if(!job.requestedStop&&!job.failure)fail('Закрылся канал управления моделью.');});
   child.stderr.on('data',()=>{}); // Drain diagnostics without retaining potentially sensitive library output.
   child.stdout.setEncoding('utf8');
   child.stdout.on('data',chunk=>{
    if(this.active!==job||job.requestedStop||job.failure)return;
    job.buffer+=chunk;
    if(Buffer.byteLength(job.buffer)>65536){fail('Сервис прислал слишком большое сообщение состояния.');return;}
    let end;
    while((end=job.buffer.indexOf('\n'))>=0){
     const line=job.buffer.slice(0,end);job.buffer=job.buffer.slice(end+1);
     let event;try{event=JSON.parse(line);}catch{fail('Неверный ответ запуска сервиса.');return;}
     if(!event||typeof event!=='object'){fail('Неверный ответ запуска сервиса.');return;}
     if(event.phase==='ready'){
      if(job.settled||event.host!=='127.0.0.1'||!Number.isInteger(event.port)||event.port<1||event.port>65535||
         event.digest!==digest||event.model!==model||!['development','release'].includes(event.qualification)||
         (event.qualification==='development'&&!allow_development)){fail('Сервис загрузил не выбранную модель.');return;}
      clearTimeout(job.startTimer);job.connection={endpoint:'http://127.0.0.1:'+event.port,model,digest};
      job.settled=true;this.publish({phase:'ready',model,digest,qualification:event.qualification});job.resolve(this.snapshot());
     }else if(['starting','verifying','loading'].includes(event.phase)&&!job.settled){
      const state={phase:'starting',stage:event.phase};
      if(event.phase==='verifying'&&Number.isSafeInteger(event.verified_bytes)&&Number.isSafeInteger(event.total_bytes)&&
         event.total_bytes>0&&event.verified_bytes>=0&&event.verified_bytes<=event.total_bytes){
       state.verifiedBytes=event.verified_bytes;state.totalBytes=event.total_bytes;
      }
      this.publish(state);
     }else if(event.phase==='error'){fail('Не удалось подготовить локальную модель.');return;}
     else if(event.phase==='stopped'){fail('Сервис остановился до запроса приложения.');return;}
     else{fail('Неожиданное состояние сервиса.');return;}
    }
   });
   job.startTimer=timer(()=>fail('Истекло время запуска локальной модели.'),this.startTimeout);
   child.stdin.write(JSON.stringify({manifest,base,adapter,digest,token:job.token,allow_development})+'\n');
  }catch{
   if(job.child)fail('Не удалось создать процесс модели.');
   else{job.failure='Не удалось создать процесс модели.';settleError(job.failure);closed();}
  }
  return job.started;
 }
 stop(){return this.active?this.active.stop():Promise.resolve(this.snapshot());}
 // For the trusted main-process request bridge only; never expose this object over IPC/MCP or in notifications.
 connection(){
  if(this.state.phase!=='ready'||!this.active?.connection)throw Error('Сервис модели ещё не готов.');
  return {...this.active.connection,token:this.active.token};
 }
}
module.exports={RuntimeSupervisor};
