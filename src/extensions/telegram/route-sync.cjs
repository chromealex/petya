// Chat route «sync» (src/features/chat-routes.cjs): «обнови телеграм» refreshes the chosen chats and says how it went;
// «прочитай / проверь телеграм» refreshes and then answers from what was saved.
const SYNC=/^(?:петя[,!\s]+)?(?:обнови|прочитай|проверь)\s+(?:телеграм|telegram|тг)[.!?]*$/iu;
module.exports={id:'telegram-sync',stage:'sync',SYNC,
 async turn(s,command,{choice}){
  if(choice||!SYNC.test(command)||!s.telegram)return null;
  const result=await s.telegram.source.sync();
  if(/^обнови/iu.test(command))return {handled:true,text:result.message};
  return s.dialogue.turn(command,undefined,'chat');
 }};
