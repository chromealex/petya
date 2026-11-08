// «Крэши»: which chat requests are about an app's crashes, and the filters a request names (period, release,
// platform, environment, only new ones). Which crash service a request names is the sources' own business
// (src/features/crash-sources.cjs `named` / `standalone`): nothing here knows Sentry, Crashlytics or Google Play.
// JavaScript's \b does not know Cyrillic, so word edges are written with Unicode letter classes.
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=source=>new RegExp(source,'iu');

// Crash nouns: «крэш/креш/краш» with case endings (not «крашеный»), «crash», «падения» of the app, «вылеты».
const CRASH=re(W+'(?:кр[эеа]ш(?:и|ей|ам|ами|ах|а|у|ом|ем|ы|ев|ев\\p{L}{1,3}|-?репорт\\p{L}{0,3})?|crash(?:es|ed|s)?|падени(?:е|я|й|ю|ям|ями|ях)|вылет(?:ы|ов|ам|ами|ах|а)?)'+E);
// «падение продаж», «вылет рейса»: not the app.
const NOT_APP=re('(?:падени\\p{L}*|вылет\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:продаж|выручк|доход|курс|цен|рейтинг|онлайн|ретеншн|retention|конверси|трафик|метрик|fps|фпс|кадр|самол|рейс|давлени|спрос|интерес)');
// ANR is the Google Play ANR card's subject, a red build is CI's, «сервер упал» is ordinary talk.
const ANR=re(W+'(?:anr|анр)\\p{L}{0,3}'+E+'|зависани\\p{L}*');
const BUILD=re('(?:упал\\p{L}*|сломал\\p{L}*|красн\\p{L}*|не собрал\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:сборк|билд|build|пайплайн|pipeline|джоб|job|ci'+E+')|(?:сборк|билд|build|пайплайн|pipeline|джоб|job|ci'+E+')\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:упал|сломал|красн|не собрал)');
// Requests for other handlers: fixing code (Programmer), a Jira task, explanations and setup questions.
const ELSEWHERE=re(W+'(?:исправ\\p{L}*|почини\\p{L}*|пофикс\\p{L}*|поправ\\p{L}*|jira|джир\\p{L}*|жир[аеуы]|тикет\\p{L}*|задач[уаи]'+E+'|созда\\p{L}*|заведи)');
const QUIET=/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить|работает|интегрировать|отправ)|объясни,? что такое|не\s+(?:надо|нужно|показывай))/iu;
// A request to see data: what, how many, top, new, a period, a release, a platform.
const ASK=re(W+'(?:какие|какой|какая|сколько|покажи|показать|выведи|топ|список|что с|что там|что по|что в|есть ли|были ли|новые|нов\\p{L}{1,3}|последн\\p{L}*|проверь|глянь|посмотри|статистик\\p{L}*|только|за (?:неделю|сегодня|вчера|сутки|день|месяц|\\d+)|вчера|сегодня|после (?:релиза|версии|апдейта|обновлени)|в релизе|в версии|на андроид\\p{L}*|на android|на ios|на айос|на айфон\\p{L}*)');

// `standalone`: the request names a crash service by a name that is a crash request by itself («что в Sentry»);
// `named`: it names a crash service at all («крэши в Google Play» is a request even without «покажи»).
function about(text,{standalone=false,named=false}={}){
 const t=String(text||'').trim();
 if(!t||t.length>600||QUIET.test(t))return false;
 if(ELSEWHERE.test(t)||ANR.test(t))return false;
 if(!standalone&&BUILD.test(t))return false;
 const crash=CRASH.test(t)&&!NOT_APP.test(t);
 if(!crash&&!standalone)return false;
 // «Sentry» alone (e.g. «открой Sentry») or a crash word with a request.
 return ASK.test(t)||crash&&(named||standalone)||standalone&&t.split(/\s+/).length<=4;
}

const DAY=86400000;
// The period a request names, always with start and end; `statsPeriod` for services that take a relative period.
function period(text,now=new Date()){
 const t=String(text||'').toLowerCase();
 const back=(days,extra)=>({start:new Date(now.getTime()-days*DAY).toISOString(),end:now.toISOString(),days,...extra});
 const n=t.match(/за\s+(?:последние\s+)?(\d{1,3})\s*(дн|день|дня|сут|час|недел|месяц)/u);
 if(/вчера/u.test(t)){const end=new Date(now);end.setHours(0,0,0,0);const start=new Date(end.getTime()-DAY);return {label:'вчера',start:start.toISOString(),end:end.toISOString(),days:1,calendar:true,kind:'yesterday'};}
 if(n){
  const v=Math.max(1,Number(n[1])),unit=n[2];
  if(unit==='час'){const h=Math.min(v,2160);return back(h/24,{label:'за '+h+' ч',statsPeriod:h+'h',days:Math.max(1,h/24),kind:'hours'});}
  const days=Math.min(90,unit==='недел'?v*7:unit==='месяц'?v*30:v);
  return back(days,{label:'за '+days+' '+require('../app-kit.cjs').plural(days,['день','дня','дней']),statsPeriod:days+'d',kind:'days'});
 }
 if(/сегодня|за\s+сутки|за\s+день|за\s+24/u.test(t))return back(1,{label:'за сутки',statsPeriod:'24h',kind:'day'});
 if(/(?:две|2)\s+недел/u.test(t))return back(14,{label:'за 14 дней',statsPeriod:'14d',kind:'days'});
 if(/месяц/u.test(t))return back(30,{label:'за 30 дней',statsPeriod:'30d',kind:'month'});
 if(/недел/u.test(t))return back(7,{label:'за неделю',statsPeriod:'7d',kind:'week'});
 return null;
}
const RELEASE=/(?:релиз\p{L}*|верси\p{L}*|release|апдейт\p{L}*|обновлени\p{L}*|билд\p{L}*|сборк\p{L}*|versionCode)\s+(?:№\s*)?v?([\p{L}\p{N}_.@+-]*\d[\p{L}\p{N}_.@+-]*)/iu;
const BARE=/(?:^|[\s(«"])v?(\d+\.\d+(?:\.\d+){0,2}(?:[-+][\p{L}\p{N}.]+)?)(?=$|[\s,.!?)»"])/u;
function release(text){
 const m=String(text||'').match(RELEASE)||String(text||'').match(BARE);
 return m?m[1].replace(/[.,]+$/,''):null;
}
function platform(text){
 // A project slug like «game-ios» is not a platform.
 const W2='(?:^|[^\\p{L}\\p{N}_-])',E2='(?![\\p{L}\\p{N}_-])';
 if(re(W2+'(?:андроид\\p{L}{0,3}|android)'+E2).test(text))return 'Android';
 if(re(W2+'(?:ios|айос\\p{L}{0,3}|айфон\\p{L}{0,3}|iphone|ipad|айпад\\p{L}{0,3})'+E2).test(text))return 'iOS';
 return null;
}
function environment(text,fallback=''){
 if(re(W+'(?:прод\\p{L}{0,4}|production|prod)'+E).test(text))return 'production';
 if(re(W+'(?:стейдж\\p{L}{0,4}|стейджинг\\p{L}{0,3}|staging|stage)'+E).test(text))return 'staging';
 return fallback;
}
const onlyNew=text=>re(W+'(?:нов(?:ые|ых|ым|ыми|ое|ая|ый)|появил\\p{L}*|впервые)'+E).test(text);
function parse(text,{now=new Date()}={}){
 return {period:period(text,now),release:release(text),platform:platform(text),environment:environment(text),onlyNew:onlyNew(text)||/после\s+(?:релиза|версии|апдейта|обновлени)/iu.test(text)};
}
module.exports={about,parse,period,release,platform,environment,CRASH,ANR,BUILD,NOT_APP};
