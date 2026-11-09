// When to offer «Mattermost» to someone who has not added or connected it: only when Mattermost is named. Neighbours:
// Slack, Telegram, Discord and VK Teams (other messengers), building a Mattermost plugin, bot or webhook (the
// Programmer), installing or fixing the Mattermost server or client.
module.exports={
 id:'mattermost',name:'Mattermost',
 pitch:'покажу, что обсуждали в каналах Mattermost — темы с точными цитатами, пересказ треда, поиск; сообщение в канал — только после вашего «Отправить»',
 names:[/mattermost|маттермост\p{L}*|матермост\p{L}*|мэттермост\p{L}*/iu],
 topics:[],
 avoid:[/(?:плагин\p{L}*|plugin|webhook\p{L}*|вебхук\p{L}*|бот\p{L}*|api|sdk)\s+(?:для\s+|в\s+)?(?:mattermost|маттермост\p{L}*)|(?:mattermost|маттермост\p{L}*)[\s-]+(?:plugin|webhook|api|sdk)/iu,
  /(?:mattermost|маттермост\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается)|лагает|тормозит|упал)|(?:установи|скачай|обнови|удали|разверни|задеплой|подними)\p{L}*\s+(?:\p{L}+\s+)?(?:mattermost|маттермост)/iu,
  /slack|слак|телеграм|telegram|discord|дискорд|vk\s*teams|вк\s*тимс/iu],
 requests:[/(?:что нового|что пишут|что обсуждали|покажи|сводк|перескажи|найди|поищи|отправь|опубликуй|напиши)/iu],
 connect:'settings',
 ready:settings=>settings.extension_mattermost==='true'&&require('./client.cjs').connected(settings)
};
