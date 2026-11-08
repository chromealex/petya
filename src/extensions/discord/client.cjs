// Discord REST API (v10) calls of «Discord»: no gateway connection, only HTTP with a bot token.
// Auth: `Authorization: Bot <token>`. The bot needs View Channels and Read Message History in the chosen channels
// (Send Messages / Send Messages in Threads to post), and the privileged MESSAGE CONTENT intent switched on in the
// Developer Portal: without it Discord returns empty `content` for other people's messages, over REST too.
const API='https://discord.com/api/v10';
const SNOWFLAKE=/^\d{15,21}$/;
// Channel types the app reads: text, announcement, forum (its posts are threads). Threads: 10, 11, 12.
const TYPES={0:'text',5:'announcement',15:'forum'};
const SENDABLE=new Set([0,5]);
const LIMIT=2000;// Discord's message length limit

// Settings: the bot token (secret), the server (guild) id and the chosen channels as JSON [{id,name,type}].
function channelsOf(value){
 let list;try{list=JSON.parse(String(value||'[]'));}catch{return [];}
 if(!Array.isArray(list))return [];
 return list.filter(c=>c&&SNOWFLAKE.test(String(c.id))&&TYPES[c.type]!==undefined).map(c=>({id:String(c.id),name:String(c.name||c.id).slice(0,100),type:Number(c.type)})).slice(0,25);
}
function config(settings){
 return {token:String(settings.discordToken||'').trim().replace(/^Bot\s+/i,''),guild:String(settings.discordGuild||'').trim(),guildName:String(settings.discordGuildName||'').trim(),channels:channelsOf(settings.discordChannels)};
}
const connected=settings=>{const c=config(settings);return !!c.token&&SNOWFLAKE.test(c.guild)&&c.channels.length>0;};

// A snowflake carries its creation time: (id >> 22) + Discord epoch.
const timeOf=id=>{try{return new Date(Number((BigInt(id)>>22n)+1420070400000n));}catch{return null;}};
const snowflakeAt=date=>String((BigInt(date.getTime())-1420070400000n)<<22n);
const newer=(a,b)=>{try{return BigInt(a)>BigInt(b);}catch{return false;}};
const messageUrl=(guild,channel,message)=>'https://discord.com/channels/'+guild+'/'+channel+(message?'/'+message:'');

// Errors in words the user can act on; the HTTP status stays on the error.
function explain(error){
 let code=0;try{code=JSON.parse(error.detail||'{}').code||0;}catch{code=0;}
 const map={401:'Discord не принял токен бота. Проверьте его в «Настройки → Discord».',
  403:code===50013?'Боту не хватает прав в этом канале (нужно «Отправлять сообщения», в ветках — «Отправлять сообщения в ветках»).':'У бота нет доступа к каналу: дайте ему «Просматривать каналы» и «Читать историю сообщений».',
  404:'Discord не нашёл сервер, канал или сообщение. Проверьте выбор в «Настройки → Discord».',
  429:'Discord ограничил число запросов. Повторите через '+Math.ceil(Number(error.retryAfter)||5)+' с.'};
 const e=Error(map[error.status]||error.message||'Discord недоступен.');e.status=error.status;e.code=code;e.cause=error;return e;
}
async function api(s,path,{query,method='GET',body}={}){
 const c=config(s.settings);
 if(!c.token)throw Error('Нет токена бота Discord.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')params.append(k,String(v));
 try{
  return await s.request(API+path+(params.size?'?'+params:''),{method,headers:{Authorization:'Bot '+c.token,Accept:'application/json','User-Agent':'DiscordBot (https://github.com/chromealex/petya, 1.0)',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }catch(e){throw explain(e);}
}
const id=v=>{const x=String(v||'');if(!SNOWFLAKE.test(x))throw Error('Некорректный идентификатор Discord.');return x;};

// --- Settings helpers ----------------------------------------------------------------------------------
async function guilds(s){
 const r=await api(s,'/users/@me/guilds',{query:{limit:200}});
 if(!Array.isArray(r))throw Error('Discord вернул некорректный список серверов.');
 return r.filter(g=>SNOWFLAKE.test(String(g.id))).map(g=>({id:String(g.id),name:String(g.name||g.id)}));
}
async function channels(s,guild){
 const r=await api(s,'/guilds/'+id(guild)+'/channels');
 if(!Array.isArray(r))throw Error('Discord вернул некорректный список каналов.');
 return r.filter(c=>TYPES[c.type]!==undefined&&SNOWFLAKE.test(String(c.id))).sort((a,b)=>(a.position||0)-(b.position||0)).map(c=>({id:String(c.id),name:String(c.name||c.id),type:Number(c.type)}));
}

// --- Reading ---------------------------------------------------------------------------------------------
function normalize(m,{guild,channel,thread=null}){
 return {id:String(m.id),channel,thread,author:String(m.author?.global_name||m.author?.username||'?'),bot:!!m.author?.bot,
  text:String(m.content||''),at:m.timestamp||timeOf(m.id)?.toISOString()||null,attachments:(m.attachments||[]).length,
  embeds:(m.embeds||[]).length,stickers:(m.sticker_items||[]).length,type:Number(m.type)||0,
  replyTo:m.message_reference?.message_id?String(m.message_reference.message_id):null,url:messageUrl(guild,thread||channel,m.id)};
}
// Messages of a channel or thread newer than `since`, newest first; at most `pages` pages of 100.
async function messages(s,channel,{since,pages=2,guild,thread=null}={}){
 const out=[];let before;
 for(let page=0;page<pages;page++){
  const r=await api(s,'/channels/'+id(thread||channel)+'/messages',{query:{limit:100,before}});
  if(!Array.isArray(r))throw Error('Discord вернул некорректный список сообщений.');
  let older=false;
  for(const m of r){const t=Date.parse(m.timestamp||'');if(since&&t<since.getTime()){older=true;break;}out.push(normalize(m,{guild,channel,thread}));}
  if(older||r.length<100)break;
  before=String(r.at(-1).id);
 }
 return out;
}
// Active threads of the server (forum posts are threads too) whose parent is one of the chosen channels.
async function threads(s,guild,parents){
 const r=await api(s,'/guilds/'+id(guild)+'/threads/active');
 return (r?.threads||[]).filter(t=>parents.includes(String(t.parent_id))).map(t=>({id:String(t.id),parent:String(t.parent_id),name:String(t.name||''),last:t.last_message_id?String(t.last_message_id):null,count:Number(t.message_count)||0}));
}
// Pinned messages: the paginated /messages/pins endpoint, or the older /pins list where it is not available.
async function pins(s,channel,{guild}={}){
 let list;
 try{const r=await api(s,'/channels/'+id(channel)+'/messages/pins',{query:{limit:50}});list=(r?.items||[]).map(i=>i.message).filter(Boolean);}
 catch(e){if(e.status!==404)throw e;const r=await api(s,'/channels/'+id(channel)+'/pins');list=Array.isArray(r)?r:[];}
 return list.map(m=>normalize(m,{guild,channel}));
}

// --- Writing (only from a card button the user pressed) ----------------------------------------------------
// Mentions are never expanded: a draft that contains «@everyone» or a user tag does not ping anyone.
async function send(s,channel,content,{replyTo=null}={}){
 const text=String(content||'');
 if(!text.trim())throw Error('Напишите текст сообщения.');
 if(text.length>LIMIT)throw Error('Сообщение длиннее '+LIMIT+' символов — Discord его не примет. Сократите текст.');
 const body={content:text,allowed_mentions:{parse:[]},...(replyTo?{message_reference:{message_id:id(replyTo),fail_if_not_exists:false}}:{})};
 const r=await api(s,'/channels/'+id(channel)+'/messages',{method:'POST',body});
 if(!r?.id)throw Error('Discord не подтвердил отправку.');
 return {id:String(r.id),url:messageUrl(config(s.settings).guild,channel,r.id),at:r.timestamp||new Date().toISOString()};
}

module.exports={API,SNOWFLAKE,TYPES,SENDABLE,LIMIT,config,connected,channelsOf,timeOf,snowflakeAt,newer,messageUrl,explain,api,guilds,channels,messages,threads,pins,send};
