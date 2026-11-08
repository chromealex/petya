// «Крэши»: which chat requests are about Sentry crashes, and the filters a request names
// (period, release, platform, environment, project, only new ones).
// JavaScript's \b does not know Cyrillic, so word edges are written with Unicode letter classes.
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=source=>new RegExp(source,'iu');

const SENTRY=re(W+'(?:sentry|сентри\\p{L}{0,3})'+E);
// Crash nouns: «крэш/креш/краш» with case endings (not «крашеный»), «crash», «падения» of the app, «вылеты».
const CRASH=re(W+'(?:кр[эеа]ш(?:и|ей|ам|ами|ах|а|у|ом|ем|ы|ев|ев\\p{L}{1,3}|-?репорт\\p{L}{0,3})?|crash(?:es|ed|s)?|падени(?:е|я|й|ю|ям|ями|ях)|вылет(?:ы|ов|ам|ами|ах|а)?)'+E);
// «падение продаж», «вылет рейса»: not the app.
const NOT_APP=re('(?:падени\\p{L}*|вылет\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:продаж|выручк|доход|курс|цен|рейтинг|онлайн|ретеншн|retention|конверси|трафик|метрик|fps|фпс|кадр|самол|рейс|давлени|спрос|интерес)');
// ANR is the Google Play extension's subject, a red build is CI's, «сервер упал» is ordinary talk.
const ANR=re(W+'(?:anr|анр)\\p{L}{0,3}'+E+'|зависани\\p{L}*');
const BUILD=re('(?:упал\\p{L}*|сломал\\p{L}*|красн\\p{L}*|не собрал\\p{L}*)\\s+(?:\\p{L}+\\s+)?(?:сборк|билд|build|пайплайн|pipeline|джоб|job|ci'+E+')|(?:сборк|билд|build|пайплайн|pipeline|джоб|job|ci'+E+')\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:упал|сломал|красн|не собрал)');
// Requests for other handlers: fixing code (Programmer), a Jira task, explanations and setup questions.
const ELSEWHERE=re(W+'(?:исправ\\p{L}*|почини\\p{L}*|пофикс\\p{L}*|поправ\\p{L}*|jira|джир\\p{L}*|жир[аеуы]|тикет\\p{L}*|задач[уаи]'+E+'|созда\\p{L}*|заведи)');
const QUIET=/^(?:а\s+)?(?:что такое|зачем нуж|как (?:подключить|настроить|работает|интегрировать|отправ)|объясни,? что такое|не\s+(?:надо|нужно|показывай))/iu;
// A request to see data: what, how many, top, new, a period, a release, a platform.
const ASK=re(W+'(?:какие|какой|какая|сколько|покажи|показать|выведи|топ|список|что с|что там|что по|есть ли|были ли|новые|нов\\p{L}{1,3}|последн\\p{L}*|проверь|глянь|посмотри|статистик\\p{L}*|за (?:неделю|сегодня|вчера|сутки|день|месяц|\\d+)|вчера|сегодня|после (?:релиза|версии|апдейта|обновлени)|в релизе|в версии|на андроид\\p{L}*|на android|на ios|на айос|на айфон\\p{L}*)');

function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>600||QUIET.test(t))return false;
 const named=SENTRY.test(t);
 if(ELSEWHERE.test(t))return false;
 if(!named&&(ANR.test(t)||BUILD.test(t)))return false;
 const crash=CRASH.test(t)&&!NOT_APP.test(t);
 if(!crash&&!named)return false;
 // «Sentry» alone (e.g. «открой Sentry») or a crash word with a request.
 return ASK.test(t)||named&&t.split(/\s+/).length<=4;
}

const DAY=86400000;
function period(text,now=new Date()){
 const t=String(text||'').toLowerCase();
 const n=t.match(/за\s+(?:последние\s+)?(\d{1,3})\s*(дн|день|дня|сут|час|недел|месяц)/u);
 if(/вчера/u.test(t)){const end=new Date(now);end.setHours(0,0,0,0);const start=new Date(end.getTime()-DAY);return {label:'вчера',start:start.toISOString(),end:end.toISOString(),days:1,calendar:true};}
 if(n){
  const v=Math.max(1,Number(n[1])),unit=n[2];
  if(unit==='час')return {label:'за '+v+' ч',statsPeriod:Math.min(v,2160)+'h',days:Math.max(1,v/24)};
  const days=Math.min(90,unit==='недел'?v*7:unit==='месяц'?v*30:v);
  return {label:'за '+days+' '+require('../app-kit.cjs').plural(days,['день','дня','дней']),statsPeriod:days+'d',days};
 }
 if(/сегодня|за\s+сутки|за\s+день|за\s+24/u.test(t))return {label:'за сутки',statsPeriod:'24h',days:1};
 if(/(?:две|2)\s+недел/u.test(t))return {label:'за 14 дней',statsPeriod:'14d',days:14};
 if(/месяц/u.test(t))return {label:'за 30 дней',statsPeriod:'30d',days:30};
 if(/недел/u.test(t))return {label:'за неделю',statsPeriod:'7d',days:7};
 return null;
}
const RELEASE=/(?:релиз\p{L}*|верси\p{L}*|release|апдейт\p{L}*|обновлени\p{L}*|билд\p{L}*|сборк\p{L}*)\s+(?:№\s*)?v?([\p{L}\p{N}_.@+-]*\d[\p{L}\p{N}_.@+-]*)/iu;
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
// A configured project named in the request narrows the search to it.
function project(text,slugs){
 const t=String(text||'').toLowerCase();
 return slugs.find(slug=>new RegExp('(?:^|[^\\p{L}\\p{N}_-])'+slug.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}_-])','u').test(t))||null;
}
function parse(text,{now=new Date(),projects=[],environment:env=''}={}){
 const rel=release(text);
 return {period:period(text,now),release:rel,platform:platform(text),environment:environment(text,env),onlyNew:onlyNew(text)||/после\s+(?:релиза|версии|апдейта|обновлени)/iu.test(text),project:project(text,projects)};
}
module.exports={about,parse,period,release,platform,environment,project,SENTRY,CRASH,ANR,BUILD};
