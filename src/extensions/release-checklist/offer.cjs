// When to offer «Релизный чек-лист» to someone who has not added it. Readiness of a release as a whole is this app;
// release notes, crashes or reviews after a release, «when is the release» and other checklists are not.
module.exports={
 id:'release-checklist',name:'Релизный чек-лист',
 pitch:'проверю готовность релиза по чек-листу проекта: CI, крэши, отзывы, патчноут, локализация, размер билда, зависимости, блокеры в Jira и номера версий — и покажу, что мешает выпуску',
 names:[/релизн\p{L}*\s+чек[- ]?лист\p{L}*|чек[- ]?лист\p{L}*\s+(?:к\s+|для\s+)?(?:релиз|выпуск)\p{L}*|release\s+checklist/iu],
 topics:[/готов\p{L}*\s+(?:ли\s+)?(?:\p{L}+\s+){0,2}(?:к\s+)?(?:релиз|выпуск)\p{L}*/iu,
  /что\s+(?:ещё\s+|еще\s+)?(?:мешает|блокирует|держит)\s+(?:нам\s+)?(?:выпуск|выпустить|релиз|зарелизить|выкат|выкатить|релизнуть)\p{L}*/iu,
  /можно\s+ли\s+(?:уже\s+)?(?:выпускать|выпустить|релизить|зарелизить|выкатывать|выкатить)/iu],
 avoid:[/патч[- ]?ноу?т\p{L}*|ч[еэ]й?нджлог\p{L}*|changelog|release[- ]?notes?|релиз[- ]?ноу?т\p{L}*|крэш\p{L}*|краш\p{L}*|отзыв\p{L}*|когда\s+(?:будет\s+)?релиз/iu],
 requests:[/(?:готов|чек[- ]?лист|мешает|можно ли|проверь|покажи)/iu],
 connect:'install',
 ready:settings=>settings['extension_release-checklist']==='true'
};
