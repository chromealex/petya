// «Воронки»: which chat requests are about a funnel of game events, and what they ask for (a preset — tutorial,
// onboarding, install → first purchase — or explicit steps, a segment to compare, the period, a saved funnel's name).
// «Воронка» in the sales or marketing sense (leads, CRM, deals, a website) is not a game-events funnel and is left
// alone; so are other meanings of the word (a kitchen funnel, a crater).
// JavaScript's \b does not know Cyrillic, so word edges are written with Unicode letter classes.
const W='(?:^|[^\\p{L}\\p{N}_])',E='(?![\\p{L}\\p{N}_])';
const re=s=>new RegExp(s,'iu');

const FUNNEL=re('воронк\\p{L}*|'+W+'funnel'+E);
// Game events words that make «воронка» ours.
const GAME=re('туториал\\p{L}*|tutorial|обучени\\p{L}*|онбординг\\p{L}*|onboarding|'+W+'ftue'+E+'|установк\\p{L}*|инсталл?\\p{L}*|'+W+'install'+E+'|перв\\p{L}* (?:покупк|платеж|платёж|оплат|сесси|запуск|уровн|бо[йя])\\p{L}*|покупк\\p{L}*|игрок\\p{L}*|событи\\p{L}*|ивент\\p{L}*|'+W+'events?'+E+'|уровн\\p{L}*|уровен\\p{L}*|'+W+'level'+E+'|шаг\\p{L}*|регистрац\\p{L}*|квест\\p{L}*|матч\\p{L}*|appmetrica|аппметрик\\p{L}*');
// Sales / marketing funnels and other meanings: never ours unless game events are named too.
const MARKETING=re('продаж\\p{L}*|'+W+'(?:лид\\p{L}*|lead\\p{L}*|crm|срм|b2b|сделк\\p{L}*|клиент\\p{L}*|amocrm|амоцрм|битрикс\\p{L}*|bitrix\\p{L}*|hubspot|хабспот|email|e-mail|рассылк\\p{L}*|лендинг\\p{L}*|landing|сайт\\p{L}*|маркетинг\\p{L}*|маркетингов\\p{L}*|менеджер\\p{L}*|звонк\\p{L}*|воронк\\p{L}* (?:от|после) взрыв\\p{L}*|кухонн\\p{L}*|бутылк\\p{L}*|торнадо|смерч\\p{L}*|водоворот\\p{L}*|кофе\\p{L}*|пролить|налить)'+E);
// Strong game wording that wins over a marketing word («воронка туториала для игроков с лендинга» is still ours).
const STRONG=re('туториал\\p{L}*|tutorial|онбординг\\p{L}*|onboarding|'+W+'ftue'+E+'|событи\\p{L}* игр\\p{L}*|игров\\p{L}* событи\\p{L}*|appmetrica|аппметрик\\p{L}*');
// «Где отваливаются игроки на онбординге», «на каком шаге туториала уходят».
const DROPOFF=re('(?:где|на каком (?:шаге|этапе)|на каких (?:шагах|этапах)|какой шаг)\\s+(?:\\p{L}+\\s+){0,3}?(?:отваливают\\p{L}*|отваливает\\p{L}*|отпада\\p{L}*|теря\\p{L}*|уход\\p{L}*|уходят|броса\\p{L}*|застрева\\p{L}*|дропа\\p{L}*)'+
 '|(?:отвал\\p{L}*|дроп\\p{L}*|drop[- ]?off|конверси\\p{L}*)\\s+(?:\\p{L}+\\s+){0,2}?(?:по шагам|на шагах|шагов|в|на|по)\\s+(?:\\p{L}+\\s+)?(?:туториал|онбординг|обучени|ftue)\\p{L}*');
const DROPOFF_SUBJECT=re('туториал\\p{L}*|tutorial|обучени\\p{L}*|онбординг\\p{L}*|onboarding|'+W+'ftue'+E+'|перв\\p{L}* сесси\\p{L}*');
// A drop-off question that names the flow it is about (for offers: «где мы теряем время» is not a funnel).
const DROPOFF_ABOUT=new RegExp('^(?=[\\s\\S]*(?:'+DROPOFF_SUBJECT.source+'))[\\s\\S]*(?:'+DROPOFF.source+')','iu');
const DEFINITION=/^(?:а\s+)?(?:что такое|что значит|что означает|зачем нуж\p{L}*|как (?:строить|построить|правильно строить|читать|считается)|объясни,? что такое)\s/iu;
const LIST=re('(?:мои|сохранённ\\p{L}*|сохраненн\\p{L}*|какие у (?:нас|меня))\\s+воронк\\p{L}*|список воронок');
const REQUEST=re('покажи|построй|сделай|посчитай|собери|нарисуй|какая|какой|сколько|где|давай');

function steps(text){
 const t=String(text||'');
 // «воронка: a → b → c», «воронка из событий a, b, c», «шаги: a > b > c».
 const m=/(?:воронк\p{L}*|funnel|шаг\p{L}*)\s*(?:из\s+событий|по\s+событиям|событий)?\s*[:—]\s*(.+)$/iu.exec(t)||/(?:из|по)\s+событи\p{L}*\s+(.+)$/iu.exec(t);
 if(!m)return null;
 const parts=m[1].split(/\s*(?:→|->|=>|⟶|>|,|;|\s+-\s+|\s+—\s+|\s+затем\s+|\s+потом\s+)\s*/u).map(x=>x.trim().replace(/^[«"'`]+|[»"'`.!?]+$/gu,'')).filter(Boolean);
 const ok=parts.filter(x=>/^[\p{L}\p{N}_.:$-][\p{L}\p{N}_.:$ -]{0,79}$/u.test(x));
 return ok.length>=2&&ok.length===parts.length?[...new Set(ok)].slice(0,10):null;
}
function preset(text){
 const t=String(text||'');
 if(re('(?:до|к|в)\\s+(?:перв\\p{L}*\\s+)?(?:покупк|платеж|платёж|оплат|депозит)\\p{L}*|(?:установк\\p{L}*|install)\\s*(?:→|->|-|—)\\s*(?:перв\\p{L}*\\s+)?покупк').test(t))return 'purchase';
 if(re('онбординг\\p{L}*|onboarding|'+W+'ftue'+E+'|перв\\p{L}* сесси\\p{L}*').test(t))return 'onboarding';
 if(re('туториал\\p{L}*|tutorial|обучени\\p{L}*').test(t))return 'tutorial';
 return null;
}
function segment(text){
 const t=String(text||'');
 if(re('по платформ\\p{L}*|платформ\\p{L}* (?:сравни|сравнение)|android\\s+(?:и|vs|против)\\s+ios|ios\\s+(?:и|vs|против)\\s+android|андроид\\p{L}*\\s+(?:и|против)\\s+(?:ios|айос\\p{L}*)').test(t))return 'platform';
 if(re('по стран\\p{L}*|стран\\p{L}* сравни|по гео'+E).test(t))return 'country';
 if(re('по верси\\p{L}*|по билд\\p{L}*|по релиз\\p{L}*').test(t))return 'version';
 return null;
}
function days(text){
 const t=String(text||'').toLowerCase();
 const n=t.match(/за\s+(?:последние\s+)?(\d{1,3})\s*(дн|день|дня|сут|недел|месяц)/u);
 if(n){const v=Math.max(1,Number(n[1]));return Math.min(92,n[2]==='недел'?v*7:n[2]==='месяц'?v*30:v);}
 if(/вчера/u.test(t))return 1;
 if(/за\s+(?:эту\s+|прошлую\s+)?неделю/u.test(t))return 7;
 if(/(?:две|2)\s+недел/u.test(t))return 14;
 if(/квартал/u.test(t))return 90;
 return 30;
}
// The quoted or trailing name of a saved funnel: «воронка «Магазин»», «покажи воронку магазин».
function name(text){
 const q=/воронк\p{L}*\s+[«"]([^»"]{1,60})[»"]/iu.exec(text);if(q)return q[1].trim();
 const m=/воронк\p{L}*\s+([\p{L}\p{N}][\p{L}\p{N} _-]{0,40})$/iu.exec(String(text||'').trim());
 return m?m[1].replace(/\s+(?:за|по|на)\s.*$/iu,'').trim():'';
}

// 'funnel' | 'list' | 'ask' (a bare «покажи воронку») | null
function about(text,{saved=[]}={}){
 const t=String(text||'').trim();
 if(!t||t.length>600||DEFINITION.test(t))return null;
 if(LIST.test(t))return 'list';
 const funnel=FUNNEL.test(t),explicit=!!steps(t),strong=STRONG.test(t);
 if(MARKETING.test(t)&&!strong&&!explicit)return null;
 if(DROPOFF.test(t)&&DROPOFF_SUBJECT.test(t))return 'funnel';
 if(!funnel)return null;
 if(explicit||GAME.test(t))return 'funnel';
 const n=name(t).toLowerCase();
 if(n&&saved.some(f=>f.name.toLowerCase()===n))return 'funnel';
 return REQUEST.test(t)?'ask':null;
}
function parse(text){
 return {preset:preset(text),steps:steps(text),segment:segment(text),days:days(text),name:name(text)};
}
module.exports={about,parse,steps,preset,segment,days,name,FUNNEL,GAME,MARKETING,DROPOFF,DROPOFF_ABOUT};
