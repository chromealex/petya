// Answer context (src/features/chat-routes.cjs): a question about Telegram («что писали в телеграме?») is answered by
// the local model from the last saved chats of the connected account, given to it as `telegramContext`. A chat that
// once asked about Telegram keeps it (older chats remember it as `topic.telegram`).
const modules=require('../../modules.cjs');
module.exports={id:'telegram',key:'telegramContext',legacy:'telegram',
 clarify:'Уточните, что найти в сохранённых сообщениях Telegram.',
 matches:command=>/(?:телеграм|telegram|(?:^|\s)тг(?:\s|$))/iu.test(command),
 async rows(s){
  const rows=s.memory.prune().filter(c=>c.source==='Telegram').slice(-5).map(c=>({id:c.id,title:c.title,text:c.text.slice(-3000),at:c.at,url:c.url}));
  if(!modules.enabled(s.settings,'telegram'))return {rows,stop:'Включите модуль Telegram в подключениях.'};
  if(!rows.length)return {rows,stop:'Сначала подключите Telegram, выберите чаты и нажмите «Обновить контекст».'};
  if(!s.settings.model)return {rows,stop:'В памяти есть сообщения Telegram. Настройте локальную модель Ollama для ответа по их содержимому. Их можно посмотреть во вкладке «Контекст».'};
  return {rows};
 }};
