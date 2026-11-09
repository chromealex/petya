// Telegram as a `messenger-source` (docs/foundations/messengers.md), read from what Petya already keeps: the chats the
// user selected, synced into the context memory by src/telegram.cjs (one memory item per chat, the last 100 messages
// of the retained window). No Telegram call is made here; the Telegram core is unchanged. Telegram has no threads in
// this data: a reply is marked by its «Ответ на #id» prefix. `memory: true` — «Поиск по всему» searches the memory
// itself.
const modules=require('../../modules.cjs');
const items=s=>{try{return (s.memory?.prune?.()||[]).filter(i=>i.source==='Telegram'&&Array.isArray(i.messages)&&i.telegramChat);}catch{return [];}};
function convert(item){
 return item.messages.map(m=>{
  const reply=/^Ответ на #(\d+): /.exec(String(m.text||''));
  return {id:String(m.id),channel:{id:String(item.telegramChat),name:item.title||String(item.telegramChat)},thread:null,replyTo:reply?reply[1]:null,
   author:{id:String(m.user||''),name:String(m.user||'Участник')},bot:false,text:String(m.text||'').replace(/^Ответ на #\d+: /,''),at:Number(m.at)||0,
   url:/^https:\/\/t\.me\/c\/\d+\//.test(item.url||'')?item.url.replace(/\/\d+$/,'/'+m.id):'',replies:0,files:m.media?1:0};
 });
}
module.exports={
 id:'telegram',name:'Telegram',memory:true,
 names:[/telegram|телеграм\p{L}*|(?:^|[^\p{L}])тг(?=$|[^\p{L}])/iu],
 ready:settings=>{if(!modules.enabled(settings,'telegram'))return false;try{return !!JSON.parse(settings.telegramCredential||'{}').session;}catch{return false;}},
 hint:()=>'Подключите личный аккаунт Telegram в «Подключениях» и выберите чаты.',
 async channels(services){return items(services).map(i=>({id:String(i.telegramChat),name:i.title||String(i.telegramChat),kind:'group'}));},
 async messages(services,{channel}){return {messages:items(services).filter(i=>String(i.telegramChat)===channel).flatMap(convert)};},
 async search(services,{query}){
  const words=String(query||'').toLowerCase().split(/\s+/).filter(w=>w.length>=3).map(w=>w.slice(0,Math.max(3,w.length-2)));
  if(!words.length)return {messages:[]};
  return {messages:items(services).flatMap(convert).filter(m=>words.every(w=>m.text.toLowerCase().includes(w)))};
 }
};
