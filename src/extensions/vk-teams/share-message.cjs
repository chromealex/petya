// Capability «share-message» of VK Teams: a card's summary, patch notes or an announcement go to VK Teams through the
// app's own chat flow («Отправь в VK Teams: …»). That flow never guesses a chat — it asks with the bot's chats as
// options — and shows a card with the exact text and chat; only «Отправить» there sends it.
const client=require('./client.cjs');
module.exports={
 label:'Отправить в VK Teams',
 ready:s=>s['extension_vk-teams']==='true'&&client.connected(s),
 async run(services,payload){
  const text=String(payload.text||'').replace(/\r\n?/g,'\n').trim().slice(0,client.LIMIT);
  if(!text)throw Error('Нет текста сообщения.');
  return {ask:'Отправь в VK Teams: '+text,send:true};
 }
};
