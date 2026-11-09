// When to offer «Воронки»: a funnel of game events (tutorial, onboarding, install → first purchase, own steps) or
// «где отваливаются игроки на онбординге». Not this: sales and marketing funnels (leads, CRM, a website), other
// meanings of «воронка», and plain metrics (DAU, retention, revenue are «Метрики игры»).
const q=require('./query.cjs');
module.exports={
 id:'funnels',name:'Воронки',
 pitch:'построю воронку событий игры — туториал, онбординг или путь до первой покупки — с отвалом между шагами, временем между ними и сравнением по платформам, странам и версиям',
 names:[],
 topics:[/воронк\p{L}*\s+(?:\p{L}+\s+){0,3}?(?:туториал|tutorial|обучени|онбординг|onboarding|ftue|установк|инсталл|install|перв\p{L}* покупк|покупк|игрок|событи|ивент|уровн|шаг)\p{L}*/iu,
  /воронк\p{L}*\s*[:—]\s*\S+\s*(?:→|->|>|,)\s*\S+/iu,
  q.DROPOFF_ABOUT],
 avoid:[q.MARKETING,/(?:^|[^\p{L}])(?:dau|mau|retention|ретеншн\p{L}*|arpdau|ecpm)(?=$|[^\p{L}])/iu],
 requests:[/(?:покажи|построй|сделай|посчитай|собери|какая|где|на каком|сколько)/iu],
 connect:'install',
 ready:settings=>settings.extension_funnels==='true'
};
