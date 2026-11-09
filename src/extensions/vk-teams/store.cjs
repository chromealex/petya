// What the VK Teams bot has received, kept on this computer: the Bot API has no history, so messages exist for Petya
// only from the events it took from the queue (events/get). `<company data>/extensions/vk-teams/events.json` (folder
// 0700, file 0600): the last event id, the chats the bot has seen and their messages of the last 31 days (at most 5000).
// newMessage adds a message, editedMessage replaces its text, deleteMessage removes it; members joining or leaving
// only make the chat known. Nothing else is kept (no files, only how many were attached).
const fs=require('node:fs');
const path=require('node:path');
const DAY=86400000,KEEP_DAYS=31,MAX_MESSAGES=5000;
const KINDS={private:'direct',group:'group',channel:'channel'};

const empty=()=>({lastEventId:0,bot:'',chats:{},messages:[],syncedAt:0,error:''});
function file(dataRoot){return path.join(dataRoot,'extensions','vk-teams','events.json');}
function read(dataRoot){
 if(!dataRoot)return empty();
 try{const v=JSON.parse(fs.readFileSync(file(dataRoot),'utf8'));return {...empty(),...v,chats:v.chats&&typeof v.chats==='object'?v.chats:{},messages:Array.isArray(v.messages)?v.messages:[]};}
 catch{return empty();}
}
function write(dataRoot,state){
 if(!dataRoot)return;
 const dir=path.dirname(file(dataRoot));fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const tmp=file(dataRoot)+'.'+process.pid+'.tmp';
 fs.writeFileSync(tmp,JSON.stringify(state),{mode:0o600});fs.renameSync(tmp,file(dataRoot));
}
function wipe(dataRoot){try{fs.rmSync(path.dirname(file(dataRoot)),{recursive:true,force:true});}catch{/* nothing kept */}}

const name=from=>[from?.firstName,from?.lastName].filter(Boolean).join(' ')||String(from?.nick||from?.userId||'?');
const text=v=>String(v??'').replace(/\r\n?/g,'\n').slice(0,10000);
// A newMessage / editedMessage payload → a stored message. A reply part names the message it answers; a message in a
// thread carries `parent_topic` {chatId, messageId} (the thread's root).
function messageOf(p,bot){
 const chat=p.chat||{};
 const reply=(p.parts||[]).find(x=>x?.type==='reply')?.payload?.message;
 const topic=p.parent_topic||p.parentTopic||null;
 const files=(p.parts||[]).filter(x=>['file','sticker','voice'].includes(x?.type)).length;
 const captions=(p.parts||[]).filter(x=>x?.type==='file'&&x.payload?.caption).map(x=>x.payload.caption);
 return {id:String(p.msgId),chat:String(topic?.chatId||chat.chatId||''),from:{id:String(p.from?.userId||''),name:name(p.from)},
  text:text(p.text||captions.join('\n')),at:(Number(p.timestamp)||0)*1000,replyTo:reply?.msgId?String(reply.msgId):null,
  thread:topic?.messageId?String(topic.messageId):null,files,bot:!!bot&&String(p.from?.userId||'')===bot};
}
function know(state,chat,at){
 if(!chat?.chatId)return;
 const id=String(chat.chatId),old=state.chats[id]||{};
 state.chats[id]={id,title:String(chat.title||old.title||[chat.firstName,chat.lastName].filter(Boolean).join(' ')||id).slice(0,120),kind:KINDS[chat.type]||old.kind||'group',at:Math.max(old.at||0,at||0)};
}
// Applies a batch of events; returns how many messages were added.
function apply(state,events,{now=Date.now()}={}){
 let added=0;
 for(const e of events){
  const id=Number(e?.eventId);if(Number.isFinite(id)&&id>state.lastEventId)state.lastEventId=id;
  const p=e?.payload||{};
  if(e?.type==='newMessage'||e?.type==='editedMessage'){
   if(!p.msgId||!p.chat?.chatId)continue;
   const m=messageOf(p,state.bot);
   know(state,p.chat,m.at);
   if(m.thread&&p.parent_topic?.chatId&&p.parent_topic.chatId!==p.chat.chatId)know(state,{chatId:p.parent_topic.chatId,type:'group'},m.at);
   const i=state.messages.findIndex(x=>x.id===m.id&&x.chat===m.chat);
   if(i>=0){state.messages[i]={...state.messages[i],text:m.text,edited:true};continue;}
   if(e.type==='editedMessage')continue;
   state.messages.push(m);added++;
  }else if(e?.type==='deleteMessage'){
   const chat=String(p.chat?.chatId||'');state.messages=state.messages.filter(x=>!(x.id===String(p.msgId)&&x.chat===chat));
  }else if(e?.type==='newChatMembers'||e?.type==='leftChatMembers'||e?.type==='pinnedMessage'||e?.type==='unpinnedMessage'){
   know(state,p.chat,(Number(p.timestamp)||0)*1000||now);
  }
 }
 // Replies point to their thread root: a reply to a reply belongs to the same thread.
 const byId=new Map(state.messages.map(m=>[m.chat+':'+m.id,m]));
 for(const m of state.messages){
  if(m.thread||!m.replyTo)continue;
  let root=byId.get(m.chat+':'+m.replyTo),guard=0;
  while(root?.replyTo&&byId.has(m.chat+':'+root.replyTo)&&guard++<20)root=byId.get(m.chat+':'+root.replyTo);
  m.thread=root?root.thread||root.id:m.replyTo;
 }
 const since=now-KEEP_DAYS*DAY;
 state.messages=state.messages.filter(m=>m.at>=since).sort((a,b)=>a.at-b.at).slice(-MAX_MESSAGES);
 return added;
}

module.exports={DAY,KEEP_DAYS,MAX_MESSAGES,file,read,write,wipe,apply,messageOf,empty};
