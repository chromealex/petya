// When to offer «Напоминания» to someone who has not added it. «Напомни …» itself is never offered on (the offer
// layer stays quiet on it, and without the app Petya's recurring commands and dialogue answer it); talk about
// reminders as a thing is. Neighbours: recurring commands («проверяй почту каждые 5 минут»), birthdays, the
// polite-reminder skill («напомни Ивану про отчёт»), the calendar (meetings) and Jira due dates.
module.exports={
 id:'reminders',name:'Напоминания',
 pitch:'напомню в нужное время или когда что-то случится — закроют задачу, коллега появится в Slack, начнётся встреча, соберётся билд',
 names:[],
 topics:[/(?:мои|какие|все|список)\s+(?:у\s+меня\s+)?напоминани\p{L}*|напоминани\p{L}*\s+(?:на\s+(?:сегодня|завтра)|по\s+событию)/iu,
  /(?:поставь|создай|сделай|заведи|добавь|установи)\s+(?:мне\s+)?напоминани\p{L}*/iu],
 avoid:[/дн\p{L}*\s+рождени|день\s+рождения|коллег\p{L}*|вежлив|пнуть|календар|встреч|созвон|срок\p{L}*\s+задач|дедлайн|cron|крон|почт|письм/iu],
 requests:[/(?:покажи|какие|поставь|создай|сделай|заведи|добавь|установи|мои)/iu],
 connect:'install',
 ready:settings=>settings.extension_reminders==='true'
};
