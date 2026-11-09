// When to offer «Kubernetes» to someone who has not added it.
// Neighbours: Docker containers, pod logs («Логи сервера»), monitoring and alerts, store releases («выкатка в
// Google Play»), dialogue lines («реплики персонажа»), «под Windows».
module.exports={
 id:'kubernetes',name:'Kubernetes',
 pitch:'покажу поды и их проблемы (CrashLoopBackOff, OOMKilled, перезапуски), события и статус выкатки, объясню, почему падает под, а перезапуск и масштабирование сделаю только после подтверждения с точной командой kubectl',
 names:[/(?:^|[^\p{L}])(?:kubernetes|k8s|кубер\p{L}*|кубернетес\p{L}*|kubectl|кубектл\p{L}*)(?=$|[^\p{L}])/iu],
 topics:[/(?:^|[^\p{L}])(?:поды|подов|pods?)(?=$|[^\p{L}])/iu,/crashloop\p{L}*|imagepullbackoff|(?:^|[^\p{L}])(?:деплойме?нт\p{L}*|deployments?)(?=$|[^\p{L}])/iu],
 avoid:[/docker|докер|контейнер|(?:^|[^\p{L}])(?:лог(?:и|ов|ах|ам)?|logs?)(?=$|[^\p{L}])|алерт|alert|prometheus|google play|app store|testflight|реплик\p{L}* (?:персонаж|диалог)|(?:^|[^\p{L}])под (?:windows|mac|linux|android|ios)(?=$|[^\p{L}])/iu],
 requests:[/(?:что с|покажи|какие|почему|статус|перезапусти|отскейл|сколько|упал|падает)/iu],
 connect:'install',
 connected:settings=>!!require('./kubectl.cjs').binary({custom:String(settings.kubernetesKubectl||'').trim()}),
 ready:settings=>settings.extension_kubernetes==='true'
};
