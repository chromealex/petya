// When to offer «Подсказки на встрече» to someone who has not added it: hints during a meeting.
// Neighbours: the summary of a meeting that happened (Petya's meeting summary), recording a meeting, preparing for one
// («Подготовка к встрече»), the calendar, and «подскажи …» as an ordinary question.
module.exports={
 id:'meeting-hints',name:'Подсказки на встрече',
 pitch:'во время записи встречи покажу в углу экрана, что это уже решали, что вы обещали и что значит термин проекта — со ссылкой на источник',
 names:[],
 topics:[/подсказ\p{L}*\s+(?:мне\s+)?(?:на|во\s+время|по\s+ходу|для)\s+(?:\p{L}+\s+)?(?:встреч|созвон|звонк|митинг|синк|совещани)/iu,
  /(?:включи|выключи|отключи)\s+подсказк\p{L}*\s+(?:на|во\s+время)\s+(?:\p{L}+\s+)?(?:встреч|созвон|звонк|митинг)/iu,
  /(?:напоминай|подсказывай)\s+(?:мне\s+)?(?:прямо\s+)?(?:на|во\s+время)\s+(?:\p{L}+\s+)?(?:встреч|созвон)\p{L}*,?\s+(?:что|если|когда|о\s+том)/iu],
 avoid:[/сводк|протокол|расшифров|транскрип|запиши\s+(?:\p{L}+\s+)?встреч|слушай\s+встреч|подготов|повестк|(?:поставь|создай|запланируй|назначь)\s+(?:\p{L}+\s+)?(?:встреч|созвон)|код|unity|юнити/iu],
 requests:[/подсказ|включи|напоминай|хочу|нужн/iu],
 connect:'install',
 ready:settings=>settings['extension_meeting-hints']==='true'
};
