// Trusted main-process client; not an IPC/MCP interface or an application router.
const {randomUUID}=require('node:crypto');
const {runtimeFetch}=require('./http.cjs');
const {consume,preview}=require('../answer-stream.cjs');
const aborted=()=>Object.assign(Error('Запрос к модели отменён.'),{name:'AbortError'});
function connection(value){
 let url;try{url=new URL(value.endpoint);}catch{throw Error('Неверный адрес сервиса модели.');}
 if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||
    !/^[A-Za-z0-9_-]{32,256}$/.test(value.token||'')||typeof value.model!=='string'||!value.model||!/^[a-f0-9]{64}$/.test(value.digest||''))
  throw Error('Неверная идентичность сервиса модели.');
 return {endpoint:url.origin,token:value.token,model:value.model,digest:value.digest};
}
class RuntimeClient{
 constructor({getConnection,fetchImpl=runtimeFetch,timeout=90000,maxPending=32}={}){
  this.getConnection=getConnection;this.fetch=fetchImpl;this.timeout=timeout;this.maxPending=maxPending;
  this.queue=[];this.active=null;this.shutdown=new AbortController();
 }
 stats(){return {running:this.active?1:0,waiting:this.queue.length,closed:this.shutdown.signal.aborted};}
 chat(body,{signal,onAnswerChunk}={}){
  try{
   if(this.shutdown.signal.aborted||signal?.aborted)throw aborted();
   const target=connection(this.getConnection());
   if(!body||typeof body!=='object'||Array.isArray(body)||body.model!==target.model)throw Error('Запрошена другая модель.');
   const encoded=JSON.stringify(body);if(Buffer.byteLength(encoded)>1048576)throw Error('Слишком большой запрос к модели.');
   if(this.queue.length>=this.maxPending)throw Error('Очередь запросов к модели заполнена.');
   const combined=signal?AbortSignal.any([signal,this.shutdown.signal]):this.shutdown.signal;
   if(combined.aborted)throw aborted();
   return new Promise((resolve,reject)=>{
    const job={target,encoded,stream:body.stream!==false,onAnswerChunk,signal:combined,resolve,reject,started:false};
    job.abort=()=>{if(!job.started){const at=this.queue.indexOf(job);if(at>=0)this.queue.splice(at,1);combined.removeEventListener('abort',job.abort);reject(aborted());}};
    combined.addEventListener('abort',job.abort,{once:true});this.queue.push(job);this.drain();
   });
  }catch(error){return Promise.reject(error);}
 }
 drain(){
  if(this.active||!this.queue.length)return;
  const job=this.active=this.queue.shift();job.started=true;job.signal.removeEventListener('abort',job.abort);
  this.perform(job).then(job.resolve,job.reject).finally(()=>{this.active=null;this.drain();});
 }
 async perform(job){
  if(job.signal.aborted)throw aborted();
  const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(),this.timeout);
  const signal=AbortSignal.any([job.signal,deadline.signal]),id=randomUUID();let cancellation;
  const headers={'Content-Type':'application/json',Authorization:'Bearer '+job.target.token,'X-Petya-Request-Id':id};
  const cancel=()=>{
   cancellation=this.fetch(job.target.endpoint+'/api/cancel',{method:'POST',headers,body:JSON.stringify({request_id:id}),redirect:'error',signal:AbortSignal.timeout(2000)})
    .then(response=>response.body?.cancel()).catch(()=>{});
  };
  signal.addEventListener('abort',cancel,{once:true});
  try{
   let response;
   while(true){
    response=await this.fetch(job.target.endpoint+'/api/chat',{method:'POST',headers,body:job.encoded,signal,redirect:'error'});
    if(response.status!==503)break;
    // This runtime returns 503 before admitting generation, while a previous GPU call unwinds.
    await response.body?.cancel();
    await new Promise((resolve,reject)=>{
     if(signal.aborted){reject(aborted());return;}
     const abort=()=>{clearTimeout(wait);reject(aborted());};
     const wait=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},100);
     signal.addEventListener('abort',abort,{once:true});
    });
   }
   if(!response.ok){const error=Error('Сервис модели вернул HTTP '+response.status+'.');error.status=response.status;await response.body?.cancel();throw error;}
   const result=job.stream?await consume(response,job.onAnswerChunk||(()=>{})):await response.json();
   if(!result||result.error||result.done!==true||typeof result.message?.content!=='string')throw Error('Сервис модели не завершил ответ.');
   if(signal.aborted)throw aborted();
   if(!job.stream&&job.onAnswerChunk)job.onAnswerChunk(preview(result.message.content));
   return result;
  }catch(error){
   job.onAnswerChunk?.('');
   if(signal.aborted){if(deadline.signal.aborted&&!job.signal.aborted)throw Error('Истекло время ответа модели.');throw aborted();}
   if(error.status)throw error;
   throw Error('Не удалось получить корректный ответ локальной модели.');
  }finally{
   clearTimeout(timer);signal.removeEventListener('abort',cancel);if(cancellation)await cancellation;
  }
 }
 close(){this.shutdown.abort();}
}
module.exports={RuntimeClient,connection};
