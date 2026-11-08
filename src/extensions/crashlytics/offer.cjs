// When to offer «Firebase Crashlytics»: Crashlytics named («крашлитикс»), or Firebase together with crashes.
// Other Firebase products (Analytics, Remote Config, Auth, Firestore, Cloud Messaging, Hosting…) are not this app.
// Accepting also adds «Крэши» (`also`), the app that shows the crashes.
const CRASH='(?:кр[эеа]ш\\p{L}{0,4}|crash\\p{L}{0,3}|падени\\p{L}{0,3}|вылет\\p{L}{0,3})';
const FIREBASE='(?:firebase|файр[- ]?бейс\\p{L}*|фаербейс\\p{L}*)';
const connected=settings=>settings.extension_crashlytics==='true'&&require('./client.cjs').connected(settings);
module.exports={
 id:'crashlytics',name:'Firebase Crashlytics',
 pitch:'подключу Firebase Crashlytics к «Крэшам» через выгрузку в BigQuery: топ крэшей за период, новые после релиза и график по дням',
 names:[/(?:crashlytics|кр[аэе]шлитикс\p{L}*)/iu,new RegExp(CRASH+'\\s+(?:\\p{L}+\\s+){0,2}'+FIREBASE,'iu'),new RegExp(FIREBASE+'\\s+(?:\\p{L}+\\s+){0,1}'+CRASH,'iu')],
 topics:[],
 avoid:[/(?:^|[^\p{L}])(?:anr|анр)(?=$|[^\p{L}])/iu,new RegExp(FIREBASE+'\\s+(?:analytics|аналитик|remote\\s?config|ремоут|auth|авториз|firestore|realtime\\s+database|cloud\\s+messaging|fcm|hosting|хостинг|storage|functions|app\\s+distribution|performance)','iu')],
 also:['crashes'],
 connect:'settings',
 connected,
 ready:settings=>connected(settings)&&settings.extension_crashes==='true'
};
