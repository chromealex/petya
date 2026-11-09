// When to offer «Закупка трафика» to someone who has not added or connected it.
// Neighbours: ad revenue from ads shown in our games («Реклама и монетизация»), starting or stopping campaigns,
// in-app purchases, store reviews.
const UA=require('../../features/ua-sources.cjs');
module.exports={
 id:'ua-campaigns',name:'Закупка трафика',
 pitch:'покажу, сколько стоит привлечение игроков: траты, установки и CPI по сетям и кампаниям из AppLovin, Unity Ads и Meta',
 names:[/unity\s*ads|юнити\s*адс|(?:^|[^\p{L}])(?:facebook ads|meta ads|axon)(?=$|[^\p{L}])/iu],
 topics:[/закупк\p{L}*\s+(?:\p{L}+\s+)?(?:трафик\p{L}*|пользовател\p{L}*|игрок\p{L}*)|(?:^|[^\p{L}])(?:cpi|roas|роас)(?=$|[^\p{L}])/iu,
  /(?:потратил\p{L}*|расход\p{L}*|затрат\p{L}*)[^.?!]{0,30}(?:реклам\p{L}*|кампани\p{L}*|закупк\p{L}*)|реклам\p{L}*\s+кампани\p{L}*|(?:стоимост\p{L}*|сколько стоит|сколько стоят|цен\p{L}*)\s+(?:одн\p{L}*\s+)?(?:установк|инсталл|привлечени)\p{L}*/iu],
 avoid:[/заработ\p{L}*|выручк\p{L}*\s+(?:с|от)\s+реклам|e-?cpm|fill[- ]?rate|(?:запусти|останови|выключи|отключи|создай)\p{L}*\s+(?:\p{L}+\s+)?(?:реклам|кампани)|маркетингов|отзыв|покупк\p{L}* в приложении/iu],
 requests:[/(?:сколько|какой|какая|какие|покажи|по сетям|по кампаниям|вчера|за неделю|за месяц|дороже|дешевле)/iu],
 connect:'settings',
 connected:settings=>UA.create({settings:{...settings,'extension_ua-campaigns':'true'}}).list().length>0,
 ready:settings=>settings['extension_ua-campaigns']==='true'&&UA.create({settings}).list().length>0
};
