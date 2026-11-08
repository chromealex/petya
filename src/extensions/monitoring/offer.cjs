// When to offer «Мониторинг»: a request about server/service health, alerts, uptime, incidents, or the server
// addresses a project uses — decided by the app's own routing (query.cjs `about`), so the offer and the app agree.
// Near-misses stay with their owners: competitors / mentions monitoring, a screen («монитор»), this computer's
// uptime, a calendar alert, logs («Логи сервера»), Kubernetes objects, Docker containers.
const Q=require('./query.cjs');
// A RegExp whose test is the app's own router.
const about=Object.assign(/(?:)/u,{test:text=>Q.about(String(text||''))});
const connected=settings=>!!(settings.monitoringPrometheusUrl||settings.monitoringAlertmanagerUrl||settings.monitoringGrafanaUrl&&settings.monitoringGrafanaToken||Number(settings.monitoringUptimeChecks)>0);
module.exports={
 id:'monitoring',name:'Мониторинг',
 pitch:'покажу, живы ли серверы: сервисы из Prometheus, алерты Alertmanager и Grafana, свои проверки доступности с аптаймом и сертификатами, инциденты недели; найду адреса серверов в коде проекта, а заглушу алерт только после вашего подтверждения',
 names:[/(?:^|[^\p{L}])(?:prometheus|прометеус\p{L}*|grafana|графан\p{L}*|alertmanager|алертменеджер\p{L}*|promql)(?=$|[^\p{L}])/iu],
 topics:[about],
 avoid:[/конкурент|упоминани|бренд|яркост|экран|(?:^|[^\p{L}])монитор(?:а|е|у|ом|ы|ов)?(?=$|[^\p{L}])|аптайм компьютер|аптайм компа|календар|напомин|(?:^|[^\p{L}])(?:логи|логов|логах|logs?)(?=$|[^\p{L}])|(?:^|[^\p{L}])(?:поды|подов|pods?|kubectl|kubernetes|k8s|кубер\p{L}*)(?=$|[^\p{L}])|докер|docker|контейнер/iu],
 requests:[/(?:что с|вс[её] ли|какие|покажи|почему|аптайм|алерт|заглуши|найди|собери|сколько|живо|живы|лежит|упал)/iu],
 connect:'settings',
 connected,
 ready:settings=>settings.extension_monitoring==='true'&&connected(settings)
};
