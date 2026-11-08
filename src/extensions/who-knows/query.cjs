// «Кто знает»: which requests are a search for a person (who knows a subject, whom to go to, who wrote or last
// touched a piece of code) and the subject itself. A factual question that merely starts with «кто знает»
// («кто знает, когда релиз») is not a person search, and neither are «кто ты» or «знаешь ли ты…».
const clean=s=>String(s||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'').replace(/[\s?!.…]+$/u,'').trim();
const LEAD=/^(?:(?:а|и|слушай|подскажи|скажи|не знаешь|не подскажешь|ну)[,\s]+)*/iu;
const WHO='кто\\s+(?:(?:у нас|в команде|из команды|из ребят|из наших|тут|здесь|вообще|лучше всех|больше всех|сейчас)[,\\s]+)*';
const EXPERT=new RegExp('^'+WHO+'(разбирается|шарит|сеч[её]т|понимает|эксперт|спец|специалист|в теме|знает толк|копался|ковырялся|ковырял|занимается|занимался|работает|работал)\\s+(.+)$','iu');
const KNOWS=new RegExp('^'+WHO+'(?:хорошо\\s+)?знает[,\\s]+(.+)$','iu');
const WHOM=/^(?:к кому\s+(?:мне\s+|нам\s+)?(?:идти|пойти|обратиться|обращаться|бежать|подойти|сходить)?\s*(?:с вопрос\p{L}*|за помощью|за советом)?|кого\s+(?:мне\s+)?(?:спросить|спрашивать|дёрнуть|дернуть|позвать|подключить)|с кем\s+(?:мне\s+)?(?:поговорить|посоветоваться|обсудить|проконсультироваться))\s+(по|про|насч[её]т|о|об|обо|с|в|на тему)\s+(.+)$/iu;
const AUTHOR=new RegExp('^'+WHO+'(писал|пишет|делал|делает|пилил|пилит|запилил|реализовывал|реализовал|разрабатывал|разрабатывает|переписывал|переписал|рефакторил|коммитил|ведёт|ведет|написал|сделал|автор|создал|создавал)\\s+(.+)$','iu');
const LAST=new RegExp('^'+WHO+'(?:(последн\\p{L}*|недавно|крайн\\p{L}*)\\s+)?(трогал\\p{L}*|менял\\p{L}*|правил\\p{L}*|изменял\\p{L}*|коммитил\\p{L}*|ломал\\p{L}*|сломал\\p{L}*|чинил\\p{L}*|починил\\p{L}*|лез\\p{L}*|залезал\\p{L}*)\\s+(.+)$','iu');
// «кто знает, когда релиз»: a question word after «знает» asks for a fact, not for a person.
const FACTUAL=/^[,\s]*(?:когда|где|почему|зачем|сколько|во сколько|ли|что|чем|какой|какая|какое|какие|каков\p{L}*|куда|откуда|кто|чей|чья|чьё|чье|будет|есть|можно|нужно|надо)(?=$|[^\p{L}])/iu;
const HOW=/^[,\s]*как(?=$|[^\p{L}])(?!\s+(?:устроен\p{L}*|работает|работают|сделан\p{L}*|написан\p{L}*|реализован\p{L}*|настроен\p{L}*|собирается|чинить|починить|поднять|запустить))/iu;
// «кто написал» / «кто сделал» / «кто автор» name a person only when the object is code or a game system:
// «кто написал PlayerController», but not «кто написал «Мастера и Маргариту»».
const CODE=/[A-Z][a-z0-9]+[A-Z]|[a-z0-9]_[a-z0-9]|\.(?:cs|cpp|h|hpp|js|ts|tsx|py|go|rs|java|kt|swift|lua|shader|prefab|unity|asset|json|ya?ml|gradle)(?=$|[^\p{L}])|[\\/]|::|(?:^|[^\p{L}])(?:код\p{L}*|класс\p{L}*|модул\p{L}*|скрипт\p{L}*|систем\p{L}*|фич\p{L}*|механик\p{L}*|компонент\p{L}*|сервис\p{L}*|метод\p{L}*|функци\p{L}*|файл\p{L}*|шейдер\p{L}*|сцен\p{L}*|префаб\p{L}*|бэкенд\p{L}*|бекенд\p{L}*|сервер\p{L}*|клиент\p{L}*|интерфейс\p{L}*|магазин\p{L}*|инвентар\p{L}*|сет\p{L}*|мультиплеер\p{L}*|матчмейкинг\p{L}*|сохранени\p{L}*|билд\p{L}*|сборк\p{L}*|плагин\p{L}*|sdk|api|ui|ci|backend|frontend|server|client|shader|scene|prefab)(?=$|[^\p{L}])/u;
// Words that say nothing about the subject.
const TRAIL=/\s+(?:у нас|в проекте|в нашем проекте|в игре|в нашей игре|в репозитории|в репо|в коде|из команды|в команде|лучше всех|больше всех|сейчас|вообще|пожалуйста)$/iu;
const PREP=/^(?:в|во|по|про|о|об|обо|насч[её]т|с|над|на тему|за)\s+/iu;
const DEMONSTRATIVE=/^(?:эт(?:от|ом|у|ой|о|и|ими|ого)|наш(?:у|ем|ей|ему|его|и|их)?)\s+/iu;

function subject(raw){
 let t=String(raw||'').trim().replace(/^[«"“'`]+|[»"”'`]+$/gu,'');
 for(let i=0;i<3;i++)t=t.replace(TRAIL,'').replace(PREP,'').replace(DEMONSTRATIVE,'').trim();
 t=t.replace(/^[«"“'`]+|[»"”'`]+$/gu,'').trim();
 return t.length>=2&&t.length<=120?t:'';
}

// {mode:'expert'|'author'|'last', topic} or null.
function parse(text){
 const t=clean(text).replace(LEAD,'');
 if(!t)return null;
 let m;
 if((m=LAST.exec(t))){const topic=subject(m[3]);return topic?{mode:m[1]?'last':'author',topic}:null;}
 if((m=AUTHOR.exec(t))){
  const strict=/^(?:написал|сделал|автор|создал|создавал)$/iu.test(m[1]);
  const topic=subject(m[2]);
  if(!topic||strict&&(!CODE.test(m[2])||/^[«"“]/u.test(m[2].trim())&&!CODE.test(topic)))return null;
  return {mode:'author',topic};
 }
 if((m=EXPERT.exec(t))){
  // «кто работает завтра», «кто занимается спортом» are not about a subject of the project: the subject must follow a preposition.
  if(/^(?:работает|работал|занимается|занимался)$/iu.test(m[1])&&!/^(?:над|с|по|в|во)\s/iu.test(m[2])&&!CODE.test(m[2]))return null;
  const topic=subject(m[2]);return topic?{mode:'expert',topic}:null;
 }
 if((m=KNOWS.exec(t))){
  if(FACTUAL.test(m[1])||HOW.test(m[1]))return null;
  const topic=subject(m[1].replace(/^[,\s]+/,'').replace(/^как\s+(?:\p{L}+\s+)?/iu,''));return topic?{mode:'expert',topic}:null;
 }
 if((m=WHOM.exec(t))){const topic=subject(m[2]);return topic?{mode:'expert',topic}:null;}
 return null;
}

// For the offer (src/features/extension-offers.cjs): the same request shapes as regular expressions.
const TOPICS=[
 /кто\s+(?:\p{L}+\s+){0,3}(?:разбирается|шарит|сеч[её]т|эксперт|спец|специалист|в теме|знает толк)\s+(?:в|во|по|про)\s/iu,
 /кто\s+(?:\p{L}+\s+){0,2}знает\s+(?:про|о|об|по|насч[её]т)\s/iu,
 /к кому\s+(?:\p{L}+\s+){0,3}(?:по|про|насч[её]т|с вопрос\p{L}*)\s|кого\s+(?:мне\s+)?(?:спросить|дёрнуть|дернуть)\s+(?:по|про)\s|с кем\s+(?:мне\s+)?(?:посоветоваться|проконсультироваться)\s/iu,
 /кто\s+(?:последн\p{L}*|недавно)\s+(?:трогал|менял|правил|коммитил)\p{L}*\s/iu,
 /кто\s+(?:писал|пилил|делал|реализовывал|разрабатывал|рефакторил|переписывал)\s+(?:[A-Za-z_][\w.]*|код|класс|модул|скрипт|систем|магазин|инвентар|сет|сохранени|ui|интерфейс)/iu
];
const AVOID=[/кто\s+(?:\p{L}+\s+){0,2}знает[,\s]+(?:когда|где|почему|зачем|сколько|во сколько|ли|что|какой|какая|какие|куда|кто)(?=$|[^\p{L}])/iu,/^(?:а\s+)?кто\s+ты(?=$|[^\p{L}])|знаешь\s+ли\s+ты|ты\s+знаешь/iu];

module.exports={parse,subject,clean,TOPICS,AVOID,CODE};
