// «Патчноуты»: player-facing notes of a release from its real changes — Jira issues of a version or sprint, commits
// between two tags of the project's git repository and merged pull requests on GitHub. Internal changes are left
// out by labels / components / commit types from the settings (shown, can be switched back on). The local model
// writes the notes per language and tone; every line cites the changes it describes (shown on hover), so nothing
// invented gets in. Texts are cut to each store's limit; the team gets a separate changelog. Read-only: copying and
// sending to a channel happen from the card (the channel's own flow confirms).
//
// Boundary with the skill library: «release-notes», «patch-notes-players» and «changelog-from-commits» shape a
// free answer from text the user gives in the message («напиши патчноут: исправили …, добавили …»). This app
// answers when the request points at a source of changes (a version, a sprint, two tags) and lists none itself;
// a request with the changes written inline is left to the skills.
const kit=require('../app-kit.cjs');
const {ask}=require('../../input-required.cjs');
const sources=require('./sources.cjs');
const notes=require('./notes.cjs');
const langs=require('../localization/langs.cjs');
const {randomUUID}=require('node:crypto');
const ID='patch-notes',BY='Патчноуты';

// --- Routing -------------------------------------------------------------------------------------------------
// Neighbours: meeting notes («заметки встречи», meetings), news in Slack («что нового в Slack»), translation keys
// (localization), build size, store reviews.
const TOPIC=/патч[- ]?ноу?т\p{L}*|patch[- ]?notes?|ч[еэ]йнджлог\p{L}*|ч[еэ]нджлог\p{L}*|changelog|release[- ]?notes?|релиз[- ]?ноу?т\p{L}*|что\s+нового\s+(?:для\s+(?:стор|игрок|app\s*store|google\s*play|апп?\s*стор|плей)|в\s+(?:верси|релиз|обновлени|сборк)\p{L}*|(?:в\s+)?v?\d+\.\d+)|анонс\p{L}*\s+(?:обновлени|апдейт|верси|релиз)\p{L}*|(?:текст|описани\p{L}*)\s+(?:обновлени|апдейт)\p{L}*\s+(?:для|в)\s+(?:стор|игрок|app\s*store|google\s*play)|список\s+изменений\s+(?:верси|релиз|между|к\s+верси|для\s+игрок)|what'?s\s+new/iu;
const AVOID=/заметк\p{L}*\s+(?:встреч|созвон)|сводк\p{L}*\s+встреч|что\s+нового\s+в\s+(?:slack|слак|чат|канал|почт|telegram|телеграм|jira|джир)|^\s*\/|^(?:а\s+)?(?:что\s+такое|как\s+(?:написать|писать|оформить))|(?:сделай|создай|придумай)\s+скилл/iu;
// The changes written in the message itself («…: исправили зависание, добавили ивент») are the skills' job.
const INLINE=/:\s*\S[^:\n]{6,}(?:[,;\n•-]\s*\S[^,;\n]{3,}){1,}/u;
function intent(text){
 const t=String(text||'').trim();
 if(!t||t.length>500||AVOID.test(t)||!TOPIC.test(t))return false;
 if(INLINE.test(t.replace(/v?\d+(?:\.\d+)+/g,'V')))return false;
 return true;
}
// The tab the request is about.
function destination(text){
 const t=String(text||'');
 if(/google\s*play|плей\s*маркет|гугл\s*пле/iu.test(t))return 'play';
 if(/app\s*store|апп?\s*стор|эпп?\s*стор/iu.test(t))return 'appstore';
 if(/discord|дискорд|telegram|телеграм|анонс|игрок|сообществ|канал/iu.test(t))return 'post';
 if(/ч[еэ]й?нджлог|changelog|release[- ]?notes?|релиз[- ]?нот|для\s+команд|внутренн/iu.test(t))return 'internal';
 return 'appstore';
}

// --- Building a card -------------------------------------------------------------------------------------------
async function notesFor(s,items,{languages,tone,version}){
 const out={},warnings=[];let model=false;
 for(const lang of languages){
  s.requestProgress?.report?.('Пишу патчноут: '+langs.name(lang));
  let note=null;
  try{note=await notes.generate(s,{items,lang,tone,version});}catch(e){if(e.name==='AbortError'||/Модель изменилась/.test(e.message))throw e;note=null;}
  if(note){out[lang]=note;model=model||note.model;continue;}
  if(!s.settings.model){
   // Without a model: the changes' own titles, once, without translation.
   if(!Object.keys(out).length)out[lang]=notes.plain(items);
   warnings.push('Без локальной модели — заголовки изменений как есть, без перевода'+(languages.length>1?'; другие языки появятся с моделью':'')+'.');
   break;
  }
  warnings.push(langs.name(lang)+': модель не дала строк со ссылками на изменения — язык пропущен.');
 }
 return {notes:out,warnings:[...new Set(warnings)],model};
}
function title(version,range,label){
 if(range?.toName)return 'Версия '+String(range.toName).replace(/^v/i,'');
 if(version)return 'Версия '+String(version).replace(/^v/i,'');
 return label||'Обновление';
}
async function build(s,command,have){
 s.requestProgress?.report?.('Собираю изменения');
 const r=sources.refs(command);
 const got=await sources.collect(s,command,have);
 const version=r.versions.length?[...r.versions].sort(sources.compareVersions).at(-1):'';
 const name=title(version,got.range,got.sources[0]?.split(' · ')[1]);
 if(!got.items.length){
  const why=got.notes.length?' '+got.notes.join(' '):'';
  return kit.reply(s,command,{by:BY,error:!!got.notes.length,text:'Изменений для «'+name+'» не нашёл.'+why});
 }
 const languages=notes.languages(command,s.settings),tone=notes.tone(command,s.settings);
 const made=await notesFor(s,got.items,{languages,tone,version:name});
 const card={id:randomUUID(),title:name,version,sources:got.sources,range:got.range?{from:got.range.from,to:got.range.to}:null,items:got.items,languages:Object.keys(made.notes),requested:languages,tone,
  notes:made.notes,model:made.model,warnings:[...got.notes,...made.warnings],chosen:got.items.filter(i=>i.include).map(i=>i.id),dest:destination(command),limits:Object.fromEntries(Object.entries(notes.DESTS).map(([k,v])=>[k,v.limit]))};
 card.texts=notes.texts(card.notes,{chosen:card.chosen,title:name});card.internal=notes.changelog(card.items,{title:name,chosen:card.chosen});
 return kit.reply(s,command,{by:BY,text:summary(card),data:{patchNotes:card}});
}
function summary(c){
 const used=c.items.filter(i=>i.include).length,inner=c.items.filter(i=>i.internal).length,undone=c.items.filter(i=>!i.internal&&!i.done).length;
 const parts=[c.title+': '+used+' '+kit.plural(used,['изменение','изменения','изменений'])+' для игроков из '+c.sources.join(', ')+'.'];
 if(inner)parts.push('Внутренних — '+inner+', они только в чейнджлоге.');
 if(undone)parts.push('Не готово — '+undone+', в патчноут не вошли.');
 const first=c.languages[0];
 if(first){const play=c.texts[first].play;parts.push('Языки: '+c.languages.join(', ')+'. Google Play ('+first+'): '+play.count+' из '+play.limit+' символов'+(play.dropped?', не вошло строк: '+play.dropped:'')+'.');}
 if(c.warnings.length)parts.push(c.warnings.join(' '));
 return parts.join(' ');
}
async function run(s,command){
 const have=await sources.available(s);
 if(!have.jira&&!have.git&&!have.github)return kit.reply(s,command,{by:BY,question:true,text:'Патчноут собирается из реальных изменений: подключите Jira («Подключения → Jira»), откройте проект с git-репозиторием или добавьте «GitHub» с токеном. Потом повторите запрос.'});
 const r=sources.refs(command);
 if(!r.versions.length&&!r.sprint){
  // Which release: versions from Jira and tags from git, newest first.
  const options=[];
  try{if(have.jira)for(const v of (await sources.jiraVersions(s)).slice(0,3))options.push('версия '+v.name);}catch{/* no options from Jira */}
  try{const tags=have.git?await sources.localTags(s,have.git):have.github?await sources.githubTags(s,have.github):[];const list=tags.filter(t=>/\d+\.\d+/.test(t)).sort((a,b)=>sources.compareVersions(b,a));if(list[1])options.push('между '+list[1]+' и '+list[0]);}catch{/* no options from git */}
  return ask({text:'К какой версии писать патчноут? Назовите версию, спринт или два тега («между v1.4 и v1.5»).',label:'Версия',placeholder:'1.5',options:[...new Set(options)].slice(0,4)},answer=>{
   const a=String(answer||'').trim();
   if(!sources.refs(a).versions.length&&!sources.refs(a).sprint)return kit.reply(s,command,{by:BY,question:true,text:'Не понял версию: нужен номер вроде 1.5, «спринт 12» или «между v1.4 и v1.5». Повторите запрос с ним.'});
   return guard(s,command,()=>build(s,command+' '+a,have));
  });
 }
 return build(s,command,have);
}
async function guard(s,command,work){try{return await work();}catch(e){if(e.name==='InputRequired'||e.name==='AbortError')throw e;return kit.failure(s,command,BY,e);}}
async function turn(s,command){
 const text=String(command||'');
 if(!intent(text)||!kit.installed(s,ID))return null;
 return guard(s,text,()=>run(s,text));
}

// --- Card calls: re-compose after toggles, regenerate in another tone ------------------------------------------------------
function setup(s){
 const busy=new Set();
 function locate(id){
  for(const topic of s.dialogue.state?.topics||[])for(const message of topic.messages||[]){const card=message.extensionData?.patchNotes;if(card?.id===id)return card;}
  throw Error('Патчноут устарел или удалён. Повторите запрос в чате.');
 }
 const clean=(card,chosen)=>[...new Set((Array.isArray(chosen)?chosen:card.chosen).map(String).filter(id=>card.items.some(i=>i.id===id)))];
 const refresh=card=>{card.texts=notes.texts(card.notes,{chosen:card.chosen,title:card.title});card.internal=notes.changelog(card.items,{title:card.title,chosen:card.chosen});};
 // Toggles in the card: lines about switched-off changes go and the limits are recounted, without the model.
 // A change switched on that the texts do not mention yet needs «Перегенерировать».
 function compose({id,chosen}={}){
  const card=locate(String(id||''));card.chosen=clean(card,chosen);refresh(card);
  s.dialogue.persist();return {texts:card.texts,internal:card.internal,chosen:card.chosen};
 }
 // «Перегенерировать в другом тоне»: the chosen changes, new texts from the model.
 async function regenerate({id,tone,chosen}={}){
  const card=locate(String(id||''));
  if(!s.settings.model)throw Error('Чтобы переписать текст, выберите локальную модель в настройках.');
  if(busy.has(card.id))throw Error('Уже переписываю этот патчноут.');
  card.chosen=clean(card,chosen);
  const set=new Set(card.chosen),items=card.items.map(i=>({...i,include:set.has(i.id)})),next=notes.TONES.includes(tone)?tone:card.tone;
  busy.add(card.id);
  try{
   const made=await notesFor(s,items,{languages:card.requested||card.languages,tone:next,version:card.title});
   if(!Object.keys(made.notes).length)throw Error('Модель не дала строк со ссылками на изменения. Попробуйте ещё раз.');
   Object.assign(card,{notes:made.notes,languages:Object.keys(made.notes),tone:next,model:made.model,warnings:made.warnings});
   refresh(card);s.dialogue.persist();return card;
  }finally{busy.delete(card.id);}
 }
 return {ipc:{compose,regenerate}};
}
function validate(next){
 for(const key of ['patchNotesInternalLabels','patchNotesInternalComponents'])if(next[key]!==undefined&&(typeof next[key]!=='string'||next[key].length>600))throw Error('Список меток или компонентов слишком длинный.');
 if(next.patchNotesLanguages!==undefined){const list=String(next.patchNotesLanguages).split(/[,;\s]+/).filter(Boolean);if(!list.length||list.length>8||list.some(x=>!langs.code(x)))throw Error('Языки патчноута — коды через запятую, например: ru, en, de.');}
 if(next.patchNotesTone!==undefined&&!notes.TONES.includes(next.patchNotesTone))throw Error('Неизвестный тон патчноута.');
}
module.exports={name:'patchNotes',defaults:{['extension_'+ID]:'false',patchNotesInternalLabels:sources.DEFAULT_LABELS,patchNotesInternalComponents:'',patchNotesLanguages:'ru, en',patchNotesTone:'дружелюбный'},validate,setup,turn,intent,destination,summary};
