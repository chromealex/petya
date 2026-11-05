const {resolveChannels}=require('./slack.cjs');
const team=require('./team.cjs');
function requestKind(command) {
 const text=String(command).trim().replace(/^петя[\s,:.!?—-]*/iu,'');
 if(/(?:не\s+(?:из|через|по)|без)\s+(?:slack|слака?)(?=$|[\s,.!])/iu.test(text))return {explicit:false,generic:false,channels:[]};
 const explicit=/(?:из|через|по)\s+(?:slack|слака?)(?=$|[\s,.!#])/iu.test(text);
 const generic=/^(?:пожалуйста[,\s]+)?(?:заполни|дополни|обнови|собери|сформируй)\s+(?:(?:раздел|справочник|состав|карточки)\s+)?(?:нашу\s+|мою\s+)?команд[уыа][.!?\s]*$/iu.test(text);
 const links=text.match(/https:\/\/[^\s]+/gu)||[];
 const channels=links.filter(link=>{try{const u=new URL(link);return (u.hostname==='app.slack.com'||u.hostname.endsWith('.slack.com'))&&/^\/archives\/[CG][A-Z0-9]+/.test(u.pathname);}catch{return false;}});
 channels.push(...[...text.matchAll(/#([\p{L}\p{N}_*-]+)/gu)].map(m=>m[1]));
 const tail=text.replace(/^.*?(?:из|через|по)\s+(?:slack|слака?)[\s,:]*/iu,'').replace(/^(?:канал[аы]?|каналов)\s+/iu,'').replace(/[.!?]+$/,'').trim();
 if(explicit&&!channels.length&&/^[\p{L}\p{N}_*-]+$/u.test(tail)&&!/^пожалуйста$/iu.test(tail))channels.push(tail);
 return {explicit,generic,channels};
}
class SlackTeam {
 constructor({settings,request,enabled,context=()=>({})}){Object.assign(this,{settings,request,enabled,context});}
 async collect(command) {
  const kind=requestKind(command),s=this.settings();
  if(!kind.explicit&&!kind.generic)return null;
  if(!this.enabled()||!(s.slackCredential||s.slackToken)) {
   if(kind.explicit)throw Error('Подключите Slack в настройках текущей компании, затем повторите заполнение команды.');
   return null;
  }
  const selection=kind.channels.length?kind.channels.join(','):(s.slackChannels||this.context().projectChannels?.map(c=>c.id).join(',')||(this.context().hasSavedChannels?'*':''));
  if(!selection?.trim()){const e=Error('Из каких каналов взять команду? Назовите канал в формате «из Slack #разработка» или выберите рабочие каналы в подключении Slack.');e.teamChannels=true;throw e;}
  const fingerprint=()=>JSON.stringify([this.enabled(),this.settings().slackCredential,this.settings().slackToken,this.settings().slackChannels,this.context()]);
  const before=fingerprint(),check=()=>{if(before!==fingerprint())throw Error('Подключение Slack изменилось. Повторите заполнение команды.');};
  const request=async(url,options)=>{check();const data=await this.request(url,options);check();return data;};
  const api=async(method,args={})=>{
   const data=await request('https://slack.com/api/'+method+'?'+new URLSearchParams(args),{headers:{Authorization:'Bearer '+(s.slackToken||'')}});
   if(!data?.ok)throw Error('Slack: '+String(data?.error||'empty_response')+(data?.error==='missing_scope'?'. Переподключите Slack с правами users:read, channels:read и groups:read.':''));
   return data;
  };
  const routing=require('./slack-channel-route.cjs');
  const target=kind.channels.length===1?kind.channels[0]:'';
  const literal=/#/.test(command)||/^[CG][A-Z0-9]+$/.test(target)||target.includes('-')||target.startsWith('https://');
  let channels;
  if(kind.channels.length>1)channels=(await resolveChannels(selection,s.slackToken||'',request)).filter(id=>/^[CG]/.test(id));
  else if(target&&literal){
   try{channels=[(await routing.findChannel(request,s.slackToken||'',target)).id];}
   catch(error){if(!/изменилось/u.test(error.message)){error.teamChannels=true;error.channelInput=true;}throw error;}
  }
  else {
   const all=await routing.listChannels(request,s.slackToken||'');
   const allowed=kind.channels.length||this.context().projectChannels?.length?all:all.filter(c=>require('./slack.cjs').selectors(selection).some(p=>p===c.id||require('./slack.cjs').matches(c.name,[p])));
   const choice=routing.chooseChannels(allowed,{target,literal,topic:this.context()});
   if(!choice.channels){const options=(choice.options||[]).slice(0,8);const e=Error(choice.reason+' '+options.map((c,i)=>(i+1)+': '+c.name).join('; ')+'. Назовите канал или номер варианта.');e.teamChannels=true;e.channelOptions=options;throw e;}
   channels=choice.channels.map(c=>c.id);
  }
  if(!channels.length)throw Error('Для заполнения команды выберите рабочие каналы Slack, а не личные переписки.');
  if(channels.length>30){const e=Error('Выбрано больше 30 каналов. Уточните рабочий канал: например, «из Slack #разработка».');e.teamChannels=true;throw e;}
  const ids=new Set();
  const pages=async(method,args,consume)=>{
   let cursor='';const seen=new Set();
   for(let page=0;page<50;page++) {
    const data=await api(method,{...args,limit:'200',...(cursor?{cursor}:{})});
    if(!Array.isArray(data.members))throw Error('Slack вернул неполный список участников. Повторите запрос.');
    const complete=consume(data.members);
    cursor=String(data.response_metadata?.next_cursor||'').trim();
    if(!cursor||complete)return;
    if(seen.has(cursor))throw Error('Slack повторил страницу участников. Повторите запрос позже.');seen.add(cursor);
   }
   throw Error('Слишком много страниц Slack. Уточните канал команды.');
  };
  for(const channel of channels)await pages('conversations.members',{channel},rows=>{
   for(const id of rows)if(/^[UW][A-Z0-9]+$/.test(id))ids.add(id);
   if(ids.size>2000){const e=Error('В выбранных каналах слишком много участников. Уточните один рабочий канал.');e.teamChannels=true;throw e;}
  });
  if(!ids.size)return [];
  const remaining=new Set(ids),members=[];
  await pages('users.list',{},rows=>{
   for(const user of rows) {
    if(!remaining.delete(user.id))continue;
    if(user.deleted||user.is_bot||user.is_app_user||user.id==='USLACKBOT')continue;
    const p=user.profile||{},name=String(p.real_name||user.real_name||p.display_name||user.name||'').trim().slice(0,120);
    if(!name)throw Error('Slack не вернул имя участника. Повторите запрос позже.');
    const email=typeof p.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)?p.email.slice(0,254):'';
    const member=team.validate([{name,aliases:p.display_name&&p.display_name!==name?String(p.display_name).slice(0,240):'',role:String(p.title||'').slice(0,160),email,slackId:user.id}])[0];
    members.push({member,source:'Профиль Slack',evidence:JSON.stringify(member)});
    if(members.length>100){const e=Error('В выбранных каналах больше 100 коллег — справочник рассчитан на 100. Уточните канал своей команды.');e.teamChannels=true;throw e;}
   }
   return remaining.size===0;
  });
  if(remaining.size)throw Error('Slack не вернул профили всех участников. Команда не изменена; повторите запрос позже.');
  check();return members;
 }
}
module.exports={SlackTeam,requestKind};
