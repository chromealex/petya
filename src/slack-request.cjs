const {randomUUID,createHash}=require('node:crypto');
const {chooseChannels,listChannels,findChannel}=require('./slack-channel-route.cjs');
const hash=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>String(s||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/[.!?]+$/,'').trim();
function parse(command){
 const value=clean(command).replace(/^попроси\s+/iu,'');if(value===clean(command))return null;
 const group=require('./team-roles.cjs').addressed(value);
 const exact=/^(команду|(?:в\s+(?:канале\s+)?)?#[\p{L}\p{N}_-]+)\s+(.+)$/iu.exec(value);
 if(!group&&!exact)return null;
 const literal=!!exact?.[1].includes('#');
 const target=literal?exact[1].slice(exact[1].indexOf('#')+1):group?.role==='qa'?'qa':group?'разработка':'';
 const body=(group?.body||exact[2]).trim().replace(/(^|\s)(в|из|по)\s+жир(?:е|у|ы)(?=$|[\s,.!?])/giu,'$1$2 Jira');
 return {target,literal,recipientRole:group?.mentions?group.role:'',text:/^(?:заполнить|дополнить|обновить)\s+(?:состав\s+)?команду$/iu.test(body)?'Коллеги, пожалуйста, помогите заполнить состав команды: напишите в ответах к этому сообщению имена участников, их роли и рабочие контакты.':'Коллеги, просьба: '+body};
}
function thread(topic,channel){try{const u=new URL(topic.slackSource?.url);if(u.hostname!=='app.slack.com'&&!u.hostname.endsWith('.slack.com'))return '';const m=/^\/archives\/([CG][A-Z0-9]+)\/p(\d{10,})$/.exec(u.pathname);if(m?.[1]!==channel)return '';const ts=u.searchParams.get('thread_ts');return /^\d+\.\d{6}$/.test(ts||'')?ts:m[2].slice(0,-6)+'.'+m[2].slice(-6);}catch{return '';}}
class SlackRequest {
 constructor({state,save,settings,enabled,context,request,reply,preview=false,now=Date.now}){Object.assign(this,{state,save,settings,enabled,context,request,reply,preview,now});state.slackRequests ||= [];this.pending=null;this.busy=false;for(const r of state.slackRequests)if(r.status==='sending')r.status='unknown';}
 account(){return hash(this.settings().slackCredential||this.settings().slackToken||'');}
 scope(){return JSON.stringify([this.account(),this.enabled(),this.context(),this.settings().teamMembers]);}
 async turn(command,answer=false){
  let task=parse(command),selected,lookupTarget;
  if(!answer&&!task){this.pending=null;return null;}
  if(!answer&&/(?:не отправляй|не пиши|без отправки|только черновик)/iu.test(command))return this.reply('Поручение не отправлено.');
  if(this.busy)return this.reply('Предыдущее поручение ещё обрабатывается.');
  if(answer){const p=this.pending;this.pending=null;if(!p||p.scope!==this.scope()||this.now()-p.at>600000)return this.reply('Выбор канала устарел. Повторите поручение.',{error:true});
   const value=clean(command).toLowerCase();if(/^(?:отмена|стоп|не надо)$/.test(value))return this.reply('Поручение отменено.');
   const ord={первый:1,первая:1,первое:1,второй:2,вторая:2,второе:2,третий:3,третья:3,третье:3};
   selected=p.options[(ord[value]||Number(value))-1]||p.options.find(c=>c.id.toLowerCase()===value||c.name.toLowerCase()===value.replace(/^#/,''));
   if(!selected)lookupTarget=clean(command);else if(p.lookup)lookupTarget=selected.id;task=p.task;
  }
  this.busy=true;
  try{
   if(!this.enabled()||!(this.settings().slackToken||this.settings().slackCredential))throw Error('Подключите Slack и включите его модуль.');
   const scope=this.scope(),topic=this.context(),account=this.account(),token=this.settings().slackToken||'';
   const check=()=>{require('./answer-cancel.cjs').check();if(scope!==this.scope())throw Error('Проект, тема или подключение изменились. Повторите поручение.');};
   const request=async(...args)=>{check();const result=await this.request(...args);check();return result;};
   let all;try{all=lookupTarget?[await findChannel(request,token,lookupTarget)]:await listChannels(request,token,{target:task.literal?task.target:''});}catch(error){if(error.code==='SLACK_CHANNEL_LOOKUP_REQUIRED')return this.ask(task,error.channels||[],'В какой канал отправить поручение? Введите точное название или ссылку.',true);if(lookupTarget&&!/изменились/u.test(error.message))return this.ask(task,[],error.message,true);throw error;}
   if(lookupTarget)selected=all[0];
   let choice=chooseChannels(all,{...task,topic});
   if(selected){const live=all.find(c=>c.id===selected.id&&!c.is_archived);choice=live?{channels:[live]}:{options:all,reason:'Выбранный канал больше недоступен.'};}
   // A purpose alone cannot authorize the only channel in an unrelated workspace.
   if(!selected&&!task.literal&&!topic.projectMemoryId&&!topic.jiraProject&&!topic.reviewScope&&!topic.slackSource?.url)choice={options:choice.channels||choice.options||all,reason:'Не выбран рабочий проект. В какой канал отправить поручение?'};
   if(!choice.channels)return this.ask(task,choice.options||[],choice.reason);
   const channel=choice.channels[0],thread_ts=thread(topic,channel.id);
   const key=hash(JSON.stringify([account,channel.id,thread_ts,task.text.toLowerCase().replace(/\s+/g,' '),...task.recipientRole?[task.recipientRole]:[]]));
   const legacyKey=hash(JSON.stringify([account,channel.id,thread_ts,task.text.toLowerCase().replace(/\s+/g,' ')]));
   const old=this.state.slackRequests.find(r=>(r.key===key||!Array.isArray(r.recipients)&&r.key===legacyKey)&&(r.status==='unknown'||r.status==='sending'||r.status==='sent'&&this.now()-r.at<900000));
   if(old)return this.receipt(old,true);
   const recipients=task.recipientRole?await require('./slack-recipients.cjs').resolveRecipients({role:task.recipientRole,channel,topic,settings:this.settings(),request,token}):[];
   check();
   const send=async()=>{
   check();
   const row={id:randomUUID(),key,account,channel:channel.id,name:channel.name,thread_ts,text:task.text,recipients,topicId:topic.id,projectId:topic.projectId,version:topic.versionIndex||0,projectMemoryId:topic.projectMemoryId,at:this.now(),status:'sending'};
   this.state.slackRequests.push(row);
   try{this.save();}catch(e){this.state.slackRequests.splice(this.state.slackRequests.indexOf(row),1);throw e;}
   let result;
   try{
    check();
    result=await this.request('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({channel:channel.id,text:(recipients.length?recipients.map(r=>'<@'+r.id+'>').join(' ')+'\n':'')+task.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),...thread_ts?{thread_ts}:{},client_msg_id:row.id,unfurl_links:false,unfurl_media:false,parse:'none',mrkdwn:recipients.length>0})});
   }catch(e){row.status='unknown';this.save();return this.receipt(row);}
   if(typeof result?.ok!=='boolean'){row.status='unknown';this.save();return this.receipt(row);}
   if(!result.ok){row.status='rejected';row.error=String(result.error||'неполный ответ');this.save();return this.receipt(row);}
   if(result.channel!==channel.id||!/^\d+\.\d{6}$/.test(result.ts||'')){row.status='unknown';this.save();return this.receipt(row);}
   row.ts=result.ts;row.status='sent';row.url='https://app.slack.com/archives/'+channel.id+'/p'+result.ts.replace('.','');this.save();
   return this.receipt(row);
   };
   if(this.preview)return require('./input-required.cjs').ask({text:'Отправить в #'+channel.name+(thread_ts?' · ответ в треде':'')+'?\n'+(recipients.length?'Упоминания: '+recipients.map(r=>r.name).join(', ')+'\n':'')+task.text,label:'Отправка сообщения',options:['Отправить','Отмена'],strictChoices:true},async()=>{if(this.busy)throw Error('Дождитесь завершения отправки.');this.busy=true;try{return await send();}finally{this.busy=false;}});
   return await send();
  }catch(e){if(e instanceof require('./input-required.cjs').InputRequired)throw e;return this.reply(e.message,{error:true});}finally{this.busy=false;}
 }
 ask(task,options,reason,lookup=false){options=options.filter(c=>!c.is_archived&&/^[CG][A-Z0-9]+$/.test(c.id)).slice(0,8);this.pending={task,options,lookup,scope:this.scope(),at:this.now()};return this.reply(reason||'Куда отправить поручение?',{question:true,slackRequestReply:true,...lookup||!options.length?{clarificationInput:{label:'Канал Slack',placeholder:'#название или ссылка',submit:'Продолжить'}}:{},slackRequestChoices:options.map(c=>({id:c.id,label:'#'+c.name}))});}
 async verify(id,authorize=()=>{}){
  const row=this.state.slackRequests.find(r=>r.id===id),scope=this.scope();
  const check=()=>{authorize();require('./answer-cancel.cjs').check();if(!row||row.account!==this.account()||row.topicId!==this.context().id||row.projectId!==this.context().projectId||(row.version||0)!==(this.context().versionIndex||0)||scope!==this.scope()||!this.enabled())throw Error('Чат или подключение Slack изменились. Проверка недоступна.');};
  check();const url=new URL('https://slack.com/api/'+(row.thread_ts?'conversations.replies':'conversations.history'));
  url.searchParams.set('channel',row.channel);url.searchParams.set('limit','15');url.searchParams.set('oldest',row.ts||String(Math.max(0,row.at/1000-60)));url.searchParams.set('inclusive','true');if(row.thread_ts)url.searchParams.set('ts',row.thread_ts);
  const result=await this.request(url.href,{headers:{Authorization:'Bearer '+(this.settings().slackToken||'')}});check();
  if(!result?.ok)throw Error('Не удалось проверить Slack: '+String(result?.error||'нет ответа')+'. Повторная отправка не выполнялась.');
  const found=(result.messages||[]).find(m=>/^\d+\.\d{6}$/.test(m.ts||'')&&(row.ts?m.ts===row.ts:m.client_msg_id===row.id));
  if(!found){row.verificationText='В прочитанной части канала подтверждение не найдено. Это не означает, что сообщение не отправлено. Откройте канал; повторная отправка заблокирована.';this.save();return {...this.receipt(row),text:row.verificationText,error:true};}
  delete row.verificationText;row.ts=found.ts;row.status='sent';row.verifiedAt=this.now();row.url='https://app.slack.com/archives/'+row.channel+'/p'+row.ts.replace('.','');this.save();return this.receipt(row);
 }
 receipt(row,duplicate=false){const ok=row.status==='sent';return this.reply(ok?(duplicate?'Уже отправил':'Отправил поручение')+' в #'+row.name+'.'+(row.recipients?.length?' Отметил: '+row.recipients.map(r=>r.name).join(', ')+'.':''): row.status==='rejected'?'Slack отклонил отправку в #'+row.name+': '+row.error+'. Сообщение не отправлено.': 'Slack не подтвердил отправку в #'+row.name+'. Автоматически повторять поручение не буду, чтобы не создать дубль.',{error:!ok,actionReceipt:{id:row.id,version:row.version||0,service:'slack',action:'send',status:ok?'confirmed':row.status==='rejected'?'rejected':'unknown',channelName:row.name,channel:row.channel,at:row.at,url:row.url||'https://app.slack.com/archives/'+row.channel,summary:row.text,verifiedAt:row.verifiedAt,verificationText:row.verificationText},sources:[{title:ok?'Поручение в Slack':'Проверить канал Slack',url:row.url||'https://app.slack.com/archives/'+row.channel}]});}
}
module.exports={SlackRequest,parse,thread};
