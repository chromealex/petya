// «Профайлер»: numbers for the card, all computed by code from the parsed captures — frame budget, top markers per
// thread, the stacked budget bar, spikes, GC, memory and the before/after diff. The model never produces a number:
// it may only explain markers listed here (see explain.cjs).
const GROUPS=['main','render','jobs','other'];
// Markers that wrap the whole frame or a thread: ranking them says nothing about what to optimize.
const WRAPPERS=/^(?:playerloop|editorloop|main thread|render thread|maint?hread|frame|beginframe|drawframe|gameframe|tick|mainloop|ui thread|renderthread|job ?worker.*|worker.*|threadpool.*|semaphore\.waitforsignal|idle|waitforjobgroupid|jobhandle\.complete.*)$/i;
// Waiting rather than work: shown, but not counted as a hog in the bar.
const WAITS=/^(?:waitfortargetfps|gfx\.waitforpresent(?:ongfxthread)?|gfx\.waitforgfxcommandsfromthemainthread|gfx\.presentframe|semaphore\.waitforsignal|idle)$/i;

const median=a=>{const v=a.filter(Number.isFinite);if(!v.length)return NaN;const s=[...v].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const pct=(a,p)=>{const v=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!v.length)return NaN;return v[Math.min(v.length-1,Math.floor(p*(v.length-1)+0.5))];};
const r2=n=>Number.isFinite(n)?Math.round(n*100)/100:null;

// Target frame rate from the request («при 30 fps», «на 120 кадров») or the setting.
function targetFps(text,setting){
 const m=String(text||'').match(/(?:^|[^\d])(30|60|90|120|144)\s*(?:fps|фпс|кадр\p{L}*|гц|hz)/iu);
 const v=Number(m?.[1]||setting||60);return [30,60,90,120,144].includes(v)?v:60;
}

// Merges a marker table with a frame-times table of the same capture (Profile Analyzer exports them separately).
function merge(list){
 const markers=list.filter(c=>c.markers.length),frames=list.filter(c=>c.frames.length&&!c.markers.length),memory=list.filter(c=>c.memory.length);
 const base=markers[0]||frames[0]||memory[0];
 return {...base,name:list.map(c=>c.name).join(' + '),markers:list.flatMap(c=>c.markers),frames:(markers.find(c=>c.frames.length)||frames[0]||{frames:[]}).frames,
  memory:list.flatMap(c=>c.memory),meta:Object.assign({},...list.map(c=>c.meta)),notes:[...new Set(list.flatMap(c=>c.notes))],formats:[...new Set(list.map(c=>c.format))]};
}

// The frame root (PlayerLoop, a Frame span) and the frame time.
function frameTime(c){
 if(c.frames.length)return {ms:median(c.frames.map(f=>f.ms)),from:'frames'};
 const root=c.markers.filter(m=>m.group==='main'&&(m.frameRoot||/^(?:playerloop|main thread|frame)$/i.test(m.name))).sort((a,b)=>b.median-a.median)[0];
 if(root)return {ms:root.median,from:'marker',root:root.name};
 if(c.format==='gfxinfo'&&Number.isFinite(c.meta.p50))return {ms:c.meta.p50,from:'gfxinfo'};
 return {ms:NaN,from:''};
}

// Top markers of one thread group: wrappers out, by median (or total when the capture has no frames).
function top(c,group,n=8){
 const key=c.meta.perCall?'mean':'median';
 return c.markers.filter(m=>m.group===group&&!WRAPPERS.test(m.name.trim())&&!m.frameRoot&&Number.isFinite(m[key])&&m[key]>0)
  .sort((a,b)=>b[key]-a[key]||(b.max||0)-(a.max||0)).slice(0,n);
}

// Segments of the budget bar: main-thread markers on one level just below the frame root, so they do not overlap.
// Without depth info the largest markers are taken while they fit in the frame. Waiting markers are shown apart.
function segments(c,frameMs,n=5){
 if(c.meta.perCall||!Number.isFinite(frameMs))return {parts:[],approx:true};
 const main=c.markers.filter(m=>m.group==='main'&&!m.frameRoot&&!WRAPPERS.test(m.name.trim())&&m.median>0);
 const depths=main.map(m=>m.depth).filter(Number.isFinite);
 let pool=main,approx=true;
 if(depths.length===main.length&&depths.length){
  const level=Math.min(...depths);pool=main.filter(m=>m.depth===level);approx=false;
  // One dominant child (Update.ScriptRunBehaviourUpdate under PlayerLoop) says little: go one level deeper.
  if(pool.length<3){const next=main.filter(m=>m.depth===level+1);if(next.length>=3){pool=next;}}
 }
 const parts=[];let sum=0;
 for(const m of [...pool].sort((a,b)=>b.median-a.median)){
  if(parts.length>=n)break;
  if(sum+m.median>frameMs*1.02)continue;
  parts.push({name:m.name,ms:r2(m.median),wait:WAITS.test(m.name)});sum+=m.median;
 }
 return {parts,approx,other:r2(Math.max(0,frameMs-sum))};
}

// Spikes: frames over 1.5× the budget or 2× the median frame. Timeline: at most 300 bars (max of each bucket).
function spikes(frames,budget){
 if(!frames.length)return {list:[],timeline:[],over:0};
 const med=median(frames.map(f=>f.ms)),limit=Math.max(budget*1.5,med*2);
 const list=frames.filter(f=>f.ms>limit).sort((a,b)=>b.ms-a.ms).slice(0,12).map(f=>({i:f.i,ms:r2(f.ms),gc:Number.isFinite(f.gc)?f.gc:null,at:Number.isFinite(f.at)?r2(f.at):null}));
 const size=Math.ceil(frames.length/300),timeline=[];
 for(let k=0;k<frames.length;k+=size){const chunk=frames.slice(k,k+size);const worst=chunk.reduce((a,b)=>b.ms>a.ms?b:a);timeline.push({i:worst.i,ms:r2(worst.ms),gc:Number.isFinite(worst.gc)&&worst.gc>0?worst.gc:0});}
 return {list,timeline,over:frames.filter(f=>f.ms>budget).length,limit:r2(limit)};
}

function gc(c){
 const allocs=c.markers.filter(m=>Number.isFinite(m.gcMedian)&&m.gcMedian>0&&!WRAPPERS.test(m.name)&&!/^gc\./i.test(m.name)).sort((a,b)=>b.gcMedian-a.gcMedian).slice(0,6).map(m=>({name:m.name,bytes:m.gcMedian,group:m.group}));
 const collect=c.markers.find(m=>/^gc\.collect$/i.test(m.name));
 const alloc=c.markers.find(m=>/^gc\.alloc$/i.test(m.name));
 const perFrame=c.frames.map(f=>f.gc).filter(v=>Number.isFinite(v));
 return {allocs,collect:collect?{median:r2(collect.median),max:r2(collect.max),count:collect.count}:null,
  allocCalls:alloc&&Number.isFinite(alloc.countMedian)?alloc.countMedian:alloc&&Number.isFinite(alloc.count)?alloc.count:null,
  frameMedian:perFrame.length?median(perFrame):null,framesWithGc:perFrame.filter(v=>v>0).length};
}

const row=(m,budget,perCall)=>({name:m.name,thread:m.thread||'',group:m.group,median:r2(perCall?m.mean:m.median),max:r2(m.max),
 count:Number.isFinite(m.countMedian)?m.countMedian:Number.isFinite(m.count)?m.count:null,perFrame:Number.isFinite(m.countMedian),share:perCall||!Number.isFinite(budget)?null:Math.round((m.median/budget)*1000)/10,gc:Number.isFinite(m.gcMedian)?m.gcMedian:null});

// One capture → the card's data.
function single(capture,fps){
 const c=capture,budget=1000/fps,ft=frameTime(c);
 const groups={};for(const g of GROUPS){const list=top(c,g);if(list.length)groups[g]=list.map(m=>row(m,budget,c.meta.perCall));}
 const sp=spikes(c.frames,budget);
 const fpsActual=Number.isFinite(ft.ms)&&ft.ms>0?Math.round(1000/ft.ms):null;
 return {mode:'single',fps,budget:r2(budget),name:c.name,formats:c.formats||[c.format],frame:{ms:r2(ft.ms),from:ft.from,root:ft.root||'',fps:fpsActual,
  p95:c.frames.length?r2(pct(c.frames.map(f=>f.ms),0.95)):null,count:c.frames.length,over:sp.over},
  bar:segments(c,ft.ms),groups,spikes:sp.list,timeline:sp.timeline,spikeLimit:sp.limit??null,gc:gc(c),
  memory:c.memory.slice(0,10).map(m=>({name:m.name,bytes:m.bytes})),memoryTotal:c.memory.reduce((a,m)=>a+m.bytes,0)||null,
  meta:c.meta,notes:c.notes,perCall:!!c.meta.perCall};
}

// Before/after: deltas per marker (matched by name and thread group), regressions first.
function diff(before,after,fps){
 const budget=1000/fps,key=m=>m.group+'\n'+m.name;
 const a=new Map(before.markers.filter(m=>!WRAPPERS.test(m.name)).map(m=>[key(m),m])),b=new Map(after.markers.filter(m=>!WRAPPERS.test(m.name)).map(m=>[key(m),m]));
 const rows=[];
 for(const k of new Set([...a.keys(),...b.keys()])){
  const x=a.get(k),y=b.get(k),m=y||x;
  const v0=x?.median??0,v1=y?.median??0,delta=v1-v0;
  if(Math.max(v0,v1)<0.05)continue;
  const pctChange=v0>0?delta/v0*100:null;
  const kind=Math.abs(delta)<0.1||pctChange!==null&&Math.abs(pctChange)<10?'same':delta>0?'worse':'better';
  rows.push({name:m.name,group:m.group,thread:m.thread||'',before:x?r2(v0):null,after:y?r2(v1):null,delta:r2(delta),pct:pctChange===null?null:Math.round(pctChange),kind,
   added:!x,removed:!y,share:r2(delta/budget*100),count:[x?.count??null,y?.count??null]});
 }
 rows.sort((p,q)=>(q.kind==='worse')-(p.kind==='worse')||Math.abs(q.delta)-Math.abs(p.delta));
 const f0=frameTime(before),f1=frameTime(after);
 return {mode:'diff',fps,budget:r2(budget),names:[before.name,after.name],frame:{before:r2(f0.ms),after:r2(f1.ms),delta:Number.isFinite(f0.ms)&&Number.isFinite(f1.ms)?r2(f1.ms-f0.ms):null},
  rows:rows.slice(0,20),worse:rows.filter(r=>r.kind==='worse').length,better:rows.filter(r=>r.kind==='better').length,total:rows.length,
  spikes:[spikes(before.frames,budget).over,spikes(after.frames,budget).over],frames:[before.frames.length,after.frames.length],
  timelines:[spikes(before.frames,budget).timeline,spikes(after.frames,budget).timeline],notes:[...new Set([...before.notes,...after.notes])]};
}

// --- Text -------------------------------------------------------------------------------------------------------
const ms=n=>Number.isFinite(n)?(Math.round(n*10)/10).toLocaleString('ru-RU'):'—';
const NAMES={main:'основной поток',render:'рендер-поток',jobs:'jobs/воркеры',other:'другие потоки'};
function line(m,budget){return m.name+' '+ms(m.median)+' мс'+(m.share!==null&&m.share!==undefined?' — '+Math.round(m.share)+'% от '+ms(budget)+' мс бюджета':'');}
function text(card){
 if(card.mode==='diff'){
  const worst=card.rows.filter(r=>r.kind==='worse').slice(0,3);
  const head=card.frame.delta!==null?'Кадр: '+ms(card.frame.before)+' → '+ms(card.frame.after)+' мс ('+(card.frame.delta>0?'+':'')+ms(card.frame.delta)+'). ':'';
  return head+(worst.length?'Хуже стало: '+worst.map(r=>r.name+' '+(r.before===null?'новый':ms(r.before))+' → '+ms(r.after)+' мс').join('; ')+'.':'Регрессий больше 0,1 мс и 10% нет.')+
   (card.better?' Улучшилось маркеров: '+card.better+'.':'');
 }
 const parts=[];
 if(card.frame.ms!==null)parts.push('Кадр ~'+ms(card.frame.ms)+' мс при бюджете '+ms(card.budget)+' мс ('+card.fps+' fps)'+(card.frame.ms>card.budget?' — не укладывается.':'.'));
 const main=card.groups.main?.[0],render=card.groups.render?.[0],jobs=card.groups.jobs?.[0];
 const lead=[main,render,jobs].filter(Boolean).map(m=>line(m,card.budget));
 if(lead.length)parts.push('Больше всего: '+lead.join('; ')+'.');
 if(card.spikes.length)parts.push('Пиков: '+card.spikes.length+', худший кадр '+ms(card.spikes[0].ms)+' мс.');
 if(card.gc.collect)parts.push('GC.Collect в захвате: до '+ms(card.gc.collect.max)+' мс.');
 if(card.memory.length&&!lead.length)parts.push('Память: больше всего '+card.memory[0].name+'.');
 return parts.join(' ')||'Разобрал файл.';
}

module.exports={targetFps,merge,frameTime,top,segments,spikes,gc,single,diff,text,median,pct,WRAPPERS,WAITS,GROUPS,NAMES,ms};
