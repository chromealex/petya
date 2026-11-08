// When to offer «Конфиги и баланс»: game balance against config files, ScriptableObject configs, balance versions.
// CI / server / tool configs, Petya's settings, money balance, work-life balance and load balancers are not it.
module.exports={
 id:'config-balance',name:'Конфиги и баланс',
 pitch:'сверю таблицу баланса с конфигами игры (ScriptableObject, JSON, CSV), найду расхождения и ошибки в конфигах и покажу, что поменялось между версиями; правки — через Программиста или в таблицу после подтверждения',
 names:[/scriptable\s*objects?/iu],
 topics:[/баланс\p{L}*\s+(?:с|и|в|против)\s+(?:конфиг|таблиц)\p{L}*|конфиг\p{L}*\s+(?:с|и)\s+(?:баланс|таблиц)\p{L}*/iu,
  /(?:свер\p{L}*|сравни\p{L}*)\s+(?:игров\p{L}*\s+)?баланс/iu,
  /конфиг\p{L}*\s+(?:юнит|оруж|предмет|враг|геро|персонаж|уровн|монстр|волн|скилл|игр)\p{L}*/iu,
  /(?:поменял|изменил)\p{L}*\s+в\s+баланс\p{L}*/iu,
  /в\s+игре\s+не\s+(?:как|такой|такое)\s+в\s+таблиц/iu],
 avoid:[/(?:^|[^\p{L}])(?:ci|cd|nginx|apache|docker\p{L}*|webpack|eslint|tsconfig|babel|kubernetes|k8s|jenkins|gradle|сервер\p{L}*)(?=$|[^\p{L}])|ci\/cd|github\s+actions|пет[иьяе](?=$|[^\p{L}])|(?:на|по)\s+(?:карт|сч[её]т|телефон)\p{L}*|деньг|рубл|баланс\p{L}*\s+(?:работ|жизн|бел)|балансир|нагрузк/iu],
 requests:[/(?:свер|сравни|провер|покажи|почему|что\s+поменял|что\s+изменил|найди)/iu],
 connect:'install',
 ready:settings=>settings['extension_config-balance']==='true'
};
