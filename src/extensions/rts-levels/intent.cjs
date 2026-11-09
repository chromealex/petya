// «Генератор уровней»: what a chat request asks for, by code. The local model only fills generator parameters the
// rules below did not find (`merge`), and every value is checked against the preset's schema (`validate`).
const ENGINES=/(?:^|[^\p{L}])(?:unity|юнити|godot|годот|unreal|анрил|анриал|ue[45]|cocos|defold|gamemaker|roblox|роблокс|minecraft|майнкрафт|construct)(?=$|[^\p{L}])/iu;
// Maps that are not game maps, and levels that are not game levels.
const NOT_GAME=/(?:карт\p{L}*\s+(?:сайта|сайт|проезд|метро|город|лояльност|банк|памят|мысл|знани|пути\s+пользоват|компетенц|разум|мира\s+в\s+гугл)|(?:google|гугл\p{L}*|яндекс\p{L}*|2гис|osm)[\s-]*(?:maps|карт\p{L}*)?|mind\s*map|майнд|ментальн\p{L}*\s+карт|sitemap|банковск\p{L}*\s+карт|кредитн\p{L}*\s+карт|карт\p{L}*\s+(?:visa|мир|сбер|тинькоф)|уровен\p{L}*\s+(?:логировани|логов|доступа|шума|звука|громкост|сигнала|английск|языка|сахара|воды|заряд|игрока|персонажа|героя|прокачк|сложности\s+теста)|(?:логировани|log)\p{L}*\s+(?:level|уровен)|level\s+(?:of|up)|левел\s*ап|уровень\s+\d+\s+(?:в|на)\s+(?:игре|прокачке))/iu;
const MAP_NOUN=/(?:^|[^\p{L}])(?:карт[аыуеой]\p{L}*|уровен\p{L}*|уровн\p{L}*|левел\p{L}*|map)(?=$|[^\p{L}])/iu;
const GEN_VERB=/(?:^|[^\p{L}])(?:сгенерируй|сгенерировать|сгенерь|генерируй|сделай|сделать|создай|создать|нарисуй|придумай|построй|собери|набросай|накидай|generate)(?=$|[^\p{L}])/iu;
// Words that make a map an RTS map: players, starts, resources, terrain features.
const RTS_CUES=/(?:^|[^\p{L}])(?:rts|ртс|стратеги\p{L}*|\d+\s*(?:на|vs|x|х|×)\s*\d+|игрок\p{L}*|старт\p{L}*|баз[аыуе]|рек[аиуеой]\p{L}*|руд\p{L}*|ресурс\p{L}*|месторожд\p{L}*|золот\p{L}*|рудник\p{L}*|симметрич\p{L}*|остров\p{L}*|архипелаг|каньон\p{L}*|нагорь\p{L}*|континент\p{L}*|пещер\p{L}*|лайн\p{L}*|линии|скирмиш\p{L}*|skirmish|1v1|2v2|ffa|дуэл\p{L}*)(?=$|[^\p{L}])/iu;
const PROJECTS=/(?:^|[^\p{L}])(?:покажи|какие|список|перечисли|открой\s+список)\s+(?:все\s+)?(?:мои\s+)?(?:rts|ртс)[-\s]*(?:проект\p{L}*|игр\p{L}*)|(?:мои|все)\s+(?:rts|ртс)[-\s]*(?:проект\p{L}*|игр\p{L}*)|(?:rts|ртс)[-\s]*проект\p{L}*\s+(?:есть|у\s+меня)/iu;
const CHOOSE=/(?:выбери|выбрать|смени|сменить|укажи|указать|поменяй)\s+(?:папку\s+)?(?:rts|ртс)[-\s]*(?:проект\p{L}*|игр\p{L}*)/iu;

function hasRtsProject(context){return !!context?.rtsProject;}
// What the request is: {kind:'projects'|'choose'|'generate'|'edit'|'undo'|'variant'} or null.
function classify(text,context={}){
 const t=String(text||'').trim();
 if(!t||t.length>600)return null;
 if(ENGINES.test(t))return null;
 if(PROJECTS.test(t))return {kind:'projects'};
 if(CHOOSE.test(t))return {kind:'choose'};
 // A new map described with its own players, teams, symmetry, size or kind is a new draft, even next to one.
 const fresh=MAP_NOUN.test(t)&&GEN_VERB.test(t)&&!NOT_GAME.test(t)&&(()=>{const r=parseRequest(t);return r.teams!==undefined||['players','symmetric','symmetry','river','preset','size'].some(k=>r[k]!==undefined);})();
 if(context.draft&&!fresh){
  if(/^(?:отмени|отменить|откати|верни\s+как\s+было|undo)(?:\s+(?:последн\p{L}*\s+)?(?:правк\p{L}*|изменени\p{L}*))?\s*[.!]?$/iu.test(t))return {kind:'undo'};
  if(/^(?:ещё|еще|другой|друг\p{L}*)\s+(?:вариант|сид|карт\p{L}*)\s*(?:карты)?\s*[.!]?$/iu.test(t))return {kind:'variant'};
  const edit=parseEdit(t);
  if(edit)return {kind:'edit',edit};
 }
 if(NOT_GAME.test(t))return null;
 if(!MAP_NOUN.test(t)||!GEN_VERB.test(t))return null;
 if(/(?:^|[^\p{L}])(?:картинк|изображени|рисунок|фото|арт)\p{L}*/iu.test(t)&&!RTS_CUES.test(t))return null;
 // «сгенерируй уровень» without RTS words is ours only when this Petya project already has an RTS project.
 if(!RTS_CUES.test(t)&&!hasRtsProject(context))return null;
 return {kind:'generate',request:parseRequest(t)};
}

// ---- a generation request, by rules -----------------------------------------------------------------------------
const NUM_WORDS={один:1,одного:1,двух:2,два:2,двое:2,трёх:3,трех:3,три:3,трое:3,четырёх:4,четырех:4,четыре:4,четверо:4,пяти:5,пять:5,шести:6,шесть:6,семи:7,семь:7,восьми:8,восемь:8};
const num=w=>{const n=Number(w);return Number.isFinite(n)?n:NUM_WORDS[String(w).toLowerCase()]||null;};
function parseRequest(text){
 const t=String(text).toLowerCase().replace(/ё/g,'е');
 const r={};
 // «2 на 2», «2v2», «3x3»: teams when both numbers are small, otherwise the map size.
 const pair=/(?:^|[^\d])(\d{1,4})\s*(?:на|vs|x|х|×|v)\s*(\d{1,4})(?!\d)/iu.exec(t);
 if(pair){
  const a=Number(pair[1]),b=Number(pair[2]);
  if(a<=4&&b<=4&&a>=1&&b>=1){r.players=a+b;if(a===b&&a>1)r.teams=[a,b];else if(a!==b)r.teams=[a,b];}
  else if(a>=16&&b>=16)r.size=[a,b];
 }
 const players=/(?:для|на)\s+(\d|\p{L}+)\s+игрок/iu.exec(t)||/(\d)\s+игрок/iu.exec(t);
 if(players&&!r.players){const n=num(players[1]);if(n)r.players=n;}
 if(/(?:каждый\s+сам\s+за\s+себя|ffa|все\s+против\s+всех)/iu.test(t))r.teams=null,r.ffa=true;
 if(/дуэл|1v1|один\s+на\s+один/iu.test(t)&&!r.players)r.players=2;
 if(/несимметрич|асимметрич|без\s+симметри/iu.test(t))r.symmetry='none';
 else if(/зеркальн/iu.test(t))r.symmetry='mirror';
 else if(/симметрич/iu.test(t))r.symmetric=true;
 if(/рек[аиуеой]\p{L}*\s+(?:посередине|посредине|по\s+центру|в\s+центре|через\s+центр|между)|посередине\s+рек|(?:разделен|раздел)\p{L}*\s+рек/iu.test(t))r.river='middle';
 else if(/(?:много|больше|побольше)\s+рек|рек[иа]\s+повсюду/iu.test(t))r.rivers=0.9;
 else if(/без\s+рек/iu.test(t))r.rivers=0;
 if(/(?:побольше|больше|много|богат\p{L}*)\s+(?:руды|ресурс\p{L}*|золот\p{L}*|месторожд\p{L}*|рудник\p{L}*)|руды\s+побольше|ресурс\p{L}*\s+побольше/iu.test(t))r.resources=1.6;
 else if(/(?:поменьше|меньше|мало|бедн\p{L}*)\s+(?:руды|ресурс\p{L}*|золот\p{L}*|месторожд\p{L}*)/iu.test(t))r.resources=0.6;
 if(/(?:побольше|больше|много|густ\p{L}*)\s+(?:лес\p{L}*|деревьев)|лесист/iu.test(t))r.trees=1.6;
 else if(/(?:поменьше|меньше|мало|без)\s+(?:лес\p{L}*|деревьев)/iu.test(t))r.trees=/без/.test(t)?0:0.5;
 if(/без\s+вод|сух\p{L}*\s+карт|пустын/iu.test(t))r.water=0;
 else if(/(?:много|больше|побольше)\s+вод/iu.test(t))r.water=0.45;
 if(/без\s+(?:гор|скал|обрыв|утес)|ровн\p{L}*|плоск\p{L}*/iu.test(t))r.levels=0;
 else if(/(?:много|больше)\s+(?:гор|скал|обрыв|высот)|холмист|горист/iu.test(t))r.levels=3;
 if(/архипелаг|остров/iu.test(t))r.preset='islands';
 else if(/каньон/iu.test(t))r.preset='canyons';
 else if(/нагорь|горн\p{L}*\s+карт|горы/iu.test(t))r.preset='highlands';
 else if(/континент/iu.test(t))r.preset='continents';
 else if(/пещер|подземель/iu.test(t))r.preset='caves';
 else if(/(?:^|[^\p{L}])(?:лайн\p{L}*|линии|моба|moba)(?=$|[^\p{L}])/iu.test(t))r.preset='lanes';
 if(!r.size){
  if(/(?:маленьк|небольш|крошечн|компактн)\p{L}*/iu.test(t))r.sizeWord='small';
  else if(/(?:огромн|гигантск)\p{L}*/iu.test(t))r.sizeWord='huge';
  else if(/(?:больш|просторн)\p{L}*\s+карт|карт\p{L}*\s+(?:побольше|больше)/iu.test(t))r.sizeWord='large';
 }
 const name=/(?:назови|назвать|с\s+названием|под\s+названием)\s+[«"]?([^»"]{2,40})[»"]?/iu.exec(text);
 if(name)r.title=name[1].trim();
 return r;
}

// ---- edits of a draft -------------------------------------------------------------------------------------------
function where(t){
 if(/(?:у|в|около|возле|ближе\s+к|по)\s+(?:центр|середин)/iu.test(t))return 'centre';
 if(/(?:у|около|возле|рядом\s+с)\s+(?:баз|старт|игрок)/iu.test(t))return 'bases';
 if(/(?:по\s+)?(?:угл|углам)/iu.test(t))return 'corners';
 if(/(?:по\s+)?кра/iu.test(t))return 'edges';
 return null;
}
function parseEdit(text){
 const t=String(text).toLowerCase().replace(/ё/g,'е');
 if(/рек\p{L}*\s+(?:шире|пошире|поширe)|(?:расширь|сделай\s+шире|шире\s+сделай)\s+рек/iu.test(t))return {op:'river-wider',label:'Река шире'};
 if(/рек\p{L}*\s+(?:уже|поуже)|(?:сузь|сделай\s+уже)\s+рек/iu.test(t))return {op:'river-narrower',label:'Река уже'};
 if(/(?:добавь|сделай|нарисуй|проведи)\s+рек\p{L}*(?:\s+(?:посередине|по\s+центру|через\s+центр))?/iu.test(t))return {op:'river-add',label:'Река посередине'};
 if(/(?:добавь|больше|ещ[её])\s+(?:брод|переправ|проход)\p{L}*/iu.test(t))return {op:'fords-more',label:'Больше бродов'};
 const add=/(?:добавь|поставь|размести|накидай)\s+(?:ещ[её]\s+)?(\d+|\p{L}+)?\s*(?:месторожд\p{L}*|рудник\p{L}*|шахт\p{L}*|руд\p{L}*|ресурс\p{L}*|золот\p{L}*|точк\p{L}*\s+ресурс\p{L}*)/iu.exec(t);
 if(add){const n=num(add[1])||2;return {op:'resources-add',count:Math.max(1,Math.min(8,n)),place:where(t)||'centre',label:'Ещё '+Math.max(1,Math.min(8,n))+' месторожд.'};}
 if(/(?:убери|удали|снеси|вырежи)\s+(?:весь\s+)?(?:лес|деревья)/iu.test(t))return {op:'trees-remove',place:where(t)||'centre',label:'Без леса '+({centre:'в центре',bases:'у баз',corners:'по углам',edges:'по краям'}[where(t)||'centre'])};
 if(/(?:убери|удали)\s+(?:все\s+)?(?:месторожд\p{L}*|рудник\p{L}*|руд\p{L}*)/iu.test(t))return {op:'resources-remove',place:where(t)||'centre',label:'Без месторождений '+({centre:'в центре',bases:'у баз',corners:'по углам',edges:'по краям'}[where(t)||'centre'])};
 if(/(?:побольше|больше|добавь)\s+(?:руды|ресурс\p{L}*)\s*$/iu.test(t)&&!/месторожд/.test(t))return {op:'params',params:{resources:1.6},label:'Больше ресурсов'};
 if(/(?:поменьше|меньше)\s+(?:руды|ресурс\p{L}*)/iu.test(t))return {op:'params',params:{resources:0.6},label:'Меньше ресурсов'};
 if(/(?:побольше|больше|добавь)\s+(?:лес\p{L}*|деревьев)/iu.test(t))return {op:'params',params:{trees:1.6},label:'Больше леса'};
 if(/(?:поменьше|меньше)\s+(?:лес\p{L}*|деревьев)/iu.test(t))return {op:'params',params:{trees:0.5},label:'Меньше леса'};
 if(/(?:побольше|больше|добавь)\s+вод/iu.test(t))return {op:'params',params:{water:0.45},label:'Больше воды'};
 if(/(?:поменьше|меньше|убери)\s+вод/iu.test(t))return {op:'params',params:{water:0.05},label:'Меньше воды'};
 if(/(?:сделай|пусть)\s+(?:карт\p{L}*\s+)?(?:больше|побольше)$/iu.test(t))return {op:'params',grow:1.25,label:'Карта больше'};
 if(/(?:сделай|пусть)\s+(?:карт\p{L}*\s+)?(?:меньше|поменьше)$/iu.test(t))return {op:'params',grow:0.8,label:'Карта меньше'};
 return null;
}

// ---- the preset schema and validation --------------------------------------------------------------------------
// Known generator params (gen_presets "params") with their ranges; unknown keys are dropped.
const RANGES={water:[0,1],rivers:[0,1],lakes:[0,1],shallows:[0,1],levels:[0,9],plateau:[0,1],peaks:[0,1],relief:[0,64],trees:[0,5],resources:[0,5],startSpread:[0.2,1],ridged:[0,1],islands:[0,16],lanes:[1,5],laneWidth:[2,12],obstacles:[0,0.6],baseRadius:[2,32],nearRadius:[4,64]};
const SYMMETRY=['auto','none','point','mirror','mirror-y','mirror4','rot4','rotational'];
const SIZES={small:[48,48],large:[112,112],huge:[160,160]};
function schemaKeys(presets){
 const known=new Set();
 const list=String(presets?.params||'').split(',').map(p=>p.trim().split(/\s/)[0]).filter(Boolean);
 for(const k of list)known.add(k);
 for(const p of presets?.presets||[])for(const k of Object.keys(p.params||{}))known.add(k);
 return known;
}
const usable=presets=>(presets?.presets||[]).filter(p=>p.params?.shape!=='planet'&&!/planet/i.test(p.genre||''));
// The game's own presets come first; otherwise classic land maps.
function defaultPreset(presets){const list=usable(presets);return list.find(p=>p.source&&p.source!=='engine')||list.find(p=>p.id==='classic')||list[0]||null;}
function symmetryFor(players,{river,symmetric,symmetry}){
 if(symmetry&&SYMMETRY.includes(symmetry)){
  if(symmetry==='none'||symmetry==='auto'||symmetry==='rotational')return symmetry;
  if(['point','mirror','mirror-y'].includes(symmetry))return players===2?symmetry:players===4?'mirror4':'rotational';
  if(['mirror4','rot4'].includes(symmetry))return players===4?symmetry:players===2?'mirror':'rotational';
 }
 if(river==='middle')return players===2?'mirror':players===4?'mirror4':'rotational';
 if(symmetric)return players===2?'point':players===4?'rot4':'rotational';
 return 'auto';
}
// A request (rules + model) → map_generate arguments and the post-generation features, checked against the preset.
function validate(request,presets,{seed}={}){
 const list=usable(presets);
 if(!list.length)throw Error('В движке нет подходящих пресетов генератора (gen_presets пуст).');
 const preset=list.find(p=>p.id===request.preset)||defaultPreset(presets);
 const known=schemaKeys(presets);
 const players=Math.max(1,Math.min(8,Math.round(Number(request.players)||2)));
 const params={};
 for(const [k,[lo,hi]] of Object.entries(RANGES)){
  if(request[k]===undefined||request[k]===null||!known.has(k))continue;
  const v=Number(request[k]);if(!Number.isFinite(v))continue;
  // resources / trees are multipliers of the preset's own amounts
  params[k]=Math.min(hi,Math.max(lo,k==='levels'||k==='islands'||k==='lanes'||k==='laneWidth'?Math.round(v):Math.round(v*100)/100));
 }
 let size=Array.isArray(request.size)&&request.size.length===2?request.size.map(Number):null;
 if(!size&&request.sizeWord&&SIZES[request.sizeWord])size=SIZES[request.sizeWord];
 if(!size&&request.grow&&Array.isArray(preset.params?.size))size=preset.params.size.map(n=>Math.round(n*request.grow));
 if(size&&known.has('size')){
  if(!size.every(n=>Number.isInteger(n)&&n>=16&&n<=1024))throw Error('Размер карты: от 16 до 1024 клеток по каждой стороне.');
  params.size=size;
 }
 // A river in the middle is drawn after generation; extra generator rivers would cross it.
 if(request.river==='middle'&&params.rivers===undefined&&known.has('rivers'))params.rivers=0.15;
 const symmetry=symmetryFor(players,request);
 let teams=null;
 if(Array.isArray(request.teams)&&request.teams.length===2&&request.teams[0]+request.teams[1]===players)teams=request.teams.map(n=>Math.max(1,Math.round(n)));
 return {
  gen:{preset:preset.id,seed:Number.isSafeInteger(seed)?seed:Number.isSafeInteger(request.seed)?request.seed:1,players,symmetry,params},
  presetTitle:preset.title||preset.id,
  river:request.river==='middle'?{width:Math.max(2,Math.round((params.size?.[0]||preset.params?.size?.[0]||64)/18)),fords:3}:null,
  teams,
  title:typeof request.title==='string'&&request.title.trim()?request.title.trim().slice(0,60):''
 };
}

// ---- the model's part ------------------------------------------------------------------------------------------
const MODEL_SCHEMA={type:'object',properties:{
 preset:{type:'string'},players:{type:'integer'},teamA:{type:'integer'},teamB:{type:'integer'},symmetric:{type:'boolean'},
 riverMiddle:{type:'boolean'},water:{type:'number'},rivers:{type:'number'},resources:{type:'number'},trees:{type:'number'},levels:{type:'integer'},
 width:{type:'integer'},height:{type:'integer'}},additionalProperties:false};
function modelPrompt(presets){
 const ids=usable(presets).map(p=>p.id+' — '+(p.title||p.id)+(p.genre?' ('+p.genre+')':'')).join('; ');
 return 'Ты переводишь просьбу о карте для RTS в параметры генератора. Пресеты: '+ids+'. Поля: preset (id), players (1–8), teamA/teamB (размер команд, например 2 и 2 для «2 на 2»), symmetric, riverMiddle (река через центр между командами), water/rivers (0–1), resources/trees (множители, 1 = как в пресете), levels (уровни обрывов 0–9), width/height (клетки 16–1024). Заполняй только то, что следует из просьбы. Ответ — JSON.';
}
// Rules win; the model only adds what the rules did not find.
function merge(rules,model){
 if(!model||typeof model!=='object')return {...rules};
 const out={...rules};
 const set=(k,v)=>{if(out[k]===undefined&&v!==undefined&&v!==null)out[k]=v;};
 set('preset',typeof model.preset==='string'?model.preset:undefined);
 set('players',Number.isInteger(model.players)?model.players:undefined);
 if(out.teams===undefined&&Number.isInteger(model.teamA)&&Number.isInteger(model.teamB)&&model.teamA>0&&model.teamB>0){out.teams=[model.teamA,model.teamB];if(out.players===undefined)out.players=model.teamA+model.teamB;}
 if(model.symmetric===true)set('symmetric',true);
 if(model.riverMiddle===true)set('river','middle');
 for(const k of ['water','rivers','resources','trees','levels'])set(k,typeof model[k]==='number'?model[k]:undefined);
 if(!out.size&&!out.sizeWord&&Number.isInteger(model.width)&&Number.isInteger(model.height))out.size=[model.width,model.height];
 return out;
}
module.exports={classify,parseRequest,parseEdit,validate,merge,modelPrompt,MODEL_SCHEMA,usable,defaultPreset,symmetryFor,schemaKeys,ENGINES,NOT_GAME,MAP_NOUN,GEN_VERB,RTS_CUES,PROJECTS};
