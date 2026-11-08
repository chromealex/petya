// Capability «video-meeting» of «Петя в Zoom»: the user's Zoom Personal Meeting Room. There is no Zoom API here:
// the link is the one the user saved, or one found in plain-text Zoom data on this computer; otherwise the card
// asks the user to paste it once (Zoom → Встречи → Личная комната) and it is remembered. The same room serves
// every meeting, which the card says next to the choice.
const room=require('./personal-room.cjs');
module.exports={
 id:'zoom',name:'Zoom',label:'Zoom (личная комната)',
 ready:s=>!!room.valid(s.zoomPersonalLink)||room.installed(),
 hint:s=>room.valid(s.zoomPersonalLink)?'Одна и та же комната для всех встреч':'Одна и та же комната для всех встреч · ссылку нужно вставить один раз',
 async run(services,payload,check){
  const typed=payload.link!==undefined&&payload.link!==null&&String(payload.link).trim();
  if(typed){
   const link=room.valid(payload.link);
   if(!link)return {needLink:true,text:'Это не ссылка на личную комнату Zoom. Нужна ссылка вида https://…zoom.us/j/1234567890.'};
   check();services.saveSettings?.({zoomPersonalLink:link});
   return {provider:'zoom',url:link,id:link.match(/\/j\/(\d+)/)[1],personal:true};
  }
  let link=room.valid(services.settings.zoomPersonalLink);
  if(!link){link=room.discover();if(link){check();services.saveSettings?.({zoomPersonalLink:link});}}
  if(!link)return {needLink:true,text:'Вставьте ссылку на вашу личную комнату Zoom: в приложении Zoom откройте «Встречи» → «Личная комната» и скопируйте ссылку. Петя запомнит её.'};
  return {provider:'zoom',url:link,id:link.match(/\/j\/(\d+)/)[1],personal:true};
 }
};
