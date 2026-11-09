// «Метрики игры»: which chat requests are about the game's product metrics, and what they ask for
// (period, focus metric, platform, version, a named source, comparison with the previous period).
// JavaScript's \b does not know Cyrillic, so word edges are written with Unicode letter classes.
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=s=>new RegExp(s,'iu');

const SOURCE=re(W+'(?:appmetrica|app\\s?metrica|аппметрик\\p{L}*|апметрик\\p{L}*)'+E);
const DAU=re(W+'(?:dau|mau|wau|дау|мау)'+E+'|активн\\p{L}*\\s+(?:игрок|пользовател|юзер)\\p{L}*|(?:сколько|число|количеств\\p{L}*)\\s+(?:активных\\s+)?(?:игроков|пользователей)\\s+(?:в день|в игре|за)');
const NEW=re('(?:нов\\p{L}*)\\s+(?:игрок|пользовател|юзер|установ)\\p{L}*|(?:^|[^\\p{L}])(?:new users|инстал\\p{L}*)'+E);
const RETENTION=re(W+'(?:ретеншн\\p{L}*|ретенш\\p{L}*|ретеншен\\p{L}*|retention|удержани\\p{L}*|d1|d7|d30|д1|д7|д30)'+E);
const REVENUE=re(W+'(?:выручк\\p{L}*|доход\\p{L}*|revenue|arpdau|arpu|arppu|арпу|платеж\\p{L}*|монетизаци\\p{L}*)'+E);
const METRICS=re('метрик\\p{L}*\\s+(?:игры|приложения|проекта|продукта|по игре)|(?:основн|главн|важн)\\p{L}* (?:продуктов\\p{L}* )?метрик\\p{L}*|продуктов\\p{L}* метрик\\p{L}*|(?:^|[^\\p{L}])kpi(?:[^\\p{L}]|$)|ключев\\p{L}* метрик\\p{L}*');
// «сравни эту неделю с прошлой» says nothing about the subject: it is a metrics request only when nothing else is named.
const WEEKS=re('сравни\\p{L}*\\s+(?:эту|текущую|прошлую)\\s+неделю\\s+с\\s+(?:прошлой|позапрошлой)|(?:эта|текущая)\\s+неделя\\s+против\\s+прошлой');
// Neighbours: team metrics and velocity (Jira), crashes, store reviews, ANR, server metrics, build size, in-app
// purchases by product and payers, funnels.
const ELSEWHERE=re('метрик\\p{L}*\\s+(?:команд|разработ|спринт|сервер|бэкенд|backend|сайта|кода|ci)|велосити|velocity|спринт\\p{L}*|задач\\p{L}*|тикет\\p{L}*|jira|джир\\p{L}*|'+W+'(?:крэш\\p{L}*|креш\\p{L}*|краш\\p{L}*|crash\\p{L}*|sentry|anr|анр|отзыв\\p{L}*|реклам\\p{L}*|rewarded|interstitial|баннер\\p{L}*|ecpm|ецпм|fill rate|филлрейт\\p{L}*|rps|cpu|latency|grafana|графан\\p{L}*|prometheus|коммит\\p{L}*|документ\\p{L}*|файл\\p{L}*|презентац\\p{L}*|слайд\\p{L}*|pr|пулл?\\p{L}*)'+E+'|сервер\\p{L}*|размер\\p{L}* (?:билда|сборки|apk)|a\\s?/\\s?b|аб[- ]?тест|значим\\p{L}*|srm'+
 // In-app purchases by product, payers, ARPPU, refunds and first purchases («Покупки в игре»); funnels («Воронки»).
 '|внутриигров\\p{L}*|платящ\\p{L}*|плательщик\\p{L}*|'+W+'(?:arppu|арппу|iap|in-app|рефанд\\p{L}*|refunds?)'+E+'|перв\\p{L}* покупк\\p{L}*|покупк\\p{L}* (?:в игре|в приложении)|(?:выручк|продаж|доход)\\p{L}* (?:по|с|от) (?:продукт|товар|пак|набор|оффер)\\p{L}*|возврат\\p{L}* (?:покупок|платежей)|воронк\\p{L}*'+
 // «What was that dip on the chart» asks for an explanation («Объясни график»), not for the card again.
 '|(?:что за|объясни\\p{L}*|разбери)\\s+(?:\\p{L}+\\s+){0,2}?(?:провал\\p{L}*|пик\\p{L}*|всплеск\\p{L}*|яма|ям\\p{L}*|скач\\p{L}*|график\\p{L}*)');
// «Почему упал DAU?» asks for an explanation (the chat model answers from the card), not for the card again.
const QUIET=/^(?:а\s+)?(?:почему|отчего|из-за чего|что такое|зачем нуж|как (?:подключить|настроить|считается|работает)|объясни)/iu;

function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>500||QUIET.test(t)||ELSEWHERE.test(t))return false;
 return SOURCE.test(t)||DAU.test(t)||NEW.test(t)||RETENTION.test(t)||REVENUE.test(t)||METRICS.test(t)||WEEKS.test(t);
}

function period(text){
 const t=String(text||'').toLowerCase();
 const n=t.match(/за\s+(?:последние\s+)?(\d{1,3})\s*(дн|день|дня|сут|недел|месяц)/u);
 if(n){const v=Math.max(1,Number(n[1])),days=Math.min(90,n[2]==='недел'?v*7:n[2]==='месяц'?v*30:v);return days;}
 if(/вчера/u.test(t))return 1;
 if(/квартал|(?:^|\D)90\s*дн/u.test(t))return 90;
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/месяц|(?:^|\D)30\s*дн/u.test(t))return 30;
 return 7;
}
function focus(text){
 if(RETENTION.test(text))return 'retention';
 if(REVENUE.test(text))return 'revenue';
 if(NEW.test(text))return 'new';
 if(DAU.test(text))return 'dau';
 return null;
}
function platform(text){
 if(re('(?:^|[^\\p{L}\\p{N}_-])(?:андроид\\p{L}{0,3}|android)(?![\\p{L}\\p{N}_-])').test(text))return 'android';
 if(re('(?:^|[^\\p{L}\\p{N}_-])(?:ios|айос\\p{L}{0,3}|айфон\\p{L}{0,3}|iphone)(?![\\p{L}\\p{N}_-])').test(text))return 'ios';
 return null;
}
function version(text){
 const m=String(text||'').match(/(?:верси\p{L}*|билд\p{L}*|релиз\p{L}*|version)\s+v?(\d+(?:\.\d+){1,3})/iu);
 return m?m[1]:null;
}
const compare=text=>re('сравни\\p{L}*|по сравнению|против прошл|с прошл\\p{L}* (?:недел|месяц|период)|после ивента|после акци|после обновлени|после релиза').test(text);

// The source a request names: AppMetrica by its own words, any other source by its name or the names it gives
// (`sources`: [{id, names}] — Grafana answers to its host, «DAU из wombyte» for dashboards.wombyte.net).
const mentions=(text,name)=>{const n=String(name||'').toLowerCase().replace(/ё/g,'е').trim();if(n.length<3)return false;
 const stem=n.length>=6&&/[а-я]$/.test(n)?n.slice(0,-1):n;
 return re(W+stem.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+(stem===n?'':'\\p{L}{0,3}')+E).test(String(text||'').replace(/ё/gi,'е'));};
function source(text,sources=[]){
 if(SOURCE.test(text))return 'appmetrica';
 return sources.find(x=>(x.names||[]).some(n=>mentions(text,n)))?.id||null;
}
function parse(text,{sources}={}){
 return {days:period(text),focus:focus(text),platform:platform(text),version:version(text),compare:compare(text),source:source(text,sources)};
}
module.exports={about,parse,source,mentions,period,focus,platform,version,compare,SOURCE,DAU,NEW,RETENTION,REVENUE,METRICS,ELSEWHERE};
