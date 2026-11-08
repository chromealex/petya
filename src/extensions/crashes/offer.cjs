// When to offer «Крэши» to someone who has not added or connected it. Only Sentry is promised:
// Firebase Crashlytics has no public REST API for issues (see docs/apps/crashes.md).
const {SENTRY,CRASH,ANR,BUILD}=require('./query.cjs');
module.exports={
 id:'crashes',name:'Крэши',
 pitch:'покажу крэши из Sentry: топ за период, новые после релиза, график по дням, а по кнопке — в задачу Jira, Программисту или «Решено»',
 names:[SENTRY],
 topics:[CRASH],
 // ANR is Google Play's, a red build is CI's; «падение продаж», «вылет рейса» are not crashes of the app;
 // Crashlytics is not supported, so it is not offered for it.
 avoid:[ANR,BUILD,/(?:падени\p{L}*|вылет\p{L}*)\s+(?:\p{L}+\s+)?(?:продаж|выручк|доход|курс|цен|рейтинг|онлайн|ретеншн|конверси|трафик|метрик|fps|фпс|самол|рейс|давлени)/iu,/crashlytics|крашлитикс\p{L}*/iu],
 requests:[/(?:какие|сколько|топ|новые|покажи|что с|за неделю|вчера|после релиза)/iu],
 connect:'settings',
 ready:settings=>settings.extension_crashes==='true'&&!!settings.sentryToken&&!!settings.sentryOrg
};
