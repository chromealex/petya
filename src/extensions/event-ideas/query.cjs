// «Идеи для ивентов»: which requests are about live-ops events of the game — ideas («какой ивент провести в декабре»,
// «идеи ивентов на Хэллоуин для Бразилии»), planning one («запланируй ивент «Хэллоуин»») or recording a past one with its
// dates («прошлый ивент «Хэллоуин» шёл с 24 октября по 2 ноября 2025»). An event in the calendar, an event in code
// (UnityEvent, listeners) and funnel events are not it.
const EVENT=/(?:^|[^\p{L}])(?:ивент\p{L}*|лайв[- ]?опс\p{L}*|live[- ]?ops|событи\p{L}*\s+(?:в\s+игре|для\s+игроков))(?=$|[^\p{L}])/iu;
const IDEAS=/иде[яиюй]\p{L}*|предлож\p{L}*|придума\p{L}*|подскаж\p{L}*|посоветуй|(?:какие|какой|какую)\s+(?:\p{L}+\s+){0,2}?(?:ивент|событи)|что\s+(?:бы\s+)?(?:провести|запустить|устроить)|(?:провести|запустить|устроить)\s+(?:\p{L}+\s+){0,2}?(?:ивент|событи)/iu;
const PLAN=/(?:^|[^\p{L}])(?:запланир\p{L}*|заплан\p{L}*|поставь\s+в\s+план|добавь\s+в\s+план)\s+(?:\p{L}+\s+){0,2}?(?:ивент\p{L}*|событи\p{L}*|иде[юя])/iu;
const PAST=/(?:прошл\p{L}*|провели|проводили|был\p{L}*|шёл|шел|прош[её]л)\s+(?:\p{L}+\s+){0,2}?ивент\p{L}*|ивент\p{L}*\s+[«"][^»"]+[»"]\s+(?:был|шёл|шел|прош[её]л|проходил)/iu;
const AVOID=/календар\p{L}*|встреч\p{L}*|созвон\p{L}*|митинг\p{L}*|(?:^|[^\p{L}])(?:unity\s*events?|unityevent|listener\p{L}*|eventbus|event\s*system)(?=$|[^\p{L}])|обработчик\p{L}*|подпи\p{L}*\s+на\s+(?:ивент|событи)|в\s+коде|воронк\p{L}*|аналитик\p{L}*\s+событ|appmetrica|аппметрик|назван\p{L}*|нейминг\p{L}*|слоган\p{L}*|(?:^|[^\p{L}])имя\s+(?:для|ивент)/iu;

function about(text){
 const t=String(text||'').trim();
 if(!t||t.length>500||!EVENT.test(t)||AVOID.test(t))return null;
 if(PLAN.test(t))return 'plan';
 if(PAST.test(t)&&dates(t).length>=2)return 'past';
 if(IDEAS.test(t))return 'ideas';
 return null;
}
const MONTHS=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
// Dates of a request: «24 октября 2025», «2 ноября», «24.10.2025», «24.10».
function dates(text,today){
 const out=[];const t=String(text||'');
 const re=new RegExp('(\\d{1,2})\\s+('+MONTHS.join('|')+')\\p{L}*(?:\\s+(\\d{4}))?|(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}))?','giu');let m;
 while((m=re.exec(t))){
  const day=Number(m[1]||m[4]),month=m[2]?MONTHS.findIndex(x=>new RegExp('^'+x,'iu').test(m[2]))+1:Number(m[5]),year=m[3]||m[6]?Number(m[3]||m[6]):null;
  if(month<1||month>12||day<1||day>31)continue;out.push({day,month,year,at:m.index});
 }
 // A missing year: the year of the last date that has one, else the latest year that is not in the future.
 const y=[...out].reverse().find(d=>d.year)?.year;
 return out.map(d=>{let year=d.year||y;if(!year&&today){year=Number(today.slice(0,4));if(String(year)+'-'+String(d.month).padStart(2,'0')+'-'+String(d.day).padStart(2,'0')>today)year--;}year=year||new Date().getFullYear();return year+'-'+String(d.month).padStart(2,'0')+'-'+String(d.day).padStart(2,'0');});
}
const REGIONS=[[/росси|(?:^|[^\p{L}])рф(?=$|[^\p{L}])|ру\s*сегмент|снг/iu,['RU']],[/сша|америк(?!\p{L}*\s+латин)|штат/iu,['US']],[/латинск\p{L}*\s+америк|латам|latam/iu,['BR','MX']],[/бразил/iu,['BR']],[/мексик/iu,['MX']],
 [/китай|китая|китае|кнр/iu,['CN']],[/тайван/iu,['TW']],[/коре/iu,['KR']],[/япони/iu,['JP']],[/инди(?:и|я|ю)/iu,['IN']],[/турци/iu,['TR']],[/индонези/iu,['ID']],[/вьетнам/iu,['VN']],
 [/(?:^|[^\p{L}])(?:азии|азия|азию|азиатск\p{L}*)/iu,['CN','KR','JP','VN','ID']],[/европ/iu,['DE','FR','GB']],[/герман/iu,['DE']],[/франци/iu,['FR']],[/британи|англи/iu,['GB']],
 [/арабск|ближн\p{L}*\s+восток|mena|сауд|оаэ|эмират|египт|мусульман/iu,['SA','AE','EG','TR']]];
function regions(text){const out=new Set();for(const [re,list] of REGIONS)if(re.test(text))list.forEach(r=>out.add(r));return [...out];}
const MONTH_NAMES=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
// The window: «на декабрь» (to the month's end), «на месяц», «на 2 месяца», «на зиму», «до конца года»; 60 days by default.
function horizon(text,today){
 const t=String(text||'');const d=Date.parse(today+'T00:00:00Z');
 const end=(y,m)=>new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
 const diff=to=>Math.max(7,Math.round((Date.parse(to)-d)/86400000));
 let m=new RegExp('(?:на|в|к)\\s+('+MONTH_NAMES.join('|')+')\\p{L}*','iu').exec(t);
 if(m){const month=MONTH_NAMES.findIndex(x=>new RegExp('^'+x,'iu').test(m[1]))+1;const now=new Date(d);let y=now.getUTCFullYear();if(month<now.getUTCMonth()+1)y++;return diff(end(y,month));}
 m=/(?:на|за)\s+(\d{1,2})\s*(?:месяц|мес)/iu.exec(t);if(m)return Math.min(365,30*Number(m[1]));
 m=/(?:на|за)\s+(\d{1,2})\s*недел/iu.exec(t);if(m)return Math.min(365,7*Number(m[1]));
 if(/(?:на|в)\s+(?:ближайш\p{L}*\s+)?месяц/iu.test(t))return 30;
 if(/на\s+(?:ближайш\p{L}*\s+)?(?:недел\p{L}*)/iu.test(t))return 14;
 if(/на\s+зиму/iu.test(t)){const now=new Date(d);const y=now.getUTCMonth()>=2?now.getUTCFullYear()+1:now.getUTCFullYear();return diff(end(y,2));}
 if(/до\s+конца\s+года/iu.test(t))return diff(end(new Date(d).getUTCFullYear(),12));
 if(/(?:на|в)\s+(?:этот\s+)?квартал/iu.test(t))return 90;
 return 60;
}
// A holiday named in a request («на Хэллоуин», «к Новому году», «на Рамадан»).
const NAMED=[['halloween',/хэллоуин|хеллоуин|halloween/iu],['christmas',/рождеств/iu],['new-year',/нов\p{L}*\s+год/iu],['valentine',/валентин/iu],['easter',/пасх/iu],['lunar-new-year',/китайск\p{L}*\s+нов\p{L}*\s+год|лунн\p{L}*\s+нов/iu],
 ['black-friday',/ч[её]рн\p{L}*\s+пятниц/iu],['ramadan',/рамадан/iu],['eid-al-fitr',/ураза/iu],['eid-al-adha',/курбан/iu],['diwali',/дивали/iu],['thanksgiving',/благодарени/iu],['mar8',/8\s+марта|женск\p{L}*\s+день/iu],['feb23',/23\s+февраля/iu],
 ['victory',/день\s+победы|9\s+мая/iu],['mid-autumn',/середины\s+осени|mid-?autumn/iu],['chuseok',/чхусок/iu],['seollal',/соллаль/iu],['carnival',/карнавал/iu],['golden-week-cn',/(?:китайск\p{L}*\s+)?золот\p{L}*\s+недел/iu]];
function named(text){for(const [id,re] of NAMED)if(re.test(text))return id;return null;}
const quoted=text=>/[«"]([^»"]{2,80})[»"]/u.exec(String(text||''))?.[1]?.trim()||null;
module.exports={about,dates,regions,horizon,named,quoted};
