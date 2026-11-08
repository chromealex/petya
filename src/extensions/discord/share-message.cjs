// Capability «share-message» of Discord: patch notes, announcements or a card's summary go to Discord through the
// app's own chat flow («Отправь в Discord: …»). That flow never guesses a channel — it asks with the chosen
// channels as options — and shows a card with the exact text and channel; only «Отправить» there posts it.
const client=require('./client.cjs');
const {one}=require('../link-text.cjs');
module.exports={
 label:'Отправить в Discord',
 ready:s=>s['extension_discord']==='true'&&client.connected(s)&&client.config(s).channels.some(c=>client.SENDABLE.has(c.type)),
 async run(services,payload){
  // Line breaks of patch notes are kept; only the edges are trimmed.
  const text=String(payload.text||'').replace(/\r\n?/g,'\n').trim().slice(0,client.LIMIT);
  if(!one(text))throw Error('Нет текста сообщения.');
  return {ask:'Отправь в Discord: '+text,send:true};
 }
};
