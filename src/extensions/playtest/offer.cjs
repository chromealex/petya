// When to offer «Разбор плейтеста» to someone who has not added it.
module.exports={
 id:'playtest',name:'Разбор плейтеста',
 pitch:'разберу запись плейтеста: где игрок застрял, повторные смерти, простои и негатив в речи — с кадрами, цитатами и временем',
 names:[/(?:^|[^\p{L}])play-?test\p{L}*(?=$|[^\p{L}])/iu],
 topics:[/плей-?тест\p{L}*/iu,/(?:где|когда|почему) игрок (?:застрял|застревает|запутал\p{L}*|бросил|сдал\p{L}*)|момент\p{L}* фрустрац\p{L}*|фрустрац\p{L}* игрок\p{L}*/iu],
 // Meeting recordings are the meetings app's, GIFs the converter's, failing tests CI's or the coder's.
 avoid:[/созвон\p{L}*|встреч\p{L}*|митинг\p{L}*|гифк\p{L}*|(?:^|[^\p{L}])gif(?=$|[^\p{L}])|(?:^|[^\p{L}])тест\p{L}* (?:упал|упали|не прош|красн)|юнит|автотест/iu],
 requests:[/(?:разбер|покажи|найди|где|какие|что|почему)/iu],
 connect:'install',
 ready:settings=>settings.extension_playtest==='true'
};
