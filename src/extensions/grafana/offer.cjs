// When to offer «Grafana» to someone who has not added or connected it: Grafana by name, a pasted Grafana dashboard
// link (…/d/<uid>/…), and dashboards as the subject. Game metrics (DAU, retention, revenue) stay «Метрики игры»'s
// offer; Grafana being down or a login problem is support talk; PromQL without Grafana and «нарисуй график» are not
// this app.
const q=require('./query.cjs');
const LINK=/https?:\/\/[^\s]+\/d(?:-solo)?\/[A-Za-z0-9_-]{1,64}(?:[/?#\s]|$)/iu;
module.exports={
 id:'grafana',name:'Grafana',
 pitch:'покажу дашборды Grafana прямо в чате: графики, плитки и таблицы панелей за нужный период, поиск дашбордов и ссылки «Открыть в Grafana»; только чтение',
 names:[q.NAMED,LINK],
 // «найди дашборд про ретеншн»: asking for a dashboard outweighs the metric word in it.
 topics:[q.DASH,/(?:найди|поищи|какие|список|открой|покажи)\s+(?:\p{L}+\s+)?(?:дашборд|дэшборд|dashboard)\p{L}*/iu],
 avoid:[q.SUPPORT,/^(?:нарисуй|построй|сделай)\s+(?:\p{L}+\s+)?(?:график|диаграмм)/iu,/(?:^|[^\p{L}])(?:promql|prometheus|прометеус\p{L}*)(?![\p{L}])/iu],
 requests:[/(?:покажи|что на|что в|открой|найди|какие|список)/iu],
 connect:'settings',
 ready:settings=>settings.extension_grafana==='true'&&require('./client.cjs').connected(settings)
};
