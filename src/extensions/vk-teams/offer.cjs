// When to offer «VK Teams» to someone who has not added or connected it: only when VK Teams is named (or Myteam, its
// former name). Neighbours: ВКонтакте (posts, groups, ads — marketing, not the work messenger), Microsoft Teams
// («тимс»), Slack, Telegram, Discord, Mattermost, building a VK Teams bot (the Programmer), the client not working.
module.exports={
 id:'vk-teams',name:'VK Teams',
 pitch:'покажу, что пишут в рабочих чатах VK Teams, где есть бот Пети: темы с точными цитатами, пересказ треда, поиск; сообщение в чат — только после вашего «Отправить»',
 names:[/vk\s*teams|вк\s*тимс\p{L}*|vk\s*тимс\p{L}*|вк\s*teams|вктимс\p{L}*|myteam/iu],
 topics:[],
 avoid:[/(?:бот\p{L}*|bot\s*api|api|sdk|webhook\p{L}*|вебхук\p{L}*)\s+(?:для\s+|в\s+)?(?:vk\s*teams|вк\s*тимс\p{L}*)|(?:напиши|сделай|создай|разработай)\p{L}*\s+(?:\p{L}+\s+){0,2}бот\p{L}*|metabot|метабот/iu,
  /(?:vk\s*teams|вк\s*тимс\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается)|лагает|тормозит|упал)|(?:установи|скачай|обнови|удали)\p{L}*\s+(?:\p{L}+\s+)?(?:vk\s*teams|вк\s*тимс)/iu,
  /slack|слак|телеграм|telegram|discord|дискорд|mattermost|маттермост|microsoft\s*teams|вконтакт|vkontakte/iu],
 requests:[/(?:что нового|что пишут|что обсуждали|покажи|сводк|перескажи|найди|поищи|отправь|опубликуй|напиши)/iu],
 connect:'settings',
 ready:settings=>settings['extension_vk-teams']==='true'&&require('./client.cjs').connected(settings)
};
