// When to offer «Реклама и монетизация» to someone who has not added or connected it.
// Neighbours: buying users with ads (campaigns, spend, creatives — a separate user-acquisition app later), turning
// ads off, in-app purchases and subscriptions, and crashes' «падение выручки» wording.
const {NEAR}=require('./query.cjs');
module.exports={
 id:'ad-revenue',name:'Реклама и монетизация',
 pitch:'покажу выручку с рекламы по дням, сетям, форматам и странам, eCPM и просадки — из AppLovin MAX или Unity LevelPlay',
 names:[/(?:^|[^\p{L}])(?:applovin|эпп?ловин\p{L}*|аппловин\p{L}*|levelplay|level play|левел ?плей\p{L}*|ironsource|айрон ?сорс\p{L}*)(?=$|[^\p{L}])/iu],
 topics:[/(?:заработ\p{L}*|выручк\p{L}*|доход\p{L}*|монетизац\p{L}*|revenue)\s+(?:\p{L}+\s+)?(?:с|от|на)\s+реклам\p{L}*|реклам\p{L}*\s+(?:\p{L}+\s+)?(?:принес\p{L}*|принёс\p{L}*|приносит|заработал\p{L}*|выручк\p{L}*|доход\p{L}*)|рекламн\p{L}* (?:выручк|доход|монетизац)\p{L}*|ad[- ]?revenue/iu,
  /(?:^|[^\p{L}])(?:e-?cpm|ецпм|arpdau|арпдау)(?=$|[^\p{L}])|fill[- ]?rate|филл?[- ]?рейт\p{L}*/iu,
  /(?:выручк\p{L}*|доход\p{L}*|e-?cpm)\s+(?:\p{L}+\s+)?(?:с|от|по)\s+(?:rewarded|ревард\p{L}*|interstitial|интерстишл\p{L}*|баннер\p{L}*|banner)|какой формат (?:рекламы )?(?:приносит|больше|лучше)/iu],
 avoid:[NEAR],
 requests:[/(?:сколько|какой|какая|какие|покажи|упал|просел|вырос|по сетям|по форматам|по странам|вчера|за неделю)/iu],
 connect:'settings',
 ready:settings=>settings['extension_ad-revenue']==='true'&&(require('./applovin-source.cjs').ready(settings)||require('./levelplay-source.cjs').ready(settings))
};
