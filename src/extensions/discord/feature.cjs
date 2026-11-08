// «Discord»: the game community's Discord server in the chat. Reads the chosen channels, their active threads and
// pinned messages over the REST API with a bot token (no gateway), and shows what players say: themes with verbatim
// quotes and links, mood, frequent questions with answers drafted from the pinned messages, bug reports that can go
// to the task tracker. A message is posted only from a card where the user sees the exact text and the channel and
// presses «Отправить»; a channel is never guessed (the Slack rule in AGENTS.md): it is named in the request, it is
// the source thread of a question, or the user picks it from the shared question panel.
const {randomUUID}=require('node:crypto');
const kit=require('../app-kit.cjs');
const client=require('./client.cjs');
const d=require('./digest.cjs');
const ID='discord',BY='Discord';

// --- Routing -------------------------------------------------------------------------------------------------
const NAME=/discord|дискорд\p{L}*/iu;
// Not this app: coding with discord.js / discord.py, the user's own Discord client not working, other messengers.
const CODE=/discord\s*\.\s*(?:js|py)|discord(?:js|py)|discord[\s.-]?(?:api|sdk|webhook|интент)|(?:библиотек|пакет|модул|npm|pip)\p{L}*\s+(?:для\s+)?discord|(?:напиши|написать|сделай|сделать|создай|создать|разработай|закодь|код)\p{L}*\s+(?:\p{L}+\s+){0,2}бот\p{L}*|бот\p{L}*\s+(?:для|на|в)\s+(?:discord|дискорд)/iu;
const BROKEN=/(?:discord|дискорд\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается|подключается|обновляется|отвечает)|лагает|тормозит|упал|завис|вылетает)|не\s+(?:работает|запускается|грузится|открывается)\s+(?:discord|дискорд)|(?:установи|установить|скачай|скачать|обнови|обновить|удали|удалить|переустанови)\p{L}*\s+(?:\p{L}+\s+)?(?:discord|дискорд)|(?:discord|дискорд\p{L}*)\s+nitro|нитро/iu;
const OTHER=/slack|слак\p{L}*|телеграм\p{L}*|telegram|(?:^|[^\p{L}])тг(?=$|[^\p{L}])|поддержк\p{L}*|тикет\p{L}*|zendesk|отзыв\p{L}*|(?:app\s?store|google\s?play)/iu;
const FAQ=/частые вопросы|часто спрашивают|что спрашивают игроки|вопросы игроков/iu;
const SEND=/(?:^|[^\p{L}])(?:отправь|отправить|опубликуй|опубликовать|запости|запостить|выложи|выложить|кинь|скинь|напиши|написать|ответь|ответить|анонсируй|объяви)(?=$|[^\p{L}])[^:?!]{0,60}?(?:в|во|на)\s+(?:discord|дискорд)/iu;

function wanted(text){
 const t=String(text||'').trim();
 if(!t||CODE.test(t)||BROKEN.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить|создать бота))/iu.test(t))return false;
 if(NAME.test(t))return true;
 return FAQ.test(t)&&!OTHER.test(t);
}

// --- Channels named in the request -----------------------------------------------------------------------------
const key=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/^#/,'').replace(/[^\p{L}\p{N}]+/gu,'');
function namedChannel(text){
 const t=String(text||'');
 return t.match(/#([\p{L}\p{N}_-]{2,})/u)?.[1]||t.match(/(?:в|во|из)\s+канал(?:е|а|у)?\s+[«"]?([\p{L}\p{N}_-]{2,})/iu)?.[1]||null;
}
const findChannel=(list,name)=>name?list.find(c=>key(c.name)===key(name))||null:null;

// The text to post: after a colon, in «quotes», or after «, что …».
function messageText(text){
 const t=String(text||'');
 const colon=t.indexOf(':');
 if(colon>=0){const rest=t.slice(colon+1).trim();if(rest)return rest.replace(/^[«"](.*)[»"]$/su,'$1').trim();}
 const quoted=t.match(/[«"]([^»"]{2,})[»"]/u);if(quoted)return quoted[1].trim();
 const that=t.match(/(?:discord\p{L}*|дискорд\p{L}*)[^,]*?,?\s+что\s+(.{2,})$/isu);if(that)return that[1].trim();
 return '';
}

// --- Seen marks: the newest message id per channel shown in the last digest (for unread counts) ----------------
function seenOf(settings){try{const v=JSON.parse(settings.discordSeen||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function markSeen(s,rows,channels){
 const seen=seenOf(s.settings);
 for(const c of channels){const top=rows.filter(m=>m.channel===c.id).reduce((a,m)=>!a||client.newer(m.id,a)?m.id:a,seen[c.id]||null);if(top)seen[c.id]=top;}
 const keep=Object.fromEntries(Object.entries(seen).filter(([k,v])=>client.SNOWFLAKE.test(k)&&client.SNOWFLAKE.test(String(v))).slice(-25));
 try{s.saveSettings?.({discordSeen:JSON.stringify(keep)});}catch{/* unread counts are a nicety */}
}

// --- Reading -------------------------------------------------------------------------------------------------------
async function collect(s,chosen,{days,now=new Date(),wantPins=true}){
 const c=client.config(s.settings),seen=seenOf(s.settings),notes=[],errors=[];
 const since={};
 for(const ch of chosen){
  if(days)since[ch.id]=new Date(now.getTime()-days*d.DAY);
  else{const last=seen[ch.id]&&client.timeOf(seen[ch.id]);since[ch.id]=last&&now-last<14*d.DAY?last:new Date(now.getTime()-3*d.DAY);}
 }
 const rows=[],pinned=[];
 for(const ch of chosen){
  if(ch.type===15)continue;// a forum has no messages of its own, only posts (threads)
  try{s.requestProgress?.report('Читаю #'+ch.name);rows.push(...await client.messages(s,ch.id,{since:since[ch.id],guild:c.guild}));}
  catch(e){errors.push(e);notes.push('#'+ch.name+': '+e.message);}
 }
 // Active threads and forum posts of the chosen channels with activity in the window.
 try{
  const list=(await client.threads(s,c.guild,chosen.map(x=>x.id))).filter(t=>t.last&&client.timeOf(t.last)>=since[t.parent]).sort((a,b)=>client.newer(a.last,b.last)?-1:1).slice(0,8);
  for(const t of list){
   try{s.requestProgress?.report('Читаю ветку «'+t.name.slice(0,40)+'»');rows.push(...(await client.messages(s,t.parent,{since:since[t.parent],guild:c.guild,thread:t.id,pages:1})).map(m=>({...m,threadName:t.name})));}
   catch(e){notes.push('Ветка «'+t.name+'»: '+e.message);}
  }
 }catch(e){notes.push('Ветки: '+e.message);}
 if(wantPins)for(const ch of chosen.filter(x=>x.type!==15).slice(0,6)){
  try{pinned.push(...(await client.pins(s,ch.id,{guild:c.guild})).filter(m=>d.normalize(m.text)));}catch{/* pins are context only */}
 }
 if(errors.length&&errors.length===chosen.filter(x=>x.type!==15).length&&!rows.length)throw errors[0];
 return {rows:rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)),pinned:pinned.slice(0,20),since,seen,notes};
}

async function analyse(s,rows,pinned,names,which){
 if(!s.settings.model||rows.length<2)return {clusters:s.settings.model?[]:null,faq:null};
 const sample=rows.slice(0,150);
 let clusters=null,faq=null;
 if(which!=='faq'){
  s.requestProgress?.report(which==='bugs'?'Ищу сообщения о багах':'Группирую сообщения по темам');
  const raw=await kit.modelJSON(s,{system:(which==='bugs'?'Найди в сообщениях игроков из Discord сообщения о багах и сгруппируй их по проблеме (не больше 6 тем, kind всегда bug).':'Сгруппируй сообщения игроков из Discord по темам (не больше 6).')+' title — короткая тема по-русски. kind — bug (баг или вылет), question (вопрос), feedback (пожелание или жалоба на баланс, монетизацию), praise (похвала), other. sentiment — настроение темы. messages — номера сообщений этой темы. quotes — 1–2 точные цитаты, скопированные из сообщений дословно, без изменений и перевода. Флуд и приветствия не включай.',
   user:d.numbered(sample,names),schema:d.CLUSTER_SCHEMA,predict:1600}).catch(()=>null);
  clusters=raw?d.clusters(raw,sample).filter(c=>which!=='bugs'||c.kind==='bug'):[];
 }
 if(which!=='bugs'){
  s.requestProgress?.report('Собираю частые вопросы');
  const questions=sample.filter(m=>d.QUESTION.test(m.text));
  if(questions.length){
   const raw=await kit.modelJSON(s,{system:'Найди вопросы, которые игроки задают в Discord чаще всего (не больше 6). question — вопрос коротко по-русски. messages — номера сообщений с этим вопросом. Ответ answer пиши только по закреплённым сообщениям: pin — номер закреплённого сообщения, на котором основан ответ, answer — короткий ответ игрокам на языке вопроса. Если в закреплённых сообщениях ответа нет, pin = 0 и answer пустой. Ничего не выдумывай.',
    user:'Сообщения игроков:\n'+d.numbered(questions.slice(0,100),names)+'\n\nЗакреплённые сообщения:\n'+(pinned.length?pinned.map((m,i)=>(i+1)+'. [#'+(names[m.channel]||m.channel)+'] '+d.normalize(m.text).slice(0,500)).join('\n'):'(нет)'),schema:d.FAQ_SCHEMA,predict:1600}).catch(()=>null);
   faq=raw?d.faq(raw,questions.slice(0,100),pinned):[];
  }else faq=[];
 }
 return {clusters,faq};
}

const days=n=>n+' '+kit.plural(n,['день','дня','дней']);
// Discord's own answers (token, access, limits) are already explained in words; network failures go to the shared wording.
const fail=(s,command,e)=>e?.status?kit.reply(s,command,{by:BY,error:true,text:BY+' · '+e.message}):kit.failure(s,command,BY,e);
async function digest(s,command,chosen,which){
 const c=client.config(s.settings),now=new Date(),asked=d.period(command);
 const span=asked||(which==='digest'?null:7);
 const got=await collect(s,chosen,{days:span,now,wantPins:which!=='bugs'});
 const all=got.rows,rows=all.filter(d.human),names=Object.fromEntries(c.channels.map(x=>[x.id,x.name]));
 const hidden=d.contentHidden(all);
 const notes=[...got.notes];
 if(hidden)notes.unshift('Discord отдаёт сообщения без текста: включите Message Content Intent у бота (Developer Portal → Bot → Privileged Gateway Intents).');
 const {clusters,faq}=hidden?{clusters:s.settings.model?[]:null,faq:null}:await analyse(s,rows,got.pinned,names,which);
 const from=new Date(Math.min(...Object.values(got.since).map(x=>x.getTime()),now.getTime()-d.DAY));
 const channels=chosen.map(ch=>{
  const own=rows.filter(m=>m.channel===ch.id),mark=got.seen[ch.id];
  return {id:ch.id,name:ch.name,type:ch.type,count:own.length,unread:mark?own.filter(m=>client.newer(m.id,mark)).length:own.length,url:client.messageUrl(c.guild,ch.id)};
 });
 const bugs=clusters?clusters.filter(x=>x.kind==='bug'):null;
 const card={id:randomUUID(),guild:c.guild,guildName:c.guildName,mode:which,days:span,from:from.toISOString(),to:now.toISOString(),total:rows.length,
  channels,activity:d.activity(rows,from,now).slice(-14),
  mood:rows.length?{score:clusters?.length?Math.round(clusters.reduce((a,x)=>a+x.sentiment*x.count,0)/clusters.reduce((a,x)=>a+x.count,0)*100)/100:d.wordMood(rows),byModel:!!clusters?.length}:null,
  clusters:which==='bugs'?bugs:clusters,faq:faq??(which==='bugs'?null:d.plainFaq(rows)),faqByModel:faq!==null,
  bugs:which==='bugs'&&clusters===null?d.plainBugs(rows):which!=='bugs'&&clusters===null?d.plainBugs(rows).slice(0,4):[],
  pinned:got.pinned.slice(0,6).map(m=>({text:d.normalize(m.text).slice(0,200),url:m.url,channel:m.channel})),
  sendable:c.channels.filter(x=>client.SENDABLE.has(x.type)).map(x=>({id:x.id,name:x.name})),
  hidden,notes,model:!!s.settings.model,at:Date.now()};
 markSeen(s,all,chosen);
 const where=chosen.length===1?' в #'+chosen[0].name:'';
 const period=span?' за '+days(span):' с прошлого просмотра';
 let text;
 if(hidden)text='Discord'+where+': бот не видит текст сообщений — включите Message Content Intent в Developer Portal.';
 else if(!rows.length)text='Discord'+where+period+': новых сообщений игроков нет.';
 else{
  text='Discord'+where+period+': '+rows.length+' '+kit.plural(rows.length,['сообщение','сообщения','сообщений'])+' игроков.';
  if(which==='bugs')text+=bugs?(bugs.length?' Баги: '+bugs.slice(0,3).map(x=>x.title.toLowerCase()+' ('+x.count+')').join(', ')+'.':' Сообщений о багах не нашлось.'):' Похожих на баги: '+card.bugs.length+' (по словам, без модели).';
  else if(which==='faq')text+=card.faq.length?' Чаще всего спрашивают: '+card.faq.slice(0,3).map(x=>'«'+x.question+'» ('+x.count+')').join(', ')+'.':' Повторяющихся вопросов нет.';
  else if(clusters?.length)text+=' Главные темы: '+clusters.slice(0,3).map(x=>x.title.toLowerCase()+' ('+x.count+')').join(', ')+'.';
 }
 return kit.reply(s,command,{by:BY,text,data:{discordDigest:card},sources:[{title:'Discord · '+(c.guildName||'сервер'),url:client.messageUrl(c.guild,chosen[0].id)}]});
}

// --- Sending: a preview card; nothing is posted until «Отправить» -------------------------------------------------
function compose(s,command,channel,text){
 const c=client.config(s.settings);
 const card={id:randomUUID(),guild:c.guild,guildName:c.guildName,channel:{id:channel.id,name:channel.name},text:text.slice(0,4000),limit:client.LIMIT,replyTo:null,sent:null};
 const over=card.text.length>client.LIMIT;
 return kit.reply(s,command,{by:BY,question:false,text:'Сообщение в #'+channel.name+' готово. Проверьте текст и нажмите «Отправить» — без этого ничего не уйдёт.'+(over?' Текст длиннее '+client.LIMIT+' символов: сократите его.':''),data:{discordCompose:card}});
}
function sendTurn(s,command){
 const c=client.config(s.settings),targets=c.channels.filter(x=>client.SENDABLE.has(x.type));
 if(!targets.length)return kit.reply(s,command,{by:BY,question:true,text:'Среди выбранных каналов Discord нет текстовых, куда можно писать. Отметьте канал в «Настройки → Discord».'});
 const text=messageText(command),name=namedChannel(command.slice(0,command.indexOf(':')>=0?command.indexOf(':'):undefined)),hit=findChannel(targets,name);
 const withText=channel=>{
  if(text)return compose(s,command,channel,text);
  return require('../../input-required.cjs').ask({text:'Что написать в #'+channel.name+'?',label:'Текст сообщения'},answer=>compose(s,command,channel,String(answer||'').trim()));
 };
 if(hit)return withText(hit);
 // Never the first or the last channel by default: the user picks it.
 const labels=targets.map(x=>'#'+x.name);
 return require('../../input-required.cjs').ask({text:(name?'Канала «'+name+'» нет среди выбранных. ':'')+'В какой канал Discord отправить?',label:'Канал',options:labels,strictChoices:true},
  choice=>{const ch=targets[labels.indexOf(choice)]||findChannel(targets,choice);if(!ch)throw Error('Такого канала нет среди выбранных.');return withText(ch);});
}

async function turn(s,command){
 const text=String(command||'');
 if(!wanted(text)||!kit.installed(s,ID))return null;
 if(!client.connected(s.settings)){
  const c=client.config(s.settings);
  return kit.reply(s,command,{by:BY,question:true,text:!c.token?'Discord пока не подключён. Создайте бота в Discord Developer Portal, включите ему Message Content Intent, добавьте на сервер и вставьте токен в «Настройки → Discord».':'Выберите сервер и каналы, которые читать, в «Настройки → Discord».'});
 }
 const c=client.config(s.settings),which=d.mode(text);
 if(SEND.test(text)&&which!=='faq')return sendTurn(s,text);
 const name=namedChannel(text),hit=findChannel(c.channels,name);
 if(name&&!hit&&!/^(?:discord|дискорд)/iu.test(name)){
  const labels=c.channels.map(x=>'#'+x.name);
  return require('../../input-required.cjs').ask({text:'Канала «'+name+'» нет среди выбранных. Какой показать?',label:'Канал',options:labels,strictChoices:true},
   choice=>digest(s,command,[c.channels[labels.indexOf(choice)]||c.channels[0]].filter(Boolean),which).catch(e=>fail(s,command,e)));
 }
 try{return await digest(s,text,hit?[hit]:c.channels,which);}
 catch(e){if(e instanceof require('../../input-required.cjs').InputRequired)throw e;return fail(s,command,e);}
}

// --- Card actions ----------------------------------------------------------------------------------------------------
// Cards Petya saved in the chat, by id: a message is sent only to a channel the card showed.
function locate(s,cardId){
 for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){
  for(const k of ['discordCompose','discordDigest']){const card=message.extensionData?.[k];if(card?.id===cardId)return {message,card,kind:k};}
 }
 return null;
}
function setup(s){
 const sending=new Set();
 // {card, channel, replyTo?, thread?} and exactly the text the user saw in the editor.
 async function send(ref,text){
  if(!client.connected(s.settings))throw Error('Discord не подключён. Откройте «Настройки → Discord».');
  const hit=locate(s,ref?.card);if(!hit)throw Error('Карточка не найдена в чате. Повторите запрос.');
  const c=client.config(s.settings);
  if(hit.card.guild!==c.guild)throw Error('Сервер Discord в настройках изменился. Повторите запрос.');
  // A compose card posts to the channel it showed; a reply to a frequent question goes to the question's own channel
  // or thread, as a reply to its latest message.
  let channel,target,question=null;
  if(hit.kind==='discordCompose'){if(ref.channel!==hit.card.channel.id)throw Error('Канал не совпадает с карточкой.');channel=target=ref.channel;}
  else{question=(hit.card.faq||[]).find(x=>x.latest?.id&&x.latest.id===ref?.replyTo);if(!question)throw Error('Вопрос не найден в карточке.');channel=question.channel;target=question.thread||question.channel;}
  if(!c.channels.some(x=>x.id===channel))throw Error('Этого канала больше нет среди выбранных в настройках.');
  // Never twice: a sent card stays sent (a write with an unknown outcome is not retried either).
  if((question||hit.card).sent)throw Error('Это сообщение уже отправлено.');
  const lock=hit.card.id+':'+(ref.replyTo||'');if(sending.has(lock))throw Error('Сообщение уже отправляется.');
  sending.add(lock);
  try{
   const result=await client.send(s,target,text,{replyTo:question?question.latest.id:null});
   if(question)question.sent={...result,text};
   else{hit.card.sent={...result,text};hit.card.text=text;}
   s.dialogue.persist?.();
   return {...result,text:'Отправлено в Discord.'};
  }finally{sending.delete(lock);}
 }
 function status(){const c=client.config(s.settings);return {hasToken:!!c.token,guild:c.guild,guildName:c.guildName,channels:c.channels,connected:client.connected(s.settings)};}
 return {ipc:{send,status,guilds:()=>client.guilds(s),channels:guild=>client.channels(s,guild)}};
}

function validate(next){
 if(next.discordToken&&!/^(?:Bot\s+)?[\w-]{20,}\.[\w-]{4,}\.[\w-]{20,}$/.test(String(next.discordToken).trim()))throw Error('Это не похоже на токен бота Discord: он из трёх частей через точку (Developer Portal → Bot → Reset Token).');
 if(next.discordGuild&&!client.SNOWFLAKE.test(String(next.discordGuild).trim()))throw Error('ID сервера Discord — число из 17–20 цифр.');
 if(next.discordChannels){let v;try{v=JSON.parse(next.discordChannels);}catch{throw Error('Список каналов Discord повреждён. Отметьте каналы заново.');}if(!Array.isArray(v)||v.length>25)throw Error('Отметьте не больше 25 каналов Discord.');}
}
module.exports={name:'discordApp',
 defaults:{['extension_'+ID]:'false',discordToken:'',discordGuild:'',discordGuildName:'',discordChannels:'[]',discordSeen:'{}'},
 secrets:['discordToken'],validate,setup,turn,wanted,namedChannel,messageText,locate};
