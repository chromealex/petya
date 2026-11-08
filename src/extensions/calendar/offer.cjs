// When to offer «Календарь» to someone who has not added it (or has no calendar access yet).
const {connected}=require('./feature.cjs');
module.exports={
 id:'calendar',name:'Календарь',
 pitch:'покажу встречи на день и неделю, найду общее свободное время с коллегами и поставлю встречу после вашего подтверждения (Google Календарь или Outlook)',
 names:[/google\s*(?:calendar|календар\p{L}*)|гугл[\s-]*календар\p{L}*|outlook\s*(?:calendar|календар\p{L}*)|календар\p{L}*\s+(?:google|гугл\p{L}*|outlook|аутлук\p{L}*)/iu],
 topics:[/(?:мои|какие|ближайш\p{L}*)\s+(?:у\s+меня\s+)?(?:встреч|созвон)\p{L}*|(?:встреч|созвон)\p{L}*\s+на\s+(?:сегодня|завтра|послезавтра|неделю|этой\s+неделе)/iu,
  /когда\s+я\s+свобод\p{L}*|свободн\p{L}*\s+(?:время|окн\p{L}*|слот\p{L}*)\s+(?:с|для|у\s+меня)/iu,
  /(?:найди|подбери)\s+(?:\p{L}+\s+)?(?:час|время|слот)\s+(?:для\s+встреч\p{L}*\s+)?(?:с|со)\s+\p{L}/iu,
  /(?:поставь|запланируй|назначь|создай)\s+(?:\p{L}+\s+)?(?:встреч|созвон)\p{L}*/iu,
  /(?:в|по|мо[йеё]м?)\s+календар\p{L}*/iu],
 // Meeting summaries and meeting recording (meetings), Jira due dates, vacation calendar, birthdays, cron.
 avoid:[/сводк|итог\p{L}*\s+встреч|протокол|что\s+(?:решили|обсуждали|обсудили)|договорил|расшифров|транскрип|(?:по|при|про)?слушай|подключись|запиши\s+встреч|срок\p{L}*\s+задач|дедлайн|отпуск|рождени|cron|крон/iu],
 requests:[/(?:покажи|найди|подбери|поставь|запланируй|назначь|создай|когда|что\s+у\s+меня|какие)/iu],
 connect:'settings',
 ready:settings=>settings.extension_calendar==='true'&&connected(settings)
};
