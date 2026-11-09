const {randomUUID,createHash}=require('node:crypto');
const {listChannels,findChannel}=require('./channel-route.cjs');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function sourceFooter(report){return 'Источник отчёта: Jira · '+report.project+'\nДанные проверены: '+new Date(report.at).toLocaleString('ru-RU')+'\n'+(report.sources||[]).filter(s=>{try{return new URL(s.url).protocol==='https:';}catch{return false;}}).map(s=>s.title+': '+s.url).join('\n');}
class ReportShare{
 constructor({state,save,settings,enabled,dialogue,context,request,progress=()=>{},now=Date.now}){Object.assign(this,{state,save,settings,enabled,dialogue,context,request,progress,now});this.progressItems=new Map();this.drafts=new Map();this.busy=false;this.epoch=0;state.reportShares ||= [];for(const r of state.reportShares)if(r.status==='sending')r.status='unknown';}
 scope(report){const s=this.settings();return hash([s.slackCredential||s.slackToken,this.enabled(),s.jiraUrl,s.jiraProjects,s.jiraProject,this.dialogue.active()?.id,this.dialogue.active()?.jiraProject,this.dialogue.active()?.projectMemoryId,this.dialogue.active()?.reviewScope,this.context(report)]);}
 report(id){this.dialogue.prune();const topic=this.dialogue.state.topics.find(t=>t.workReport?.id===id);if(!topic||topic!==this.dialogue.active())throw Error('Выберите тему исходного отчёта и откройте сообщение заново.');const r=topic.workReport;if(r.site&&r.site!==this.settings().jiraUrl)throw Error('Подключение Jira изменилось. Откройте исходное подключение или подготовьте новый отчёт.');return r;}
 requireSlack(){if(!this.enabled()||!(this.settings().slackToken||this.settings().slackCredential))throw Error('Подключите Slack и включите его модуль.');}
 async auth(check){check();const r=await this.request('https://slack.com/api/auth.test',{headers:{Authorization:'Bearer '+(this.settings().slackToken||'')}});check();if(!r?.ok||!/^T[A-Z0-9]+$/.test(r.team_id||''))throw Error('Не удалось подтвердить рабочее пространство Slack. Проверьте подключение.');return {id:r.team_id,name:String(r.team||r.team_id).slice(0,200)};}
 async track(reportId,work){
  const id='report-share-lookup:'+reportId,send=item=>{this.progressItems.set(id,{id,title:'Канал для отчёта',...item});this.progress(this.progressItems.get(id));};
  if(this.progressItems.get(id)?.busy)throw Error('Поиск канала уже выполняется.');
  send({busy:true,text:'Ищу доступные каналы Slack…',version:'loading',kind:'info'});
  try{const result=await work();send({busy:false,text:result.needsChannel?'Укажите канал в чате.':'Канал можно выбрать в чате.',version:'ready',kind:'success'});return result;}
  catch(e){send({busy:false,text:e.message,version:'error',kind:'error'});throw e;}
 }
 open(reportId){return this.track(reportId,()=>this.openDraft(reportId));}
 async openDraft(reportId){
  this.requireSlack();const report=this.report(reportId),scope=this.scope(report),fingerprint=hash(report),epoch=this.epoch;
  const check=()=>{this.requireSlack();if(epoch!==this.epoch||scope!==this.scope(report)||hash(this.report(reportId))!==fingerprint)throw Error('Тема, проект или подключение изменились. Откройте сообщение заново.');};
  const account=await this.auth(check);let all,needsChannel=false;
  try{all=await listChannels(async(...args)=>{check();const r=await this.request(...args);check();return r;},this.settings().slackToken||'',{pages:3});}
  catch(e){if(e.code!=='SLACK_CHANNEL_LOOKUP_REQUIRED')throw e;check();needsChannel=true;all=e.channels;}
  const channels=all.filter(c=>!c.is_archived&&/^[CG][A-Z0-9]+$/.test(c.id)&&typeof c.name==='string');
  if(!channels.length&&!needsChannel)throw Error('Нет доступных каналов Slack. Проверьте права подключения.');
  const bindings=new Set((this.context(report).projectChannels||[]).map(c=>c.id));
  const id=randomUUID(),draft={id,reportId,scope,fingerprint,account,channels:channels.map(c=>({id:c.id,name:c.name,linked:bindings.has(c.id)})),at:this.now()};
  for(const [key,d] of this.drafts)if(d.reportId===reportId||this.now()-d.at>600000)this.drafts.delete(key);
  this.drafts.set(id,draft);
  return {id,reportId,needsChannel,project:report.project,account:account.name,text:report.text,footer:sourceFooter(report),channels:draft.channels.sort((a,b)=>Number(b.linked)-Number(a.linked)||a.name.localeCompare(b.name)),receipts:this.state.reportShares.filter(r=>r.reportId===reportId&&r.team===account.id).map(r=>this.receipt(r))};
 }
 resolve(reportId,id,query){return this.track(reportId,async()=>{
  const d=this.drafts.get(id);this.check(d);if(d.reportId!==reportId)throw Error('Исходный отчёт изменился.');
  const check=()=>this.check(d),account=await this.auth(check);if(account.id!==d.account.id)throw Error('Рабочее пространство Slack изменилось.');
  const target=await findChannel(async(...args)=>{check();const r=await this.request(...args);check();return r;},this.settings().slackToken||'',query);check();
  const channel={id:target.id,name:target.name,linked:(this.context(this.report(reportId)).projectChannels||[]).some(c=>c.id===target.id)};
  d.channels=[...d.channels.filter(c=>c.id!==channel.id),channel];return {channels:d.channels,selected:channel.id};
 });}
 cancel(id){this.drafts.delete(id);}
 clear(){this.epoch++;this.drafts.clear();this.progressItems.clear();}
 check(d){this.requireSlack();if(!d||this.drafts.get(d.id)!==d||this.now()-d.at>600000)throw Error('Черновик устарел. Откройте сообщение заново.');const report=this.report(d.reportId);if(d.scope!==this.scope(report)||d.fingerprint!==hash(report))throw Error('Тема, проект или подключение изменились. Откройте сообщение заново.');return report;}
 async send({id,channel,text}={}){
  if(this.busy)throw Error('Дождитесь результата текущей отправки.');
  const draft=this.drafts.get(id),report=this.check(draft);
  if(typeof text!=='string'||!text.trim()||text.length>16000)throw Error('Сообщение должно содержать от 1 до 16000 символов.');
  if(!draft.channels.some(c=>c.id===channel))throw Error('Выберите точный канал из списка.');
  this.busy=true;
  try{
   const check=()=>this.check(draft),account=await this.auth(check);
   if(account.id!==draft.account.id)throw Error('Рабочее пространство Slack изменилось. Откройте сообщение заново.');
   const old=this.state.reportShares.find(r=>r.reportId===report.id&&r.team===account.id&&r.channel===channel&&['sending','unknown','sent'].includes(r.status));if(old)return this.receipt(old,true);
   const target=await findChannel(async(...args)=>{check();const r=await this.request(...args);check();return r;},this.settings().slackToken||'',channel);
   const chosen=draft.channels.find(c=>c.id===channel);
   if(!target||target.name!==chosen.name)throw Error('Выбранный канал удалён, архивирован или переименован. Откройте список заново.');
   if(this.state.reportShares.length>=500)throw Error('История отправок заполнена. Сообщение не отправлено.');
   check();
   const message=text.trim()+'\n\n'+sourceFooter(report);
   const row={id:randomUUID(),reportId:report.id,topicId:this.dialogue.active()?.id,projectId:this.dialogue.active()?.projectId,team:account.id,channel,name:target.name,project:report.project,at:this.now(),status:'sending',textHash:hash(message)};
   this.state.reportShares.push(row);try{this.save();}catch(e){this.state.reportShares.splice(this.state.reportShares.indexOf(row),1);throw e;}
   // No automatic retry after a write: a timeout may have happened after Slack accepted it.
   let result;
   try{check();}catch(e){row.status='rejected';this.save();throw e;}
   try{result=await this.request('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+(this.settings().slackToken||''),'Content-Type':'application/json'},body:JSON.stringify({channel,text:message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),client_msg_id:row.id,unfurl_links:false,unfurl_media:false,parse:'none',mrkdwn:false})});}
   catch{row.status='unknown';return this.finish(row);}
   if(result?.ok===false){row.status='rejected';row.error=String(result.error||'неполный ответ').slice(0,200);return this.finish(row);}
   if(result?.ok!==true||result.channel!==channel||!/^\d+\.\d{6}$/.test(result.ts||'')){row.status='unknown';return this.finish(row);}
   row.status='sent';row.ts=result.ts;row.url='https://app.slack.com/archives/'+channel+'/p'+result.ts.replace('.','');return this.finish(row);
  }finally{this.busy=false;}
 }
 finish(row){let warning='';const topic=this.dialogue.state?.topics?.find(t=>t.id===row.topicId&&t.projectId===row.projectId&&t.workReport?.id===row.reportId);if(topic){require('../../action-evidence.cjs').recordReceipt(topic,{id:row.id,action:'send',service:'slack',status:row.status==='sent'?'confirmed':row.status==='rejected'?'rejected':'unknown',channelName:row.name,channel:row.channel,at:row.at});try{this.dialogue.persist();}catch{warning=' Не удалось сохранить подтверждение в диалоге.';}}try{this.save();}catch{warning=' Не удалось обновить локальную историю; после перезапуска проверьте канал перед дальнейшими действиями.';}return {...this.receipt(row),warning};}
 receipt(row,duplicate=false){return {id:row.id,status:row.status,channel:row.channel,name:row.name,project:row.project,url:row.url||'https://app.slack.com/archives/'+row.channel,text:row.status==='sent'?(duplicate?'Этот отчёт уже отправлен':'Отчёт отправлен')+' в #'+row.name+'.':row.status==='rejected'?'Slack отклонил сообщение: '+(row.error||'отправка отменена')+'. Можно исправить причину и повторить.':'Slack не подтвердил отправку в #'+row.name+'. Повтор заблокирован, чтобы не создать дубль. Проверьте канал.'};}
}
module.exports={ReportShare,sourceFooter};
