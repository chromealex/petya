// «Mattermost»: the team's Mattermost in the chat, with the user's personal access token on their own server.
// Reads only the channels chosen in settings (through the `messenger-source` registry,
// docs/foundations/messengers.md): a channel digest with themes and verbatim quotes, the summary of a thread, search.
// A message is posted only from a card where the user sees the exact text and the channel and presses «Отправить»;
// a channel is never guessed (AGENTS.md «Slack context»): it is named in the request, it is the thread the card shows,
// or the user picks it from the shared question panel.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const client=require('./client.cjs');
const D=require('../../messenger-digest.cjs');
const M=require('../../features/messenger-sources.cjs');
const {ask,InputRequired}=require('../../input-required.cjs');
const ID='mattermost',BY='Mattermost';

// --- Routing ---------------------------------------------------------------------------------------------------------
const NAME=/mattermost|маттермост\p{L}*|матермост\p{L}*|мэттермост\p{L}*/iu;
// Not this app: building plugins, bots, webhooks or integrations for Mattermost; installing or fixing the server or the
// client; other messengers named in the same request; definitions.
const CODE=/(?:плагин\p{L}*|plugin|webhook\p{L}*|вебхук\p{L}*|бот\p{L}*|api|sdk|интеграци\p{L}*|slash[-\s]?команд\p{L}*)\s+(?:для\s+|в\s+|к\s+)?(?:mattermost|маттермост\p{L}*)|(?:mattermost|маттермост\p{L}*)[\s-]+(?:plugin|webhook|api|sdk|server|сервер\p{L}*\s+(?:поднять|установить|обновить))|(?:напиши|написать|сделай|сделать|создай|создать|разработай|закодь)\p{L}*\s+(?:\p{L}+\s+){0,2}(?:бот\p{L}*|плагин\p{L}*|интеграци\p{L}*)/iu;
const BROKEN=/(?:mattermost|маттермост\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается|подключается|обновляется|присылает)|лагает|тормозит|упал|завис|вылетает)|не\s+(?:работает|запускается|грузится|открывается)\s+(?:mattermost|маттермост\p{L}*)|(?:установи|установить|скачай|скачать|обнови|обновить|удали|удалить|разверни|развернуть|задеплой|подними|поднять|настрой|настроить|переустанови)\p{L}*\s+(?:\p{L}+\s+)?(?:mattermost|маттермост\p{L}*)/iu;
const OTHER=/slack|слак\p{L}*|телеграм\p{L}*|telegram|discord|дискорд\p{L}*|vk\s*teams|вк\s*тимс/iu;
function wanted(text){
 const t=String(text||'').trim();
 if(!t||!NAME.test(t)||CODE.test(t)||BROKEN.test(t)||OTHER.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|чем\s+(?:mattermost|маттермост\p{L}*)\s+(?:лучше|хуже|отличается)|как\s+(?:подключить|настроить|установить|развернуть|создать|сделать))/iu.test(t))return false;
 // «Поиск по всему» owns searches everywhere and answers from its results, even when a messenger is named.
 if(/(?:^|[^\p{L}])(?:везде|повсюду|всюду|по\s+всему|по\s+всем\s+(?:источникам|сервисам))(?=$|[^\p{L}])|(?:по|из|на\s+основе)\s+найденн/iu.test(t))return false;
 return true;
}
const days=n=>n+' '+kit.plural(n,['день','дня','дней']);
const periodText=n=>n===1?'за сутки':'за '+days(n);
const registry=s=>s.messengerSources||M.create(s);
const fail=(s,command,e)=>e?.status?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);
const label=c=>'~'+(c.display||c.name);
const sendable=s=>client.config(s.settings).channels;

// --- Digest ----------------------------------------------------------------------------------------------------------
async function read(s,chosen,span){
 const reg=registry(s),until=new Date(),since=new Date(until.getTime()-span*M.DAY),notes=[],errors=[],messages=[];
 for(const ch of chosen){
  try{s.requestProgress?.report('Читаю ~'+(ch.display||ch.name));const r=await reg.messages(ID,{channel:ch.id,since:since.toISOString(),until:until.toISOString(),limit:500});messages.push(...r.messages);notes.push(...r.notes);if(r.truncated)notes.push('~'+(ch.display||ch.name)+': показаны последние 500 сообщений.');}
  catch(e){errors.push(e);notes.push('~'+(ch.display||ch.name)+': '+e.message);}
 }
 if(errors.length===chosen.length)throw errors[0];
 return {messages:messages.sort((a,b)=>b.at.localeCompare(a.at)),since:since.toISOString(),until:until.toISOString(),notes:[...new Set(notes)]};
}
async function digest(s,command,chosen,span){
 const c=client.config(s.settings),got=await read(s,chosen,span);
 s.requestProgress?.report('Собираю сводку');
 const ids=M.authors(got.messages).map(a=>a.id);
 let presence=null;try{presence=await registry(s).presence(ID,ids);}catch{presence=null;}
 const card=await D.digest(s,{app:ID,messages:got.messages,channels:chosen.map(ch=>({id:ch.id,name:ch.display||ch.name,url:client.channelUrl(c.url,ch.teamName,ch.name)})),since:got.since,until:got.until,days:span,presence,what:'рабочего чата команды в Mattermost',notes:got.notes});
 card.server=c.url.replace(/^https?:\/\//,'');card.sendable=chosen.map(ch=>({id:ch.id,name:ch.display||ch.name}));
 const where=chosen.length===1?' в ~'+(chosen[0].display||chosen[0].name):'';
 let text;
 if(!card.total)text='Mattermost'+where+' '+periodText(span)+': новых сообщений нет.';
 else{
  text='Mattermost'+where+' '+periodText(span)+': '+card.total+' '+kit.plural(card.total,['сообщение','сообщения','сообщений'])+(chosen.length>1?' в '+card.channels.filter(x=>x.count).length+' '+kit.plural(card.channels.filter(x=>x.count).length,['канале','каналах','каналах']):'')+'.';
  if(card.themes?.length)text+=' Главные темы: '+card.themes.slice(0,3).map(x=>x.title.toLowerCase()+' ('+x.count+')').join(', ')+'.';
  else if(card.threads.length)text+=' Самое живое обсуждение: «'+card.threads[0].title.slice(0,80)+'» ('+card.threads[0].replies+' '+kit.plural(card.threads[0].replies,['ответ','ответа','ответов'])+').';
 }
 const sources=card.threads.filter(t=>t.url).slice(0,4).map(t=>({title:'Mattermost · '+t.title.slice(0,80),url:t.url}));
 return kit.reply(s,command,{by:BY,text,data:{mattermostCard:card},sources});
}
function chooseChannel(s,command,name,then,{question='Какой канал Mattermost?'}={}){
 const list=sendable(s),labels=list.map(label);
 return ask({text:(name?'Канала «'+name+'» нет среди выбранных. ':'')+question,label:'Канал',options:[...labels],strictChoices:true},
  choice=>{const ch=list[labels.indexOf(choice)]||D.findChannel(list,String(choice||'').replace(/^~/,''));if(!ch)throw Error('Такого канала нет среди выбранных.');return then(ch);});
}

// --- Thread ----------------------------------------------------------------------------------------------------------
async function summarize(s,command,rootId){
 const r=await registry(s).thread(ID,{id:rootId});
 if(!r.messages.length)return kit.reply(s,command,{by:BY,text:'Mattermost: тред пуст или недоступен.'});
 s.requestProgress?.report('Пересказываю тред');
 const card=await D.threadCard(s,{app:ID,messages:r.messages,notes:r.notes});
 card.server=client.config(s.settings).url.replace(/^https?:\/\//,'');card.limit=client.LIMIT;
 const t=card.thread;
 const text=(t.summary?t.summary+' ':'Тред «'+t.root.text.slice(0,90)+'»: '+t.replies+' '+kit.plural(t.replies,['ответ','ответа','ответов'])+', участники: '+t.people.slice(0,5).join(', ')+'.')+(card.model&&!t.byModel?' Пересказ не получился — показываю сообщения.':'');
 return kit.reply(s,command,{by:BY,text:text.trim(),data:{mattermostCard:card},sources:t.root.url?[{title:'Mattermost · тред',url:t.root.url}]:[]});
}
const THREAD_WORDS=/(?:^|\s)(?:перескажи|перескажите|пересказ\p{L}*|сводк\p{L}*|кратко|итог\p{L}*|о\s+ч[её]м|резюм\p{L}*|подытожь|суммируй|что\s+(?:решили|обсуждали|там)|тред\p{L}*|трэд\p{L}*|ветк\p{L}*|обсуждени\p{L}*|в|во|про|по|канал\p{L}*|последн\p{L}*)(?=$|[\s,.:;!?])/giu;
async function threadTurn(s,command){
 const c=client.config(s.settings);
 const linked=client.postOfLink(command,c.url);
 if(linked){const p=await client.post(s,linked);return summarize(s,command,p?.root_id||linked);}
 if(/https?:\/\/\S+\/pl\//i.test(command))return kit.reply(s,command,{by:BY,question:true,text:'Это ссылка не на сервер '+c.url+'. Пришлите ссылку на сообщение треда с вашего сервера Mattermost («⋯» → «Copy Link»).'});
 const name=D.namedChannel(command),hit=D.findChannel(c.channels,name);
 if(name&&!hit)return chooseChannel(s,command,name,ch=>pick(s,command,[ch]),{question:'В каком канале искать тред?'});
 return pick(s,command,hit?[hit]:c.channels);
}
async function pick(s,command,chosen){
 const got=await read(s,chosen,7);
 const words=D.subject(command,NAME).replace(THREAD_WORDS,' ').replace(/[~#]\S+/g,' ').split(/\s+/).filter(w=>w.length>=3).map(w=>w.toLowerCase().replace(/ё/g,'е').slice(0,Math.max(4,w.length-2)));
 let list=M.threads(got.messages,20);
 if(words.length)list=list.filter(t=>words.every(w=>t.title.toLowerCase().replace(/ё/g,'е').includes(w)));
 if(!list.length)return kit.reply(s,command,{by:BY,text:'Mattermost: '+(words.length?'тредов с такими словами':'тредов с ответами')+' за 7 дней в '+(chosen.length===1?'~'+(chosen[0].display||chosen[0].name):'выбранных каналах')+' нет. Пришлите ссылку на сообщение треда («⋯» → «Copy Link»).'});
 if(list.length===1)return summarize(s,command,list[0].id);
 const top=list.slice(0,6),labels=top.map((t,i)=>(i+1)+'. '+t.title.slice(0,70)+' · ~'+t.channel.name+' · '+t.replies+' '+kit.plural(t.replies,['ответ','ответа','ответов']));
 return ask({text:'Какой тред Mattermost пересказать?',label:'Тред',options:[...labels],strictChoices:true},choice=>{const t=top[labels.indexOf(choice)];if(!t)throw Error('Выберите тред из списка.');return summarize(s,command,t.id);});
}

// --- Search ----------------------------------------------------------------------------------------------------------
async function searchTurn(s,command,query){
 const q=query??D.subject(command,NAME);
 if(!q)return ask({text:'Что найти в Mattermost?',label:'Слова для поиска'},answer=>searchTurn(s,command,String(answer||'').trim().slice(0,200)));
 s.requestProgress?.report('Ищу в Mattermost');
 const r=await registry(s).search(ID,{query:q,days:31,limit:60});
 const card=D.searchCard({app:ID,query:q,messages:r.messages,notes:r.notes,scope:'выбранные каналы'});
 card.server=client.config(s.settings).url.replace(/^https?:\/\//,'');
 const text=r.messages.length?'Mattermost: по «'+q+'» нашёл '+r.messages.length+' '+kit.plural(r.messages.length,['сообщение','сообщения','сообщений'])+' в выбранных каналах.':'Mattermost: по «'+q+'» в выбранных каналах ничего не нашёл.';
 return kit.reply(s,command,{by:BY,text,data:{mattermostCard:card},sources:r.messages.filter(m=>m.url).slice(0,4).map(m=>({title:'Mattermost · ~'+m.channel.name,url:m.url}))});
}

// --- Sending: a preview card; nothing is posted until «Отправить» ------------------------------------------------------
function compose(s,command,channel,text){
 const card={id:randomUUID(),app:ID,channel:{id:channel.id,name:channel.display||channel.name},text:text.slice(0,client.LIMIT+1000),limit:client.LIMIT,sent:null,server:client.config(s.settings).url.replace(/^https?:\/\//,'')};
 const over=card.text.length>client.LIMIT;
 return kit.reply(s,command,{by:BY,text:'Сообщение в ~'+card.channel.name+' готово. Проверьте текст и нажмите «Отправить» — без этого ничего не уйдёт.'+(over?' Текст длиннее '+client.LIMIT+' символов: сократите его.':''),data:{mattermostCompose:card}});
}
function sendTurn(s,command){
 const targets=sendable(s);
 const text=D.messageText(command,NAME);
 const head=command.indexOf(':')>=0?command.slice(0,command.indexOf(':')):command;
 const name=D.namedChannel(head),hit=D.findChannel(targets,name);
 const withText=channel=>text?compose(s,command,channel,text):ask({text:'Что написать в ~'+(channel.display||channel.name)+'?',label:'Текст сообщения'},answer=>{const v=String(answer||'').trim();if(!v)throw Error('Напишите текст сообщения.');return compose(s,command,channel,v);});
 if(hit)return withText(hit);
 // Never the first or the last channel by default: the user picks it.
 return chooseChannel(s,command,name,withText,{question:'В какой канал Mattermost отправить?'});
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 const c=client.config(s.settings);
 if(!client.connected(s.settings))return kit.reply(s,command,{by:BY,question:true,text:!c.url||!c.token?'Mattermost пока не подключён. Укажите адрес сервера и личный токен доступа (Профиль → Безопасность → Personal Access Tokens) в «Настройки → Mattermost».':'Отметьте каналы, которые читать, в «Настройки → Mattermost».'});
 const m=D.mode(text,NAME);
 try{
  if(m==='send')return sendTurn(s,text);
  if(m==='thread')return await threadTurn(s,text);
  if(m==='search')return await searchTurn(s,text);
  const span=M.period(text)||1,name=D.namedChannel(text),hit=D.findChannel(c.channels,name);
  if(name&&!hit)return chooseChannel(s,command,name,ch=>digest(s,command,[ch],span).catch(e=>fail(s,command,e)),{question:'Какой канал показать?'});
  return await digest(s,text,hit?[hit]:c.channels,span);
 }catch(e){if(e instanceof InputRequired)throw e;return fail(s,command,e);}
}

// --- Card actions ----------------------------------------------------------------------------------------------------
function locate(s,cardId){
 for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){
  for(const k of ['mattermostCompose','mattermostCard']){const card=message.extensionData?.[k];if(card?.id===cardId)return {card,kind:k};}
 }
 return null;
}
function setup(s){
 const sending=new Set();
 // {card, channel} for a compose card, {card, root} for a reply in a thread card; exactly the text the user saw.
 async function send(ref,text){
  if(!client.connected(s.settings))throw Error('Mattermost не подключён. Откройте «Настройки → Mattermost».');
  const hit=locate(s,ref?.card);if(!hit)throw Error('Карточка не найдена в чате. Повторите запрос.');
  let channel,root=null,holder;
  if(hit.kind==='mattermostCompose'){if(ref.channel!==hit.card.channel.id)throw Error('Канал не совпадает с карточкой.');channel=ref.channel;holder=hit.card;}
  else if(hit.card.mode==='thread'&&ref?.root&&ref.root===hit.card.thread.id){channel=hit.card.channel.id;root=hit.card.thread.id;holder=hit.card.thread;}
  else throw Error('Отвечать можно только в тред, показанный в карточке.');
  if(!sendable(s).some(x=>x.id===channel))throw Error('Этого канала больше нет среди выбранных в настройках.');
  // Never twice: a sent card stays sent (a write with an unknown outcome is not retried either).
  if(holder.sent)throw Error('Это сообщение уже отправлено.');
  const lock=hit.card.id;if(sending.has(lock))throw Error('Сообщение уже отправляется.');
  sending.add(lock);
  try{
   const result=await client.send(s,channel,text,{root});
   const ch=sendable(s).find(x=>x.id===channel);
   const sent={...result,url:client.permalink(client.config(s.settings).url,ch?.teamName,result.id),text};
   holder.sent=sent;if(hit.kind==='mattermostCompose')hit.card.text=text;
   s.dialogue.persist?.();
   return {...sent,text:'Отправлено в Mattermost.'};
  }finally{sending.delete(lock);}
 }
 function status(){const c=client.config(s.settings);return {url:c.url,hasToken:!!c.token,channels:c.channels,connected:client.connected(s.settings)};}
 return {ipc:{send,status,me:()=>client.me(s),teamList:()=>client.teams(s),channels:team=>client.channels(s,team)}};
}

function validate(next){
 if(next.mattermostUrl&&!client.server(next.mattermostUrl))throw Error('Адрес сервера Mattermost — https://… (http только для этого компьютера), без логина и параметров.');
 if(next.mattermostToken&&!/^[A-Za-z0-9]{20,64}$/.test(String(next.mattermostToken).trim()))throw Error('Это не похоже на личный токен доступа Mattermost: он из 26 латинских букв и цифр (Профиль → Безопасность → Personal Access Tokens).');
 if(next.mattermostChannels){let v;try{v=JSON.parse(next.mattermostChannels);}catch{throw Error('Список каналов Mattermost повреждён. Отметьте каналы заново.');}if(!Array.isArray(v)||v.length>25)throw Error('Отметьте не больше 25 каналов Mattermost.');}
}
module.exports={name:'mattermostApp',
 defaults:{['extension_'+ID]:'false',mattermostUrl:'',mattermostToken:'',mattermostChannels:'[]'},
 secrets:['mattermostToken'],validate,setup,turn,wanted,locate,claims:command=>wanted(command),teardown(){},
 dashboard:{accepts:command=>wanted(command)&&D.mode(command,NAME)==='digest',size:'m',widgets:[]}};
