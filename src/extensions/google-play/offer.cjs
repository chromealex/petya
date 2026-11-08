// When to offer Google Play crashes: crashes named together with Google Play («крэши в Google Play», «крэши в гугл
// плей»). ANR is the ANR card's subject, reviews are «Отзывы в сторах». Google Play is connected in Petya's own
// service settings (`service`), and accepting adds «Крэши» (`also`), the app that shows the crashes.
const STORE='(?:google\\s?play|гугл[- ]?пле\\p{L}*|play\\s?console|плей\\s?консол\\p{L}*)';
const CRASH='(?:кр[эеа]ш\\p{L}{0,4}|crash\\p{L}{0,3}|падени\\p{L}{0,3}|вылет\\p{L}{0,3})';
const connected=settings=>settings.module_googleplay!=='false'&&!!settings.googlePlayCredential;
module.exports={
 id:'google-play',name:'Google Play',
 pitch:'покажу крэши из Android vitals Google Play в «Крэшах»: топ за период по приложениям, график по дням и новые',
 names:[new RegExp(CRASH+'\\s+(?:\\p{L}+\\s+){0,2}'+STORE,'iu'),new RegExp(STORE+'\\s+(?:\\p{L}+\\s+){0,1}'+CRASH,'iu')],
 topics:[],
 avoid:[/(?:^|[^\p{L}])(?:anr|анр)(?=$|[^\p{L}])|зависани/iu,/отзыв|review|жалоб|оценк|рейтинг/iu],
 also:['crashes'],
 service:'googleplay',
 connect:'settings',
 connected,
 ready:settings=>connected(settings)&&settings.extension_crashes==='true'
};
