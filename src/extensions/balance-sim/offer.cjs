// When to offer «Симуляция баланса»: a simulation of the game's progression or economy on its configs, days to a
// level for a free player, «what if» a reward or a price changes. Reconciling or validating configs («Конфиги и
// баланс»), game metrics, money balance and levels outside games are not it.
module.exports={
 id:'balance-sim',name:'Симуляция баланса',
 pitch:'посчитаю по конфигам игры, сколько дней игрок без доната идёт до уровня, как расходится валюта у тысяч игроков и что будет, если поменять награду или цену — все числа считает код',
 names:[/монте[- ]?карло|monte[- ]?carlo/iu],
 topics:[/(?:симул\p{L}*|смодел\p{L}*)\s+(?:\p{L}+\s+){0,2}?(?:прогресси|экономик|баланс|прокачк|игрок)\p{L}*/iu,
  /сколько\s+дн\p{L}*\s+(?:\p{L}+\s+){0,2}?до\s+\d{1,4}(?:-?(?:го|ого))?\s+уровн\p{L}*/iu,
  /(?:что\s+будет|как\s+измен\p{L}*)\s+с\s+экономик\p{L}*/iu,
  /(?:если|при)\s+(?:\p{L}+\s+){0,2}?(?:подн|увелич|сниз|уменьш|удво)\p{L}*\s+(?:\p{L}+\s+){0,1}?(?:наград|цен|стоимост)\p{L}*\s+(?:за\s+)?(?:побед|поражени|бо[йя]|матч|уровн|вход)/iu],
 avoid:[/свер\p{L}*|расхожд\p{L}*|провер\p{L}*\s+конфиг|(?:^|[^\p{L}])(?:dau|mau|ретеншн\p{L}*|retention)(?=$|[^\p{L}])|баланс\p{L}*\s+(?:на\s+)?(?:карт|сч[её]т|телефон|работ|жизн)|уровн\p{L}*\s+(?:английск|языка|воды|стресса)|что\s+такое/iu],
 requests:[/(?:сколько|симулир|смодел|что будет|как измен|посчитай|прогони|покажи)/iu],
 connect:'install',
 ready:settings=>settings['extension_balance-sim']==='true'
};
