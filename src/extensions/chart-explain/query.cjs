// «Объясни график»: which requests ask why a chart moved («почему упал график», «почему просел DAU», «объясни этот
// график») and which way («упал» — down, «вырос» — up). Near-misses stay elsewhere: a failed build or server, a
// crashing game or container, «график отпусков/работы/встреч», «нарисуй график», and definitions.
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=s=>new RegExp(s,'iu');
const CHART=re('график\\p{L}*|диаграмм\\p{L}*|кривая|кривой|chart|дашборд\\p{L}*|панел\\p{L}* в графан\\p{L}*');
const METRIC=re(W+'(?:dau|mau|wau|ccu|arpdau|arpu|arppu|ecpm|cpi|roas|ретеншн\\p{L}*|retention|d1|d7)'+E+'|выручк\\p{L}*|доход\\p{L}*|установк\\p{L}*|инсталл\\p{L}*|новых игроков|новые игроки|онлайн\\p{L}*|покупк\\p{L}*|продаж\\p{L}*|платеж\\p{L}*|платёж\\p{L}*|метрик\\p{L}*|показател\\p{L}*|конверси\\p{L}*|расход\\p{L}*|трафик\\p{L}*');
const DOWN=re('упал\\p{L}*|упало|падени\\p{L}*|пада\\p{L}*|просел\\p{L}*|просад\\p{L}*|провал\\p{L}*|снизил\\p{L}*|снижени\\p{L}*|обвал\\p{L}*|рухнул\\p{L}*|уменьшил\\p{L}*|сократил\\p{L}*|меньше стал\\p{L}*|дип'+E+'|яма');
const UP=re('вырос\\p{L}*|выросл\\p{L}*|рост'+E+'|подскочил\\p{L}*|скакнул\\p{L}*|взлетел\\p{L}*|увеличил\\p{L}*|всплеск\\p{L}*|пик'+E+'|больше стал\\p{L}*');
const WHY=re('^(?:а\\s+|петя,?\\s+)?(?:почему|отчего|из-за чего|с чего|что (?:случилось|произошло|стряслось)|в чём причина|какая причина|чем объяснить|объясни)'+E);
const EXPLAIN=re('(?:объясни|разбери|прочитай|растолкуй|опиши)\\p{L}*\\s+(?:\\p{L}+\\s+)?(?:график|диаграмм|кривую|chart)\\p{L}*|что (?:на|с|по) (?:этом |этому )?график\\p{L}*|что за (?:провал|пик|всплеск|яма|скачок) на график\\p{L}*');
// Neighbours.
const ELSEWHERE=re('сборк\\p{L}*|билд\\p{L}*|'+W+'(?:ci|пайплайн\\p{L}*|pipeline)'+E+'|сервер\\p{L}*|контейнер\\p{L}*|под'+E+'|поды|докер\\p{L}*|docker|кубер\\p{L}*|тест\\p{L}*|крэш\\p{L}*|краш\\p{L}*|креш\\p{L}*|игра пада\\p{L}*|приложение пада\\p{L}*|'+
 'график\\p{L}* (?:отпуск|работ|встреч|дежурств|смен|платеж|выплат|релиз|спринт)\\p{L}*|(?:нарисуй|построй|сделай|покажи)\\s+(?:\\p{L}+\\s+)?график\\p{L}*|что такое|как (?:читать|строить|построить)|напомни|курс\\p{L}* (?:доллар|евро|валют|акци)');
const DEFINITION=/^(?:а\s+)?(?:что такое|что значит|как считается)\s/iu;

// 'chart' (a chart word or «объясни график») | 'metric' (a metric moved, no chart word) | null
function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>600||DEFINITION.test(t)||ELSEWHERE.test(t))return null;
 if(EXPLAIN.test(t))return 'chart';
 if(!WHY.test(t))return null;
 const moved=DOWN.test(t)||UP.test(t);
 if(CHART.test(t)&&(moved||/объясни/iu.test(t)))return 'chart';
 if(METRIC.test(t)&&moved)return 'metric';
 return null;
}
function direction(text){const d=DOWN.test(text),u=UP.test(text);return d&&!u?'down':u&&!d?'up':null;}
// Which metric the question names, to pick a series: 'dau' | 'new' | 'revenue' | 'ads' | 'iap' | null
function metric(text){
 const t=String(text||'');
 if(re('реклам|ecpm').test(t))return 'ads';
 if(re('покупк|продаж|платеж|платёж|arppu').test(t))return 'iap';
 if(re(W+'(?:dau|mau|wau|ccu)'+E+'|онлайн|активн').test(t))return 'dau';
 if(re('установк|инсталл|нов\\p{L}* игрок').test(t))return 'new';
 if(re('выручк|доход|revenue|arpdau').test(t))return 'revenue';
 return null;
}
module.exports={about,direction,metric,CHART,METRIC,DOWN,UP,WHY,EXPLAIN,ELSEWHERE};
