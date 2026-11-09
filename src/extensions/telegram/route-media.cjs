// Chat route «media»: «разбери скриншот из телеграма» — a picture or video from the chosen Telegram chats
// (media-source.cjs) is attached and inspected (src/media-sources.cjs `turn`).
const TELEGRAM=/(?:телеграм|telegram|тг)/iu;
module.exports={id:'telegram-media',stage:'media',order:20,
 turn:async(s,command,{choice})=>!choice&&TELEGRAM.test(command)?require('../../media-sources.cjs').turn(s,command,{service:'telegram',name:'Telegram'}):null};
