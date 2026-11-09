// When to offer «Найм»: candidates, interviews and feedback of people being hired. Not this: hiring units, workers or
// heroes in a game, a candidate of science, store reviews, and ranking people (the app does not rank anyone).
module.exports={
 id:'hiring',name:'Найм',
 pitch:'буду вести воронку кандидатов и заметки интервью только на этом компьютере, подготовлю вопросы по навыкам роли, соберу дословные цитаты интервьюеров без оценок и предложу время интервью по календарю',
 names:[],
 topics:[/(?:^|[^\p{L}])(?:собеседовани\p{L}*|интервью\s+с\s+кандидат\p{L}*|воронк\p{L}*\s+найма|найм\p{L}*\s+(?:сотрудник|разработчик|в\s+команду|бэкенд|фронтенд)\p{L}*|кандидат\p{L}*\s+на\s+(?:позицию|вакансию|бэкенд|фронтенд|роль)|(?:добавь|заведи)\s+кандидат\p{L}*|(?:сводк\p{L}*|фидб[эе]к\p{L}*)\s+(?:по|про)\s+кандидат\p{L}*|заметки\s+интервью)(?=$|[^\p{L}])/iu],
 avoid:[/(?:^|[^\p{L}])(?:юнит\p{L}*|казарм\p{L}*|в\s+игр\p{L}*|игр\p{L}*|героев|героя|наемник\p{L}*|наёмник\p{L}*|рабоч\p{L}*\s+в|войск\p{L}*|армии|армию|наук|отзыв\p{L}*\s+в\s+(?:app\s*store|google\s*play|стор)|что\s+такое)(?=$|[^\p{L}])/iu],
 requests:[/(?:подготов|добавь|заведи|запиши|сводк|фидб|покажи|когда|назнач|вопрос)/iu],
 connect:'install',
 ready:settings=>settings.extension_hiring==='true'
};
