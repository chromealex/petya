// When to offer «Покупки в игре»: in-app purchases — revenue by product, payers and ARPPU, first purchases, refunds,
// ROAS with purchases. Not this: game revenue and ARPDAU in general («Метрики игры»), ad revenue, UA spend and plain
// ROAS, funnels to the first purchase, personal subscriptions and shopping lists, a named database (SQL).
const q=require('./query.cjs');
const connected=settings=>{try{return require('./appstore-source.cjs').ready({...settings,extension_iap:'true'})||require('./googleplay-source.cjs').ready({...settings,extension_iap:'true'})||settings.extension_sql==='true'&&require('../sql/connections.cjs').connected(settings);}catch{return false;}};
module.exports={
 id:'iap',name:'Покупки в игре',
 pitch:'покажу внутриигровые покупки: выручку по продуктам, возвраты, платящих и ARPPU, первые покупки и ROAS с покупками — из App Store Connect, Google Play или вашей базы',
 names:[],
 topics:[q.IAP],
 avoid:[q.ELSEWHERE],
 requests:[/(?:покажи|сколько|какие|какой|какая|что с|за неделю|за месяц|вчера|лучше|больше)/iu],
 connect:'settings',
 connected,
 ready:settings=>settings.extension_iap==='true'&&connected(settings)
};
