// When to offer «AppMetrica»: only when asked to connect it by name. Data questions («DAU из AppMetrica»,
// «ретеншн») offer «Метрики игры», which then asks which source to connect.
module.exports={
 id:'appmetrica',name:'AppMetrica',
 pitch:'подключу AppMetrica как источник для «Метрик игры»: DAU, новые игроки, ретеншн и выручка',
 names:[/(?:подключ\p{L}*|настро\p{L}*|добав\p{L}*|привяж\p{L}*|connect)\s+(?:\p{L}+\s+)?(?:appmetrica|app\s?metrica|аппметрик\p{L}*|апметрик\p{L}*)(?![\p{L}\p{N}])/iu],
 topics:[],
 // AppMetrica's crash reports are the crashes app's neighbourhood, not ours.
 avoid:[/(?:^|[^\p{L}])(?:крэш\p{L}*|краш\p{L}*|crash\p{L}*|anr|анр)(?![\p{L}])/iu],
 requests:[/(?:покажи|подключи|сколько|какой|какая|что в|что с)/iu],
 connect:'settings',
 ready:settings=>settings.extension_appmetrica==='true'&&require('./client.cjs').connected(settings)
};
