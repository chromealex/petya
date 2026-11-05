const {randomUUID,createHash}=require('node:crypto');
const {InputRequired}=require('../input-required.cjs');
class Clarifications {
 constructor({scope,record,now=Date.now}){Object.assign(this,{scope,record,now});this.pending=new Map();}
 latest(){const row=[...this.pending.values()].find(row=>row.scope===this.scope()&&this.now()-row.at<=1800000);if(!row)return null;const {messages,...result}=row.result;return result;}
 async run(command,work){
  for(const [id,row] of this.pending)if(row.scope===this.scope())this.pending.delete(id);
  try{return await work();}catch(error){
   if(!(error instanceof InputRequired))throw error;
   const spec=error.spec,id=randomUUID();
   const result={handled:true,question:true,text:spec.text,clarificationId:id,clarificationInput:{label:spec.label||'Уточнение',placeholder:spec.placeholder||'Напишите ответ…',submit:'Продолжить',files:!!spec.files},clarificationOptions:spec.options||[]};
   this.record?.(command,result);
   const scope=this.scope();for(const [key,row] of this.pending)if(row.scope===scope||this.now()-row.at>1800000)this.pending.delete(key);
   this.pending.set(id,{scope,command,resume:error.resume,spec,result,at:this.now(),busy:false});return result;
  }
 }
 async answer(id,answer){
  const row=this.pending.get(id);
  if(!row||row.scope!==this.scope()||this.now()-row.at>1800000){this.pending.delete(id);return {handled:true,text:'Контекст изменился или уточнение устарело. Действие не выполнено.',error:true};}
  if(row.busy)return {...row.result,text:'Уже продолжаю этот запрос. Дождитесь результата.'};
  const value=String(answer||'').trim();
  if(!value||value.length>4000)return {...row.result,text:'Введите ответ до 4000 символов.'};
  if(/^(?:отмена|отмени|стоп|не надо)[.!]?$/iu.test(value)){this.pending.delete(id);return {handled:true,text:'Запрос отменён.'};}
  if(row.spec.strictChoices&&!row.spec.options?.some(option=>option.toLocaleLowerCase()===value.toLocaleLowerCase()))return {...row.result,text:'Выберите один из предложенных вариантов.'};
  row.busy=true;this.pending.delete(id);
  // Consume before resuming: a technical failure must never automatically replay external writes.
  return this.run(row.command,()=>row.resume(value));
 }
}
module.exports={name:'clarifications',Clarifications,setup(s){
 const scope=()=>createHash('sha256').update(JSON.stringify([s.companyId,s.dialogue.active()?.id,s.dialogue.state.activeProjectId,s.dialogue.active()?.versionIndex||0,...Object.entries(s.settings).filter(([k])=>/Token|Credential|Url$|^module_|Channels$/.test(k))])).digest('hex');
 const clarifications=new Clarifications({scope,record(command,result){
  s.dialogue.rememberAction(command,result.text);const topic=s.dialogue.active();
  const last=topic?.messages.at(-1);if(last){last.clarificationId=result.clarificationId;s.dialogue.persist();}
  Object.assign(result,{topicId:topic?.id,messages:topic?.messages});
 }});
 return {clarifications,ipc:{latest:()=>clarifications.latest(),answer:(id,value)=>clarifications.answer(id,value)}};
}};
