// Slack as a `messenger-source` (docs/foundations/messengers.md), read from what Petya already keeps: the Slack threads
// synced into the context memory by src/slack-context.cjs (one memory item per thread, `slack:<channel>:<root ts>`).
// No Slack call is made here and nothing in the Slack core changes; what is not synced is not seen. `memory: true` —
// «Поиск по всему» searches the memory (and Slack's own search) itself.
const modules=require('../../modules.cjs');
const items=s=>{try{return (s.memory?.prune?.()||[]).filter(i=>i.source==='Slack'&&Array.isArray(i.messages)&&i.channel);}catch{return [];}};
const rootOf=item=>String(item.id||'').split(':')[2]||'';
// A message link from the thread link: …/archives/C1/p<root> → …/p<ts>?thread_ts=<root> for a reply.
function link(item,ts){
 try{const u=new URL(item.url);const digits=String(ts).replace('.','');const root=rootOf(item);
  return u.origin+u.pathname.replace(/p\d{16}$/,'p'+digits)+(ts!==root?'?thread_ts='+root:'');}catch{return '';}
}
function convert(item){
 const root=rootOf(item),many=item.messages.length>1;
 return item.messages.map(m=>({id:String(m.ts),channel:{id:item.channel,name:item.channelName||item.channel},thread:many?root:null,replyTo:m.ts!==root?root:null,
  author:{id:String(m.user||''),name:String(m.user||'Slack')},bot:/^B[A-Z0-9]+$/.test(String(m.user||'')),text:String(m.text||''),at:Number(m.at)||0,url:link(item,m.ts),
  replies:m.ts===root?item.messages.length-1:0,files:(m.files||[]).length}));
}
module.exports={
 id:'slack',name:'Slack',memory:true,
 names:[/slack|слак\p{L}*/iu],
 ready:settings=>modules.enabled(settings,'slack')&&!!(settings.slackToken||settings.slackCredential),
 hint:()=>'Подключите Slack в «Подключениях» и обновите его: Петя читает сохранённые треды.',
 async channels(services){
  const seen=new Map();for(const i of items(services))if(!seen.has(i.channel))seen.set(i.channel,{id:i.channel,name:i.channelName||i.channel,kind:/^D/.test(i.channel)?'direct':/^G/.test(i.channel)?'group':'channel'});
  return [...seen.values()];
 },
 async messages(services,{channel}){return {messages:items(services).filter(i=>i.channel===channel).flatMap(convert)};},
 async thread(services,{id}){const item=items(services).find(i=>rootOf(i)===id);return {messages:item?convert(item):[]};},
 async search(services,{query}){
  const words=String(query||'').toLowerCase().split(/\s+/).filter(w=>w.length>=3).map(w=>w.slice(0,Math.max(3,w.length-2)));
  if(!words.length)return {messages:[]};
  return {messages:items(services).flatMap(convert).filter(m=>words.every(w=>m.text.toLowerCase().includes(w)))};
 }
};
