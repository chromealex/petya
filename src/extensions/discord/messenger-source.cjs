// «Discord» as a `messenger-source` (docs/foundations/messengers.md): the channels chosen in its settings and their
// recent messages over the same REST calls as the app (client.cjs). Read-only. Forum channels are read by the app
// through their posts and are not listed here; bots have no message search in Discord, so there is no `search`.
const client=require('./client.cjs');
module.exports={
 id:'discord',name:'Discord',
 names:[/discord|дискорд\p{L}*/iu],
 ready:settings=>settings.extension_discord==='true'&&client.connected(settings),
 hint:()=>'Подключите бота и отметьте каналы в «Настройки → Discord».',
 async channels(services){
  const c=client.config(services.settings);
  return c.channels.filter(x=>x.type!==15).map(x=>({id:x.id,name:x.name,kind:'channel',url:client.messageUrl(c.guild,x.id)}));
 },
 async messages(services,{channel,since,limit}){
  const c=client.config(services.settings);
  if(!c.channels.some(x=>x.id===channel&&x.type!==15))throw Error('Этот канал Discord не выбран в настройках.');
  const rows=await client.messages(services,channel,{since:new Date(since),guild:c.guild,pages:Math.min(5,Math.ceil(limit/100))});
  const name=c.channels.find(x=>x.id===channel)?.name||channel;
  return {messages:rows.filter(m=>m.type===0||m.type===19).map(m=>({id:m.id,channel:{id:channel,name},thread:null,replyTo:m.replyTo,author:{id:m.author,name:m.author},bot:m.bot,
   text:m.text,at:m.at,url:m.url,files:m.attachments}))};
 }
};
