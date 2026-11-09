// VK Teams Bot API calls of «VK Teams» (https://teams.vk.com/botapi/): HTTP GET `<api>/<method>?token=…&…`, every
// answer is JSON with `ok`. The bot only sees chats it was added to and only what happens after it is there: the Bot
// API has no message history, events are taken from a queue with `events/get` (long polling, `lastEventId`) and kept
// by Petya (store.cjs). Read: self/get, events/get, chats/getInfo. Write: messages/sendText, only from a card the user
// confirmed (feature.cjs).
const DEFAULT_API='https://api.internal.myteam.mail.ru/bot/v1';
const LIMIT=4096;// keep messages within a screen; VK Teams accepts longer texts, but long announcements belong in a file

// The API address: https (http only for this computer), no credentials or query, no trailing slash.
function apiBase(value){
 const v=String(value||'').trim().replace(/\/+$/,'')||DEFAULT_API;
 let u;try{u=new URL(/^[a-z]+:\/\//i.test(v)?v:'https://'+v);}catch{return '';}
 const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))return '';
 if(u.username||u.password||u.search||u.hash)return '';
 return (u.origin+u.pathname).replace(/\/+$/,'');
}
function config(settings){return {api:apiBase(settings.vkTeamsApi),token:String(settings.vkTeamsToken||'').trim()};}
const connected=settings=>{const c=config(settings);return !!c.api&&!!c.token;};

// Errors in words the user can act on.
function explain(error,method){
 const status=error.status||0;
 const text=String(error.description||'');
 let message;
 if(status===401||/invalid token|token.*(?:invalid|not found)|unauthori/i.test(text))message='VK Teams не принял токен бота. Проверьте его в «Настройки → VK Teams» (токен выдаёт @metabot).';
 else if(status===404)message='VK Teams не нашёл адрес Bot API. Проверьте адрес в «Настройки → VK Teams».';
 else if(status===429)message='VK Teams ограничил число запросов. Повторите позже.';
 else if(/chat.*not found|no such chat|permission|forbidden|not a member/i.test(text))message=method==='messages/sendText'?'Бот не может писать в этот чат: добавьте его в чат или попросите собеседника написать боту первым.':'У бота нет доступа к этому чату.';
 else message=text?'VK Teams: '+text.slice(0,200):error.message||'VK Teams недоступен.';
 const e=Error(message);e.status=status;e.cause=error;return e;
}
async function call(s,method,params={},{timeoutMs=20000}={}){
 const c=config(s.settings);
 if(!c.api)throw Error('Адрес Bot API VK Teams — https://…/bot/v1.');
 if(!c.token)throw Error('Нет токена бота VK Teams.');
 const query=new URLSearchParams({token:c.token});
 for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')query.append(k,String(v));
 let r;
 try{r=await s.request(c.api+'/'+method+'?'+query,{timeoutMs,headers:{Accept:'application/json'}});}
 catch(e){throw explain(e,method);}
 if(!r||typeof r!=='object')throw Error('VK Teams вернул пустой ответ.');
 if(r.ok===false)throw explain(Object.assign(Error(String(r.description||'ошибка')),{description:r.description}),method);
 return r;
}

async function self(s){const r=await call(s,'self/get');return {id:String(r.userId||''),nick:String(r.nick||''),name:String(r.firstName||r.nick||'')};}
// One batch of events after `lastEventId`; `pollTime` 0 answers at once (Petya reads the queue on demand and on a timer).
async function events(s,lastEventId=0,pollTime=0){
 const r=await call(s,'events/get',{lastEventId:Number(lastEventId)||0,pollTime},{timeoutMs:(Number(pollTime)||0)*1000+20000});
 return Array.isArray(r.events)?r.events:[];
}
async function chatInfo(s,chatId){return call(s,'chats/getInfo',{chatId});}
// Plain text, no parse mode: the draft is sent exactly as written. `replyMsgId` makes it a reply.
async function send(s,chatId,text,{replyTo=null}={}){
 const body=String(text||'');
 if(!body.trim())throw Error('Напишите текст сообщения.');
 if(body.length>LIMIT)throw Error('Сообщение длиннее '+LIMIT+' символов. Сократите текст.');
 const r=await call(s,'messages/sendText',{chatId,text:body,...(replyTo?{replyMsgId:replyTo}:{})},{timeoutMs:30000});
 if(!r.msgId)throw Error('VK Teams не подтвердил отправку.');
 return {id:String(r.msgId),at:new Date().toISOString()};
}

module.exports={DEFAULT_API,LIMIT,apiBase,config,connected,explain,call,self,events,chatInfo,send};
