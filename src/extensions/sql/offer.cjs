// When to offer «SQL по словам»: a question to a database (SQL, ClickHouse, BigQuery, PostgreSQL, «в базе данных»,
// «схема таблицы»). Not this: SQL migrations, DDL and query tuning (the Programmer), «что такое JOIN» (an explanation),
// a knowledge base (docs), spreadsheets, and game metrics in words (DAU, retention, revenue are «Метрики игры»).
// Connected: an own connection, or Grafana (added and connected) whose SQL datasources are query sources.
const connected=settings=>require('./connections.cjs').connected(settings)||settings.extension_grafana==='true'&&(()=>{try{return require('../grafana/client.cjs').connected(settings);}catch{return false;}})();
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?=$|[^\\p{L}\\p{N}_])';
module.exports={
 id:'sql',name:'SQL по словам',
 pitch:'отвечу на вопрос по вашей базе: напишу SQL по схеме, покажу стоимость до запуска, а результат — таблицей и графиком',
 names:[new RegExp(W+'(?:clickhouse|bigquery|postgres(?:ql)?)'+E+'|кликхаус\\p{L}*|бигквери|постгрес\\p{L}*','iu')],
 topics:[new RegExp(W+'sql'+E+'|баз\\p{L}* данных|(?:запрос\\p{L}*|выборк\\p{L}*) (?:к|в|из) баз\\p{L}*|схем\\p{L}* таблиц\\p{L}*|структур\\p{L}* таблиц\\p{L}*|список таблиц|таблиц\\p{L}* в баз\\p{L}*','iu')],
 avoid:[new RegExp('миграц\\p{L}*|'+W+'(?:что такое|что значит|объясни|расскажи|чем отлича\\p{L}*|как работает)|баз\\p{L}* знани\\p{L}*|индекс\\p{L}*|процедур\\p{L}*|триггер\\p{L}*|спроектируй|нормализ\\p{L}*|(?:create|alter|drop) table|(?:создай|удали|измени|добавь|очисти)\\p{L}* (?:таблиц|столб|колонк|строк|запис|баз)|оптимизир\\p{L}*|ускорь|бэкап\\p{L}*|google sheets|гугл[- ]?таблиц\\p{L}*|excel|эксел\\p{L}*|firebase|crashlytics|крашлитикс\\p{L}*|кр[эеа]ш\\p{L}*','iu')],
 requests:[/(?:покажи|сколько|посчитай|выбери|выгрузи|напиши|составь|сделай|найди|топ|какие|какой|выполни|запусти)/iu],
 connect:'settings',
 connected,
 ready:settings=>settings.extension_sql==='true'&&connected(settings)
};
