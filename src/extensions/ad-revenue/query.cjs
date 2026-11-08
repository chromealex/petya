// «Реклама и монетизация»: which requests are about ad revenue, and what they ask for (period, format, network,
// platform, country, the view). Neighbours: buying users with ads (user acquisition: campaigns, spend, creatives,
// installs), turning ads off in an app, in-app purchases and subscriptions — none of these are ad revenue.
const DAY=86400000;
const L='\\p{L}';
const AD=/реклам\p{L}*|(?:^|[^\p{L}])ads?(?=$|[^\p{L}])|ad[- ]?revenue|адревеню/iu;
const MONEY=/заработ\p{L}*|зарабат\p{L}*|выручк\p{L}*|доход\p{L}*|revenue|денег|деньг\p{L}*|монетизац\p{L}*|принос\p{L}*|принёс\p{L}*|принес\p{L}*|(?:^|[^\p{L}])e?cpm(?=$|[^\p{L}])|е?cpm|ецпм|еспм|arpdau|арпдау|fill[- ]?rate|филл?[- ]?рейт\p{L}*|заполняемост\p{L}*|показ(?:ы|ов|ам|ах)(?!\p{L})|impressions?/iu;
const METRIC=/(?:^|[^\p{L}])(?:e-?cpm|ецпм|еспм|eCPM|arpdau|арпдау)(?=$|[^\p{L}])|fill[- ]?rate|филл?[- ]?рейт\p{L}*|ad[- ]?revenue|рекламн\p{L}* (?:выручк|доход|монетизац)\p{L}*|монетизаци\p{L}* (?:с |от )?реклам\p{L}*/iu;
const SERVICE=/(?:^|[^\p{L}])(?:applovin|эпп?ловин\p{L}*|аппловин\p{L}*|applovin max|levelplay|level play|левел ?плей\p{L}*|ironsource|iron source|айрон ?сорс\p{L}*)(?=$|[^\p{L}])/iu;
const FORMAT_WORD=/(?:^|[^\p{L}])(?:rewarded|reward|ревард\p{L}*|ривард\p{L}*|interstitial|inter|интерстишл\p{L}*|интер(?:ы|ов|ах|ам)?|межстранични\p{L}*|межстраничн\p{L}*|баннер\p{L}*|banners?|mrec|мрек|native|натив\p{L}*|app ?open|offerwall|офф?ервол\p{L}*)(?=$|[^\p{L}])/iu;
const MOVE=/упал\p{L}*|упад\p{L}*|просел\p{L}*|просад\p{L}*|снизил\p{L}*|вырос\p{L}*|растёт|растет|подрос\p{L}*|скач\p{L}*|аномал\p{L}*|обвал\p{L}*|меньше|больше/iu;
// User acquisition, ads inside the product turned off, purchases and creatives belong elsewhere.
const NEAR=/рекламн\p{L}* кампани\p{L}*|кампани\p{L}* (?:в|по|на|для) |маркетинг\p{L}*|закуп\p{L}*|(?:^|[^\p{L}])(?:ua|cpi|roas|cpa|ctr|cac)(?=$|[^\p{L}])|user acquisition|привлечени\p{L}*|инсталл\p{L}*|креатив\p{L}*|таргет\p{L}*|потрат\p{L}*|трат\p{L}* на рекламу|бюджет\p{L}* (?:на )?реклам|реклам\p{L}* (?:игры|нашей игры|приложения|в (?:тикток|tiktok|ютуб|youtube|инстаграм|instagram|вк|телеграм|facebook|фейсбук))|(?:^|[^\p{L}])(?:запусти|запустить|настрой|настроить|сделай|нарисуй|придумай|напиши|сними)\p{L}* (?:\p{L}+ )?(?:реклам|баннер|ролик)|(?:^|[^\p{L}])(?:отключ|выключ|убер|убра|скро|блокир|заблокир|без )\p{L}* ?(?:\p{L}+ )?реклам\p{L}*|реклам\p{L}* (?:мешает|бесит|надоел)|adblock|адблок\p{L}*|покупк\p{L}* (?:в|внутри) (?:приложени|игр)|встроенн\p{L}* покупк|(?:^|[^\p{L}])iap(?=$|[^\p{L}])|in-?app purchase|подписк\p{L}*|донат\p{L}*/iu;

function about(text){
 const t=String(text||'').trim();
 if(!t||NEAR.test(t))return false;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить|работает))/iu.test(t))return false;
 if(SERVICE.test(t)||METRIC.test(t))return true;
 if(AD.test(t)&&MONEY.test(t))return true;
 if(FORMAT_WORD.test(t)&&(MONEY.test(t)||MOVE.test(t)))return true;
 if(/формат\p{L}*/iu.test(t)&&/принос\p{L}*|выручк\p{L}*|доход\p{L}*|заработ\p{L}*|e?cpm|денег/iu.test(t))return true;
 return false;
}

const FORMATS=[[/ревард\p{L}*|ривард\p{L}*|rewarded|reward(?!\p{L})/iu,'rewarded'],[/интерстишл\p{L}*|interstitial|inter(?!\p{L})|(?:^|[^\p{L}])интер(?:ы|ов|ах|ам)?(?!\p{L})|межстраничн\p{L}*/iu,'interstitial'],
 [/баннер\p{L}*|banners?/iu,'banner'],[/mrec|мрек/iu,'mrec'],[/native|натив\p{L}*/iu,'native'],[/app ?open/iu,'appopen'],[/offerwall|офф?ервол\p{L}*/iu,'offerwall']];
const NETWORKS=[[/admob|адмоб\p{L}*|google ads?|гугл\p{L}*/iu,'Google AdMob'],[/(?:^|[^\p{L}])(?:unity|юнити|ironsource|айрон ?сорс\p{L}*)(?=$|[^\p{L}])/iu,'Unity / ironSource'],[/meta|facebook|фейсбук\p{L}*|мета(?!\p{L})/iu,'Meta Audience Network'],
 [/mintegral|минтеграл\p{L}*/iu,'Mintegral'],[/pangle|пангл\p{L}*/iu,'Pangle'],[/liftoff|vungle|вангл\p{L}*/iu,'Liftoff'],[/inmobi|инмоби/iu,'InMobi'],[/chartboost|чартбуст\p{L}*/iu,'Chartboost'],
 [/moloco|молоко(?= сет)/iu,'Moloco'],[/bidmachine/iu,'BidMachine'],[/yandex|яндекс\p{L}*/iu,'Yandex Ads'],[/applovin(?! max)|эпп?ловин\p{L}*|аппловин\p{L}*(?! макс)/iu,'AppLovin']];
const COUNTRIES=[[/росси|рф(?!\p{L})/iu,'RU'],[/сша|америк|usa(?!\p{L})/iu,'US'],[/германи/iu,'DE'],[/британи|англи/iu,'GB'],[/франци/iu,'FR'],[/япони/iu,'JP'],[/коре/iu,'KR'],[/бразили/iu,'BR'],[/турци/iu,'TR'],[/индии|индия|индию/iu,'IN'],[/канад/iu,'CA'],[/казахстан/iu,'KZ'],[/испани/iu,'ES'],[/итали/iu,'IT'],[/мексик/iu,'MX']];

const iso=ms=>new Date(ms).toISOString().slice(0,10);
// The user's calendar day as a UTC date key (reports are by UTC day).
const localDay=(now,shift=0)=>iso(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())+shift*DAY);
const NUM={один:1,одна:1,два:2,две:2,три:3,четыре:4,пять:5,шесть:6,семь:7,десять:10,четырнадцать:14,тридцать:30};
function period(text,now=new Date()){
 const t=String(text||'').toLowerCase();
 const span=(days,label,kind,endShift=-1)=>({start:localDay(now,endShift-days+1),end:localDay(now,endShift),days,label,kind});
 if(/позавчера/u.test(t))return {...span(1,'позавчера','day',-2)};
 if(/вчера|за прошл\p{L}* (?:день|сутки)/u.test(t))return span(1,'вчера','day');
 if(/сегодня|за сегодня/u.test(t))return {...span(1,'сегодня','today',0),partial:true};
 const n=t.match(/за (?:последние |прошлые )?(\d{1,2}|[а-я]+) (дн\p{L}*|недел\p{L}*|сут\p{L}*)/u);
 if(n){const v=Number(n[1])||NUM[n[1]];if(v){const days=Math.min(42,/недел/.test(n[2])?v*7:v);return span(days,'за '+days+' '+require('../app-kit.cjs').plural(days,['день','дня','дней']),days<=7?'week':'range');}}
 if(/за (?:последн\p{L}* )?(?:две|2) недел/u.test(t))return span(14,'за 2 недели','range');
 if(/за месяц|за последн\p{L}* месяц|за 30|месячн/u.test(t))return span(30,'за 30 дней','month');
 return span(7,'за 7 дней','week');
}
function view(text){
 const t=String(text||'');
 if(/(?:^|[^\p{L}])(?:e-?cpm|ецпм|еспм)(?=$|[^\p{L}])/iu.test(t))return 'ecpm';
 if(/fill[- ]?rate|филл?[- ]?рейт|заполняемост/iu.test(t))return 'fill';
 if(/arpdau|арпдау/iu.test(t))return 'arpdau';
 if(/(?:по|разных|какой|какая|какие|каким)\s+(?:\p{L}+\s+)?(?:формат\p{L}*)|формат\p{L}* (?:приносит|больше|лучше)/iu.test(t))return 'format';
 if(/(?:по|разных|какая|какие|каким)\s+(?:\p{L}+\s+)?(?:сет(?:ям|и|ей|ь)|сетк\p{L}*|network\p{L}*)/iu.test(t))return 'network';
 if(/(?:по|разных|какая|какие|каким)\s+(?:\p{L}+\s+)?(?:стран\p{L}*|гео|регион\p{L}*)/iu.test(t))return 'country';
 if(MOVE.test(t)&&/упал|упад|просел|просад|снизил|обвал|аномал/iu.test(t))return 'anomaly';
 return null;
}
function parse(text,now=new Date()){
 const t=String(text||'');
 const format=FORMATS.find(([r])=>r.test(t))?.[1]||null;
 // A network named as a source of revenue, not the service the report comes from.
 const named=NETWORKS.filter(([r])=>r.test(t)).map(([,n])=>n);
 const network=named.find(n=>!(n==='AppLovin'&&/applovin max|max(?!\p{L})/iu.test(t)))||null;
 const platform=/(?:^|[^\p{L}])(?:ios|айос\p{L}*|айфон\p{L}*|iphone|app ?store)(?=$|[^\p{L}])/iu.test(t)?'ios':/(?:^|[^\p{L}])(?:android|андроид\p{L}*|google play|гугл[- ]?пле\p{L}*)(?=$|[^\p{L}])/iu.test(t)?'android':null;
 const country=COUNTRIES.find(([r])=>r.test(t))?.[1]||null;
 const compare=/сравни\p{L}*|по сравнению|против прошл|с прошл\p{L}* недел|к прошл\p{L}* недел/iu.test(t);
 return {period:period(t,now),format,network,platform,country,compare,view:view(t)};
}
module.exports={about,parse,period,view,NEAR,DAY,iso,localDay};
