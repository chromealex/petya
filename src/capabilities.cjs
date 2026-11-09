// What Petya can do, described by meaning. When none of the handlers recognised the wording, the local model's
// tool router (src/semantic-tools.cjs) picks one of these and restates the request in a canonical form the handler
// takes («каждые полчаса глядь, не пришло ли письмо» → «проверяй почту каждые 30 минут»). The restated request runs
// only when the handler's own gate accepts it and it brings in no names or numbers the user did not say.
const req=require;
// Short commands that converse.cjs checks inline.
const PHRASES={
 undo:/^(?:отмени|отменить|верни назад) (?:последнее(?: действие)?|последний шаг)[.!?]*$/iu,
 dailyBrief:/^(?:что у нас сегодня|что на сегодня|сводка на сегодня|дай сводку|покажи сводку)[.!?]*$/iu,
};
const APPS=Symbol('apps');
const CATALOG=[
 {id:'recurring',says:'повторять команду по расписанию (каждые N минут или часов, каждый день в ЧЧ:ММ), показать повторы или остановить повтор',
  examples:['проверяй почту каждые 5 минут','каждый день в 9:30 присылай сводку','какие у меня повторы','перестань проверять почту'],accepts:t=>req('./features/recurring.cjs').matches(t)},
 {id:'skill-create',says:'Петя сам пишет себе новый скилл (инструкцию, как делать какую-то работу)',
  examples:['сделай скилл: как оформлять релиз-ноты','создай новый скилл для ревью кода'],accepts:t=>req('./features/skill-packages.cjs').matches(t)},
 {id:'highlights',says:'отметить что-то как важное (для этого чата или всего проекта) или показать отмеченное важное',
  examples:['запомни как важное: релиз 20 ноября','запомни как важное для проекта: тестирует Полина','покажи важное'],accepts:t=>req('./features/highlights.cjs').matches(t)},
 {id:'context-look',says:'посмотреть, что не так, по последней записанной встрече, когда предмет не назван',
  examples:['посмотри, что не так','разберись, в чём проблема','проверь этот тред'],accepts:t=>req('./context-reference.cjs').isContextReference(t)},
 {id:'address',says:'в каком роде обращаться к пользователю',examples:['обращайся ко мне в женском роде','обращайся ко мне в мужском роде'],accepts:t=>req('./features/address.cjs').matches(t)},
 {id:'morning-brief',says:'включить по будням утреннюю сводку в заданное время или выключить её',
  examples:['присылай утреннюю сводку в 9:30','выключи утреннюю сводку'],accepts:t=>req('./features/morning-brief.cjs').matches(t)},
 {id:'weather-rate',says:'погода в городе (сегодня, завтра) или курс валюты ЦБ',examples:['какая погода в Москве','погода в Казани завтра','курс доллара','курс евро'],
  accepts:t=>{const f=req('./features/fresh-data.cjs');return !!(f.weatherQuestion(t)||f.rateQuestion(t));}},
 {id:'list-followup',says:'выбрать, отфильтровать или переназначить задачи из только что показанного списка',
  examples:['какую из них сделать сначала','какие из них в работе','на кого их можно перевести'],
  accepts:t=>{const f=req('./features/list-followup.cjs');return !!(f.question(t)||f.filterQuestion(t)||f.assignQuestion(t));}},
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
 // Apps' entries from their chat routes (`capability`, src/features/chat-routes.cjs): git, unity, the build flows…
 APPS,
 {id:'delegation',says:'чем закончилась или как продвигается переданная агенту задача',examples:['что с задачей PROJ-12','статус поручений','чем закончилась задача'],accepts:t=>req('./task-progress.cjs').isProgress(t)},
];
// Apps add their own capabilities (`"provides": {"capability": "<file>.cjs"}`): {id, says, examples, accepts(text),
// services?: [words], owns?} is a new entry; {id, extends: '<entry id>', says?, examples?, accepts} widens an entry
// (its `says` is appended, its `accepts` is an alternative). `services` are the app's service names, which a
// restatement may use whatever the user called them; `owns` marks requests that are Petya's own (never an app offer).
const registry=()=>require('./extension-registry.cjs');
function providers(dir){
 const build=()=>require('./features/app-links.cjs').scan(dir).filter(x=>x.kind==='capability').flatMap(({provider:p,...x})=>{
  if(!p||typeof p.id!=='string'||typeof p.accepts!=='function'||(!p.extends&&(typeof p.says!=='string'||!Array.isArray(p.examples)))){
   const error=Error('Invalid capability '+x.extension+'/'+x.file);
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{setting:x.setting,capability:p}];
 }).sort((a,b)=>a.capability.id.localeCompare(b.capability.id));
 return dir?build():registry().cached('capability',build);
}
// The catalog with the capabilities of the apps that pass `use` (all of them when no settings are given).
function compose(use=()=>true){
 const own=CATALOG.flatMap(c=>c===APPS?req('./features/chat-routes.cjs').capabilities():[{...c}]),list=providers().filter(use).map(x=>x.capability);
 for(const p of list.filter(p=>p.extends)){const c=own.find(c=>c.id===p.extends);if(!c)continue;const before=c.accepts;c.accepts=t=>before(t)||!!p.accepts(t);if(p.says)c.says+=', '+p.says;if(p.examples)c.examples=[...c.examples,...p.examples];}
 return [...own,...list.filter(p=>!p.extends).map(p=>({id:p.id,says:p.says,examples:p.examples,accepts:p.accepts}))];
}
function catalog(settings){return compose(settings?x=>!x.setting||settings[x.setting]==='true':undefined);}
// Whether an added app marks the request as Petya's own (see `owns` above).
// Without settings every app counts.
function owned(command,settings){return providers().some(x=>{if(!x.capability.owns||settings&&x.setting&&settings[x.setting]!=='true')return false;try{return !!x.capability.accepts(command);}catch{return false;}});}
const serviceWords=()=>{try{return new Set(providers().flatMap(x=>x.capability.services||[]).map(w=>String(w).toLocaleLowerCase()));}catch{return new Set();}};
const byId={get:id=>catalog().find(c=>c.id===id)};
// Names, numbers, keys and channels the restatement keeps must come from the user's own words.
const norm=w=>w.toLocaleLowerCase('ru').replace(/ё/g,'е');
const WORDS={1:/один|одну|одна|раз(?!\p{L})/u,2:/два|две|пару/u,3:/три(?!\p{L}*дцат)/u,4:/четыр/u,5:/пят(?!\p{L}*надцат|\p{L}*десят)|пять/u,6:/шест/u,7:/сем(?!\p{L}*надцат)/u,8:/восем/u,9:/девят/u,10:/десят/u,12:/полдень|двенадцат/u,15:/пятнадцат|четверть/u,20:/двадцат/u,30:/тридцат|полчаса|пол\s*часа|половин/u,40:/сорок/u,45:/сорок\s*пят/u,60:/шестьдесят|час(?!\p{L}*[2-9])/u};
// Services and words of Petya himself may be named in the canonical form whatever the user called them.
const SERVICES=/^(?:jira|unity|git|diff|python|confluence|notion|gmail|outlook|google|play|anr|петя|пете|петю|проект[а-я]*|задач[а-я]*)$/u;
const said=(n,own)=>own.includes(n)||!!WORDS[Number(n)]?.test(own);
function grounded(canonical,original,examples=[]){
 const own=norm(original);
 const tokens=String(canonical).split(/[^\p{L}\p{N}#_.:-]+/u).filter(Boolean);
 for(const [i,raw] of tokens.entries()){
  const w=norm(raw.replace(/[.:]+$/,''));if(!w||SERVICES.test(w)||serviceWords().has(w))continue;
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
module.exports={get CATALOG(){return catalog();},catalog,owned,providers,PHRASES,restate,grounded};
