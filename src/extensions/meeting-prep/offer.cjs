// When to offer «Подготовка к встрече» to someone who has not added it. It needs «Календарь» (connected) too.
// Neighbours: the summary of a meeting that already happened (Petya's meeting summary), the day's meetings and new
// events («Календарь»), recording a meeting, cron schedules.
module.exports={
 id:'meeting-prep',name:'Подготовка к встрече',
 pitch:'перед встречей покажу участников, что решали с ними в прошлый раз, открытые задачи со статусом в трекере и предложу повестку со ссылками на источники',
 names:[],
 topics:[/подготов\p{L}*\s+(?:меня\s+|нас\s+)?(?:к|ко)\s+(?:\p{L}+\s+){0,2}?(?:встреч|созвон|синк|митинг|звонк|планёрк|планерк|дейли|1[:-]1)/iu,
  /(?:что|о\s+ч[её]м)\s+(?:мы\s+)?(?:обсуждали|говорили|решили|договаривались)\s+(?:(?:с|со)\s+\p{L}+\s+)?в\s+прошлый\s+раз/iu,
  /(?:о\s+ч[её]м|про\s+что)\s+(?:будет\s+)?(?:следующ|ближайш)\p{L}*\s+(?:встреч|созвон|синк|митинг)/iu,
  /повестк\p{L}*\s+(?:на|к|для)\s+(?:\p{L}+\s+)?(?:встреч|созвон|синк|митинг|планёрк|планерк|дейли|ретро|завтра|сегодня)/iu],
 avoid:[/^(?:а\s+)?(?:запомни|напомни)|сводк|протокол|расшифров|транскрип|запиши\s+встреч|(?:поставь|создай|запланируй|назначь)\s+(?:\p{L}+\s+)?(?:встреч|созвон)|cron|крон/iu],
 requests:[/подготов|повестк|что\s+обсуждали|о\s+ч[её]м|про\s+что/iu],
 connect:'install',
 ready:settings=>settings['extension_meeting-prep']==='true'&&settings.extension_calendar==='true'&&require('../calendar/accounts.cjs').connected(settings)
};
