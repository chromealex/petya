// «Покупки в игре»: which chat requests are about in-app purchases (revenue by product, payers, ARPPU, first
// purchases, refunds, ROAS with purchases) and what they ask for. Neighbours stay with their apps: game revenue,
// DAU and ARPDAU in general («Метрики игры»), ad revenue («Реклама и монетизация»), spend and plain ROAS («Закупка
// трафика»), funnels to the first purchase («Воронки»), personal subscriptions and shopping, store reviews, and
// requests to a named database («SQL по словам»).
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=s=>new RegExp(s,'iu');

const IAP=re('(?:покупк\\p{L}*|продаж\\p{L}*|выручк\\p{L}*|доход\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:в игре|в приложении|внутри игры|игроков)'+
 '|внутриигров\\p{L}*\\s+(?:покупк|платеж|платёж|продаж)\\p{L}*|'+W+'(?:iap|in-app|inapp|ин-?апп?\\p{L}*)'+E+
 '|(?:продаж\\p{L}*|выручк\\p{L}*|доход\\p{L}*)\\s+(?:по|с|от)\\s+(?:продукт|товар|пак|набор|оффер|покупк|скин)\\p{L}*'+
 '|(?:какие|какой|какая|что)\\s+(?:\\p{L}+\\s+)?(?:паки|пак|наборы|набор|товары|товар|продукты|продукт|офферы|оффер)\\s+(?:\\p{L}+\\s+)?(?:покупают|продаются|продаётся|продается|лучше|больше|чаще)'+
 '|конверси\\p{L}*\\s+в\\s+(?:платящ|плательщ|покупател|первую покупк)\\p{L}*|платящ\\p{L}*|плательщик\\p{L}*|'+W+'(?:arppu|арппу)'+E+
 '|перв\\p{L}*\\s+покупк\\p{L}*|рефанд\\p{L}*|'+W+'refunds?'+E+'|возврат\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:покупок|платежей|денег за покупк\\p{L}*|по покупкам|в (?:app store|google play|сторах|сторе))'+
 '|(?:roas|ромi|ромай|окупаемост\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:с|с учётом|с учетом|вместе с)\\s+(?:покупк|iap|инап)\\p{L}*|продаж\\p{L}*\\s+в\\s+(?:app ?store|google ?play|сторах)');
// Not ours even with purchase words.
const ELSEWHERE=re('воронк\\p{L}*|список покупок|'+W+'(?:купи|закажи|закупк\\p{L}*|закупи\\p{L}*)'+E+'|покупк\\p{L}* (?:рекламы|трафика|билет\\p{L}*|продуктов в магазин\\p{L}*|домой|лицензи\\p{L}*)'+
 '|(?:мои|мой)\\s+подписк\\p{L}*|за что я плачу|'+W+'(?:sql|clickhouse|bigquery|postgres(?:ql)?|кликхаус\\p{L}*|бигквери|постгрес\\p{L}*)'+E+'|баз\\p{L}* данных'+
 '|отзыв\\p{L}*|крэш\\p{L}*|краш\\p{L}*|креш\\p{L}*|что такое|как (?:настроить|подключить|сделать|добавить|реализовать|протестировать)|напиши код|sdk|storekit|billing ?library|unity iap');
const DEFINITION=/^(?:а\s+)?(?:что такое|что значит|чем отличается|зачем нуж\p{L}*)/iu;

function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>500||DEFINITION.test(t)||ELSEWHERE.test(t))return false;
 return IAP.test(t);
}
function view(text){
 const t=String(text||'');
 if(re('roas|окупаемост').test(t))return 'roas';
 if(re('рефанд|refund|возврат').test(t))return 'refunds';
 if(re('перв\\p{L}* покупк').test(t))return 'first';
 if(re('платящ|плательщ|arppu|арппу|конверси').test(t))return 'payers';
 return 'products';
}
function store(text){
 if(re(W+'(?:app ?store|апп? ?стор\\p{L}*|эпп? ?стор\\p{L}*|ios|айос\\p{L}*|айфон\\p{L}*)'+E).test(text))return 'appstore';
 if(re(W+'(?:google ?play|гугл ?плей\\p{L}*|android|андроид\\p{L}*)'+E).test(text))return 'googleplay';
 return null;
}
function currency(text){
 if(re('в рубл\\p{L}*|'+W+'(?:rub|руб)'+E+'|₽').test(text))return 'RUB';
 if(re('в доллар\\p{L}*|'+W+'usd'+E+'|\\$').test(text))return 'USD';
 if(re('в евро|'+W+'eur'+E+'|€').test(text))return 'EUR';
 return null;
}
function parse(text,now=Date.now()){
 const p=require('../../features/ua-sources.cjs').period(text,now);
 // Purchases default to 30 days: a week is often too few payers to compare products.
 const explicit=/вчера|сегодня|недел|месяц|за\s+\d|прошл|эт\p{L}* месяц/iu.test(String(text||''));
 const period=explicit?p:{...require('../../features/ua-sources.cjs').period('за 30 дней',now),label:'за 30 дней'};
 return {view:view(text),store:store(text),currency:currency(text),period};
}
module.exports={about,parse,view,store,currency,IAP,ELSEWHERE};
