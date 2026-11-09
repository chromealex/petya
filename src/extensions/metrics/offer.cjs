// When to offer «Метрики игры» to someone who has not added it. DAU, retention, new players, revenue and ARPDAU
// of the game are this app (with any connected metrics source); team metrics and velocity (Jira), crashes,
// store reviews, ANR, server metrics and A/B significance are not.
const q=require('./query.cjs');
module.exports={
 id:'metrics',name:'Метрики игры',
 pitch:'покажу DAU, новых игроков, ретеншн D1/D7/D30 и выручку за период с изменением к прошлому и необычные дни на графике (данные из AppMetrica)',
 names:[q.SOURCE],
 topics:[q.DAU,q.RETENTION,q.REVENUE,q.METRICS,/(?:сколько|число)\s+нов\p{L}*\s+(?:игрок|пользовател|установ)\p{L}*/iu],
 // «подключи AppMetrica» is the AppMetrica app's own offer.
 avoid:[q.ELSEWHERE,/(?:подключ\p{L}*|настро\p{L}*|добав\p{L}*|привяж\p{L}*)\s+(?:\p{L}+\s+)?(?:appmetrica|app\s?metrica|аппметрик\p{L}*|апметрик\p{L}*)/iu],
 requests:[/(?:покажи|сколько|какой|какая|как |что с|сравни|за неделю|за месяц|вчера|после)/iu],
 connect:'install',
 ready:settings=>settings.extension_metrics==='true'
};
