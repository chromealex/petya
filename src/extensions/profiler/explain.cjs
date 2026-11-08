// «Профайлер»: what the top markers mean. A short built-in reference covers common Unity / Android / browser markers
// (so the answer works without a model); with a local model chosen, the model explains only the markers given to
// it, and an explanation of a marker that is not in the capture is dropped. Numbers always come from code.
const fs=require('node:fs/promises');
const path=require('node:path');
const kit=require('../app-kit.cjs');
const {ms}=require('./analyze.cjs');

const KNOWN=[
 [/^(?:physics\.simulate|physics\.processing|physics\.fetchresults|fixedupdate\.physicsfixedupdate|physics2d\.simulate)/i,'физика: много активных Rigidbody и коллайдеров или маленький Fixed Timestep (несколько шагов физики за кадр).'],
 [/^gc\.collect/i,'сборка мусора — следствие аллокаций (GC.Alloc) в кадре; уберите аллокации из Update или включите инкрементальный GC.'],
 [/^gc\.alloc/i,'аллокации управляемой памяти; каждая приближает сборку мусора.'],
 [/^gfx\.waitforpresent/i,'основной поток ждёт рендер-поток или GPU: узкое место в рендере или на GPU, а не в скриптах.'],
 [/^waitfortargetfps/i,'ожидание по vSync или targetFrameRate — это запас кадра, а не нагрузка.'],
 [/^(?:camera\.render|renderpipelinemanager\.dorenderloop|render\.opaquegeometry|render\.transparentgeometry|drawing|renderloop)/i,'рендер: число объектов и draw calls, тени, постобработка.'],
 [/^(?:shadows\.|rendershadowmap|shadow)/i,'тени: дальность, каскады и число теневых источников.'],
 [/^(?:canvas\.buildbatch|canvas\.sendwillrendercanvases|ugui\.|layout\.)/i,'перестройка UI Canvas: часто меняющиеся элементы в одном большом Canvas.'],
 [/^(?:animator\.|director\.processframe|animation\.)/i,'аниматоры и Timeline: число Animator, Culling Mode, сложные графы.'],
 [/^(?:behaviourupdate|update\.scriptrunbehaviourupdate|lateupdate\.scriptrunbehaviourlateupdate|fixedbehaviourupdate)/i,'методы Update() скриптов; смотрите вложенные маркеры конкретных классов.'],
 [/^(?:loading\.|resources\.load|instantiate|object\.instantiate|assetbundle\.load|preloadmanager)/i,'загрузка или создание объектов во время игры; используйте пул объектов и асинхронную загрузку.'],
 [/^(?:particlesystem\.|particles)/i,'системы частиц: число частиц, коллизии частиц, симуляция в мировых координатах.'],
 [/^(?:shader\.createshader|shader\.creategpuprogram|createshadervariant)/i,'компиляция варианта шейдера при первом показе; прогрейте варианты заранее (ShaderVariantCollection).'],
 [/^(?:navmesh|navmeshmanager|ai\.)/i,'навигация: пересчёт путей и NavMeshAgent.'],
 [/^(?:audio\.|fmod)/i,'аудио: число одновременных источников и распаковка клипов.'],
 [/^(?:measure\/layout)$/i,'measure/layout в Android View: глубокая иерархия или requestLayout каждый кадр.'],
 [/^draw \(запись команд\)$/i,'onDraw в Android View: тяжёлая отрисовка или создание объектов в onDraw.'],
 [/^sync \(загрузка текстур\)$/i,'загрузка битмапов в GPU: большие или новые изображения в кадре.'],
 [/^отправка команд на gpu$/i,'много команд отрисовки для RenderThread/GPU.'],
 [/^(?:v8\.gc|majorgc|minorgc|blinkgc)/i,'сборка мусора JavaScript.'],
 [/^(?:layout|updatelayouttree|recalculatestyles)$/i,'пересчёт стилей и раскладки страницы.'],
 [/^(?:paint|rasterize|raster task)/i,'отрисовка и растеризация слоёв.']
];
function known(name){for(const [re,t] of KNOWN)if(re.test(String(name).trim()))return t;return '';}

// Script hints from marker names: «PlayerController.Update() [Invoke]» → class PlayerController.
function classes(names){
 const out=new Set();
 for(const n of names){const m=String(n).match(/(?:^|[\s.])([A-Z][A-Za-z0-9_]{2,})\.(?:[A-Za-z_][\w]*)\(\)/);if(m&&!/^(?:Physics|Camera|Canvas|Animator|Gfx|GC|Shader|Render|UGUI|Director|Update|LateUpdate|FixedUpdate|Loading|Resources|Object)$/.test(m[1]))out.add(m[1]);}
 return [...out].slice(0,6);
}
const SKIP=new Set(['node_modules','.git','Library','Temp','Logs','obj','Build','Builds','Packages','PackageCache','.gradle','.idea','.vs','Pods','DerivedData']);
// Files <Class>.cs under the project folders (bounded walk).
async function files(roots,names,{depth=8,limit=4000}={}){
 if(!names.length||!roots.length)return [];
 const want=new Set(names.map(n=>n.toLowerCase()+'.cs')),found=[];let visited=0;
 const queue=roots.map(r=>({dir:r,level:0,root:r}));
 while(queue.length&&visited<limit&&found.length<names.length){
  const {dir,level,root}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const it of items){
   if(it.isDirectory()){if(level<depth&&!SKIP.has(it.name)&&!it.name.startsWith('.'))queue.push({dir:path.join(dir,it.name),level:level+1,root});}
   else if(want.has(it.name.toLowerCase()))found.push(path.relative(path.dirname(root),path.join(dir,it.name)));
  }
 }
 return found;
}

// The markers worth explaining: the leaders of each thread, the worst regressions.
function subjects(card){
 if(card.mode==='diff')return card.rows.filter(r=>r.kind==='worse').slice(0,5).map(r=>({marker:r.name,thread:r.group,before:r.before,after:r.after,deltaMs:r.delta}));
 return Object.entries(card.groups).flatMap(([g,list])=>list.slice(0,g==='main'?4:2).map(m=>({marker:m.name,thread:g,ms:m.median,share:m.share,max:m.max,count:m.count})));
}
// Grounded lines: «Physics.Simulate 6,2 мс — 37% от 16,6 мс бюджета: …». Model text only for listed markers.
async function explain(s,card,{model=true,question=''}={}){
 const list=subjects(card);
 const fact=x=>card.mode==='diff'?x.marker+' '+(x.before===null?'новый':ms(x.before))+' → '+ms(x.after)+' мс':x.marker+' '+ms(x.ms)+' мс'+(x.share!==null&&x.share!==undefined?' — '+Math.round(x.share)+'% от '+ms(card.budget)+' мс бюджета':'');
 let byModel=new Map(),summary='';
 if(model&&s.settings.model&&list.length){
  try{
   const r=await kit.modelJSON(s,{system:'Ты помогаешь оптимизировать игру по данным профайлера. Объясни по-русски каждый маркер из списка: что он обычно означает и что проверить. Только маркеры из списка, без новых чисел и без выдуманных имён. 1–2 предложения на маркер.',
    user:{question:question||'Что оптимизировать?',budgetMs:card.budget,fps:card.fps,markers:list,spikes:card.spikes?.slice(0,3)||[],gc:card.gc?.collect||null},
    schema:{type:'object',properties:{items:{type:'array',items:{type:'object',properties:{marker:{type:'string'},explanation:{type:'string'}},required:['marker','explanation']},maxItems:10},summary:{type:'string'}},required:['items','summary']},predict:900});
   const names=new Set(list.map(x=>x.marker));
   for(const it of r?.items||[])if(names.has(it.marker)&&it.explanation)byModel.set(it.marker,String(it.explanation).replace(/\s+/g,' ').trim().slice(0,320));
   // A summary that names a marker not in the capture is not shown.
   const sum=String(r?.summary||'').trim().slice(0,400);
   const mentioned=sum.match(/[A-Za-z][\w]*(?:\.[A-Za-z_][\w]*)+/g)||[];
   if(sum&&mentioned.every(m=>[...names].some(n=>n.includes(m))))summary=sum;
  }catch{byModel=new Map();}
 }
 const items=list.map(x=>({marker:x.marker,fact:fact(x),why:byModel.get(x.marker)||known(x.marker),by:byModel.has(x.marker)?'model':known(x.marker)?'reference':''}));
 return {items,summary,model:byModel.size>0};
}

module.exports={known,classes,files,subjects,explain};
