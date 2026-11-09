// «Проверка тона», the rules: what in a draft may read as harsh, passive-aggressive, an ultimatum, shouting or
// unclear for its audience — found by code, with exact spans, so a finding always points at real words of the
// draft. Suggestions here are only the mechanical ones (lower-casing shouted words, one «!» instead of «!!!»,
// a few fixed phrases); softer wording for the rest comes from the local model (soften.cjs), checked there.
// Spelling is not checked: it is a separate job (docs/apps/tone-check.md).
const LEVELS={low:1,medium:2,high:3};
// Upper-case words that are names, not shouting.
const ACRONYMS=new Set(['API','SDK','ANR','CI','CD','QA','PR','MR','URL','JSON','HTTP','HTTPS','APK','AAB','IPA','UI','UX','SLA','ETA','ASAP','FYI','OK','VIP','CPU','GPU','RAM','SSD','HDD','iOS','AWS','GCP','SQL','CSV','PDF','PNG','JPG','DAU','MAU','ARPU','LTV','CTR','ROI','KPI','OKR','HR','PM','CEO','CTO','DM','UTC','MSK','GMT','EU','USA','UK','RU','EN','DE','FR','ES','IT','JP','CN','TV','PC','NPC','PVP','PVE','XP','HP','MP','FPS','RPG','MMO','DLC','LOL','IDE','VPN','DNS','IP','ID','TODO','README','NB','AB','A/B','РФ','США','ООО','ИП','ЗП','ТЗ','ДР','НДС','МСК','СНГ','ЕС','ВКонтакте','ВК']);
const W='(?<![\\p{L}\\p{N}])',E='(?![\\p{L}\\p{N}])';
const rx=(source,flags='giu')=>new RegExp(source,flags);
// [kind, minimal sensitivity, severity, pattern, message, fixed replacement?]
const PHRASES=[
 // Ultimatums and threats.
 ['ultimatum',1,'problem',rx(W+'(?:в\\s+)?последний\\s+раз(?:\\s+(?:говорю|прошу|напоминаю|повторяю|пишу))?'+E),'Звучит как ультиматум.'],
 ['ultimatum',1,'problem',rx(W+'иначе(?!\\s+говоря)\\s+(?:я\\s+|мы\\s+)?\\p{L}+'+E),'Угроза последствиями: так просьбу воспринимают как ультиматум.'],
 ['ultimatum',1,'problem',rx(W+'если\\s+(?:до|к)\\s+[^,.!?\\n]{1,30}?\\s+не\\s+[^,.!?\\n]{1,40},\\s*(?:то\\s+)?(?:будем|будут|придётся|придется|откат\\p{L}*|уволю|эскалир\\p{L}*|пойду|лишу|лишим)'+E),'Условие с последствиями звучит как ультиматум: лучше объяснить, почему важен срок.'],
 ['ultimatum',1,'problem',rx(W+'(?:это\\s+)?не\\s+обсуждается'+E+'|'+W+'без\\s+вариантов'+E+'|'+W+'это\\s+не\\s+просьба'+E),'Не оставляет места для ответа — звучит как ультиматум.'],
 ['ultimatum',1,'problem',rx(W+'немедленно'+E+'|'+W+'сию\\s+(?:же\\s+)?минуту'+E),'Требование «немедленно» звучит как приказ; лучше назвать срок и причину.'],
 ['ultimatum',1,'problem',rx(W+'(?:or\\s+else|last\\s+warning|final\\s+warning|this\\s+is\\s+not\\s+a\\s+request|non-negotiable)'+E),'Reads as an ultimatum.'],
 // Harsh words.
 ['harsh',1,'problem',rx(W+'(?:бред\\p{L}*|ерунд\\p{L}*|чушь|идиот\\p{L}*|дебил\\p{L}*|туп(?:ой|ая|ое|ые|ого|ым|ость|ит|ите|о)|криворук\\p{L}*|халтур\\p{L}*|позор\\p{L}*|накосячил\\p{L}*|руки\\s+(?:бы\\s+)?оторвать)'+E),'Резкое слово: читатель услышит оценку себя, а не задачи.'],
 ['harsh',1,'problem',rx(W+'(?:кто|какой\\s+\\p{L}+)\\s+(?:это|так)\\s+(?:сделал|написал|сломал|придумал)'+E),'Поиск виноватого вместо описания проблемы.'],
 ['harsh',1,'problem',rx(W+'(?:вы|ты)\\s+(?:вообще|опять|снова)\\s+(?:не\\s+\\p{L}+|ничего\\s+не\\s+\\p{L}+)'+E+'|'+W+'опять\\s+(?:всё\\s+|все\\s+)?(?:сломали|сломал|сломала|накосячили|забыли)'+E),'Обобщение «вы опять…» звучит как обвинение.'],
 ['harsh',2,'warning',rx(W+'(?:отвратительн\\p{L}*|ужасн\\p{L}*|кошмарн\\p{L}*|бесполезн\\p{L}*)'+E),'Сильная оценка — лучше описать, что именно не так.'],
 ['harsh',1,'problem',rx(W+'(?:stupid|idiot\\w*|nonsense|garbage|useless|who\\s+broke\\s+this)'+E),'Harsh wording: it reads as a judgement of the person.'],
 // Passive aggression.
 ['passive',2,'warning',rx(W+'как\\s+я\\s+(?:уже\\s+)?(?:говорил|писал|сказал|объяснял|просил|упоминал)\\p{L}*'+E),'«Как я уже писал / говорил» звучит как упрёк.','напомню'],
 ['passive',2,'warning',rx(W+'повторяю\\s+(?:ещё|еще)\\s+раз'+E+'|'+W+'(?:ещё|еще)\\s+раз\\s+повторю'+E),'Подчёркнутый повтор звучит раздражённо.','напомню'],
 ['passive',2,'warning',rx(W+'(?:в\\s+который|в\\s+очередной|в\\s+сотый)\\s+раз'+E),'Подсчёт повторов звучит как упрёк.'],
 ['passive',2,'warning',rx(W+'неужели\\s+(?:это\\s+)?(?:так\\s+)?(?:сложно|трудно)'+E+'|'+W+'не\\s+так\\s+уж\\s+(?:и\\s+)?сложно'+E),'Риторический вопрос звучит снисходительно.'],
 ['passive',2,'warning',rx(W+'(?:очевидно\\s+же|для\\s+особо\\s+(?:одарённых|одаренных)|ну\\s+(?:вы|ты)\\s+(?:же|ведь)\\s+понимае\\p{L}+|как\\s+бы\\s+намекаю)'+E),'Звучит снисходительно.'],
 ['passive',2,'warning',rx(W+'спасибо\\s+заранее,?\\s+что\\s+(?:наконец|всё-таки|все-таки)'+E),'Благодарность с упрёком читается как сарказм.'],
 ['passive',2,'warning',rx(W+'(?:as\\s+I\\s+(?:already\\s+)?(?:said|mentioned|wrote)|per\\s+my\\s+last\\s+(?:email|message))'+E),'Reads as a reproach.','to recap'],
 // Context the audience may not have.
 ['context',2,'info',rx(W+'(?:как\\s+(?:и\\s+)?(?:договорились|договаривались|обсуждали|обычно)|см\\.?\\s+выше|тот\\s+(?:самый\\s+)?(?:баг|тикет|вопрос|момент|файл)|эт(?:у|от|а|о)\\s+(?:штук\\p{L}*|проблем\\p{L}*\\s+снова)|вчерашн\\p{L}*\\s+(?:баг|проблем\\p{L}*|вопрос|созвон)|ну\\s+(?:ты|вы)\\s+понял\\p{L}*|сам\\p{L}*\\s+знаете?|as\\s+discussed)'+E),'Читатели могут не знать, о чём речь: добавьте ссылку или пару слов контекста.']
];

const lettersOf=s=>(String(s).match(/\p{L}/gu)||[]).length;
const sentenceStart=(text,i)=>/(^|[.!?\n]\s*)$/u.test(text.slice(0,i));
// A shouted run, written normally: lower case (the first letter capital at a sentence start), names kept.
function calm(run,atStart){
 let first=true;
 return run.replace(/\p{L}[\p{L}\p{N}/]*/gu,word=>{
  const keep=ACRONYMS.has(word);
  const out=keep?word:word.toLocaleLowerCase('ru');
  const result=first&&atStart&&!keep?out.charAt(0).toLocaleUpperCase('ru')+out.slice(1):out;
  first=false;return result;
 });
}

function caps(text,level){
 const out=[];
 for(const m of text.matchAll(/(?<![\p{L}\p{N}])\p{Lu}[\p{Lu}\p{N}/]*(?:[ \t,.!?:;—-]+\p{Lu}[\p{Lu}\p{N}/]*)*(?![\p{L}\p{N}])/gu)){
  const words=m[0].match(/\p{L}[\p{L}\p{N}/]*/gu)||[];
  const shouted=words.filter(w=>lettersOf(w)>=2&&!ACRONYMS.has(w)&&w===w.toLocaleUpperCase('ru')&&w!==w.toLocaleLowerCase('ru'));
  if(!shouted.length)continue;
  // Trim punctuation and acronyms at the edges of the run.
  let run=m[0].replace(/[ \t,.!?:;—-]+$/u,''),start=m.index;
  const long=shouted.some(w=>lettersOf(w)>=4);
  if(shouted.length>=2?level>=1:long&&level>=2){
   out.push({kind:'caps',severity:shouted.length>=3?'problem':'warning',span:{start,end:start+run.length,text:run},message:'Заглавные буквы читаются как крик.',suggestion:calm(run,sentenceStart(text,start))});
  }
 }
 return out;
}
function punctuation(text,level){
 if(level<2)return [];
 const out=[];
 for(const m of text.matchAll(/[!?]*(?:!{2,}|\?{2,}|\?!|!\?)[!?]*/gu))out.push({kind:'punctuation',severity:'info',span:{start:m.index,end:m.index+m[0].length,text:m[0]},message:'Несколько «!» или «?» подряд усиливают напор.',suggestion:m[0].includes('?')?'?':'!'});
 return out;
}
function phrases(text,level,audience){
 const out=[];
 for(const [kind,min,severity,pattern,message,fixed] of PHRASES){
  if(level<min)continue;
  // Missing context matters most for people outside the conversation; for a colleague in a DM only at «high».
  if(kind==='context'&&audience!=='public'&&audience!=='customer'&&level<3)continue;
  pattern.lastIndex=0;
  for(const m of text.matchAll(pattern)){
   const span={start:m.index,end:m.index+m[0].length,text:m[0]};
   let suggestion;
   if(fixed!==undefined)suggestion=sentenceStart(text,m.index)?fixed.charAt(0).toLocaleUpperCase('ru')+fixed.slice(1):fixed;
   out.push({kind,severity,span,message,...suggestion!==undefined?{suggestion}:{}});
  }
 }
 return out;
}
// Whole-message remarks for the audience: everyone pinged, internal task keys to players, a bare one-liner.
function audienceNotes(text,level,audience){
 const out=[];
 if(level>=2&&(audience==='public'||audience==='team'))for(const m of text.matchAll(/(?<![\p{L}\p{N}])@(?:channel|here|everyone)(?![\p{L}\p{N}])/gu))
  out.push({kind:'context',severity:'info',span:{start:m.index,end:m.index+m[0].length,text:m[0]},message:'Такое упоминание придёт уведомлением всем в канале — нужно ли это?'});
 if(level>=2&&audience==='customer')for(const m of text.matchAll(/(?<![\p{L}\p{N}-])[A-Z][A-Z0-9]+-\d+(?![\p{L}\p{N}])/gu))
  out.push({kind:'context',severity:'info',span:{start:m.index,end:m.index+m[0].length,text:m[0]},message:'Внутренний номер задачи ничего не скажет получателю.'});
 const words=(text.match(/\p{L}+/gu)||[]).length;
 if(level>=3&&audience==='public'&&words>0&&words<3)out.push({kind:'unclear',severity:'info',span:null,message:'Очень коротко для канала: читателям может быть непонятно, о чём речь.'});
 if(level>=3)for(const m of text.matchAll(/[^.!?\n]+/gu)){const n=(m[0].match(/\p{L}+/gu)||[]).length;if(n>45)out.push({kind:'unclear',severity:'info',span:{start:m.index,end:m.index+m[0].length,text:m[0]},message:'Длинное предложение — проще читать, если разбить. Слов: '+n});}
 return out;
}

// All findings for a draft, by place in the text; overlapping ones keep the more serious.
function findings(text,{sensitivity='medium',audience='team'}={}){
 text=String(text||'');
 const level=LEVELS[sensitivity]||2;
 const all=[...caps(text,level),...punctuation(text,level),...phrases(text,level,audience),...audienceNotes(text,level,audience)];
 const rank={problem:3,warning:2,info:1};
 all.sort((a,b)=>(a.span?a.span.start:Infinity)-(b.span?b.span.start:Infinity)||rank[b.severity]-rank[a.severity]);
 const kept=[];
 for(const f of all){
  const clash=f.span&&kept.find(k=>k.span&&f.span.start<k.span.end&&k.span.start<f.span.end);
  if(clash){if(rank[f.severity]>rank[clash.severity])kept.splice(kept.indexOf(clash),1,f);continue;}
  kept.push(f);
 }
 return kept;
}
module.exports={findings,calm,LEVELS,ACRONYMS};
