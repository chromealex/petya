// When to offer «Дни рождения» to someone who has not added it: questions about colleagues' birthdays («у кого день
// рождения на этой неделе», «когда днюха у Маши»). Neighbours that are not: reminders about a birthday («напомни про
// день рождения Ивана» — «Напоминания»), greetings and gifts (the dialogue), the calendar, events and holidays
// («ивент на Рождество» — «Идеи ивентов»), the company's birthday.
module.exports={
 id:'birthdays',name:'Дни рождения',
 pitch:'покажу, у кого из команды скоро день рождения, и буду напоминать утром — даты берутся из «Команды» и профилей Slack',
 names:[],
 topics:[/(?:у\s+кого|чей|чьи|когда|какие|ближайш\p{L}*|скоро\s+ли|список)[^.?!]{0,30}(?:д(?:е|н)\p{L}*\s+рождени\p{L}*|днюх\p{L}*)/iu,
  /(?:д(?:е|н)\p{L}*\s+рождени\p{L}*|днюх\p{L}*)\s+(?:в\s+команде|коллег\p{L}*|сотрудник\p{L}*)/iu],
 avoid:[/напомн|напоминай|поздрав|открытк|подар|календар|ивент|праздн|отпуск|компани|рождеств|событи/iu],
 requests:[/(?:у\s+кого|чей|чьи|когда|какие|ближайш|скоро|покажи|список|есть\s+ли)/iu],
 connect:'install',
 ready:settings=>settings.extension_birthdays==='true'
};
