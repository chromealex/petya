// «Grafana»: which chat requests are about Grafana dashboards and what they ask for — a list of dashboards, a
// search, one dashboard (by name, by a pasted link, or a panel mapped to a game metric), the time range.
// JavaScript's \b does not know Cyrillic, so word edges are written with Unicode letter classes.
const links=require('./links.cjs');
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=s=>new RegExp(s,'iu');

const NAMED=re(W+'(?:grafana|графан\\p{L}*|grafan\\p{L}*)'+E);
const DASH=re(W+'(?:дашборд\\p{L}*|дэшборд\\p{L}*|dashboard\\p{L}*|дашик\\p{L}*)'+E);
const LIST=re('(?:какие|список|перечисли|все|покажи все|что за)\\s+(?:\\p{L}+\\s+)?(?:дашборд|дэшборд|dashboard)\\p{L}*|(?:дашборд|дэшборд)\\p{L}*\\s+(?:есть|у нас|в графан\\p{L}*|в grafana)\\s*\\??$|какие\\s+(?:есть|у нас)\\s+(?:\\p{L}+\\s+)?(?:дашборд|дэшборд)\\p{L}*');
const SEARCH=re('(?:найди|поищи|ищи|найти|где|есть ли)\\s+(?:\\p{L}+\\s+)?(?:дашборд|дэшборд|dashboard)\\p{L}*');
// Grafana itself broken or a login problem: support talk, not a data request.
const SUPPORT=re('не\\s+(?:открывается|открыва\\p{L}*|работает|грузится|загружа\\p{L}*|пускает|отвечает|могу\\s+(?:войти|зайти|открыть))|'+W+'(?:упал\\p{L}*|лежит|тормоз\\p{L}*|глючит|сломал\\p{L}*|пароль|логин|залогин\\p{L}*|авториз\\p{L}*|500|502|504)'+E);
// How-to and talk about Grafana, not a request for data.
const QUIET=/^(?:а\s+)?(?:что такое|как (?:подключить|настроить|работает|сделать|создать|добавить|поставить|установить)|объясни|зачем|почему (?:графан|grafana))/iu;
// Petya only reads Grafana.
const WRITE=re('(?:создай|удали|измени|поменяй|добавь|отредактируй|переименуй|сохрани|переставь)\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:дашборд|дэшборд|панел|алерт|dashboard)');
// Neighbours' subjects: a bare «покажи X за неделю» is never taken for a dashboard when X is one of these.
const NEIGHBOURS=re(W+'(?:dau|mau|wau|дау|ретеншн\\p{L}*|ретенш\\p{L}*|retention|d1|d7|d30|выручк\\p{L}*|доход\\p{L}*|revenue|arpdau|arpu|метрик\\p{L}*|kpi|задач\\p{L}*|тикет\\p{L}*|баг\\p{L}*|jira|джир\\p{L}*|крэш\\p{L}*|креш\\p{L}*|краш\\p{L}*|crash\\p{L}*|sentry|anr|отзыв\\p{L}*|билд\\p{L}*|сборк\\p{L}*|ci|pr|пулл?\\p{L}*|коммит\\p{L}*|ветк\\p{L}*|календар\\p{L}*|встреч\\p{L}*|созвон\\p{L}*|письм\\p{L}*|почт\\p{L}*|slack|слак\\p{L}*|телеграм\\p{L}*|докер\\p{L}*|docker|контейнер\\p{L}*|диск\\p{L}*|файл\\p{L}*|папк\\p{L}*|погод\\p{L}*|курс\\p{L}*|новост\\p{L}*|график\\p{L}*|диаграмм\\p{L}*|таблиц\\p{L}*|зависимост\\p{L}*|пакет\\p{L}*|перевод\\p{L}*|локализац\\p{L}*|скриншот\\p{L}*|скрин\\p{L}*|команд\\p{L}*|спринт\\p{L}*|релиз\\p{L}*|патч\\p{L}*|логи|лог)'+E);
// Prometheus / PromQL written without Grafana: out of scope (no Prometheus connection).
const PROMQL=re(W+'(?:promql|prometheus|прометеус\\p{L}*)'+E+'|(?:rate|irate|increase|histogram_quantile|sum|avg)\\s*\\(\\s*[a-z_:]+(?:\\{|\\[)|[a-z_:]+\\{[a-z_]+=~?"');
const SHOW=re('^(?:а\\s+)?(?:покажи|показать|открой|глянь|посмотри|выведи|что\\s+(?:на|в|с|по|там на|там в)|как\\s+(?:там|дела\\s+(?:на|в|с|по)))'+E);

// Mapped game metrics a «DAU в графане» names (the panel the user mapped in settings).
const METRIC=[
 ['dau',re(W+'(?:dau|дау)'+E+'|активн\\p{L}*\\s+(?:игрок|пользовател)\\p{L}*')],
 ['new',re('нов\\p{L}*\\s+(?:игрок|пользовател|установ)\\p{L}*|'+W+'(?:new users|инстал\\p{L}*|install\\p{L}*)'+E)],
 ['revenue',re(W+'(?:выручк\\p{L}*|доход\\p{L}*|revenue)'+E)],
 ['arpdau',re(W+'(?:arpdau|arpu)'+E)],
 ['d30',re(W+'(?:d30|д30)'+E)],['d7',re(W+'(?:d7|д7)'+E)],['d1',re(W+'(?:d1|д1)'+E+'|ретеншн\\p{L}*|ретенш\\p{L}*|retention|удержани\\p{L}*')]
];
const metric=text=>{for(const [id,r] of METRIC)if(r.test(text))return id;return null;};

// The time range asked for, as Grafana relative times.
function period(text){
 const t=String(text||'').toLowerCase().replace(/ё/g,'е');
 const n=t.match(/за\s+(?:последние\s+|последний\s+|последнюю\s+)?(\d{1,3})\s*(мин|час|ч\b|дн|день|дня|сут|недел|мес|год|лет)/u);
 if(n){const v=Math.max(1,Number(n[1])),u=n[2];
  const [unit,word]=u.startsWith('мин')?['m',['минуту','минуты','минут']]:u.startsWith('ч')?['h',['час','часа','часов']]:u.startsWith('недел')?['w',['неделю','недели','недель']]:u.startsWith('мес')?['M',['месяц','месяца','месяцев']]:u.startsWith('год')||u.startsWith('лет')?['y',['год','года','лет']]:['d',['день','дня','дней']];
  return {from:'now-'+v+unit,to:'now',label:'за '+v+' '+plural(v,word)};}
 if(/за\s+(?:последн\p{L}*\s+)?час/u.test(t))return {from:'now-1h',to:'now',label:'за час'};
 if(/за\s+(?:последн\p{L}*\s+)?(?:сутки|день)|за\s+24\s*ч|сегодня/u.test(t))return {from:'now-24h',to:'now',label:'за сутки'};
 if(/вчера/u.test(t))return {from:'now-1d/d',to:'now-1d/d',label:'за вчера'};
 if(/за\s+(?:последн\p{L}*\s+)?(?:две|2)\s+недел/u.test(t))return {from:'now-14d',to:'now',label:'за 2 недели'};
 if(/за\s+(?:последн\p{L}*\s+)?недел|за\s+7\s*дн|недельн/u.test(t))return {from:'now-7d',to:'now',label:'за неделю'};
 if(/за\s+(?:последн\p{L}*\s+)?месяц|за\s+30\s*дн|месячн/u.test(t))return {from:'now-30d',to:'now',label:'за месяц'};
 if(/за\s+(?:последн\p{L}*\s+)?квартал|за\s+90\s*дн/u.test(t))return {from:'now-90d',to:'now',label:'за квартал'};
 if(/за\s+(?:последн\p{L}*\s+)?год/u.test(t))return {from:'now-1y',to:'now',label:'за год'};
 return null;
}
const plural=(n,[a,b,c])=>{const x=Math.abs(n)%100,y=x%10;return x>10&&x<20?c:y===1?a:y>=2&&y<=4?b:c;};

// What the request names: the words left after verbs, Grafana words, the period and filler.
const FILLER=new Set(['покажи','показать','открой','глянь','посмотри','выведи','найди','поищи','ищи','найти','где','есть','ли','что','на','в','во','с','со','по','про','о','об','для','из','у','нас','мне','там','как','дела','какие','какой','какая','список','все','всё','перечисли','дашборд','дашборде','дашборда','дашборды','дашборду','дашбордом','дашбордов','дэшборд','дэшборде','dashboard','графана','графане','графаны','графану','графаной','grafana','за','последние','последний','последнюю','неделю','неделя','сутки','день','месяц','квартал','год','час','сегодня','вчера','а','и','это','этот','эту','панель','панели','панель','график','графики','данные','данных','и','или','какое','какую','то','же','пожалуйста','мне','нам','дай','давай','текущий','текущие','сейчас','самый','свежий']);
function subject(text){
 // «лиги для сервера asia»: what follows «для / где / при / с фильтром» picks a variable value, not the dashboard.
 return String(text||'').replace(/https?:\/\/\S+/g,' ').toLowerCase().replace(/ё/g,'е')
  .replace(/(?:^|\s)(?:для|где|при|с фильтром|фильтр)\s.*$/u,' ')
  .replace(/за\s+(?:последн\p{L}*\s+)?\d+\s*\p{L}+/gu,' ')
  .split(/[^\p{L}\p{N}_-]+/u).filter(w=>w&&!FILLER.has(w)&&!/^\d+$/.test(w)).slice(0,6);
}

function parse(text){
 const t=String(text||'').trim();
 const link=links.find(t);
 const named=NAMED.test(t),dash=DASH.test(t);
 const intent=link?'show':LIST.test(t)&&subject(t).length===0?'list':SEARCH.test(t)?'search':LIST.test(t)?'search':'show';
 return {link,named,dash,explicit:!!link||named||dash,intent,words:subject(t),range:period(t),metric:named||dash?metric(t):null,
  shortLink:links.shortLink(t),write:WRITE.test(t)};
}
// Not ours at all: empty, how-to, Grafana broken, PromQL without Grafana. A link to a Grafana dashboard always is.
function excluded(text){
 const t=String(text||'').trim();
 if(!t||t.length>1500)return true;
 if(links.find(t))return false;
 if(QUIET.test(t))return true;
 if((NAMED.test(t)||DASH.test(t))&&SUPPORT.test(t))return true;
 if(PROMQL.test(t)&&!NAMED.test(t))return true;
 return false;
}
// A bare «покажи лиги за неделю»: a show verb and 1–3 words that are no neighbour's subject. Whether a dashboard is
// called so is checked against the dashboard list (only when Grafana is connected).
function implicit(text){
 const t=String(text||'').trim();
 if(excluded(t)||NAMED.test(t)||DASH.test(t)||!SHOW.test(t)||NEIGHBOURS.test(t)||t.length>120)return null;
 const words=subject(t);
 return words.length>=1&&words.length<=3?{words,range:period(t)}:null;
}
module.exports={NAMED,DASH,LIST,SEARCH,SUPPORT,QUIET,WRITE,NEIGHBOURS,PROMQL,SHOW,parse,excluded,implicit,period,subject,metric};
