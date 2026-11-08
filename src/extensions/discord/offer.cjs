// When to offer «Discord» to someone who has not added or connected it. Neighbours: Slack and Telegram (Petya's
// own messengers), coding with discord.js / discord.py (the Programmer), the user's own Discord client not working,
// player support tickets («Поддержка игроков») and store reviews.
const NAME=/(?:^|[^\p{L}])(?:discord|дискорд\p{L}*)(?=$|[^\p{L}.])/iu;
module.exports={
 id:'discord',name:'Discord',
 pitch:'покажу, что игроки пишут в Discord: темы с цитатами, частые вопросы с ответами по закрепу и баги — в задачу; сообщение в канал — только после вашего «Отправить»',
 names:[NAME],
 topics:[/частые вопросы игроков|что спрашивают игроки|(?:сообществ\p{L}*|комьюнити)\s+(?:игры|игроков)/iu],
 avoid:[/discord\s*\.\s*(?:js|py)|discord(?:js|py)|discord[\s.-]?(?:api|sdk|webhook)|бот\p{L}*\s+(?:для|на|в)\s+(?:discord|дискорд)|(?:напиши|сделай|создай)\p{L}*\s+(?:\p{L}+\s+){0,2}бот/iu,
  /(?:discord|дискорд\p{L}*)\s+(?:у меня\s+)?(?:не\s+(?:работает|запускается|грузится|открывается|подключается)|лагает|тормозит|завис)|не\s+(?:работает|запускается|грузится|открывается)\s+(?:discord|дискорд)|(?:установи|скачай|обнови|удали)\p{L}*\s+(?:discord|дискорд)|нитро|nitro/iu,
  /slack|слак|телеграм|telegram|тикет|zendesk|поддержк|отзыв/iu],
 requests:[/(?:что нового|что пишут|что говорят|покажи|частые|баги|сводк|отправь|опубликуй|напиши)/iu],
 connect:'settings',
 ready:settings=>settings['extension_discord']==='true'&&require('./client.cjs').connected(settings)
};
