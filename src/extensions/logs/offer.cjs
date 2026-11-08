// When to offer «Логи сервера» to someone who has not added or connected it.
// Neighbours: Docker container logs, CI build logs, Unity/editor logs, git log, chat logs, sign-in («логин»),
// monitoring (alerts, server health) and logistics.
module.exports={
 id:'logs',name:'Логи сервера',
 pitch:'найду строки в логах серверов (Loki, Elasticsearch/OpenSearch, поды Kubernetes), покажу график по времени и сгруппирую ошибки — с объяснением по строкам и задачей в один клик',
 names:[/(?:^|[^\p{L}])(?:loki|локи|kibana|кибан\p{L}*|opensearch|опенсерч\p{L}*|logql)(?=$|[^\p{L}])/iu],
 topics:[/(?:^|[^\p{L}])(?:лог(?:и|ов|ах|ам)?|logs?)\s+(?:\p{L}+\s+)?(?:сервер\p{L}*|бэкенд\p{L}*|бекенд\p{L}*|backend|прод\p{L}*|сервис\p{L}*|api|под(?:а|ов)|pods?)(?=$|[^\p{L}])/iu,
  /(?:ошибк\p{L}*|исключени\p{L}*|errors?)\s+(?:\p{L}+\s+){0,2}(?:в|по)\s+лог(?:ах|ам)(?=$|[^\p{L}])/iu,
  /(?:в|по)\s+лог(?:ах|ам)\s+(?:сервер\p{L}*|бэкенд\p{L}*|прод\p{L}*|сервис\p{L}*)/iu],
 avoid:[/docker|докер|контейнер|(?:^|[^\p{L}])ci(?=$|[^\p{L}])|сборк|билд|build|pipeline|unity|юнити|editor|(?:^|[^\p{L}])git(?=$|[^\p{L}])|коммит|чат\p{L}*|слак|slack|логин|логист|алерт|alert/iu],
 requests:[/(?:покажи|найди|поищи|глянь|посмотри|что в|какие|сколько|за последн|за час|за сутки|сегодня)/iu],
 connect:'settings',
 connected:settings=>require('../../features/log-sources.cjs').create({settings:{...settings,extension_logs:'true'}}).list().length>0,
 ready:settings=>settings.extension_logs==='true'&&require('../../features/log-sources.cjs').create({settings}).list().length>0
};
