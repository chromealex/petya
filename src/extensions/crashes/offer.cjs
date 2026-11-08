// When to offer «Крэши» to someone who has not added it or has no connected crash source. The pitch names no
// service: the sources (Sentry, Firebase Crashlytics, Google Play, …) have their own offers, made when a request
// names them. After adding, a request without a connected source is answered with the choice of sources.
const {CRASH,ANR,BUILD,NOT_APP}=require('./query.cjs');
const sources=settings=>require('../../features/crash-sources.cjs').create({settings}).list();
module.exports={
 id:'crashes',name:'Крэши',
 pitch:'соберу крэши из подключённых сервисов — Sentry, Firebase Crashlytics, Google Play: топ за период, новые после релиза, график по дням, а по кнопке — в задачу, Программисту или «Решено»',
 names:[],
 topics:[CRASH],
 // ANR is Google Play's card, a red build is CI's; «падение продаж», «вылет рейса» are not crashes of the app.
 avoid:[ANR,BUILD,NOT_APP],
 requests:[/(?:какие|сколько|топ|новые|покажи|что с|за неделю|вчера|после релиза)/iu],
 connect:'install',
 // Connected: at least one crash source is added and connected.
 connected:settings=>sources(settings).length>0,
 ready:settings=>settings.extension_crashes==='true'&&sources(settings).length>0
};
