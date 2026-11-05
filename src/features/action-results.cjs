const {binding}=require('../action-evidence.cjs');
const sessions=new WeakMap();
module.exports={name:'actionResults',register,setup(s){
 const operations=new Map();const publish=item=>{operations.set(item.id,item);if(operations.size>30)operations.delete(operations.keys().next().value);s.win?.webContents.send('chat-change-progress',item);};
 const scope=t=>JSON.stringify([s.companyId,t?.id,t?.projectId,t?.versionIndex||0]);
 function topic(expected){const t=s.dialogue.active();if(!t||t.archived||expected&&scope(t)!==expected)throw Error('Откройте исходный чат.');return t;}
 function snapshot(){const t=s.dialogue.active();if(!t)return {items:[]};return {scope:scope(t),items:(t.actionReceipts||[]).filter(r=>r.binding===binding(t)&&(r.version||0)===(t.versionIndex||0)).map(r=>({...r,index:t.messages.findIndex(m=>m.actionReceiptId===r.id),canVerify:r.service==='slack'&&s.slackRequest.state.slackRequests.some(x=>x.id===r.id)}))};}
 async function verify(expected,id,authorize=()=>{}){authorize();const t=topic(expected),row=t.actionReceipts?.find(r=>r.id===id&&r.binding===binding(t)&&(r.version||0)===(t.versionIndex||0));if(!row||row.service!=='slack')throw Error('Проверка этого действия недоступна.');const progress={id:'receipt:'+id,title:'Проверка результата Slack',text:'Читаю канал…',busy:true,version:'running'};if(operations.get(progress.id)?.busy)throw Error('Проверка уже выполняется.');publish(progress);try{const result=await s.dialogue.within(t.id,t.projectId,()=>require('../modules.cjs').withProject(s.dialogue.state.projects.find(p=>p.id===t.projectId),()=>s.slackRequest.verify(id,authorize)));authorize();topic(expected);publish({...progress,busy:false,text:result.text,kind:result.error?'error':'success',version:String(Date.now())});return {...snapshot(),text:result.text};}catch(error){publish({...progress,busy:false,text:error.message,kind:'error',version:String(Date.now())});throw error;}}
 sessions.set(s.dialogue,{services:s,snapshot,verify});
 return {ipc:{snapshot,verify,progress:()=>[...operations.values()]}};
}};

function register(server,z,ctx){
 const session=sessions.get(ctx.dialogue);if(!session)return;
 const {services:s}=session,id=z.string().min(1).max(200),version=z.number().int().nonnegative();
 const allowed=chatId=>{ctx.check();const t=ctx.dialogue.state.topics.find(t=>t.id===chatId&&!t.archived);if(!t||!ctx.dialogue.state.projects.some(p=>p.id===t.projectId&&!p.archived)||ctx.access?.projectId&&t.projectId!==ctx.access.projectId)throw Error('Чат недоступен.');return t;};
 const items=t=>[
  ...session.snapshot().items.filter(r=>r.service==='slack').map(r=>({id:'receipt:'+r.id,service:r.service,status:r.status,title:r.channelName?'#'+r.channelName:'Slack',canVerify:r.canVerify,verifiedAt:r.verifiedAt,url:r.url})),
  ...(s.chatChanges?.snapshot().items||[]).filter(r=>['jira','files'].includes(t.chatChanges.find(c=>c.id===r.id)?.adapter)).map(r=>({id:'change:'+r.id,service:t.chatChanges.find(c=>c.id===r.id).adapter,status:r.state,title:r.title,canVerify:r.canVerify&&['uncertain','failed','done'].includes(r.state),verifiedAt:r.receipt?.verifiedAt,url:r.receipt?.url}))
 ];
 const tool=(name,description,schema,work)=>server.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}},async args=>{
  try{const t=allowed(args.chatId),projectId=t.projectId,currentVersion=t.versionIndex||0;
   const check=()=>{if(allowed(args.chatId)!==t||t.projectId!==projectId||(t.versionIndex||0)!==currentVersion||args.version!==undefined&&args.version!==currentVersion)throw Error('Версия или проект чата изменились. Получите список результатов заново.');};check();
   const data=await ctx.run(()=>ctx.dialogue.within(t.id,projectId,()=>require('../modules.cjs').withProject(ctx.dialogue.state.projects.find(p=>p.id===projectId),async()=>{check();const result=await work(args,t,check);check();return result;})));
   check();return {content:[{type:'text',text:JSON.stringify(data)}]};
  }catch(error){return {isError:true,content:[{type:'text',text:error.message}]};}
 });
 tool('list_chat_action_results','Результаты действий Slack, Jira и файлов в разрешённом чате. Возвращает ID и версию для проверки, без содержимого файлов и секретов.',{chatId:id,offset:version.default(0),limit:z.number().int().min(1).max(100).default(25)},(args,t)=>{const rows=items(t);return {version:t.versionIndex||0,total:rows.length,items:rows.slice(args.offset,args.offset+args.limit)};});
 tool('verify_chat_action_result','Проверить ранее выполненное действие без повторной отправки или записи. Доступно в read/drafts/edit. Читает Slack, Jira или исходный файл; обновляет только локальное подтверждение и уведомления Пети. Отсутствие подтверждения не разрешает повторять действие.',{chatId:id,resultId:id,version},async(args,t,check)=>{
  const row=items(t).find(r=>r.id===args.resultId);if(!row?.canVerify)throw Error('Результат недоступен для проверки.');
  if(s.chatJobs?.busy(t.id)||ctx.dialogue.busyChat(t.id))throw Error('Дождитесь завершения запроса в этом чате.');
  let text,status;
  if(row.id.startsWith('receipt:')){const before=session.snapshot();const result=await session.verify(before.scope,row.id.slice(8),check);check();const receipt=result.items.find(r=>'receipt:'+r.id===row.id);text=receipt?.verificationText||result.text;status=receipt?.verifiedAt&&!receipt.verificationText?'confirmed':'inconclusive';}
  else{const snapshot=s.chatChanges.snapshot();const result=await s.chatChanges.verify(snapshot.scope,row.id.slice(7),check);check();const change=result.items.find(r=>'change:'+r.id===row.id);text=change?.error||change?.receipt?.text;if(change?.verificationStatus==='error')throw Error(text||'Не удалось проверить результат.');status=change?.state==='done'&&change.receipt?.verifiedAt?'confirmed':'inconclusive';}
  ctx.changed?.({owner:t.id,name:'verify_chat_action_result'});
  return {id:row.id,service:row.service,status,text,checkedAt:Date.now(),replayed:false};
 });
}
