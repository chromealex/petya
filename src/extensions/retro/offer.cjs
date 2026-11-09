// When to offer «Ретро» to someone who has not added it (or has no Jira connection yet).
// Retro styles (music, cars, games, pixel art), «ретроград», planning the next sprint, a build that went wrong and a
// single meeting's summary belong elsewhere.
const agile=require('../sprint-planning/agile.cjs');
module.exports={
 id:'retro',name:'Ретро',
 pitch:'соберу факты спринта из Jira, CI, мониторинга, встреч и чатов со ссылками на источники, предложу «что хорошо / что плохо / что попробовать», соберу голоса команды — задачи заведу только через трекер после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:retro|retrospective)(?=$|[^\p{L}-])/iu],
 topics:[/(?:^|[^\p{L}])ретро(?:спектив\p{L}*)?(?![\p{L}-])/iu,
  /что\s+(?:у\s+нас\s+)?(?:пошло|было|прошло)\s+(?:не\s+так|плохо|хорошо)\s+(?:в|за)\s+(?:\p{L}+\s+)?спринт/iu,
  /итог\p{L}*\s+(?:\p{L}+\s+)?спринт/iu],
 avoid:[/ретро-|ретроград|ретровейв|ретро\s+(?:музык|стил|игр|машин|автомобил|авто|фильм|кино|вечеринк|мод|одежд|фото|фильтр|консол|приставк|пиксел|дизайн|интерьер|песн|хит)|(?:в\s+стиле|стиль)\s+ретро|сборк|билд|что\s+такое|ретроспектив\p{L}*\s+(?:фильм|художник|выставк|творчеств)/iu],
 requests:[/(?:подготов|собер|провед|сдела|покажи|что|подвед|итог|давай)/iu],
 connect:'settings',
 ready:settings=>settings.extension_retro==='true'&&agile.connected({settings})
};
