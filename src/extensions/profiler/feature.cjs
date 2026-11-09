// «Профайлер»: what eats the frame. Reads Unity Profile Analyzer CSV exports (marker table, frame times, comparison
// table / frame times), Chrome trace JSON (chrome://tracing, Perfetto «Open trace file», engines that write it),
// `dumpsys gfxinfo framestats` text and memory tables saved as CSV. Unity's binary .data and Instruments traces are
// not decoded: the reply explains how to export. All numbers are computed by code (analyze.cjs); the local model only
// explains markers that are in the capture (explain.cjs).
const path=require('node:path');
const kit=require('../app-kit.cjs');
const parse=require('./parse.cjs');
const analyze=require('./analyze.cjs');
const explain=require('./explain.cjs');
const find=require('./find.cjs');
const unity=require('./unity.cjs');
const ID='profiler',BY='Профайлер';

const PROF=/профайл\p{L}*|профилировщик\p{L}*|(?:^|[^\p{L}])(?:profiler|perfetto|framestats|gfxinfo)(?=$|[^\p{L}])|profile analyzer|chrome[- ]?trac\p{L}*|трасс\p{L}* (?:chrome|кадр\p{L}*|perfetto)|(?:врем\p{L}*|бюджет\p{L}*) кадра|frame ?time/iu;
const FRAME=/что (?:жр[её]т|ест|съедает|грузит|тормозит|занимает) (?:кадр|fps|фпс|фреймрейт)|(?:^|[^\p{L}])фриз\p{L}*|просадк\p{L}* (?:fps|фпс|кадр\p{L}*)|(?:почему|отчего) (?:тормозит|лагает|фризит) (?:игра|кадр)|спайк\p{L}* (?:кадр\p{L}*|в кадре)|(?:^|[^\p{L}])(?:fps|фпс) (?:просел|упал|проседает)/iu;
// Other «профили» and browser tooling.
const AVOID=/браузер\p{L}*|devtools|вкладк\p{L}*|профил[ьяюе]\p{L}* (?:пользовател|игрок|в slack|в слак|компани|сотрудник)|(?:^|[^\p{L}])linkedin/iu;
const ACT=/разбер\p{L}*|разбор|покажи|глянь|посмотри|проанализ\p{L}*|что (?:тут|там|в нём|в этом)|почему|сравни\p{L}*|оптимиз\p{L}*/iu;
const COMPARE=/сравни\p{L}*|до и после|было\s*[—–-]?\s*стало|регресс\p{L}*|стало (?:хуже|лучше)|разниц\p{L}*|(?:^|[^\p{L}])diff(?=$|[^\p{L}])|по сравнению/iu;
const ADVICE=/что (?:оптимизировать|ускорить|улучшить|исправить)|как (?:ускорить|оптимизировать)|с чего начать оптимиз/iu;

function lastCard(s){
 const messages=s.dialogue.active()?.messages||[];
 for(let i=messages.length-1;i>=0;i--)if(messages[i].extensionData?.profiler)return messages[i].extensionData.profiler;
 return null;
}
// Files given now, or the captures attached earlier when the request refers back («сравни», «почему фризы»).
function sources(s,text){
 const now=find.attached(s);
 const paths=find.written(text).map(p=>({id:'',name:path.basename(p),path:p,written:true}));
 return [...now,...paths];
}
// Text-only check (also used by tests); an attached capture with an action word also counts.
function wanted(s,text){
 if(AVOID.test(text))return false;
 if(PROF.test(text)||FRAME.test(text))return true;
 if(ADVICE.test(text)&&lastCard(s))return true;
 const files=sources(s,text);
 return files.length>0&&ACT.test(text)&&files.some(f=>/\.(?:csv|tsv|json|txt|data|raw|trace|pftrace|snap)$/i.test(f.name))&&files.some(f=>!!parse.detect(f.name,f.text).kind||!!parse.detect(f.name,'').unsupported||!f.text);
}

const ask=(s,command,text)=>kit.reply(s,command,{by:BY,question:true,text});
const UNSUPPORTED={
 'unity-binary':'Файл Unity Profiler (.data/.raw) двоичный — его я не разбираю. Откройте его в Unity: Window → Analysis → Profile Analyzer → Pull Data (или Load), выберите кадры и нажмите Export → «Marker table» и «Single Frame Times». Пришлите эти CSV.',
 instruments:'Трассы Xcode Instruments (.trace) я не читаю. Для iOS-сборки Unity используйте Unity Profiler + Profile Analyzer (Export → CSV).',
 'perfetto-proto':'Бинарная трасса Perfetto (.pftrace) не поддерживается. Откройте её в ui.perfetto.dev и сохраните как JSON (Convert → Chrome JSON) или пришлите трассу Chrome JSON.',
 'memory-snapshot':'Снимок Memory Profiler (.snap) двоичный. В окне Memory Profiler откройте таблицу (All Of Memory или Summary) и сохраните её как CSV.'
};

async function load(s,files){
 const captures=[],problems=[];
 for(const f of files){
  let body;
  try{body=await find.read(f);}
  catch(e){problems.push(e.code==='ENOENT'?'Не нашёл файл '+(f.path||f.name)+'.':e.code==='EACCES'?'Нет доступа к '+(f.path||f.name)+'.':e.message);continue;}
  try{
   const c=parse.parse(body.name||f.name,body.text,{thread:parse.threadFromName(f.name)});
   if(body.truncated)c.notes=[...(c.notes||[]),'«'+f.name+'» прочитан не целиком (прикреплён без пути к файлу) — прикрепите его кнопкой «Прикрепить», чтобы я прочёл весь файл.'];
   captures.push(c);
  }catch(e){problems.push(e.unsupported?UNSUPPORTED[e.unsupported]:e.message);}
 }
 return {captures,problems};
}
// Before/after order: names saying so win («до/после», before/after, old/new, baseline), otherwise the given order.
function order(list){
 const rank=c=>/(?:^|[^a-zа-я])(?:after|new|после|новый|fix|optimi[sz]ed)(?=$|[^a-zа-я])/i.test(c.name)?1:/(?:^|[^a-zа-я])(?:before|old|до|старый|base(?:line)?)(?=$|[^a-zа-я])/i.test(c.name)?-1:0;
 return [...list].sort((a,b)=>rank(a)-rank(b));
}

async function run(s,command){
 const text=String(command);
 const fps=analyze.targetFps(text,s.settings.profilerTargetFps);
 let files=sources(s,text);
 const compare=COMPARE.test(text);
 if(!files.length&&ADVICE.test(text)){
  const last=lastCard(s);
  if(last){
   s.requestProgress?.report?.('Объясняю маркеры из захвата');
   const why=await explain.explain(s,last,{question:text});
   const lines=why.items.map(x=>'• '+x.fact+(x.why?': '+x.why:''));
   return kit.reply(s,command,{by:BY,text:(why.summary?why.summary+'\n\n':'')+(lines.length?lines.join('\n'):'В захвате нет маркеров, которые можно объяснить.')+(why.model?'':'\n\nОбъяснения — из встроенной справки по типичным маркерам; с локальной моделью разберу подробнее.')});
  }
 }
 if(!files.length){
  const before=find.earlier(s);
  if(before.length&&(compare||FRAME.test(text)||PROF.test(text)))files=before.slice(-(compare?2:4));
 }
 if(!files.length)return ask(s,command,'Пришлите захват профайлера: CSV из Unity Profile Analyzer (Export → Marker table и Single Frame Times), трассу Chrome JSON или вывод adb shell dumpsys gfxinfo <пакет> framestats — кнопкой «Прикрепить» или путём к файлу. Файл Unity Profiler .data сначала откройте в Profile Analyzer и экспортируйте CSV.');
 s.requestProgress?.report?.('Читаю '+files.map(f=>f.name).join(', '));
 const {captures,problems}=await load(s,files);
 if(!captures.length)return kit.reply(s,command,{by:BY,error:!problems.every(p=>Object.values(UNSUPPORTED).includes(p)),question:problems.every(p=>Object.values(UNSUPPORTED).includes(p)),text:problems.join('\n\n')||'Не получилось прочитать захват.'});
 let card;
 const pairs=captures.filter(c=>c.format==='unity-compare');
 const plain=captures.filter(c=>c.format!=='unity-compare');
 if(pairs.length){
  // A Compare view export already holds both sides; a frame-times comparison is merged into the marker one.
  const markers=pairs.find(p=>p.pair[0].markers.length)||pairs[0],framesPair=pairs.find(p=>p.pair[0].frames.length);
  const left={...markers.pair[0],frames:framesPair?.pair[0].frames||markers.pair[0].frames},right={...markers.pair[1],frames:framesPair?.pair[1].frames||markers.pair[1].frames};
  card=analyze.diff(left,right,fps);card.names=[markers.name+' (слева)',markers.name+' (справа)'];
 }else{
  const markerCaps=plain.filter(c=>c.markers.length);
  if(markerCaps.length>=2||compare&&plain.length>=2){
   const [a,b]=order(markerCaps.length>=2?markerCaps:plain).slice(-2);
   const framesOf=x=>plain.find(c=>c!==x&&!c.markers.length&&c.frames.length&&path.parse(c.name).name.replace(/frame.?times?/i,'')===path.parse(x.name).name.replace(/marker.?table/i,''));
   card=analyze.diff({...a,frames:a.frames.length?a.frames:framesOf(a)?.frames||[]},{...b,frames:b.frames.length?b.frames:framesOf(b)?.frames||[]},fps);
  }else{
   if(compare)problems.push('Для сравнения нужны два захвата (до и после) — пришлите второй.');
   card=analyze.single(analyze.merge(plain),fps);
  }
 }
 // Script hints for «Отдать Программисту»: classes from marker names and their files in the project folders.
 const names=card.mode==='diff'?card.rows.slice(0,8).map(r=>r.name):Object.values(card.groups).flat().map(m=>m.name);
 const classes=explain.classes(names);
 card.hints={classes,files:await explain.files(find.projectRoots(s),classes).catch(()=>[])};
 if(card.mode!=='diff'||card.worse){
  s.requestProgress?.report?.('Объясняю главные маркеры');
  const why=await explain.explain(s,card,{question:text});
  card.explain=why.items.filter(x=>x.why);card.explainedBy=why.model?'model':'reference';card.summary=why.summary;
 }
 card.unity=unity.usable(s);
 card.id=require('node:crypto').randomUUID();
 card.notes=[...new Set([...(card.notes||[]),...problems])];
 const reply=kit.reply(s,command,{by:BY,text:analyze.text(card)+(problems.length?'\n\n'+problems.join('\n'):''),data:{profiler:card}});
 find.adopt(s,files.filter(f=>f.id&&!f.earlier));
 return reply;
}

function setup(s){
 return {ipc:{
  // The fps chip on the card: remembered for the next captures.
  setFps(value){const v=Number(value);if(![30,60,120].includes(v))throw Error('Выберите 30, 60 или 120 fps.');s.saveSettings?.({profilerTargetFps:String(v)});return {fps:v};},
  // «Снять тайминги в Unity»: one FrameTimingManager reading through the Unity Editor app (its dialog confirms).
  unityTiming:()=>unity.live(s),
  unityReady:()=>unity.usable(s)
 }};
}
async function turn(s,command){
 const text=String(command||'');
 if(!kit.installed(s,ID)||!wanted(s,text))return null;
 if(/^(?:а\s+)?(?:что такое|зачем нуж|как работает)/iu.test(text.trim())&&!sources(s,text).length)return null;
 return run(s,text);
}
function validate(next){if(next.profilerTargetFps!==undefined&&!['30','60','120'].includes(String(next.profilerTargetFps)))next.profilerTargetFps='60';}
module.exports={name:'profilerApp',defaults:{['extension_'+ID]:'false',profilerTargetFps:'60'},validate,setup,turn,wanted,run,order};
