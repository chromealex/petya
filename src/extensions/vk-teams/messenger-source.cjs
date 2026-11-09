// «VK Teams» as a `messenger-source` (docs/foundations/messengers.md): the chats the bot is in and the messages it
// received since it was connected (the Bot API has no history), from the local store after a fresh sync. Read-only.
// Search is a word search over the stored messages. No presence: the Bot API does not expose it.
const client=require('./client.cjs');
const {current}=require('./sync.cjs');

function chatsOf(state){
 return Object.values(state.chats).sort((a,b)=>(b.at||0)-(a.at||0)).map(c=>({id:c.id,name:c.title,kind:c.kind}));
}
function convert(state,messages){
 const replies=new Map();for(const x of state.messages)if(x.thread){const k=x.chat+':'+x.thread;replies.set(k,(replies.get(k)||0)+1);}
 return messages.map(m=>{const c=state.chats[m.chat]||{id:m.chat,title:m.chat},n=replies.get(m.chat+':'+m.id)||0;
  return {id:m.id,channel:{id:c.id,name:c.title},thread:m.thread||(n?m.id:null),replyTo:m.replyTo,
   author:m.from,bot:m.bot,text:m.text,at:m.at,url:'',replies:n,files:m.files};});
}
// Light stems: «оплату», «оплата», «оплаты» meet.
const stems=q=>String(q||'').toLowerCase().replace(/ё/g,'е').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=2).map(w=>/^[а-я]+$/.test(w)&&w.length>=5?w.slice(0,w.length-2):w).slice(0,8);

module.exports={
 id:'vk-teams',name:'VK Teams',
 names:[/vk\s*teams|вк\s*тимс\p{L}*|vk\s*тимс\p{L}*|вк\s*teams|вктимс\p{L}*|myteam/iu],
 ready:settings=>settings['extension_vk-teams']==='true'&&client.connected(settings),
 hint:()=>'Вставьте токен бота в «Настройки → VK Teams» и добавьте бота в нужные чаты.',
 chatsOf,convert,stems,
 async channels(services){const {state}=await current(services);return chatsOf(state);},
 async messages(services,{channel,since,until,check}){
  const {state,notes}=await current(services);check();
  if(!state.chats[channel])throw Error('Бот не состоит в этом чате VK Teams.');
  const a=Date.parse(since),b=Date.parse(until);
  return {messages:convert(state,state.messages.filter(m=>m.chat===channel&&m.at>=a&&m.at<=b)),notes};
 },
 async thread(services,{channel,id,check}){
  const {state,notes}=await current(services);check();
  const list=state.messages.filter(m=>(!channel||m.chat===channel)&&(m.id===id||m.thread===id));
  return {messages:convert(state,list),notes};
 },
 async search(services,{query,since,check}){
  const {state,notes}=await current(services);check();
  const words=stems(query),a=Date.parse(since);
  if(!words.length)return {messages:[]};
  const hits=state.messages.filter(m=>m.at>=a&&words.every(w=>m.text.toLowerCase().replace(/ё/g,'е').includes(w)));
  return {messages:convert(state,hits),notes};
 }
};
