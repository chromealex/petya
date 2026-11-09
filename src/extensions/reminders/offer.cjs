// When to offer «Напоминания» to someone who has not added it. Petya's core has no reminders of its own (0.15): «напомни
// в 16:00 позвонить», «напоминай каждый понедельник про планёрку» are requests for this app and get the offer, as does
// talk about reminders as a thing («мои напоминания»). Neighbours that are not: a reminder to a colleague (the
// polite-reminder skill: «напомни Ивану про отчёт»), asking Petya to recall («напомни, что мы обсуждали», «напомни, как
// зовут…»), recurring commands («проверяй почту каждые 5 минут»), birthdays, the calendar and Jira due dates.
const LEAD='^(?:петя[,!\\s]+)?(?:пожалуйста[,\\s]+)?(?:напомни(?:те)?|напоминай(?:те)?|не\\s+забудь\\s+напомнить)';
// A reminder for someone else (as the app's own routing reads it): a group or pronoun, or a capitalised name in the
// dative («Ивану», «Маше»), unless «мне»/«нам» says it is for the user. Case-sensitive on purpose.
const OTHERS=new RegExp('^(?:[Пп]етя[,!\\s]+)?(?:[Пп]ожалуйста[,\\s]+)?[Нн]апомни(?:те)?[,\\s]+(?:команде|всем|коллегам|ребятам|ему|ей|им|(?!(?:В|Во|Через|Завтра|Сегодня|Послезавтра|Каждый|Каждую|Каждое|По|Когда|Про|О|Об|Что|Чтобы)(?=[\\s,]))\\p{Lu}\\p{Ll}+(?:[уеюи]|ой|ею))(?=$|[\\s,])','u');
const RECALL='(?:о\\s+ч[её]м|как|где|кто|кого|какой|какая|какие|какое|каким|сколько|зачем|почему|чем|куда|откуда|что\\s+(?:такое|значит|означает|было|там|у\\s+нас|мы|я|он|она|они|вы|ты|важно\\p{L}*|обсужда\\p{L}*|говорил\\p{L}*)|когда\\s+у\\s+нас)';
module.exports={
 id:'reminders',name:'Напоминания',
 pitch:'напомню в нужное время или когда что-то случится — закроют задачу, коллега появится в Slack, начнётся встреча, соберётся билд',
 names:[],
 topics:[/(?:мои|какие|все|список)\s+(?:у\s+меня\s+)?напоминани\p{L}*|напоминани\p{L}*\s+(?:на\s+(?:сегодня|завтра)|по\s+событию)/iu,
  /(?:поставь|создай|сделай|заведи|добавь|установи)\s+(?:мне\s+)?напоминани\p{L}*/iu,
  new RegExp(LEAD+'(?:\\s+(?:мне|нам))?(?=[,:\\s])','iu')],
 avoid:[
  // Subject words of neighbours, except inside a «напомни …» request («напомни за 10 минут до встречи» is ours).
  new RegExp('^(?!'+LEAD.slice(1)+').*(?:дн\\p{L}*\\s+рождени|день\\s+рождения|коллег\\p{L}*|вежлив|пнуть|календар|встреч|созвон|срок\\p{L}*\\s+задач|дедлайн|cron|крон|почт|письм)','iu'),
  OTHERS,
  new RegExp(LEAD+'(?:\\s+(?:мне|нам))?[,\\s]+'+RECALL+'(?=$|[\\s,?])','iu')],
 requests:[/(?:покажи|какие|поставь|создай|сделай|заведи|добавь|установи|мои|напомни|напоминай)/iu],
 connect:'install',
 ready:settings=>settings.extension_reminders==='true'
};
