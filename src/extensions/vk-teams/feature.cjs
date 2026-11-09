// «VK Teams»: work chats in VK Teams through a bot (VK Teams Bot API). The bot sees only the chats it was added to and
// only messages that arrive after that: there is no history in the Bot API, so Petya keeps what the bot receives
// (store.cjs, synced on demand and every few minutes while the app is added). Reads through the `messenger-source`
// registry (docs/foundations/messengers.md): a chat digest with themes and verbatim quotes, the summary of a thread
// (a message and its replies), search. A message is sent only from a card where the user sees the exact text and the
// chat and presses «Отправить»; a chat is never guessed: it is named in the request, it is the thread the card shows,
// or the user picks it from the shared question panel.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const client=require('./client.cjs');
const store=require('./store.cjs');
const {sync,current}=require('./sync.cjs');
const D=require('../../messenger-digest.cjs');
const M=require('../../features/messenger-sources.cjs');
const {ask,InputRequired}=require('../../input-required.cjs');
const ID='vk-teams',BY='VK Teams';

// --- Routing ---------------------------------------------------------------------------------------------------------
// VK Teams by name (former Myteam). «ВКонтакте», «ВК» alone, Microsoft Teams («тимс») are not it.
const NAME=/vk\s*teams|вк\s*тимс\p{L}*|vk\s*тимс\p{L}*|вк\s*teams|вктимс\p{L}*|myteam/iu;
const CODE=/(?:бот\p{L}*|bot\s*api|api|sdk|интеграци\p{L}*|webhook\p{L}*|вебхук\p{L}*)\s+(?:для\s+|в\s+|к\s+)?(?:vk\s*teams|вк\s*тимс\p{L}*|vk\s*тимс\p{L}*|вк\s*teams)|(?:напиши|написать|сделай|сделать|создай|создать|разработай|закодь)\p{L}*\s+(?:\p{L}+\s+){0,2}(?:бот\p{L}*|интеграци\p{L}*)|metabot|метабот/iu;
const BROKEN=/(?:vk\s*teams|вк\s*тимс\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается|подключается|обновляется|присылает)|лагает|тормозит|упал|завис|вылетает)|не\s+(?:работает|запускается|грузится|открывается)\s+(?:vk\s*teams|вк\s*тимс\p{L}*)|(?:установи|установить|скачай|скачать|обнови|обновить|удали|удалить|переустанови)\p{L}*\s+(?:\p{L}+\s+)?(?:vk\s*teams|вк\s*тимс\p{L}*)/iu;
const OTHER=/slack|слак\p{L}*|телеграм\p{L}*|telegram|discord|дискорд\p{L}*|mattermost|маттермост\p{L}*|microsoft\s*teams/iu;
function wanted(text){
 const t=String(text||'').trim();
 if(!t||!NAME.test(t)||CODE.test(t)||BROKEN.test(t)||OTHER.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|чем\s+\S+\s+\S+\s+(?:лучше|хуже|отличается)|как\s+(?:подключить|настроить|установить|создать|сделать))/iu.test(t))return false;
 // «Поиск по всему» owns searches everywhere and answers from its results, even when a messenger is named.
 if(/(?:^|[^\p{L}])(?:везде|повсюду|всюду|по\s+всему|по\s+всем\s+(?:источникам|сервисам))(?=$|[^\p{L}])|(?:по|из|на\s+основе)\s+найденн/iu.test(t))return false;
 return true;
}
const days=n=>n+' '+kit.plural(n,['день','дня','дней']);
const periodText=n=>n===1?'за сутки':'за '+days(n);
const registry=s=>s.messengerSources||M.create(s);
const fail=(s,command,e)=>e?.status!==undefined&&e.status!==0?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);
const quoted=c=>'«'+c.name+'»';
const NONE='Бот VK Teams ещё не видел ни одного чата. Добавьте бота в рабочий чат: он видит только чаты, куда его добавили, и только сообщения после этого.';

async function chats(s){return (await registry(s).channels(ID));}

// --- Digest ----------------------------------------------------------------------------------------------------------
async function read(s,chosen,span){
 const reg=registry(s),until=new Date(),since=new Date(until.getTime()-span*M.DAY),notes=[],errors=[],messages=[];
 for(const ch of chosen){
  try{const r=await reg.messages(ID,{channel:ch.id,since:since.toISOString(),until:until.toISOString(),limit:500});messages.push(...r.messages);notes.push(...r.notes);}
  catch(e){errors.push(e);notes.push(quoted(ch)+': '+e.message);}
 }
 if(errors.length&&errors.length===chosen.length)throw errors[0];
 return {messages:messages.sort((a,b)=>b.at.localeCompare(a.at)),since:since.toISOString(),until:until.toISOString(),notes:[...new Set(notes)]};
}
function earliest(s){const st=store.read(s.dataRoot);return st.messages.length?new Date(st.messages[0].at).toISOString():'';}
async function digest(s,command,chosen,span){
 const got=await read(s,chosen,span);
 s.requestProgress?.report('Собираю сводку');
 const first=earliest(s);
 if(first&&first>got.since)got.notes.push('Бот получает сообщения с момента подключения: самое раннее сохранённое — '+new Date(first).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})+'.');
 const card=await D.digest(s,{app:ID,messages:got.messages,channels:chosen,since:got.since,until:got.until,days:span,what:'рабочего чата команды в VK Teams',notes:got.notes});
 card.server='VK Teams';card.sendable=chosen.map(c=>({id:c.id,name:c.name}));
 const where=chosen.length===1?' в '+quoted(chosen[0]):'';
 let text;
 if(!card.total)text='VK Teams'+where+' '+periodText(span)+': новых сообщений нет.';
 else{
  const active=card.channels.filter(x=>x.count).length;
  text='VK Teams'+where+' '+periodText(span)+': '+card.total+' '+kit.plural(card.total,['сообщение','сообщения','сообщений'])+(chosen.length>1?' в '+active+' '+kit.plural(active,['чате','чатах','чатах']):'')+'.';
  if(card.themes?.length)text+=' Главные темы: '+card.themes.slice(0,3).map(x=>x.title.toLowerCase()+' ('+x.count+')').join(', ')+'.';
  else if(card.threads.length)text+=' Самое живое обсуждение: «'+card.threads[0].title.slice(0,80)+'» ('+card.threads[0].replies+' '+kit.plural(card.threads[0].replies,['ответ','ответа','ответов'])+').';
 }
 return kit.reply(s,command,{by:BY,text,data:{vkTeamsCard:card}});
}
function chooseChat(s,command,list,name,then,{question='Какой чат VK Teams?'}={}){
 const labels=list.map(c=>c.name);
 return ask({text:(name?'Чата «'+name+'» нет среди чатов бота. ':'')+question,label:'Чат',options:[...labels],strictChoices:true},
  choice=>{const ch=list[labels.indexOf(choice)]||D.findChannel(list,choice);if(!ch)throw Error('Такого чата нет среди чатов бота.');return then(ch);});
}

// --- Thread ----------------------------------------------------------------------------------------------------------
async function summarize(s,command,rootId,channel){
 const r=await registry(s).thread(ID,{id:rootId,channel});
 if(!r.messages.length)return kit.reply(s,command,{by:BY,text:'VK Teams: такого треда среди полученных ботом сообщений нет.'});
 s.requestProgress?.report('Пересказываю тред');
 const card=await D.threadCard(s,{app:ID,messages:r.messages,notes:r.notes});
 card.server='VK Teams';card.limit=client.LIMIT;
 const t=card.thread;
 const text=(t.summary?t.summary+' ':'Тред «'+t.root.text.slice(0,90)+'»: '+t.replies+' '+kit.plural(t.replies,['ответ','ответа','ответов'])+', участники: '+t.people.slice(0,5).join(', ')+'.')+(card.model&&!t.byModel?' Пересказ не получился — показываю сообщения.':'');
 return kit.reply(s,command,{by:BY,text:text.trim(),data:{vkTeamsCard:card}});
}
const THREAD_WORDS=/(?:^|\s)(?:перескажи|перескажите|пересказ\p{L}*|сводк\p{L}*|кратко|итог\p{L}*|о\s+ч[её]м|резюм\p{L}*|подытожь|суммируй|что\s+(?:решили|обсуждали|там)|тред\p{L}*|трэд\p{L}*|ветк\p{L}*|обсуждени\p{L}*|в|во|про|по|чат\p{L}*|последн\p{L}*)(?=$|[\s,.:;!?])/giu;
async function threadTurn(s,command,list){
 const ref=String(command).match(/(?:тред\p{L}*|ветк\p{L}*|сообщени\p{L}*)\s+#?(\d{3,25})/iu)?.[1];
 if(ref)return summarize(s,command,ref);
 const name=D.namedChannel(command),hit=D.findChannel(list,name);
 if(name&&!hit)return chooseChat(s,command,list,name,ch=>pick(s,command,[ch]),{question:'В каком чате искать тред?'});
 return pick(s,command,hit?[hit]:list);
}
async function pick(s,command,chosen){
 const got=await read(s,chosen,7);
 const words=D.subject(command,NAME).replace(THREAD_WORDS,' ').replace(/#\S+/g,' ').split(/\s+/).filter(w=>w.length>=3).map(w=>w.toLowerCase().replace(/ё/g,'е').slice(0,Math.max(4,w.length-2)));
 let list=M.threads(got.messages,20);
 if(words.length)list=list.filter(t=>words.every(w=>t.title.toLowerCase().replace(/ё/g,'е').includes(w)));
 if(!list.length)return kit.reply(s,command,{by:BY,text:'VK Teams: '+(words.length?'тредов с такими словами':'тредов с ответами')+' за 7 дней в '+(chosen.length===1?quoted(chosen[0]):'чатах бота')+' нет. Тредом считается сообщение и ответы на него.'});
 if(list.length===1)return summarize(s,command,list[0].id,list[0].channel.id);
 const top=list.slice(0,6),labels=top.map((t,i)=>(i+1)+'. '+t.title.slice(0,70)+' · '+t.channel.name+' · '+t.replies+' '+kit.plural(t.replies,['ответ','ответа','ответов']));
 return ask({text:'Какой тред VK Teams пересказать?',label:'Тред',options:[...labels],strictChoices:true},choice=>{const t=top[labels.indexOf(choice)];if(!t)throw Error('Выберите тред из списка.');return summarize(s,command,t.id,t.channel.id);});
}

// --- Search ----------------------------------------------------------------------------------------------------------
async function searchTurn(s,command,query){
 const q=query??D.subject(command,NAME);
 if(!q)return ask({text:'Что найти в VK Teams?',label:'Слова для поиска'},answer=>searchTurn(s,command,String(answer||'').trim().slice(0,200)));
 s.requestProgress?.report('Ищу в VK Teams');
 const r=await registry(s).search(ID,{query:q,days:31,limit:60});
 const card=D.searchCard({app:ID,query:q,messages:r.messages,notes:r.notes,scope:'сообщения, полученные ботом'});
 card.server='VK Teams';
 const text=r.messages.length?'VK Teams: по «'+q+'» нашёл '+r.messages.length+' '+kit.plural(r.messages.length,['сообщение','сообщения','сообщений'])+' среди полученных ботом.':'VK Teams: по «'+q+'» среди сообщений, полученных ботом, ничего нет.';
 return kit.reply(s,command,{by:BY,text,data:{vkTeamsCard:card}});
}

// --- Sending: a preview card; nothing is sent until «Отправить» --------------------------------------------------------
function compose(s,command,chat,text){
 const card={id:randomUUID(),app:ID,channel:{id:chat.id,name:chat.name},text:text.slice(0,client.LIMIT+1000),limit:client.LIMIT,sent:null,server:'VK Teams'};
 const over=card.text.length>client.LIMIT;
 return kit.reply(s,command,{by:BY,text:'Сообщение в «'+chat.name+'» готово. Проверьте текст и нажмите «Отправить» — без этого ничего не уйдёт.'+(over?' Текст длиннее '+client.LIMIT+' символов: сократите его.':''),data:{vkTeamsCompose:card}});
}
function sendTurn(s,command,list){
 const text=D.messageText(command,NAME);
 const head=command.indexOf(':')>=0?command.slice(0,command.indexOf(':')):command;
 const name=D.namedChannel(head),hit=D.findChannel(list,name);
 const withText=chat=>text?compose(s,command,chat,text):ask({text:'Что написать в «'+chat.name+'»?',label:'Текст сообщения'},answer=>{const v=String(answer||'').trim();if(!v)throw Error('Напишите текст сообщения.');return compose(s,command,chat,v);});
 if(hit)return withText(hit);
 // Never the first or the last chat by default: the user picks it.
 return chooseChat(s,command,list,name,withText,{question:'В какой чат VK Teams отправить?'});
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 if(!client.connected(s.settings))return kit.reply(s,command,{by:BY,question:true,text:'VK Teams пока не подключён. Создайте бота у @metabot в VK Teams (/newbot), вставьте его токен в «Настройки → VK Teams» и добавьте бота в рабочие чаты.'});
 const m=D.mode(text,NAME);
 try{
  const list=await chats(s);
  if(!list.length)return kit.reply(s,command,{by:BY,question:true,text:NONE});
  if(m==='send')return sendTurn(s,text,list);
  if(m==='thread')return await threadTurn(s,text,list);
  if(m==='search')return await searchTurn(s,text);
  const span=M.period(text)||1,name=D.namedChannel(text),hit=D.findChannel(list,name);
  if(name&&!hit)return chooseChat(s,command,list,name,ch=>digest(s,command,[ch],span).catch(e=>fail(s,command,e)),{question:'Какой чат показать?'});
  return await digest(s,text,hit?[hit]:list,span);
 }catch(e){if(e instanceof InputRequired)throw e;return fail(s,command,e);}
}

// --- Card actions, background sync -----------------------------------------------------------------------------------
function locate(s,cardId){
 for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){
  for(const k of ['vkTeamsCompose','vkTeamsCard']){const card=message.extensionData?.[k];if(card?.id===cardId)return {card,kind:k};}
 }
 return null;
}
const timers=new Set();
// While the app is added and connected, the bot's queue is read every 5 minutes so events are not lost; a new or
// changed error is announced once in the notification center (stable id `vk-teams-sync`) and as a system
// notification through the notification policy (source `vk-teams`; docs/foundations/notifications-policy.md), so
// focus sessions, quiet hours or a mute rule decide when it pops up; the recovery once, in the center only.
function background(s,publish,{electron}={}){
 let lastError='';
 return async function quiet(){
  if(!kit.installed(s,ID)||!client.connected(s.settings)||!s.dataRoot)return;
  try{await sync(s,{rounds:20});if(lastError){lastError='';publish({id:'vk-teams-sync',title:'VK Teams',text:'Сообщения бота снова обновляются.',kind:'success',busy:false});}}
  catch(e){if(e.message!==lastError){
   lastError=e.message;const text='Не удалось получить сообщения бота: '+e.message;
   publish({id:'vk-teams-sync',title:'VK Teams',text,kind:'error',busy:false});
   const tr=v=>{try{return require('../../interface-language.cjs').t(v);}catch{return v;}};
   require('../../features/notification-policy.cjs').notify(s,{source:'vk-teams',title:tr('Петя')+' · VK Teams',body:tr('Не удалось получить сообщения бота: ')+e.message},{electron});
  }}
 };
}
function setup(s){
 const sending=new Set();
 const publish=item=>{if(s.win&&!s.win.isDestroyed?.())s.win.webContents.send('extension-install-progress',item);};
 const quiet=background(s,publish);
 if(!s.smoke&&process.env.PETYA_VERIFY_BUILD!=='1'){const timer=setInterval(()=>{quiet();},5*60000);timer.unref?.();timers.add(timer);}
 // {card, channel} for a compose card, {card, root} for a reply in a thread card; exactly the text the user saw.
 async function send(ref,text){
  if(!client.connected(s.settings))throw Error('VK Teams не подключён. Откройте «Настройки → VK Teams».');
  const hit=locate(s,ref?.card);if(!hit)throw Error('Карточка не найдена в чате. Повторите запрос.');
  let chat,root=null,holder;
  if(hit.kind==='vkTeamsCompose'){if(ref.channel!==hit.card.channel.id)throw Error('Чат не совпадает с карточкой.');chat=ref.channel;holder=hit.card;}
  else if(hit.card.mode==='thread'&&ref?.root&&ref.root===hit.card.thread.id){chat=hit.card.channel.id;root=hit.card.thread.id;holder=hit.card.thread;}
  else throw Error('Отвечать можно только в тред, показанный в карточке.');
  const state=store.read(s.dataRoot);
  if(!state.chats[chat])throw Error('Бот больше не видит этот чат.');
  // Never twice: a sent card stays sent (a write with an unknown outcome is not retried either).
  if(holder.sent)throw Error('Это сообщение уже отправлено.');
  const lock=hit.card.id;if(sending.has(lock))throw Error('Сообщение уже отправляется.');
  sending.add(lock);
  try{
   const result=await client.send(s,chat,text,{replyTo:root});
   holder.sent={...result,url:'',text};if(hit.kind==='vkTeamsCompose')hit.card.text=text;
   s.dialogue.persist?.();
   return {...holder.sent,text:'Отправлено в VK Teams.'};
  }finally{sending.delete(lock);}
 }
 function status(){
  const c=client.config(s.settings),st=store.read(s.dataRoot),fresh=st.token===require('./sync.cjs').tokenKey(s.settings);
  const counts=new Map();if(fresh)for(const m of st.messages)counts.set(m.chat,(counts.get(m.chat)||0)+1);
  return {api:c.api,defaultApi:client.DEFAULT_API,hasToken:!!c.token,connected:client.connected(s.settings),bot:fresh?st.botName||'':'',syncedAt:fresh?st.syncedAt:0,error:fresh?st.error:'',
   chats:fresh?Object.values(st.chats).sort((a,b)=>(b.at||0)-(a.at||0)).map(x=>({id:x.id,title:x.title,kind:x.kind,count:counts.get(x.id)||0,at:x.at})):[]};
 }
 return {ipc:{send,status,sync:async()=>{await sync(s,{rounds:20});return status();},forget:()=>{store.wipe(s.dataRoot);return status();}}};
}

function validate(next){
 if(next.vkTeamsApi&&!client.apiBase(next.vkTeamsApi))throw Error('Адрес Bot API VK Teams — https://…/bot/v1 (http только для этого компьютера).');
 if(next.vkTeamsToken&&!/^[\w.:-]{16,200}$/.test(String(next.vkTeamsToken).trim()))throw Error('Это не похоже на токен бота VK Teams: его выдаёт @metabot после /newbot.');
}
module.exports={name:'vkTeamsApp',
 defaults:{['extension_'+ID]:'false',vkTeamsApi:'',vkTeamsToken:''},
 secrets:['vkTeamsToken'],validate,setup,turn,wanted,locate,background,claims:command=>wanted(command),
 teardown(){for(const t of timers)clearInterval(t);timers.clear();},
 dashboard:{accepts:command=>wanted(command)&&D.mode(command,NAME)==='digest',size:'m',widgets:[]}};
