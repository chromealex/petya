// When to offer «Встречи 1:1» to someone who has not added it: preparing a one-on-one with a colleague, recording its
// outcome, what was promised on it. Not games and sports («1 на 1 в игре», «бой один на один»), scores («счёт 1:1»),
// scale («масштаб 1:1»), promises about tasks («мои обещания по задачам») or general meeting summaries and prep.
module.exports={
 id:'one-on-one',name:'Встречи 1:1',
 pitch:'подготовлю встречу 1:1 с коллегой — прошлые заметки, открытые договорённости, его задачи и PR, повестка — и сохраню итоги с договорённостями после вашего подтверждения, только на этом компьютере',
 names:[/(?:встреч\p{L}*\s+)?(?:1:1|one[\s-]on[\s-]one|ван[\s-]?ту[\s-]?ван\p{L}*)\s+(?:с|со)\s+\p{L}/iu],
 topics:[/(?:подготов\p{L}*|повестк\p{L}*|итоги|запиши|что\s+обсудить)\s+(?:\p{L}+\s+)?(?:к\s+|на\s+|по\s+)?(?:встреч\p{L}*\s+)?(?:1:1|1\s+на\s+1|один\s+на\s+один|one[\s-]on[\s-]one)/iu,
  /что\s+я\s+(?:обещал|пообещал)\p{L}*\s+(?:на\s+(?:1:1|встреч\p{L}*)|\p{Lu}\p{Ll}+)/u],
 avoid:[/(?:в|на)\s+игр\p{L}*|игра\p{L}*|бой|сраж|матч|дуэл|сыгра|счет|счёт|масштаб|шахмат|баскетбол|футбол|задач|jira|жир[аеу]|спринт|сводк|протокол|расшифров/iu],
 requests:[/(?:подготов|запиши|сохрани|что|покажи|какие|итоги|повестк)/iu],
 connect:'install',
 ready:settings=>settings['extension_one-on-one']==='true'
};
