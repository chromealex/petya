// What a chat message asks of «Фокус»: start a session or a pomodoro series, a break, pause / resume / stop /
// extend the running one, its status, the day or week report, or help to concentrate. Commands that only make
// sense during a session («пауза», «стоп», «ещё 10 минут») are taken only while one is running.
// Near-misses: camera focus in Unity, focus groups, input focus, and planning talk without a time
// («давай сфокусируемся на багах»).
const NUM={один:1,одну:1,две:2,два:2,три:3,четыре:4,пять:5,шесть:6,семь:7,восемь:8,десять:10,пятнадцать:15,двадцать:20,'двадцать пять':25,тридцать:30,сорок:40,'сорок пять':45,пятьдесят:50,шестьдесят:60,девяносто:90};
const NUMWORD='(?:двадцать\\s+пять|сорок\\s+пять|'+Object.keys(NUM).filter(k=>!k.includes(' ')).join('|')+')';
const num=w=>/^\d+$/.test(w)?Number(w):NUM[String(w).toLowerCase().replace(/\s+/g,' ')]||0;

const FOCUS=/(?:^|[^\p{L}])(?:фокус\p{L}{0,4}|сфокусир\p{L}*|фокусир\p{L}*|помодоро|pomodoro|фокус-сесси\p{L}*)(?=$|[^\p{L}])/iu;
const AVOID=/камер|unity|юнити|объектив|автофокус|фокусн\p{L}*\s+расстоян|фокус-?групп|фокусник|фокус\p{L}*\s+(?:ввода|окна|элемент|кнопк|поля|на\s+(?:элемент|кнопк|пол[еяю]|инпут|окн))|в\s+фокусе\s+(?:спринта|квартала|релиза|команды)|фокус\s+(?:продукта|компании|команды|спринта|квартала)|(?:^|[^\p{L}])focus\s*\(|blur/iu;
// «Сфокусируемся», «фокусируемся» — planning talk about the team, not a timer.
const WE=/(?:^|[^\p{L}])(?:с?фокусируемся|с?фокусируемс|сосредоточимся|давайте\s+с?фокус)/iu;
const START=/(?:^|[^\p{L}])(?:запусти|начни|начать|начинаю|включи|старт\p{L}*|поставь|засеки|хочу|давай)\s+(?:мне\s+)?(?:\p{L}+\s+)?(?:фокус|помодоро|pomodoro|фокус-сесси)/iu;
const DURATION=new RegExp('(?:^|[^\\p{L}\\d])(?:(?:на|в)\\s+)?(?:(\\d{1,3}|'+NUMWORD+')\\s*(?:мин\\p{L}*|м)(?=$|[^\\p{L}])|(\\d{1,2}(?:[.,]5)?|'+NUMWORD+')\\s*(?:час\\p{L}*|ч)(?=$|[^\\p{L}])|(полчаса|полтора\\s+часа|час)(?=$|[^\\p{L}]))','iu');
const COUNT=new RegExp('(?:^|[^\\p{L}\\d])(\\d{1,2}|'+NUMWORD+')\\s*(?:раз\\p{L}*|цикл\\p{L}*|подход\\p{L}*|сесси\\p{L}*|круг\\p{L}*|помидор\\p{L}*)(?=$|[^\\p{L}])','iu');
const JIRA=/(?:^|[^A-Za-z0-9-])([A-Z][A-Z0-9]{1,9}-\d{1,6})(?![\w-])/;

const REPORT=/сколько\s+(?:я\s+)?(?:сегодня\s+|вчера\s+|за\s+(?:сегодня|неделю|день)\s+|на\s+этой\s+неделе\s+|за\s+эту\s+неделю\s+)?(?:я\s+)?(?:с?фокусир\p{L}*|сосредотач\p{L}*|был\p{L}*\s+в\s+фокусе|фокус\p{L}*)|(?:отч[её]т|статистик\p{L}*|итог\p{L}*|сводк\p{L}*)\s+(?:по\s+)?(?:фокус\p{L}*|помодоро)|(?:фокус\p{L}*|помодоро)\s+за\s+(?:сегодня|неделю|день)|сколько\s+(?:у\s+меня\s+)?(?:было\s+)?(?:фокус-сесси\p{L}*|сесси\p{L}*\s+фокуса|помидор\p{L}*)/iu;
const HELP=/помоги\s+(?:мне\s+)?(?:с?концентр\p{L}*|сосредоточ\p{L}*|с?фокусир\p{L}*)|не\s+могу\s+(?:с?концентр|сосредоточ|с?фокусир)\p{L}*|хочу\s+(?:поработать\s+)?(?:сосредоточ\p{L}*|без\s+отвлечений)|постоянно\s+отвлекаюсь/iu;
const PREFIX='^(?:петя[,!\\s]+)?';
const BREAK=new RegExp(PREFIX+'(?:давай\\s+|сделай\\s+|сделаем\\s+|хочу\\s+|начни\\s+|запусти\\s+|включи\\s+|возьму\\s+)?(?:перерыв|передышк\\p{L}*)(?:\\s+на)?(?:\\s+(\\d{1,3}|'+NUMWORD+'|полчаса)\\s*(?:мин\\p{L}*|м)?)?\\s*[.!]*$','iu');
const PAUSE=new RegExp(PREFIX+'(?:(?:поставь|поставить|поставь\\s+фокус|поставь\\s+таймер)\\s+на\\s+паузу|пауз[аеу]|пауза\\s+фокус\\p{L}*|приостанови(?:\\s+фокус\\p{L}*|\\s+таймер)?)\\s*[.!]*$','iu');
const RESUME=new RegExp(PREFIX+'(?:продолж\\p{L}*|возобнов\\p{L}*|сними\\s+с\\s+паузы)(?:\\s+(?:фокус\\p{L}*|таймер|сесси\\p{L}*))?\\s*[.!]*$','iu');
const STOP=new RegExp(PREFIX+'(?:стоп|останови|закончи|заверши|хватит|прекрати|выключи|отмени|сбрось)(?:\\s+(фокус\\p{L}*|помодоро|таймер\\p{L}*|сесси\\p{L}*|перерыв))?\\s*[.!]*$','iu');
const EXTEND=new RegExp(PREFIX+'(?:ещ[её]|добавь|продли\\p{L}*)(?:\\s+(?:фокус\\p{L}*|таймер))?\\s+(?:на\\s+)?(\\d{1,3}|'+NUMWORD+'|полчаса)\\s*(?:мин\\p{L}*|м)?(?:\\s+(?:фокус\\p{L}*|к\\s+фокусу))?\\s*[.!]*$','iu');
const STATUS=new RegExp(PREFIX+'(?:сколько\\s+(?:ещ[её]\\s+)?(?:времени\\s+)?осталось(?:\\s+(?:фокуса|до\\s+конца(?:\\s+фокуса|\\s+сессии)?))?|сколько\\s+до\\s+конца\\s+(?:фокуса|сессии|перерыва)|как\\s+(?:там\\s+)?(?:мой\\s+)?фокус)\\s*[?.!]*$','iu');

function minutesOf(text){
 const m=DURATION.exec(text);if(!m)return null;
 if(m[1])return num(m[1]);
 if(m[2])return Math.round(Number(String(m[2]).replace(',','.'))*60||num(m[2])*60);
 const w=m[3].toLowerCase().replace(/\s+/g,' ');
 return w==='полчаса'?30:w==='полтора часа'?90:60;
}
// The session label: the request without the command words, time and count («над картой уровня»).
const all=re=>new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g');
const FILLER=/(?:^|\s)(?:петя|запусти|начни|начать|начинаю|включи|старт\p{L}*|поставь|засеки|хочу|давай|мне|пожалуйста|плиз|подряд|сессию|сессия|таймер)(?=$|[\s,.!?])/giu;
const PREP=/^(?:по|на|над|для|с|со|в|во|про)$/iu;
function labelOf(text){
 let rest=String(text).replace(all(JIRA),' ').replace(all(COUNT),' ').replace(all(DURATION),' ').replace(all(FOCUS),' ').replace(FILLER,' ');
 const words=rest.replace(/[,.!?;:—]+/gu,' ').split(/\s+/).filter(Boolean);
 while(words.length&&PREP.test(words.at(-1)))words.pop();
 while(words.length>1&&PREP.test(words[0])&&PREP.test(words[1]))words.shift();
 if(words.every(w=>PREP.test(w)))return '';
 const label=words.join(' ').slice(0,120);
 // «на задаче BW-12»: the key says it all.
 return /^(?:(?:на|над|по)\s+)?(?:задач\p{L}*|тикет\p{L}*|таск\p{L}*|работ\p{L}*)$/iu.test(label)?'':label;
}
function intent(text,{active=false}={}){
 const t=String(text||'').trim().replace(/\s+/g,' ');
 if(!t||t.length>400)return null;
 const jira=JIRA.exec(t)?.[1]||'';
 if(REPORT.test(t)&&!AVOID.test(t))return {action:'report',period:/недел/iu.test(t)?'week':'today'};
 if(HELP.test(t))return {action:'help'};
 const b=BREAK.exec(t);if(b)return {action:'break',minutes:b[1]?(b[1].toLowerCase()==='полчаса'?30:num(b[1])):5};
 if(active){
  if(PAUSE.test(t))return {action:'pause'};
  if(RESUME.test(t))return {action:'resume'};
  const s=STOP.exec(t);if(s)return {action:'stop'};
  const e=EXTEND.exec(t);if(e)return {action:'extend',minutes:e[1].toLowerCase()==='полчаса'?30:num(e[1])};
  if(STATUS.test(t))return {action:'status'};
 }else{
  // Without a session only the explicit forms are ours («останови фокус»), bare «стоп» is someone else's.
  const s=STOP.exec(t);if(s&&s[1]&&/фокус|помодоро|сесси/iu.test(s[1]))return {action:'stop'};
  if(PAUSE.test(t)&&/фокус/iu.test(t))return {action:'pause'};
 }
 if(!FOCUS.test(t)||AVOID.test(t)||WE.test(t))return null;
 const minutes=minutesOf(t),pomodoro=/помодоро|pomodoro/iu.test(t);
 const count=COUNT.exec(t);
 if(pomodoro&&(count||minutes||START.test(t)||/^(?:петя[,!\s]+)?(?:помодоро|pomodoro)/iu.test(t)))return {action:'pomodoro',count:Math.min(12,Math.max(1,count?num(count[1]):4)),minutes:minutes&&minutes<=90?minutes:25,label:labelOf(t),jira};
 if(minutes||START.test(t))return {action:'start',minutes:minutes||25,label:labelOf(t),jira};
 return null;
}
module.exports={intent,minutesOf,labelOf,JIRA};
