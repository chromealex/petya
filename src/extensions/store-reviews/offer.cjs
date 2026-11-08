// When to offer «Отзывы в сторах» to someone who has not added or connected it.
// Neighbours: code review / PR (pull-requests), performance review, candidate feedback, meeting feedback,
// ANR in Google Play (google-play), crashes, build size — none of these are store reviews.
const STORES='(?:app\\s?store|апп?\\s?стор\\p{L}*|эпп?\\s?стор\\p{L}*|google\\s?play|гугл[- ]?пле\\p{L}*|play\\s?market|плей\\s?маркет\\p{L}*|стор(?:е|ах|ы|ов)?)';
module.exports={
 id:'store-reviews',name:'Отзывы в сторах',
 pitch:'покажу отзывы App Store и Google Play с оценками по дням и темами жалоб, подготовлю ответ игроку',
 // Reviews named together with a store are an explicit request for this app.
 names:[new RegExp('(?:отзыв\\p{L}*|reviews?|жалоб\\p{L}*|оценк\\p{L}*|рейтинг\\p{L}*)\\s+(?:\\p{L}+\\s+){0,2}(?:в|из|на|с|про)\\s+'+STORES,'iu'),new RegExp(STORES+'\\s+(?:отзыв\\p{L}*|reviews?)','iu')],
 topics:[/отзыв(?:ы|ов|ах|ам|ами)(?!\p{L})/iu,/жалоб\p{L}*\s+(?:игрок|пользовател|юзер)\p{L}*/iu,/что пишут\s+(?:игроки|пользователи|в отзывах|в сторах)/iu,/(?:ответь|ответить|отвечать)\s+(?:на\s+)?отзыв/iu],
 avoid:[/код[- ]?ревью|code[- ]?review|ревью\s+(?:кода|pr|пр|пул\p{L}*)|pull[- ]?request|пул+[- ]?реквест|перф\p{L}*[- ]?ревью|performance[- ]?review|кандидат|собеседовани|соискател|резюме|ваканси|фидб[эе]к\p{L}*\s+(?:по|о|об|на|после)\s+(?:встреч|созвон|митинг)|отзыв\p{L}*\s+(?:о|об|про|на|по|после)\s+(?:встреч|созвон|митинг|сотрудник|коллег)|отзыв\p{L}*\s+(?:доступ|токен|ключ|сертификат|прав)|отозва|(?:^|[^\p{L}])(?:anr|крэш\p{L}*|краш\p{L}*|crash\p{L}*|apk|aab|ipa)(?=$|[^\p{L}])|размер\p{L}* (?:сборк|билд|apk|aab|ipa)/iu],
 requests:[/(?:покажи|что пишут|сколько|какие|плохие|жалоб|ответь|за неделю|за месяц|после обновления)/iu],
 connect:'settings',
 ready:settings=>settings['extension_store-reviews']==='true'&&Object.values(require('./feature.cjs').connected(settings)).some(Boolean)
};
