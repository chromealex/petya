// Capability «share-message» of Slack: hands the text to Petya's team request flow («Попроси команду …»).
// That flow never guesses a channel: it uses only a channel confirmed for the current project or asks with
// concrete options, then shows channel, thread and text and sends only after «Отправить».
const modules=require('../../modules.cjs');
const {one}=require('../link-text.cjs');
module.exports={
 label:'Отправить в Slack',
 ready:s=>modules.enabled(s,'slack')&&!!(s.slackCredential||s.slackToken),
 async run(services,payload){
  const text=one(payload.text).slice(0,3000);if(!text)throw Error('Нет текста сообщения.');
  return {ask:'Попроси команду '+text,send:true};
 }
};
