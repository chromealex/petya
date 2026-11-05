const {randomUUID,createHash}=require('node:crypto');
const {InputRequired}=require('../input-required.cjs');
const sessions=new WeakMap();
const TTL=1800000;
class Clarifications {
 constructor({scope,record,context=()=>({}),resolve,now=Date.now}){Object.assign(this,{scope,record,context,resolve,now});this.pending=new Map();}
 latest(){const row=[...this.pending.values()].find(row=>row.scope===this.scope()&&this.now()<=row.expiresAt);if(!row)return null;const {messages,...result}=row.result;return result;}
 list(){return [...this.pending.entries()].filter(([,row])=>this.now()<=row.expiresAt&&row.scope===this.scope(row.owner)).map(([id,row])=>({
  id,...row.owner,request:row.command,question:row.spec.text,input:row.result.clarificationInput,
  options:(row.spec.options||[]).map((label,index)=>({id:String(index+1),label})),createdAt:row.at,expiresAt:row.expiresAt,
  active:row.scope===this.scope(),requiresActiveChat:false,canResume:!row.recoveryRequired
 }));}
 offer(command,spec,resume,previous={}){
  const id=randomUUID(),result={...previous,handled:true,question:true,text:spec.text,clarificationId:id,clarificationInput:{label:spec.label||'Уточнение',placeholder:spec.placeholder||'Напишите ответ…',submit:'Продолжить',files:!!spec.files,choicesOnly:!!spec.strictChoices},clarificationOptions:spec.options||[]};
  for(const key of ['teamFillReply','slackRequestReply','slackRequestChoices'])delete result[key];
  this.record?.(command,result);
  const scope=this.scope();for(const [key,row] of this.pending)if(row.scope===scope||this.now()>row.expiresAt)this.pending.delete(key);
  this.pending.set(id,{scope,owner:this.context(),command,resume,spec,result,at:this.now(),expiresAt:this.now()+Math.min(TTL,spec.ttlMs||TTL),busy:false});this.save?.();return result;
 }
 async run(command,work){
  for(const [id,row] of this.pending)if(row.scope===this.scope())this.pending.delete(id);
  this.save?.();
  try{
   const result=await work(),resume=this.resolve?.(result);
   return resume?this.offer(command,{text:result.text,...result.clarificationInput,ttlMs:600000,options:(result.slackRequestChoices||[]).map(o=>o.label)},resume,result):result;
  }catch(error){
   if(!(error instanceof InputRequired))throw error;
   return this.offer(command,error.spec,error.resume);
  }
 }
 async answer(id,answer,authorize=()=>{},recordAnswer=()=>{}){
  authorize();
  const row=this.pending.get(id);
  if(!row||row.scope!==this.scope()||this.now()>row.expiresAt){this.pending.delete(id);return {handled:true,text:'Контекст изменился или уточнение устарело. Действие не выполнено.',error:true};}
  if(row.busy)return {...row.result,text:'Уже продолжаю этот запрос. Дождитесь результата.'};
  const value=String(answer||'').trim();
  if(!value||value.length>4000)return {...row.result,text:'Введите ответ до 4000 символов.'};
  if(/^(?:отмена|отмени|стоп|не надо)[.!]?$/iu.test(value)){this.pending.delete(id);this.save?.();recordAnswer(value);if(row.resume.cancel)return this.run(row.command,()=>row.resume.cancel());return {handled:true,text:'Запрос отменён.'};}
  if(row.spec.strictChoices&&!row.spec.options?.some(option=>option.toLocaleLowerCase()===value.toLocaleLowerCase()))return {...row.result,text:'Выберите один из предложенных вариантов.'};
  if(row.recoveryRequired)return row.result;
  row.busy=true;this.pending.delete(id);this.save?.();recordAnswer(value);
  // Consume before resuming: a technical failure must never automatically replay external writes.
  return this.run(row.command,()=>{authorize();return row.resume(value);});
 }
}
module.exports={name:'clarifications',Clarifications,register,setup(s){
 const context=()=>({companyId:s.companyId,chatId:s.dialogue.active()?.id,projectId:s.dialogue.active()?.projectId||s.dialogue.state.activeProjectId,version:s.dialogue.active()?.versionIndex||0});
 const scope=(owner=context())=>{
  const topic=s.dialogue.state.topics.find(t=>t.id===owner.chatId);
  if(!topic||topic.archived||!s.dialogue.state.projects.some(p=>p.id===topic.projectId&&!p.archived))return '';
  return createHash('sha256').update(JSON.stringify([s.companyId,topic.id,topic.projectId,topic.versionIndex||0,...Object.entries(s.settings).filter(([k])=>/Token|Credential|Url$|^module_|Channels$/.test(k))])).digest('hex');
 };
 const clarifications=new Clarifications({scope,context,resolve(result){
  if(!result?.question)return null;
  const owner=result.teamFillReply?s.teamFill:result.slackRequestReply||result.slackRequestChoices?s.slackRequest:null;
  if(owner){const resume=answer=>owner.turn(answer,true);resume.cancel=()=>owner.turn('отмена',true);return resume;}
  return null;
 },record(command,result){
  const existing=s.dialogue.active()?.messages.at(-1);
  if(existing?.role!=='assistant'||existing.text!==result.text)s.dialogue.rememberAction(command,result.text);const topic=s.dialogue.active();
  const last=topic?.messages.at(-1);if(last){last.clarificationId=result.clarificationId;s.dialogue.persist();}
  // Recording may have opened the chat for this question; team filling checks its answer against that chat.
  if(result.by==='заполнение команды')s.teamFill?.rescope?.();
  Object.assign(result,{topicId:topic?.id,messages:topic?.messages});
 }});
 const runtime=require('./clarification-runtime.cjs')(s,clarifications);
 sessions.set(s.dialogue,clarifications);
 return {clarifications,ipc:{stop:runtime.stop,history:runtime.history,latest:()=>clarifications.latest(),answer:(id,value)=>clarifications.answer(id,value)}};
}};

function register(server,z,ctx){
 const session=sessions.get(ctx.dialogue);if(!session)return;
 const id=z.string().min(1).max(200),page={offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(25)};
 const visible=()=>session.list().filter(row=>{
  const topic=ctx.dialogue.state.topics.find(t=>t.id===row.chatId&&!t.archived);
  return row.companyId===ctx.companyId&&topic&&topic.projectId===row.projectId&&ctx.dialogue.state.projects.some(p=>p.id===row.projectId&&!p.archived)&&(!ctx.access?.projectId||ctx.access.projectId===row.projectId);
 });
 const find=args=>{const row=visible().find(r=>r.id===args.clarificationId&&r.chatId===args.chatId);if(!row)throw Error('Уточнение недоступно, завершено или устарело.');return row;};
 const tool=(name,description,schema,fn,write=false)=>{
  if(write&&ctx.access?.mode!=='edit')return;
  server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:!write,destructiveHint:write,openWorldHint:write}},async args=>{
   try{ctx.check();return await ctx.run(async()=>{ctx.check();const result=await fn(args);ctx.check();return {isError:!!result?.error,content:[{type:'text',text:JSON.stringify(result)}]};});}
   catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
  });
 };
 tool('list_chat_clarifications','Ожидающие вопросы Пети: исходный запрос, варианты, поля и срок действия. Только разрешённые чаты. Ответы продолжаются в исходном чате без переключения интерфейса.',{chatId:id.optional(),...page},args=>{const rows=visible().filter(r=>!args.chatId||r.chatId===args.chatId);return {total:rows.length,items:rows.slice(args.offset,args.offset+args.limit)};});
 tool('get_chat_clarification','Прочитать одно незавершённое уточнение перед ответом.',{chatId:id,clarificationId:id},find);
 async function respond(args,cancel=false){
  const row=find(args),topic=ctx.dialogue.state.topics.find(t=>t.id===row.chatId);
  return ctx.dialogue.within(row.chatId,row.projectId,async()=>{
  const check=()=>{ctx.check();if(ctx.access?.mode!=='edit')throw Error('Нужен доступ на редактирование.');if(!topic||!ctx.dialogue.state.topics.includes(topic)||topic.archived||topic.projectId!==row.projectId||(topic.versionIndex||0)!==row.version||!ctx.dialogue.state.projects.some(p=>p.id===row.projectId&&!p.archived))throw Error('Контекст уточнения изменился.');if(ctx.chatJobs?.busy(topic.id)||ctx.dialogue.busyChat(topic.id))throw Error('В чате уже выполняется запрос.');};
  check();
  const option=args.optionId?row.options.find(o=>o.id===args.optionId):null;
  if(!cancel&&((args.answer!==undefined)===(args.optionId!==undefined)||args.optionId&&!option))throw Error('Передайте либо answer, либо optionId из текущего уточнения.');
  const answer=cancel?'отмена':option?.label||args.answer;
  const project=ctx.dialogue.state.projects.find(p=>p.id===row.projectId);
  const version=topic.versionIndex||0;
  let result;
  try{result=await require('../modules.cjs').withProject(project,()=>session.answer(row.id,answer,check,value=>{topic.messages.push({role:'user',text:value,at:Date.now(),by:args.assistant?'MCP · '+args.assistant:'MCP'});ctx.dialogue.persist();},args.assistant?'MCP · '+args.assistant:'MCP'));}
  catch(error){ctx.check();if(ctx.dialogue.active()===topic)ctx.changed?.({owner:topic.id,name:'answer_chat_clarification',result:{handled:true,error:true,text:error.message}});throw error;}
  check();if(topic.archived||(topic.versionIndex||0)!==version||topic.projectId!==row.projectId)throw Error('Контекст изменился во время продолжения.');
  // The owner handles persistence where possible. Plain results still belong in the chat.
  if(ctx.dialogue.active()===topic&&!topic.archived){
   const last=topic.messages.at(-1);
   if(result.text&&(last?.role!=='assistant'||last.text!==result.text)){topic.messages.push({role:'assistant',text:result.text,at:Date.now(),error:!!result.error});ctx.dialogue.persist();}
   ctx.changed?.({owner:topic.id,name:cancel?'cancel_chat_clarification':'answer_chat_clarification',result:{...result,topicId:topic.id,messages:topic.messages}});
  }
  return {status:result.cancelled?'cancelled':result.error?'error':result.question?'waiting':cancel?'cancelled':'completed',text:result.text,error:!!result.error,clarification:result.clarificationId?visible().find(r=>r.id===result.clarificationId):null};
  });
 }
 tool('answer_chat_clarification','Ответить на вопрос и продолжить сохранённый запрос. Может выполнить исходное действие во внешнем сервисе. Нужны права edit. Открывать чат в Пете не требуется. Передайте answer или optionId. Повторная отправка использованного ID не выполняет действие снова.',{chatId:id,clarificationId:id,answer:z.string().trim().min(1).max(4000).optional(),optionId:id.optional(),assistant:z.string().trim().min(1).max(80).optional()},args=>respond(args),true);
 const accessible=chatId=>{const topic=ctx.dialogue.state.topics.find(t=>t.id===chatId&&!t.archived);if(!topic||ctx.access?.projectId&&topic.projectId!==ctx.access.projectId||!ctx.dialogue.state.projects.some(p=>p.id===topic.projectId&&!p.archived))throw Error('Чат недоступен.');return topic;};
 tool('stop_chat_continuation','Остановить выполняющееся продолжение. Уже выполненные действия не откатываются.',{chatId:id},args=>{accessible(args.chatId);return {stopped:session.stop(args.chatId)};},true);
 tool('list_chat_continuations','История продолжений: кто ответил, состояние и результат. Имя ассистента — необязательная метка клиента, не подтверждённая личность.',{chatId:id,...page},args=>{accessible(args.chatId);const rows=session.history(args.chatId);return {total:rows.length,items:rows.slice(args.offset,args.offset+args.limit)};});
 tool('cancel_chat_clarification','Отменить ожидающее уточнение без выполнения сохранённого запроса.',{chatId:id,clarificationId:id},args=>respond(args,true),true);
}
