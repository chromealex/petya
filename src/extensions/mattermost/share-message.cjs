// Capability «share-message» of Mattermost: a card's summary, patch notes or an announcement go to Mattermost through
// the app's own chat flow («Отправь в Mattermost: …»). That flow never guesses a channel — it asks with the chosen
// channels as options — and shows a card with the exact text and channel; only «Отправить» there posts it.
const client=require('./client.cjs');
module.exports={
 label:'Отправить в Mattermost',
 ready:s=>s.extension_mattermost==='true'&&client.connected(s),
 async run(services,payload){
  // Line breaks are kept (Mattermost renders Markdown); only the edges are trimmed.
  const text=String(payload.text||'').replace(/\r\n?/g,'\n').trim().slice(0,client.LIMIT);
  if(!text)throw Error('Нет текста сообщения.');
  return {ask:'Отправь в Mattermost: '+text,send:true};
 }
};
