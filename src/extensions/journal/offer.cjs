// When to offer «Дневник дня» to someone who has not added it. Neighbours and near-misses: a game devlog
// («дневник разработки» is for players → patch notes), log files («журнал логов»), changelogs («журнал изменений»),
// meeting and sprint results (meetings, Jira), the calendar (meetings of a day), reminders.
module.exports={
 id:'journal',name:'Дневник дня',
 pitch:'соберу, что вы сделали за день и неделю по данным Пети — чаты, задачи, коммиты, встречи — помогу составить план на завтра и сохраню личные заметки',
 names:[],
 topics:[/что\s+я\s+(?:сегодня\s+|вчера\s+)?(?:сделал\p{L}*|успел\p{L}*)|итоги\s+(?:дня|недели|за\s+неделю|за\s+день)|план\s+на\s+завтра|(?:запиши|добавь|занеси)\s+в\s+дневник|дневник\s+дня|(?:мой|личный)\s+дневник/iu],
 avoid:[/дневник\p{L}*\s+(?:разработ|игры|проекта|для\s+игрок)|devlog|дев-?лог|журнал|(?<!\p{L})лог(?:и|ов|а)?(?!\p{L})|чейнджлог|changelog|изменени|патч|релиз|встреч|спринт|созвон|календар|напоминани|не\s+так/iu],
 requests:[/(?:что\s+я|итоги|план|запиши|покажи|подведи)/iu],
 connect:'install',
 ready:settings=>settings.extension_journal==='true'
};
