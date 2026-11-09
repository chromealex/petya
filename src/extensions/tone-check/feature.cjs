// «Проверка тона»: before Petya sends a message on your behalf (Slack, Discord, replies to reviews and support
// tickets, mail drafts, PR comments), the confirmation shows what may read as harsh, passive-aggressive, shouted,
// an ultimatum or unclear for that audience, with softer variants (check.cjs, an outgoing check). In the chat:
// «как это звучит: …», «смягчи сообщение: …». Spans are found by code; softer wording comes from the local model
// and is kept only when it keeps the facts and the language (soften.cjs). Nothing is sent or changed by itself.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const {review,SERVICES}=require('./review.cjs');
const {LEVELS}=require('./rules.cjs');
const ID='tone-check',BY='Проверка тона';

const clean=s=>String(s||'').trim().replace(/^петя[\s,:.!?—-]*/iu,'').trim();
// Voice, sound, colour, «тонкий», reviews' sentiment and spelling are not this app.
const NOT=/голос|озвуч|реч[ьи]|интонаци|мелоди|звонок|рингтон|музык|тонк|тональност\p{L}*\s+отзыв|отзыв|оттен|цвет|орфограф|опечат|грамматик|пунктуац/iu;
const PATTERNS=[
 ['check',/^как\s+(?:это|оно|такое|мо[её]|наше)?\s*(?:сообщение|письмо|ответ|текст)?\s*звучит(?:\s+(?:со\s+стороны|для\s+\p{L}+))?\s*(?:[:—-]\s*|\?\s*|\s+)?([\s\S]*)$/iu],
 ['check',/^(?:проверь|оцени|посмотри)\s+тон(?![\p{L}])(?:\s+(?:сообщения|текста|письма|ответа|поста))?\s*(?:[:—-]\s*|\s+)?([\s\S]*)$/iu],
 ['check',/^не\s+слишком\s+(?:ли\s+)?(?:резко|грубо|жёстко|жестко)(?:\s+звучит)?\s*(?:[:—?-]\s*|\s+)?([\s\S]*)$/iu],
 ['soften',/^(?:смягчи|сделай\s+(?:помягче|мягче|вежливее)|перепиши\s+(?:помягче|мягче|вежливее|спокойнее))(?:\s+(?:это|мо[её]|такое))?(?:\s+(?:сообщение|текст|письмо|ответ|формулировку|пост))?\s*(?:[:—-]\s*|\s+)?([\s\S]*)$/iu]
];
// The request: {mode:'check'|'soften', text, audience} or null when it is not about the tone of a message.
function parse(command){
 const c=clean(command);
 for(const [mode,re] of PATTERNS){
  const m=re.exec(c);if(!m)continue;
  let head=c.slice(0,c.length-m[1].length),rest=m[1];
  // «проверь тон ответа игроку: …» — a few words before «:» still belong to the request.
  const lead=/^([^:—\n«"“„?]{1,40}?)\s*[:—\n]\s*([\s\S]+)$/u.exec(rest);
  if(lead&&!/[:—\n?-]\s*$/u.test(head)){head+=lead[1]+': ';rest=lead[2];}
  // With «:», a dash, quotes or a new line the rest is the message; without them it is part of the request.
  const separated=/[:—\n?-]\s*$/u.test(head)||/^\s*[«"“„']/u.test(rest);
  if(NOT.test(separated?head:c))return null;
  // «смягчи свет», «смягчи условия»: softening is about a message only when it is named or set off.
  if(mode==='soften'&&!separated&&!/сообщени|текст|письм|ответ|формулировк|пост/iu.test(head))return null;
  let text=rest.trim().replace(/^[«"“„']([\s\S]*)[»"”“'][?]?$/u,'$1').trim();
  // «как это звучит?» without a message: ask for it; a bare word after the verb is not a message either.
  const audience=/(?:в\s+(?:общ\p{L}*|публичн\p{L}*)\s+канал|для\s+(?:всех|канала|сообщества))/iu.test(head)?'public':/(?:клиент|игрок|пользовател)/iu.test(head)?'customer':/(?:в\s+личк|лично|в\s+личн)/iu.test(head)?'direct':'team';
  return {mode,text,audience};
 }
 return null;
}

const plural=kit.plural;
function summary(r,mode){
 const serious=r.findings.filter(f=>f.severity!=='info').length;
 if(mode==='soften'){
  if(r.rewrite)return 'Мягче: '+r.rewrite;
  if(!r.findings.length)return 'Сообщение и так звучит спокойно — менять нечего.';
  return r.model?'Отметил, что смягчить; целиком переписать не получилось — примените варианты в карточке.':'Отметил, что смягчить. Для переписанного целиком варианта выберите локальную модель в настройках.';
 }
 if(!r.findings.length)return 'Звучит спокойно и понятно — замечаний нет.';
 const kinds=[...new Set(r.findings.map(f=>({caps:'капслок',punctuation:'много «!»',ultimatum:'ультиматум',harsh:'резкие слова',passive:'пассивная агрессия',context:'не хватает контекста',unclear:'неясно'})[f.kind]).filter(Boolean))];
 return (serious?'Может прозвучать резко: ':'Есть мелочи: ')+kinds.join(', ')+' — '+r.findings.length+' '+plural(r.findings.length,['замечание','замечания','замечаний'])+'.';
}

async function run(s,command,want){
 s.requestProgress?.report?.(want.mode==='soften'?'Смягчаю сообщение':'Проверяю тон');
 const r=await review(s,{text:want.text,audience:want.audience},{rewrite:want.mode==='soften',budget:want.mode==='soften'?20000:8000});
 const card={mode:want.mode,text:want.text,audience:want.audience,language:r.language,sensitivity:r.sensitivity,findings:r.findings,rewrite:r.rewrite,model:r.model};
 return kit.reply(s,command,{by:BY,text:summary(r,want.mode),data:{toneCard:card}});
}

async function turn(s,command){
 const want=parse(command);
 if(!want||!kit.installed(s,ID))return null;
 if(!want.text||want.text.length<2)return ask({text:want.mode==='soften'?'Какое сообщение смягчить? Вставьте текст.':'Какое сообщение проверить? Вставьте текст.',label:'Текст сообщения',placeholder:'Текст, который хотите отправить'},answer=>{
  const text=String(answer||'').trim();
  return run(s,command,{...want,text});
 });
 return run(s,command,want);
}

function validate(next){
 if(next.toneCheckSensitivity!==undefined&&!LEVELS[next.toneCheckSensitivity])throw Error('Некорректная чувствительность проверки тона.');
 if(next.toneCheckChannels!==undefined&&String(next.toneCheckChannels).split(',').map(x=>x.trim()).filter(x=>x&&x!=='none').some(x=>!SERVICES.includes(x)))throw Error('Некорректный список каналов проверки тона.');
}
module.exports={name:'toneCheck',defaults:{['extension_'+ID]:'false',toneCheckSensitivity:'medium',toneCheckChannels:SERVICES.join(',')},validate,setup(){return {};},turn,parse,summary,
 // The quoted message may name other apps' subjects; an explicit tone request is ours first (extension-ui.cjs).
 claims:command=>!!parse(command)};
