// «Симуляция баланса»: which requests are a simulation of the game economy, and what they ask — a level milestone
// («сколько дней до 10 уровня»), an amount to earn («за сколько накопит 5000 золота»), a «what if» («если поднять
// награду за победу на 20%»), the horizon and the number of players. Word edges are written with Unicode classes.
const SIM=/(?:^|[^\p{L}])(?:симул\p{L}*|смодел\p{L}*|моделиров\p{L}*|прогон\p{L}*\s+(?:симуляц|модел|экономик|баланс|прогресс)\p{L}*|монте[- ]?карло|monte[- ]?carlo)/iu;
const SUBJECT=/прогресси\p{L}*|экономик\p{L}*|баланс\p{L}*|уровн\p{L}*|валют\p{L}*|золот\p{L}*|монет\p{L}*|кристалл\p{L}*|наград\p{L}*|прокачк\p{L}*|конфиг\p{L}*|игрок\p{L}*|(?:^|[^\p{L}])(?:xp|опыт\p{L}*|f2p|ф2п)(?=$|[^\p{L}])/iu;
const LEVEL=/(?:до|на)\s+(\d{1,4})(?:-?(?:го|ого|й|ый))?\s+(?:уровн\p{L}*|лвл\p{L}*|lvl)|(\d{1,4})(?:-?(?:го|ого|й|ый))?\s+уровн\p{L}*/iu;
const DAYS_Q=/(?:сколько|за\s+сколько|через\s+сколько)\s+(?:\p{L}+\s+){0,2}?(?:дн\p{L}*|недел\p{L}*|времени)|как\s+быстро|когда\s+игрок/iu;
const PLAYER=/игрок\p{L}*|без\s+доната|без\s+покупок|f2p|ф2п|не\s*платящ\p{L}*|прокачк\p{L}*|прокача\p{L}*/iu;
const EARN=/накоп\p{L}*\s+(?:на\s+)?(\d[\d\s]*)\s*(\p{L}+)|заработа\p{L}*\s+(\d[\d\s]*)\s*(\p{L}+)/iu;
const IF=/(?:что\s+будет|что\s+станет|как\s+измен\p{L}*|как\s+повлия\p{L}*|что\s+случится)[\s\S]{0,60}?(?:если|при)\s|(?:^|[^\p{L}])если\s+(?:мы\s+)?(?:подн|увелич|сниз|уменьш|удво|урез|поменя|измен|сдела)/iu;
const CHANGE=/(подн\p{L}*|повы\p{L}*|увелич\p{L}*|сниз\p{L}*|пониз\p{L}*|уменьш\p{L}*|урез\p{L}*|удво\p{L}*|утро\p{L}*|сделать|поставить|измен\p{L}*|поменя\p{L}*)\s+([\s\S]{2,80}?)(?:\s+(?:на|в|до)\s+(\d+(?:[.,]\d+)?)\s*(%|процент\p{L}*|раз\p{L}*)?|$)/iu;
// Neighbours: reconciling and validating configs («Конфиги и баланс»), metrics, money balance, levels outside games.
const AVOID=/свер\p{L}*|расхожд\p{L}*|(?:что|какие)\s+(?:\p{L}+\s+)?(?:поменял|изменил)\p{L}*\s+в\s+(?:баланс|конфиг)|провер\p{L}*\s+конфиг|валидац\p{L}*|(?:^|[^\p{L}])(?:dau|mau|ретеншн\p{L}*|retention|arpdau|ltv)(?=$|[^\p{L}])|баланс\p{L}*\s+(?:на\s+)?(?:карт|сч[её]т|телефон|кошел|работ|жизн|бел)|уровн\p{L}*\s+(?:английск|языка|воды|стресса|шума|сахара|сигнала|громкост|доступа|логирован|лога)|что\s+такое\s+(?:симуляц|монте)/iu;

function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>600||AVOID.test(t))return null;
 if(IF.test(t)&&CHANGE.test(t)&&/наград|цен|стоимост|опыт|бонус|доход|xp|золот|монет|кристал|прайс|экономик/iu.test(t))return 'whatif';
 if(SIM.test(t)&&SUBJECT.test(t))return 'sim';
 if(DAYS_Q.test(t)&&(LEVEL.test(t)&&(PLAYER.test(t)||/уровн/iu.test(t))||EARN.test(t)&&PLAYER.test(t)))return 'sim';
 return null;
}
const number=v=>Number(String(v).replace(/\s+/g,'').replace(',','.'));
// The change of a «what if»: words naming the target and the operation (× factor or a new value).
function change(text){
 const m=CHANGE.exec(String(text||''));if(!m)return null;
 const verb=m[1].toLowerCase(),words=m[2].trim(),n=m[3]!==undefined?number(m[3]):null,unit=(m[4]||'').toLowerCase();
 const down=/^(?:сниз|пониз|уменьш|урез)/u.test(verb);
 let op='mul',value=null;
 if(/^удво/u.test(verb))value=2;else if(/^утро/u.test(verb))value=3;
 else if(n!==null&&(unit.startsWith('%')||unit.startsWith('процент')))value=down?1-n/100:1+n/100;
 else if(n!==null&&unit.startsWith('раз'))value=down?1/n:n;
 else if(n!==null&&/\sдо\s/u.test(m[0]))op='set',value=n;
 else if(n!==null)value=down?1-n/100:1+n/100;
 if(value===null||!(value>0))return {words,missing:true};
 return {words,op,value,text:m[0].trim()};
}
function parse(text){
 const t=String(text||'');
 const lv=LEVEL.exec(t),earn=EARN.exec(t);
 const days=/за\s+(\d{1,3})\s*(?:дн|день|дня|сут)/iu.exec(t)||/(?:на|в\s+течение)\s+(\d{1,3})\s*(?:дн|день|дня)/iu.exec(t);
 const months=/за\s+(\d{1,2})?\s*месяц/iu.exec(t);
 const players=/(\d[\d\s]{1,6})\s*игрок/iu.exec(t);
 return {
  level:lv?Number(lv[1]||lv[2]):null,
  earn:earn?{amount:number(earn[1]||earn[3]),word:(earn[2]||earn[4]||'').toLowerCase()}:null,
  days:days?Number(days[1]):months?Math.min(365,30*Number(months[1]||1)):null,
  players:players?number(players[1]):null,
  paying:/с\s+донатом|платящ\p{L}*\s+игрок|кит\p{L}*/iu.test(t)&&!/без\s+доната|не\s*платящ/iu.test(t),
  change:about(t)==='whatif'?change(t):null
 };
}
// Russian words of a request → what they name in the economy (triggers, resources, sinks).
const WORDS=[
 [/побед\p{L}*|выигр\p{L}*/iu,{trigger:'win'}],[/поражени\p{L}*|проигр\p{L}*/iu,{trigger:'loss'}],
 [/ежедневн\p{L}*|за\s+вход|логин\p{L}*|дейли|daily/iu,{trigger:'daily'}],[/(?:за\s+)?(?:бо[йия]\p{L}*|матч\p{L}*|раунд\p{L}*|уровень\s+пройден)/iu,{trigger:'action'}],
 [/опыт\p{L}*|(?:^|[^\p{L}])xp(?=$|[^\p{L}])/iu,{resource:'xp'}],[/золот\p{L}*|(?:^|[^\p{L}])gold/iu,{resource:'gold'}],[/монет\p{L}*|coins?/iu,{resource:'coin'}],
 [/кристалл\p{L}*|гем\p{L}*|gems?/iu,{resource:'gem'}],[/алмаз\p{L}*|diamonds?/iu,{resource:'diamond'}],
 [/цен\p{L}*|стоимост\p{L}*|прайс\p{L}*|подорож\p{L}*|дешевл\p{L}*/iu,{sink:true}],[/наград\p{L}*|доход\p{L}*|бонус\p{L}*/iu,{source:true}]
];
function meaning(words){const out={};for(const [re,v] of WORDS)if(re.test(words))Object.assign(out,v);return out;}
// Which sources / sinks a change names: by trigger, resource, «награда» vs «цена», and the object's own name.
function targets(economy,words){
 const m=meaning(words);
 const low=String(words).toLowerCase();
 const named=list=>list.filter(x=>x.object&&low.includes(String(x.object).toLowerCase()));
 if(m.sink||(!m.source&&!m.trigger&&named(economy.sinks).length)){
  const byName=named(economy.sinks);
  if(byName.length)return byName;
  return economy.sinks.filter(x=>!m.resource||x.resource===m.resource);
 }
 // «награда за квесты»: a trigger the economy does not know is asked, not widened to every reward.
 if(!m.trigger&&/(?:^|\s)за\s+\p{L}{3,}/u.test(low))return [];
 let list=economy.sources;
 if(m.trigger)list=list.filter(x=>x.trigger===m.trigger);
 if(m.resource)list=list.filter(x=>x.resource===m.resource);
 // «награда за победу» without a resource: the currency rewards; XP only when named.
 else if(m.trigger)list=list.filter(x=>x.resource!=='xp');
 return m.trigger||m.resource||m.source?list:[];
}
module.exports={about,parse,change,targets,meaning};
