// What Petya can do, described by meaning. When none of the handlers recognised the wording, the local model's
// tool router (src/semantic-tools.cjs) picks one of these and restates the request in a canonical form the handler
// takes («каждые полчаса глядь, не пришло ли письмо» → «проверяй почту каждые 30 минут»). The restated request runs
// only when the handler's own gate accepts it and it brings in no names or numbers the user did not say.
const req=require;
// Short commands that converse.cjs checks inline.
const PHRASES={
 telegramSync:/^(?:петя[,!\s]+)?(?:обнови|прочитай|проверь)\s+(?:телеграм|telegram|тг)[.!?]*$/iu,
 undo:/^(?:отмени|отменить|верни назад) (?:последнее(?: действие)?|последний шаг)[.!?]*$/iu,
 dailyBrief:/^(?:что у нас сегодня|что на сегодня|сводка на сегодня|дай сводку|покажи сводку)[.!?]*$/iu,
};
const READ_GIT=new Set(['status','diff','log','branches']);
const CATALOG=[
 {id:'recurring',says:'повторять команду по расписанию (каждые N минут или часов, каждый день в ЧЧ:ММ), показать повторы или остановить повтор',
  examples:['проверяй почту каждые 5 минут','каждый день в 9:30 присылай сводку','какие у меня повторы','перестань проверять почту'],accepts:t=>req('./features/recurring.cjs').matches(t)},
 {id:'skill-create',says:'Петя сам пишет себе новый скилл (инструкцию, как делать какую-то работу)',
  examples:['сделай скилл: как оформлять релиз-ноты','создай новый скилл для ревью кода'],accepts:t=>req('./features/skill-packages.cjs').matches(t)},
 {id:'highlights',says:'отметить что-то как важное (для этого чата или всего проекта) или показать отмеченное важное',
  examples:['запомни как важное: релиз 20 ноября','запомни как важное для проекта: тестирует Полина','покажи важное'],accepts:t=>req('./features/highlights.cjs').matches(t)},
 {id:'context-look',says:'посмотреть, что не так, по последней записанной встрече или треду Slack, когда предмет не назван',
  examples:['посмотри, что не так','разберись, в чём проблема','проверь этот тред'],accepts:t=>req('./context-reference.cjs').isContextReference(t)},
 {id:'address',says:'в каком роде обращаться к пользователю',examples:['обращайся ко мне в женском роде','обращайся ко мне в мужском роде'],accepts:t=>req('./features/address.cjs').matches(t)},
 {id:'morning-brief',says:'включить по будням утреннюю сводку в заданное время или выключить её',
  examples:['присылай утреннюю сводку в 9:30','выключи утреннюю сводку'],accepts:t=>req('./features/morning-brief.cjs').matches(t)},
 {id:'weather-rate',says:'погода в городе (сегодня, завтра) или курс валюты ЦБ',examples:['какая погода в Москве','погода в Казани завтра','курс доллара','курс евро'],
  accepts:t=>{const f=req('./features/fresh-data.cjs');return !!(f.weatherQuestion(t)||f.rateQuestion(t));}},
 {id:'list-followup',says:'выбрать, отфильтровать или переназначить задачи из только что показанного списка',
  examples:['какую из них сделать сначала','какие из них в работе','на кого их можно перевести'],
  accepts:t=>{const f=req('./features/list-followup.cjs');return !!(f.question(t)||f.filterQuestion(t)||f.assignQuestion(t));}},
 {id:'git-read',says:'посмотреть состояние git в папке проекта: статус, изменения, историю коммитов, ветки',examples:['статус гита','покажи diff','история коммитов','покажи ветки'],
  accepts:t=>READ_GIT.has(req('./git-workspace.cjs').commandRoute(t)?.action)},
 {id:'unity',says:'Unity: найти или показать префаб, ошибки консоли, иерархию сцены',examples:['покажи префаб Player','покажи ошибки в консоли Unity','покажи иерархию сцены в Unity'],
  accepts:t=>!!req('./extensions/unity/intent.cjs').intent(t)},
 {id:'draw',says:'нарисовать или сгенерировать картинку',examples:['нарисуй кота-космонавта на Луне','сгенерируй картинку: закат над морем'],accepts:t=>!!req('./local-images.cjs').imagePrompt(t)},
 {id:'capabilities',says:'что Петя умеет и какие у него возможности',examples:['что ты умеешь','какие у тебя возможности'],accepts:t=>!!req('./capabilities-reply.cjs').reply(t,null,{},[])},
 {id:'jira-decompose',says:'декомпозировать фичу: разбить обсуждение или документацию на несколько задач Jira',
  examples:['декомпозируй эту фичу','разбей фичу на задачи'],accepts:t=>req('./core.cjs').decomposeRequest(t)},
 {id:'jira-work',says:'Jira: задачи на пользователе, загрузка команды или человека, статус проекта',
  examples:['мои задачи','какие задачи у Ивана','загрузка команды','статус проекта ABC'],
  accepts:t=>['personal','workload','status'].includes(req('./work-query-route.cjs').classify(t,null)?.kind)},
 {id:'project-catalog',says:'перечислить известные проекты',examples:['какие у нас проекты','список проектов'],accepts:t=>req('./project-catalog.cjs').isProjectCatalogQuestion(t)},
 {id:'project-memory',says:'выбрать рабочий проект, узнать текущий, забыть проект или запомнить для него канал Slack, проект Jira, репозиторий',
  examples:['работаем над проектом Альфа','какой сейчас проект','забудь проект Альфа','запомни канал разработки #dev'],accepts:t=>req('./project-memory.cjs').matches(t)},
 {id:'slack-digest',says:'что нового в Slack за день, два дня или неделю, кто писал пользователю',examples:['что нового в Slack','что нового в слаке за 2 дня','что мне писали в Slack'],
  accepts:t=>!!req('./slack-digest.cjs').question(t)},
 {id:'telegram-sync',says:'обновить сообщения Telegram',examples:['обнови телеграм'],accepts:t=>PHRASES.telegramSync.test(String(t).trim())},
 {id:'build',says:'что со сборкой (билдом) и почему она упала, по логу из Slack',examples:['что с билдом','почему упал билд','разбери лог'],
  accepts:t=>req('./build-question.cjs').isBuildQuestion(t)||req('./slack-log.cjs').isLogQuestion(t)},
 {id:'delegation',says:'чем закончилась или как продвигается переданная агенту задача',examples:['что с задачей PROJ-12','статус поручений','чем закончилась задача'],accepts:t=>req('./task-progress.cjs').isProgress(t)},
];
const byId=new Map(CATALOG.map(c=>[c.id,c]));
// Names, numbers, keys and channels the restatement keeps must come from the user's own words.
const norm=w=>w.toLocaleLowerCase('ru').replace(/ё/g,'е');
const WORDS={1:/один|одну|одна|раз(?!\p{L})/u,2:/два|две|пару/u,3:/три(?!\p{L}*дцат)/u,4:/четыр/u,5:/пят(?!\p{L}*надцат|\p{L}*десят)|пять/u,6:/шест/u,7:/сем(?!\p{L}*надцат)/u,8:/восем/u,9:/девят/u,10:/десят/u,12:/полдень|двенадцат/u,15:/пятнадцат|четверть/u,20:/двадцат/u,30:/тридцат|полчаса|пол\s*часа|половин/u,40:/сорок/u,45:/сорок\s*пят/u,60:/шестьдесят|час(?!\p{L}*[2-9])/u};
// Services and words of Petya himself may be named in the canonical form whatever the user called them.
const SERVICES=/^(?:slack|jira|unity|telegram|git|diff|python|confluence|notion|gmail|outlook|google|play|anr|петя|пете|петю|проект[а-я]*|задач[а-я]*)$/u;
const said=(n,own)=>own.includes(n)||!!WORDS[Number(n)]?.test(own);
function grounded(canonical,original,examples=[]){
 const own=norm(original);
 const tokens=String(canonical).split(/[^\p{L}\p{N}#_.:-]+/u).filter(Boolean);
 for(const [i,raw] of tokens.entries()){
  const w=norm(raw.replace(/[.:]+$/,''));if(!w||SERVICES.test(w))continue;
  const specific=/\d|#|[a-z]/i.test(raw)||i>0&&/^\p{Lu}/u.test(raw);
  if(!specific)continue;
  const digits=w.match(/\d+/g)||[];
  if(digits.length?digits.some(d=>!said(d,own)):!own.includes(w.slice(0,Math.max(3,w.length<=3?w.length:w.length<=5?w.length-1:w.length-2))))return false;
 }
 return true;
}
// The restated request, or null when it is not one this capability takes.
function restate(id,canonical,original){
 const c=byId.get(id),text=String(canonical||'').trim();
 if(!c||!text||text.length>500||norm(text)===norm(String(original||'').trim()))return null;
 let ok=false;try{ok=!!c.accepts(text);}catch{ok=false;}
 return ok&&grounded(text,original,c.examples)?text:null;
}
module.exports={CATALOG,PHRASES,restate,grounded};
