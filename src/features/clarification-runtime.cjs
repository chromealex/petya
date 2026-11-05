const {AsyncLocalStorage}=require('node:async_hooks');
const execution=new AsyncLocalStorage();
const cancel=require('../answer-cancel.cjs');
module.exports=function runtime(s,session){
 const active=new Map(),d=s.dialogue;
 const job=(topic,state,label,result)=>{
  topic.chatJob={...topic.chatJob,clarification:true,state,label,at:Date.now(),acknowledged:false,finishedAt:state==='running'?null:Date.now()};
  if(result)topic.lastChatResult={...result,topicId:topic.id,messages:undefined,topics:undefined};
  d.persist();s.chatJobs?.emit?.({topicId:topic.id,job:topic.chatJob});
 };
 const audit=(topic,op,state,text)=>{op.state=state;op.updatedAt=Date.now();op.summary=String(text||'').slice(0,600);d.persist();};
 const stop=id=>{const op=active.get(id);if(!op)return false;op.controller.abort(cancel.stopped());job(op.topic,'running','Останавливаю продолжение…');return true;};
 if(s.chatJobs){const busy=s.chatJobs.busy.bind(s.chatJobs),previous=s.chatJobs.cancel?.bind(s.chatJobs);s.chatJobs.busy=id=>busy(id)||(active.has(id)&&execution.getStore()!==active.get(id));s.chatJobs.cancel=id=>stop(id)||previous?.(id)||false;}
 const offer=session.offer.bind(session);session.offer=(...args)=>{const result=offer(...args),topic=d.active();if(topic&&!active.has(topic.id)&&!s.chatJobs?.busy(topic.id)){topic.chatJob={command:args[0],startedAt:Date.now()};job(topic,'attention','Нужно уточнение',result);}return result;};
 const raw=session.answer.bind(session);
 session.answer=async(id,value,authorize=()=>{},recordAnswer=()=>{},actor='Пользователь')=>{
  const row=session.pending.get(id),topic=d.active();
  if(!row||!topic||row.scope!==session.scope()||session.now()>row.expiresAt)return raw(id,value,authorize,recordAnswer);
  authorize();if(active.has(topic.id)||s.chatJobs?.busy(topic.id)||d.busyChat(topic.id))throw Error('В этом чате уже выполняется запрос.');
  const text=String(value||'').trim(),isCancel=/^(?:отмена|отмени|стоп|не надо)[.!]?$/iu.test(text);
  if(!text||text.length>4000||!isCancel&&row.spec.strictChoices&&!row.spec.options?.some(o=>o.toLocaleLowerCase()===text.toLocaleLowerCase()))return raw(id,value,authorize,recordAnswer);
  if(row.recoveryRequired&&!isCancel)return row.result;
  const op={id,chatId:topic.id,request:row.command,answer:text,actor,startedAt:Date.now(),state:'running'};
  topic.clarificationHistory ||= [];topic.clarificationHistory.push(op);topic.clarificationHistory=topic.clarificationHistory.slice(-50);
  const running={controller:new AbortController(),topic};active.set(topic.id,running);
  topic.chatJob={command:row.command,startedAt:op.startedAt};job(topic,'running','Продолжаю сохранённый запрос…');
  try{
   const result=await execution.run(running,()=>cancel.run(running.controller.signal,()=>require('../request-progress.cjs').run('converse',label=>job(topic,'running',label),()=>raw(id,value,()=>{cancel.check();authorize();},recordAnswer))));
   if(running.controller.signal.aborted)throw cancel.stopped();
   audit(topic,op,result.error?'error':result.question?'waiting':isCancel?'cancelled':'completed',result.text);
   const last=topic.messages.at(-1);if(result.text&&(last?.role!=='assistant'||last.text!==result.text))topic.messages.push({role:'assistant',text:result.text,at:Date.now(),error:!!result.error});
   job(topic,result.error||result.question?'attention':isCancel?'cancelled':'done',result.question?'Нужно уточнение':result.error?'Нужно внимание':isCancel?'Отменено':'Готово',result);
   return {...result,topicId:topic.id,messages:topic.messages};
  }catch(error){
   const stopped=running.controller.signal.aborted;
   if(stopped)for(const [key,pending] of session.pending)if(pending.owner.chatId===topic.id)session.pending.delete(key);
   const text=stopped?'Продолжение остановлено. Уже выполненные действия не отменены; перед новым запуском проверьте результат.':error.message;
   audit(topic,op,stopped?'cancelled':'error',text);
   const result={handled:true,error:!stopped,cancelled:stopped,text,topicId:topic.id};
   topic.messages.push({role:'assistant',text,at:Date.now(),error:!stopped});job(topic,stopped?'cancelled':'attention',text,result);
   return {...result,messages:topic.messages};
  }finally{active.delete(topic.id);session.save?.();}
 };
 const restore=descriptor=>{
  if(descriptor?.kind==='git-input')return answer=>s.chatJobs.converse((descriptor.prefix||'')+answer+(descriptor.suffix||''));
  if(descriptor?.kind==='drawing-input')return answer=>s.chatJobs.converse('Нарисуй '+answer);
  if(descriptor?.kind==='repair-input')return answer=>s.buildRepair.turn(descriptor.command+' '+answer);
  return null;
 };
 session.save=()=>{d.state.pendingClarifications=[...session.pending].map(([id,row])=>({id,scope:row.scope,owner:row.owner,command:row.command,spec:row.spec,at:row.at,expiresAt:row.expiresAt}));d.persist();};
 for(const saved of d.state.pendingClarifications||[]){
  if(!saved.owner||saved.scope!==session.scope(saved.owner)||Date.now()>saved.expiresAt)continue;
  const resume=restore(saved.spec.restart),result={handled:true,question:true,text:saved.spec.text,clarificationId:saved.id,clarificationOptions:saved.spec.options||[],clarificationInput:{label:saved.spec.label||'Уточнение',placeholder:saved.spec.placeholder||'Напишите ответ…',submit:'Продолжить'},...!resume?{recoveryRequired:true,originalRequest:saved.command}:{} };
  session.pending.set(saved.id,{...saved,result,resume:resume||(()=>({handled:true,question:true,...result})),recoveryRequired:!resume});
  const topic=d.state.topics.find(t=>t.id===saved.owner.chatId);if(topic){topic.lastChatResult=result;topic.chatJob={...topic.chatJob,state:'attention',label:resume?'Нужно уточнение':'Запрос сохранён. Нужно проверить продолжение.',at:Date.now(),acknowledged:false};}
 }
 for(const topic of d.state.topics){for(const op of topic.clarificationHistory||[])if(op.state==='running'){op.state='interrupted';op.summary='Перезапуск прервал продолжение. Результат действия требует проверки; автоматический повтор отключён.';op.updatedAt=Date.now();topic.lastChatResult={handled:true,text:op.summary};topic.chatJob={...topic.chatJob,state:'attention',label:op.summary,at:Date.now(),acknowledged:false};}}
 session.stop=stop;session.history=id=>d.state.topics.find(t=>t.id===id)?.clarificationHistory||[];
 session.save();
 return {stop,history:session.history};
};
