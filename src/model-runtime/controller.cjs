// Shared lifecycle logic. Trusted installation/qualification and caller permissions are separate boundaries.
const {randomUUID}=require('node:crypto');
const {RuntimeSupervisor}=require('./supervisor.cjs');
const {RuntimeClient}=require('./client.cjs');
const messages={starting:'Подготавливаю запуск модели.',verifying:'Проверяю файлы модели.',loading:'Загружаю модель.',rechecking:'Проверяю загруженную модель.',ready:'Модель готова к работе.',stopping:'Останавливаю модель.',stopped:'Модель остановлена.'};
class RuntimeController{
 constructor({resolveInstallation,emit=()=>{},createOwner=options=>new RuntimeSupervisor(options),createClient=options=>new RuntimeClient(options)}={}){
  this.resolveInstallation=resolveInstallation;this.emit=emit;this.createOwner=createOwner;this.createClient=createClient;
  this.job=null;this.closed=false;this.state={id:'petya-model-runtime',phase:'idle',busy:false,message:'Модель не запущена.'};
 }
 snapshot(){return {...this.state,queue:this.job?.client?.stats()||{running:0,waiting:0,closed:true}};}
 publish(job,phase,extra={}){
  if(this.job!==job)return;
  const busy=['starting','stopping'].includes(phase);
  this.state={id:'petya-model-runtime',phase,busy,version:job.id+':'+(busy?'active':phase),message:messages[phase]||'Не удалось подготовить модель.',...extra};
  try{this.emit(this.snapshot());}catch{} // UI delivery must not own worker lifetime.
 }
 start(){
  if(this.closed)throw Error('Управление моделью завершено.');
  if(this.job){if(this.state.phase==='stopping')throw Error('Дождись остановки модели.');return this.snapshot();}
  const job={id:randomUUID(),abort:new AbortController(),owner:null,client:null,loaded:false};this.job=job;
  this.publish(job,'starting',{stage:'starting'});
  job.pending=(async()=>{
   try{
    // Resolver must use trusted installed paths and a separately qualified release, never MCP-supplied paths.
    const install=await this.resolveInstallation({signal:job.abort.signal});
    if(job.abort.signal.aborted)return;
    job.owner=this.createOwner({python:install.python});
    job.owner.on('state',event=>{
     if(this.job!==job||job.abort.signal.aborted)return;
     if(event.phase==='starting'){
      if(event.stage==='loading')job.loaded=true;
      const stage=event.stage==='verifying'&&job.loaded?'rechecking':event.stage;
      const details={stage,message:messages[stage]||messages.starting};
      if(Number.isSafeInteger(event.totalBytes)&&event.totalBytes>0&&Number.isSafeInteger(event.verifiedBytes)&&event.verifiedBytes>=0&&event.verifiedBytes<=event.totalBytes)
       details.percent=Math.floor(event.verifiedBytes*100/event.totalBytes);
      this.publish(job,'starting',details);
     }else if(event.phase==='stopping'&&this.state.phase==='ready'){
      job.client?.close();
      this.publish(job,'stopping',{message:'Сервис модели завершает работу после ошибки.'});
     }else if(event.phase==='error'&&['ready','stopping'].includes(this.state.phase)){
      job.client?.close();this.publish(job,'error');this.job=null;
     }
    });
    await job.owner.start(install.config);
    if(job.abort.signal.aborted)return;
    job.client=this.createClient({getConnection:()=>job.owner.connection()});
    this.publish(job,'ready',{model:install.config.model,digest:install.config.digest});
   }catch{
    job.client?.close();await job.owner?.stop();
    if(!job.abort.signal.aborted){this.publish(job,'error');if(this.job===job)this.job=null;}
   }
  })();
  return this.snapshot();
 }
 async stop(){
  const job=this.job;if(!job)return this.snapshot();
  if(job.stopping)return job.stopping;
  job.abort.abort();job.client?.close();this.publish(job,'stopping');
  job.stopping=(async()=>{
   const stopping=job.owner?.stop();await job.pending;await stopping;
   this.publish(job,'stopped');if(this.job===job)this.job=null;return this.snapshot();
  })();
  return job.stopping;
 }
 chat(body,options){if(this.state.phase!=='ready'||!this.job?.client) return Promise.reject(Error('Модель ещё не готова.'));return this.job.client.chat(body,options);}
 async dispose(){this.closed=true;return this.stop();}
}
module.exports={RuntimeController};
