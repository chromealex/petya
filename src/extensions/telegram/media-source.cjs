// Pictures and videos of the chosen Telegram chats, as a `media-source` (src/media-sources.cjs): listed from the
// synced messages of the connected account, downloaded through the Telegram session after the user picked one.
const {supported}=require('../../media-sources.cjs');
module.exports={id:'telegram',name:'Telegram',
 candidates(items,settings){
  let tg={};try{tg=JSON.parse(settings.telegramCredential||'{}');}catch{tg={};}
  const rows=[];
  for(const item of items)if(item.source==='Telegram'&&String(item.telegramAccount)===tg.userId&&(tg.selected||[]).some(c=>c.id===item.telegramChat))
   for(const m of item.messages||[])if(m.media&&supported(m.media.name))rows.push({contextId:item.id,messageId:m.id,chatId:item.telegramChat,name:m.media.name,size:m.media.size,title:item.title,at:m.at,url:item.url});
  return rows;
 },
 fingerprint:settings=>[settings.module_telegram,settings.telegramCredential],
 download:(s,row)=>s.telegram.source.download(row.chatId,row.messageId)
};
