// When to offer «Sentry»: only when Sentry is named. A crash request without a service name is «Крэши»'s offer.
// Accepting also adds «Крэши» (`also`), the app that shows the crashes.
const {SENTRY}=require('./crash-source.cjs');
const connected=settings=>settings.extension_sentry==='true'&&!!settings.sentryToken&&!!settings.sentryOrg;
module.exports={
 id:'sentry',name:'Sentry',
 pitch:'подключу Sentry к «Крэшам»: топ крэшей за период, новые после релиза, crash-free релиза и кнопка «Решено»',
 names:[SENTRY],
 topics:[],
 // ANR is Google Play's card; a red build is CI's.
 avoid:[/(?:^|[^\p{L}])(?:anr|анр)(?=$|[^\p{L}])/iu],
 also:['crashes'],
 connect:'settings',
 // The catalog shows Sentry connected by its own token; the offer stays until «Крэши» is added too.
 connected,
 ready:settings=>connected(settings)&&settings.extension_crashes==='true'
};
