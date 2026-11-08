// When to offer «Аномалии» to someone who has not added it: «что необычного вчера», «есть аномалии за неделю?».
// Ad revenue drops are «Реклама и монетизация»'s own view, metrics for a period are «Метрики игры»; weather,
// gifts and ideas are not data.
module.exports={
 id:'anomalies',name:'Аномалии',
 pitch:'каждое утро сравню вчерашние метрики, крэши, обращения в поддержку, рекламную выручку и оценки в сторах с теми же днями прошлых недель и скажу только о заметных отклонениях',
 names:[/(?:^|[^\p{L}])аномали(?:и|й|ям|ях|я)(?=$|[^\p{L}])/iu],
 topics:[/(?:^|[^\p{L}])аномали\p{L}*/iu,/(?:что|чего)\s+(?:\p{L}+\s+)?необычн\p{L}*\s+(?:вчера|сегодня|за\s+(?:недел|сутки)|в\s+(?:метрик|данных|цифрах))/iu,/необычн\p{L}*\s+(?:в\s+)?(?:метрик|данных|цифрах|показател)\p{L}*/iu],
 avoid:[/аномальн\p{L}*\s+(?:жар|холод|погод|мороз|снег|дожд)|необычн\p{L}*\s+(?:подар|иде|имя|имен|назван|мест|рецепт)|реклам\p{L}*|(?:^|[^\p{L}])(?:e-?cpm|ецпм)(?=$|[^\p{L}])|applovin|levelplay/iu],
 requests:[/(?:есть|какие|покажи|что|найди|были)/iu],
 connect:'install',
 ready:settings=>settings.extension_anomalies==='true',
 connected:settings=>{try{return require('./feeds.cjs').connected({settings}).length>0;}catch{return false;}}
};
