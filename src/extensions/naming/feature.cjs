// «Нейминг»: names for heroes, items, features, events and games. The model only proposes candidates with their
// meaning; code checks each one: length and characters, duplicates in the current project (localization texts and
// keys, code identifiers), a transliteration and pronunciation notes for ru/en, the App Store (iTunes Search API),
// Google Play (one web search through Petya's search tool, when it is on) and, for game names, the .com domain
// (RDAP). Checking names the user already has («проверь название «Bunker Wars»») works without a model.
const kit=require('../app-kit.cjs');
const checks=require('./checks.cjs');
const project=require('./project.cjs');
const stores=require('./stores.cjs');
const ID='naming',BY='Нейминг';

// --- Routing -------------------------------------------------------------------------------------------------
const SUBJECTS=[
 ['hero',/геро\p{L}*|персонаж\p{L}*|гном\p{L}*|эльф\p{L}*|орк\p{L}*|босс\p{L}*|(?:^|[^\p{L}])(?:npc|нпс)(?=$|[^\p{L}])|злоде\p{L}*|питом\p{L}*|юнит\p{L}*|бойц\p{L}*|воин\p{L}*|маг(?:а|ов|ам|и)?(?=$|[^\p{L}])|дракон\p{L}*|монстр\p{L}*|существ\p{L}*|рас[аыу](?=$|[^\p{L}])|фракци\p{L}*|клан\p{L}*|гильди\p{L}*/iu],
 ['item',/предмет\p{L}*|артефакт\p{L}*|оружи\p{L}*|меч\p{L}*|зель\p{L}*|амулет\p{L}*|брон\p{L}*|скин\p{L}*|валют\p{L}*|ресурс\p{L}*|карт(?:у|ы|а|очк\p{L}*)(?=$|[^\p{L}])|сундук\p{L}*|лутбокс\p{L}*|бустер\p{L}*/iu],
 ['event',/ивент\p{L}*|событи\p{L}*|акци\p{L}*|сезон\p{L}*|турнир\p{L}*|праздник\p{L}*|батл-?пасс\p{L}*|боевой\s+пропуск/iu],
 ['feature',/фич\p{L}*|режим\p{L}*|механик\p{L}*|функци[юяи]\s+(?:в\s+игр|для\s+игрок)|систем\p{L}*\s+(?:прокачк|крафт|наград)/iu],
 ['place',/локаци\p{L}*|мир[аы]?(?=$|[^\p{L}])|город\p{L}*|планет\p{L}*|остров\p{L}*|подземель\p{L}*|карт[аыу]\s+уровн/iu],
 ['game',/игр[аыуе](?=$|[^\p{L}])|игры|игрушк\p{L}*|проект\p{L}*|студи\p{L}*|приложени\p{L}*/iu]
];
const NAME='(?:назван\\p{L}*|имя|имени|имена|имён|имен|кличк\\p{L}*|никнейм\\p{L}*|ник(?:и|ов)?|нейминг\\p{L}*)';
const ASK=new RegExp('(?:придума\\p{L}*|предлож\\p{L}*|подбер\\p{L}*|подобра\\p{L}*|сгенерир\\p{L}*|накида\\p{L}*|дай|нужн\\p{L}*|вариант\\p{L}*|сочини|помоги\\s+(?:с|придумать)|идеи)\\s+(?:[\\p{L}\\d-]+\\s+){0,4}?'+NAME+'(?=$|[^\\p{L}])','iu');
const HOW=/как\s+(?:бы\s+)?(?:нам\s+|мне\s+)?(?:лучше\s+)?назвать\s+(?:наш\p{L}*\s+|нов\p{L}*\s+|эт\p{L}*\s+)?(\p{L}+)/iu;
const BARE=new RegExp('^(?:петя[,!\\s]+)?(?:ещ[её]\\s+)?'+NAME+'\\s+(?:для\\s+)?','iu');
const CHECK=new RegExp('(?:проверь|свобод\\p{L}*\\s+ли|занят\\p{L}*\\s+ли|есть\\s+ли\\s+(?:уже\\s+)?(?:такое|такая|игра)|не\\s+занят\\p{L}*\\s+ли)\\s+(?:\\p{L}+\\s+){0,2}?'+NAME+'?','iu');
// Code names, tasks, renaming, amounts, and questions about an existing name are someone else's.
const AVOID=/переменн|функци(?!\p{L}*\s+(?:в\s+игр|для\s+игрок))|метод|класс(?!ическ)|интерфейс\p{L}*\s+в\s+код|файл|папк|ветк|бранч|репозитор|коммит|таблиц|колонк|столбц|(?:^|[^\p{L}])пол[яеь](?=$|[^\p{L}])|параметр|эндпоинт|переимен|назови\s+сумм|сумм[уы](?=$|[^\p{L}])|задач|тикет|баг[аиу]?(?=$|[^\p{L}])|как\s+называ|какое\s+(?:у\s+\p{L}+\s+)?назван|как\s+(?:тебя|его|её|ее|их)\s+зовут|канал\p{L}*\s+в\s+слак|чат\p{L}*\s+в\s+телеграм/iu;

// A follow-up to the previous naming card: «ещё в этом стиле», «короче», «Придумай названия короче: …».
const FOLLOW=/^(?:петя[,!\s]+)?(?:придумай\s+)?(?:ещ[её]\s+)?(?:названия\s+|имена\s+|варианты\s+)?(?:ещ[её]|короче|другие|в\s+этом\s+стиле)(?=$|[\s,:.!])/iu;
const BARE_FOLLOW=/^(?:петя[,!\s]+)?(?:ещ[её](?:\s+(?:в\s+этом\s+стиле|варианты|названия|имена))?|короче|покороче|другие(?:\s+варианты)?)\s*[.!]*$/iu;
function kindOf(text){for(const [kind,re] of SUBJECTS)if(re.test(text))return kind;return 'other';}
// Names given by the user for a check: «…» or "…", or after a colon, comma separated.
function given(text){
 const quoted=[...String(text).matchAll(/«([^»]{1,60})»|"([^"]{1,60})"|“([^”]{1,60})”/gu)].map(m=>(m[1]||m[2]||m[3]).trim()).filter(Boolean);
 if(quoted.length)return quoted.slice(0,10);
 const after=/:\s*(.+)$/u.exec(text);
 return after?after[1].split(/[,;]\s*|\s+или\s+/u).map(x=>x.trim().replace(/[.!?]+$/u,'')).filter(x=>x&&x.length<=60).slice(0,10):[];
}
function intent(text){
 const t=String(text||'').trim().replace(/\s+/g,' ');
 if(!t||t.length>600||AVOID.test(t))return null;
 const names=given(t);
 if(CHECK.test(t)&&names.length&&new RegExp(NAME,'iu').test(t))return {mode:'check',names,kind:kindOf(t)};
 if(ASK.test(t))return {mode:'make',kind:kindOf(t)};
 const how=HOW.exec(t);if(how&&kindOf(how[1])!=='other')return {mode:'make',kind:kindOf(how[1])};
 if(BARE.test(t)&&kindOf(t.replace(BARE,''))!=='other')return {mode:'make',kind:kindOf(t.replace(BARE,''))};
 return null;
}
// Language, length and count asked for.
function wishes(text){
 const t=String(text);
 const lang=/англ\p{L}*|english|латиниц\p{L}*/iu.test(t)?'en':/русск\p{L}*|кириллиц\p{L}*/iu.test(t)?'ru':'';
 let limit=Number(/до\s+(\d{1,2})\s+(?:букв|символ|знак)/iu.exec(t)?.[1]||0);
 if(!limit&&/коротк\p{L}*|короче/iu.test(t))limit=10;
 const oneWord=/одн(?:о|им)\s+слов/iu.test(t);
 const count=Math.min(12,Math.max(3,Number(/(\d{1,2})\s+(?:\p{L}+\s+){0,2}?(?:вариант|назван|имён|имен|ник|кличек|штук)/iu.exec(t)?.[1]||8)));
 return {lang,limit,oneWord,count,domain:/домен|сайт/iu.test(t)};
}

// --- Candidates from the model ------------------------------------------------------------------------------------
const KIND_RU={hero:'персонаж',item:'предмет',event:'ивент',feature:'фича',place:'локация',game:'игра',other:'другое'};
async function propose(s,request,kind,w,avoid){
 const schema={type:'object',properties:{candidates:{type:'array',maxItems:12,items:{type:'object',properties:{name:{type:'string'},meaning:{type:'string'},lang:{type:'string',enum:['ru','en']}},required:['name','meaning','lang']}}},required:['candidates']};
 const r=await kit.modelJSON(s,{system:'Ты придумываешь названия для игр и игровых сущностей. Дай '+w.count+' разных вариантов по просьбе. name — само название без кавычек и пояснений; meaning — коротко по-русски, что оно значит и откуда; lang — язык названия (ru или en). Соблюдай стиль, язык и длину из просьбы.',
  user:{request,kind:KIND_RU[kind],language:w.lang||'любой подходящий',maxLength:w.limit||null,oneWord:w.oneWord||undefined,notThese:avoid.length?avoid:undefined},schema,temperature:0.8,predict:1500});
 if(!r?.candidates)return null;
 const seen=new Set(avoid.map(checks.key));const out=[];
 for(const c of r.candidates){
  const name=String(c.name||'').replace(/^[«"'\s]+|[»"'\s.]+$/gu,'').trim();
  const k=checks.key(name);
  if(!name||name.length>60||!k||seen.has(k))continue;seen.add(k);
  out.push({name,meaning:String(c.meaning||'').slice(0,240),lang:c.lang==='en'?'en':'ru'});
 }
 return out.slice(0,w.count);
}
// The previous naming card in this chat (for «ещё в этом стиле» / «короче»).
function previous(s){
 const topic=s.dialogue?.active?.();
 for(const m of [...(topic?.messages||[])].reverse())if(m.extensionData?.namingCard)return m.extensionData.namingCard;
 return null;
}

// --- Checks -------------------------------------------------------------------------------------------------------
async function check(s,list,{kind,limit,domain:withDomain,fetcher,delay=250}){
 const roots=(()=>{try{return require('../localization/find.cjs').projectRoots(s);}catch{return [];}})();
 s.requestProgress?.report?.('Проверяю названия в проекте'+(roots.length?'':' (папки проекта не выбраны)'));
 const idx=roots.length?await project.index(roots).catch(()=>null):null;
 s.requestProgress?.report?.('Ищу в App Store');
 const rows=[];
 for(const [i,c] of list.entries()){
  if(i&&delay)await stores.pause(delay);
  rows.push({...c,...checks.inspect(c.name,{kind,limit}),project:idx?project.match(idx,c.name):null,appStore:await stores.appStore(c.name,{fetcher})});
 }
 s.requestProgress?.report?.('Ищу в Google Play');
 const play=await stores.googlePlay(list.map(c=>c.name),s);
 for(const r of rows)r.googlePlay=play.results?.[r.name]||null;
 if(withDomain){s.requestProgress?.report?.('Проверяю домены');for(const r of rows){r.domain=await stores.domain(r.name,{fetcher});}}
 for(const r of rows)r.verdict=verdict(r);
 const order={free:0,similar:1,taken:2};
 rows.sort((a,b)=>order[a.verdict.status]-order[b.verdict.status]);
 return {rows,checked:{project:!!idx,roots:roots.length,locFiles:idx?.locFiles||0,codeFiles:idx?.codeFiles||0,appStore:rows.some(r=>r.appStore.status!=='unknown'),googlePlay:play.results?true:false,googlePlayNote:play.skipped||'',domain:!!withDomain}};
}
// One verdict per name: taken if an exact match anywhere, similar if anything close, else free.
function verdict(r){
 const sources=[['проекте',r.project],['App Store',r.appStore],['Google Play',r.googlePlay]];
 for(const [where,x] of sources)if(x?.status==='taken'){const m=x.matches[0];return {status:'taken',where,like:m?.text||m?.name||''};}
 for(const [where,x] of sources)if(x?.status==='similar'){const m=x.matches[0];return {status:'similar',where,like:m?.text||m?.name||''};}
 return {status:'free'};
}

function summary(rows,checked){
 const free=rows.filter(r=>r.verdict.status==='free').length,taken=rows.filter(r=>r.verdict.status==='taken').length;
 const parts=[rows.length+' '+kit.plural(rows.length,['вариант','варианта','вариантов'])+': свободно '+free+(taken?', занято '+taken:'')+(rows.length-free-taken?', похожих '+(rows.length-free-taken):'')+'.'];
 const best=rows.filter(r=>r.verdict.status==='free').slice(0,3).map(r=>r.name);
 if(best.length)parts.push('Свободны: '+best.join(', ')+'.');
 if(!checked.project)parts.push('Проект не проверен: у чата нет папки проекта.');
 if(checked.googlePlayNote)parts.push(checked.googlePlayNote);
 return parts.join(' ');
}
async function makeTurn(s,command,want,{fetcher,delay}){
 const w=wishes(command);
 const prev=FOLLOW.test(command.trim())?previous(s):null;
 // Names already shown in this thread of follow-ups are not proposed again.
 const avoid=prev?[...new Set([...(prev.avoid||[]),...prev.candidates.map(c=>c.name)])].slice(-40):[];
 if(prev&&/короче/iu.test(command)&&!w.limit){const avg=prev.candidates.reduce((n,c)=>n+c.length,0)/Math.max(1,prev.candidates.length);w.limit=Math.max(4,Math.floor(avg*0.7));}
 const kind=want.kind!=='other'?want.kind:prev?.kind||'other';
 const request=prev&&prev.request&&!command.includes(prev.request)?command+' (исходная просьба: '+prev.request+')':command;
 if(!s.settings.model)return kit.reply(s,command,{by:BY,error:true,text:'Чтобы придумать названия, выберите локальную модель в настройках. Проверить готовые можно и без неё: «проверь название «Bunker Wars»».'});
 s.requestProgress?.report?.('Придумываю варианты');
 const list=await propose(s,request,kind,w,avoid);
 if(!list?.length)return kit.reply(s,command,{by:BY,error:true,text:'Модель не предложила подходящих вариантов. Уточните стиль или язык и попробуйте ещё раз.'});
 const {rows,checked}=await check(s,list,{kind,limit:w.limit,domain:w.domain||kind==='game',fetcher,delay});
 const base=prev?.request&&avoid.length?prev.request:command;
 return kit.reply(s,command,{by:BY,text:summary(rows,checked),data:{namingCard:{mode:'make',request:base,kind,limit:w.limit,lang:w.lang,candidates:rows,checked,avoid}}});
}
async function checkTurn(s,command,want,{fetcher,delay}){
 const w=wishes(command);
 const {rows,checked}=await check(s,want.names.map(name=>({name,meaning:'',lang:checks.script(name)==='latin'?'en':'ru'})),{kind:want.kind,limit:w.limit,domain:w.domain||want.kind==='game',fetcher,delay});
 const one=rows.length===1?rows[0]:null;
 const text=one?(one.verdict.status==='free'?'«'+one.name+'» свободно: совпадений в проекте и сторах не нашёл.':one.verdict.status==='taken'?'«'+one.name+'» занято: '+one.verdict.where+' — «'+one.verdict.like+'».':'«'+one.name+'» похоже на «'+one.verdict.like+'» ('+one.verdict.where+').')+(checked.googlePlayNote?' '+checked.googlePlayNote:''):summary(rows,checked);
 return kit.reply(s,command,{by:BY,text,data:{namingCard:{mode:'check',request:command,kind:want.kind,limit:w.limit,candidates:rows,checked}}});
}

function setup(s){
 // The card's «Проверить домен .com» for names that were not checked yet.
 return {ipc:{async domains(names){if(!Array.isArray(names)||names.length>12)throw Error('Неверный список названий.');const out={};for(const n of names){out[n]=await stores.domain(String(n).slice(0,60));}return out;}}};
}
async function turn(s,command,{fetcher=globalThis.fetch,delay=250}={}){
 if(!kit.installed(s,ID))return null;
 let want=intent(command);
 // «ещё», «короче» right after a naming card continue it.
 if(!want&&BARE_FOLLOW.test(String(command).trim())){const last=s.dialogue?.active?.()?.messages?.at(-1);if(last?.extensionData?.namingCard?.mode==='make')want={mode:'make',kind:last.extensionData.namingCard.kind};}
 if(!want)return null;
 try{return want.mode==='check'?await checkTurn(s,command,want,{fetcher,delay}):await makeTurn(s,command,want,{fetcher,delay});}
 catch(e){if(e.name==='InputRequired')throw e;return kit.failure(s,command,BY,e);}
}
module.exports={name:'namingApp',defaults:{['extension_'+ID]:'false'},validate(){},setup,turn,intent,wishes,given,verdict};
