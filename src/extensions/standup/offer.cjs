// When to offer «Стендап» to someone who has not added it (or has neither Jira nor Slack connected).
// Comedy stand-up, the standup meeting in the calendar and meeting summaries belong to others.
const collect=require('./collect.cjs');
module.exports={
 id:'standup',name:'Стендап',
 pitch:'соберу асинхронный стендап: черновики «вчера / сегодня / блокеры» по Jira и коммитам или ответы из треда Slack, подсвечу блокеры и кто не ответил — в Slack отправлю только по вашей кнопке',
 names:[/(?:^|[^\p{L}])(?:standup|stand-up)(?=$|[^\p{L}])/iu],
 topics:[/(?:^|[^\p{L}])(?:стенд-?ап\p{L}*|стэнд-?ап\p{L}*|дейли)(?=$|[^\p{L}])/iu,
  /что\s+(?:вчера\s+)?(?:делал[аи]?|сделал[аи]?)\s+(?:вчера\s+)?(?:наша\s+|вся\s+)?команд\p{L}*|что\s+(?:наша\s+)?команда\s+(?:делала|сделала)\s+вчера/iu,
  /у\s+кого\s+(?:есть\s+|сейчас\s+)?блокер\p{L}*|блокер\p{L}*\s+(?:у\s+)?команд\p{L}*/iu],
 avoid:[/комед|комик|юмор|шутк|шоу|концерт|выступлени|открыт\p{L}*\s+микрофон|сводк\p{L}*\s+встреч|(?:во\s+сколько|когда|перенес\p{L}*|отмени\p{L}*|запиши|подключись|слушай)\s+(?:\p{L}+\s+)?(?:стенд|стэнд|дейли|standup)/iu],
 requests:[/(?:собери|настрой|покажи|подготовь|проведи|что|у\s+кого|кто)/iu],
 connect:'settings',
 ready:settings=>settings.extension_standup==='true'&&(collect.jiraReady({settings})||collect.slackReady({settings}))
};
