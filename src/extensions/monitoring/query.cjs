// «Мониторинг», understanding a request in code: is it about server/service health, which part (overview, alerts,
// uptime, why, silence, incidents, endpoint discovery), which service, signal and period. The model is asked only
// to map free text to one of the known services / signals when code finds none (feature.cjs).
const DAY=86400000,HOUR=3600000,MIN=60000;

const W=(body,flags='iu')=>new RegExp('(?:^|[^\\p{L}\\d])(?:'+body+')(?=$|[^\\p{L}\\d])',flags);
const SERVERS=W('сервер\\p{L}*|серв[ао]к\\p{L}*|сервис\\p{L}*|бэкенд\\p{L}*|бекенд\\p{L}*|backend|прод|прода|проде|проду|продакшн\\p{L}*|production|инфр\\p{L}*|хост\\p{L}*|api|апи|эндпоинт\\p{L}*|сайт\\p{L}*|стейджинг\\p{L}*|staging|балансер\\p{L}*|база|базы|бд|nginx|redis|postgres\\p{L}*|постгрес\\p{L}*');
const MONITOR=W('мониторинг\\p{L}*|prometheus|прометеус\\p{L}*|alertmanager|алертменеджер\\p{L}*|promql');
const ALERT=W('алерт\\p{L}*|alerts?|аларм\\p{L}*|инцидент\\p{L}*|incident\\p{L}*');
const UPTIME=W('аптайм\\p{L}*|uptime|доступност\\p{L}*|sla');
const HEALTH=/(?:что (?:с|там с|по)\s|как (?:там |себя чувству\p{L}* )?|вс[её] ли |живо|живы|жив\s|жив\?|лежит|лежат|леж\p{L}*|упал\p{L}*|ляг\p{L}*|недоступ\p{L}*|не отвечает|не отвечают|тормоз\p{L}*|медленн\p{L}*|статус|здоров\p{L}*|health|состояни\p{L}*|горит|горят|красн\p{L}*|работает ли|работают ли|в порядке)/iu;
// Everyone else's subjects: competitors / mentions monitoring, the screen, this computer's uptime, calendar
// alerts, logs (the log app), Kubernetes objects and Docker containers (their apps), disks, prices.
const NOT=new RegExp([
 'конкурент','упоминани','бренд','отзыв','соцсет','цен(?:ы|а|у)(?:$|[^\\p{L}])','курс(?:а|ы)? ',
 '(?:^|[^\\p{L}])монитор(?:а|е|у|ом|ы|ов|ах)?(?=$|[^\\p{L}])','яркост','экран','дисплей','второй монитор',
 'компьютер','(?:^|[^\\p{L}])компа?(?=$|[^\\p{L}])','ноутбук','макбук','мак(?:а|е)?(?=$|[^\\p{L}])','перезагруз\\p{L}* (?:комп|ноут|мак)',
 'календар','напомин','будильник','давлени','пульс','сердц','сна(?:$|[^\\p{L}])',
 '(?:^|[^\\p{L}])(?:лог|логи|логов|логах|логам|logs?)(?=$|[^\\p{L}])',
 '(?:^|[^\\p{L}])(?:под|поды|подов|подах|pods?|kubectl|kubernetes|k8s|кубер\\p{L}*|деплоймент\\p{L}*|deployment\\p{L}*|неймспейс\\p{L}*|namespace\\p{L}*|helm)(?=$|[^\\p{L}])',
 'докер','docker','контейнер','compose',
 'диск(?:е|а|у)?(?=$|[^\\p{L}])','места на','крэш','краш','anr','сборк','билд','ci(?:$|[^\\p{L}])'
].join('|'),'iu');
const SILENCE=/(?:^|[^\p{L}])(?:заглуш\p{L}*|приглуш\p{L}*|замьют\p{L}*|замуть|выключи уведомлени\p{L}*|silence|тишин\p{L}* на)(?=$|[^\p{L}])/iu;
const WHY=/(?:^|[^\p{L}])(?:почему|из-за чего|что случилось|что не так|в ч[её]м дело|отчего)(?=$|[^\p{L}])/iu;
const INCIDENTS=W('инцидент\\p{L}*|аварии|аварий|авария|падени\\p{L}* (?:сервер|сервис|прод|api)\\p{L}*|даунтайм\\p{L}*|downtime|простой');
const ALIVE=/вс[её] ли (?:живо|живы|работает|в порядке с сервер)|вс[её] живо|все живы|живы ли сервер|жив ли (?:сервер|прод|сайт|api)/iu;

// --- Endpoint discovery: «найди все адреса серваков в проекте», «какие сервера использует игра» ---------------
const ADDRESS=/(?:адрес\p{L}*|хост\p{L}*|домен\p{L}*|(?:^|[^\p{L}])url\p{L}*|урл\p{L}*|ссылк\p{L}* на сервер\p{L}*|эндпоинт\p{L}*|endpoint\p{L}*|(?:^|[^\p{L}])ip(?=$|[^\p{L}]))/iu;
const SERVERISH=/(?:сервер\p{L}*|серв[ао]к\p{L}*|бэкенд\p{L}*|бекенд\p{L}*|backend|(?:^|[^\p{L}])(?:api|апи)(?=$|[^\p{L}])|cdn|сдн)/iu;
const IN_CODE=/(?:проект\p{L}*|(?:^|[^\p{L}])код\p{L}*|скрипт\p{L}*|исходник\p{L}*|репо\p{L}*|репозитор\p{L}*|игр\p{L}*|клиент\p{L}*|приложени\p{L}*|сборк\p{L}*|конфиг\p{L}*|c#|шарп\p{L}*|unity|юнити)/iu;
const USES=/(?:использу\p{L}*|ходит|ходят|стучит|стучится|обращается|дёргает|дергает|подключается|зашит\p{L}*|прописан\p{L}*|захардкожен\p{L}*|хардкод\p{L}*)/iu;
const COLLECT=/(?:найди|собери|вытащи|выпиши|покажи|перечисли|какие|какой|куда|список)/iu;
const NOT_DISCOVER=/офис|доставк|компьютер\p{L}*|моего|мой ip|мой айпи|почт\p{L}*|e-?mail|улиц|квартир|openapi|swagger|сваггер|(?:^|[^\p{L}])(?:дерни|дёрни|отправь|get|post)(?=$|[^\p{L}])|роутер|wi-?fi|вайфай/iu;
function discovery(text){
 const t=String(text||'');
 if(NOT_DISCOVER.test(t))return false;
 if(/(?:какие|какой|куда)[^.?!]{0,25}(?:сервер\p{L}*|серв[ао]к\p{L}*|бэкенд\p{L}*|хост\p{L}*|домен\p{L}*|адрес\p{L}*)[^.?!]{0,30}/iu.test(t)&&USES.test(t)&&IN_CODE.test(t))return true;
 return ADDRESS.test(t)&&SERVERISH.test(t)&&IN_CODE.test(t)&&COLLECT.test(t);
}

function about(text){
 const t=String(text||'').trim();
 if(!t)return false;
 if(discovery(t))return true;
 if(/^(?:а\s+)?(?:что такое|объясни,? что такое|как (?:настроить|подключить) (?!.*сервис))/iu.test(t))return false;
 const named=MONITOR.test(t);
 if(NOT.test(t)&&!named&&!ALERT.test(t))return false;
 if(NOT.test(t)&&/календар|напомин|будильник|конкурент|упоминани/iu.test(t))return false;
 // One HTTP request to a health endpoint («какой статус у health-check прода», «отвечает ли staging») is «API-клиент».
 if(!named&&/health-?check|хелс-?чек|хелсчек|отвечает ли/iu.test(t))return false;
 if(named)return true;
 if(ALIVE.test(t))return true;
 if(SILENCE.test(t)&&ALERT.test(t))return true;
 if(ALERT.test(t)&&(/(?:горят|горит|активн|firing|какие|что|покажи|сколько|список|за )/iu.test(t)||SERVERS.test(t)))return true;
 if(UPTIME.test(t)&&(SERVERS.test(t)||/за (?:недел|месяц|сутки|день|30|7)|аптайм|uptime/iu.test(t)))return true;
 if(INCIDENTS.test(t)&&(/недел|месяц|сутки|вчера|сегодня|какие|были|список|покажи/iu.test(t)||SERVERS.test(t)))return true;
 if(SERVERS.test(t)&&(HEALTH.test(t)||WHY.test(t)))return true;
 return false;
}

function intent(text){
 const t=String(text||'');
 if(discovery(t))return 'discover';
 if(SILENCE.test(t))return 'silence';
 if(WHY.test(t))return 'why';
 if(UPTIME.test(t))return 'uptime';
 if(INCIDENTS.test(t)&&!/горят|горит|активн|сейчас/iu.test(t))return 'incidents';
 if(ALERT.test(t))return 'alerts';
 return 'overview';
}

const SIGNAL_WORDS=[['errorRate',/ошиб\p{L}*|5xx|500-?е|пятисот\p{L}*|error/iu],['latencyP95',/медленн\p{L}*|тормоз\p{L}*|задержк\p{L}*|латентн\p{L}*|latency|p95|время ответа|долго отвечает/iu],
 ['rps',/нагрузк\p{L}*|rps|запрос\p{L}* в секунду|трафик\p{L}*/iu],['saturation',/cpu|цпу|процессор\p{L}*|памят\p{L}*|насыщ\p{L}*|saturation|загруз\p{L}*/iu]];
function signal(text){for(const [k,r] of SIGNAL_WORDS)if(r.test(String(text||'')))return k;return '';}

// The period: {label, from, to, ms}. Default depends on the intent.
function period(text,now,fallback){
 const t=String(text||'').toLowerCase();
 const n=v=>({'час':1,'полчаса':0.5,'два':2,'три':3,'пять':5,'шесть':6,'двенадцать':12,'сутки':1,'день':1,'неделю':1,'месяц':1})[v]??Number(v);
 let m;
 if((m=/(?:за|последн\p{L}*)\s+(\d+)\s*(минут\p{L}*|мин|час\p{L}*|ч|дн\p{L}*|день|сут\p{L}*|недел\p{L}*)/iu.exec(t))){
  const k=m[2].startsWith('мин')?MIN:m[2].startsWith('ч')?HOUR:m[2].startsWith('нед')?7*DAY:DAY;
  const ms=Math.min(Number(m[1])*k,30*DAY);return {label:'за '+m[1]+' '+m[2],from:now-ms,to:now,ms};
 }
 if(/за (?:последний |последн\p{L}* )?час|за час/iu.test(t))return {label:'за последний час',from:now-HOUR,to:now,ms:HOUR};
 if(/полчаса/iu.test(t))return {label:'за полчаса',from:now-30*MIN,to:now,ms:30*MIN};
 if(/сутки|за день|сегодня|24 ?ч/iu.test(t))return {label:'за сутки',from:now-DAY,to:now,ms:DAY};
 if(/вчера/iu.test(t)){const d=new Date(now);d.setHours(0,0,0,0);return {label:'за вчера',from:d.getTime()-DAY,to:d.getTime(),ms:DAY};}
 if(/недел/iu.test(t))return {label:'за неделю',from:now-7*DAY,to:now,ms:7*DAY};
 if(/месяц|30 дн/iu.test(t))return {label:'за 30 дней',from:now-30*DAY,to:now,ms:30*DAY};
 void n;
 return {...fallback,from:now-fallback.ms,to:now};
}
const DEFAULT_PERIOD={overview:{label:'за 6 часов',ms:6*HOUR},why:{label:'за 6 часов',ms:6*HOUR},alerts:{label:'сейчас',ms:6*HOUR},silence:{label:'сейчас',ms:HOUR},
 uptime:{label:'за неделю',ms:7*DAY},incidents:{label:'за неделю',ms:7*DAY},discover:{label:'',ms:HOUR}};

// Silence duration: «на час», «на 30 минут», «на 2 часа», «на сутки», «до утра» (until 9:00). null = not said.
function duration(text,now=Date.now()){
 const t=String(text||'').toLowerCase();
 let m;
 if(/на полчаса/u.test(t))return {ms:30*MIN,label:'30 минут'};
 if((m=/на\s+(\d+)\s*(минут\p{L}*|мин|час\p{L}*|ч|дн\p{L}*|день|сут\p{L}*)/iu.exec(t))){const k=m[2].startsWith('м')?MIN:m[2].startsWith('ч')?HOUR:DAY;return {ms:Number(m[1])*k,label:m[1]+' '+m[2]};}
 if(/на (?:один |1 )?час(?:ок)?(?:$|[^\p{L}])/iu.test(t))return {ms:HOUR,label:'1 час'};
 if(/на два часа/u.test(t))return {ms:2*HOUR,label:'2 часа'};
 if(/на сутки|на день/u.test(t))return {ms:DAY,label:'сутки'};
 if(/до утра|до завтра/u.test(t)){const d=new Date(now);d.setDate(d.getDate()+(d.getHours()>=9?1:0));d.setHours(9,0,0,0);return {ms:d.getTime()-now,label:'до 9:00'};}
 return null;
}

module.exports={about,intent,signal,period,duration,discovery,DEFAULT_PERIOD,SERVERS,MONITOR,ALERT,NOT};
