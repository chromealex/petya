// «Профайлер»: readers for the capture formats Petya can parse reliably. Every reader returns a capture
// {format, name, markers:[{name,thread,median,mean,min,max,count,depth,gc}], frames:[{i,ms,gc,at}], memory:[], meta:{}, notes:[]}
// or a pair for comparison exports ({format:'unity-compare', rows:[…]}). Times are milliseconds, sizes bytes.
// Unity's own .data / .raw captures are binary and are never decoded here: `detect` names them so the reply can
// explain how to export CSV from Profile Analyzer instead.

// --- CSV -------------------------------------------------------------------------------------------------------
// Separator: the one most frequent outside quotes in the header line (Profile Analyzer 1.x writes «;», older «,»).
function separator(line){
 const n={';':0,',':0,'\t':0};let quoted=false;
 for(const c of line){if(c==='"')quoted=!quoted;else if(!quoted&&c in n)n[c]++;}
 return Object.entries(n).sort((a,b)=>b[1]-a[1])[0][1]?Object.entries(n).sort((a,b)=>b[1]-a[1])[0][0]:',';
}
function csv(text){
 const src=String(text||'').replace(/^﻿/,'');
 const first=src.split(/\r?\n/).find(l=>l.trim())||'';
 const sep=separator(first),rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"'&&cell.trim()==='')quoted=true;
  else if(c===sep){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];}
  else cell+=c;
 }
 row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);
 return rows.map(r=>r.map(x=>x.trim()));
}
const key=h=>String(h||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9%]/g,'');
// Numbers: «.» always in Profile Analyzer; a lone «,» decimal (Excel in a Russian locale) is accepted too.
function num(v){
 if(v===undefined||v===null)return NaN;
 let s=String(v).trim().replace(/\s/g,'');if(!s)return NaN;
 if(/^-?\d+,\d+$/.test(s))s=s.replace(',','.');
 const n=Number(s);return Number.isFinite(n)?n:NaN;
}
// Column index by the first matching header key.
function column(header,...names){const keys=header.map(key);for(const n of names){const i=keys.indexOf(n);if(i>=0)return i;}return -1;}
function columnLike(header,re){return header.map(key).findIndex(k=>re.test(k));}

// --- Threads ---------------------------------------------------------------------------------------------------
// Groups shown in the card: main, render (incl. GPU submission), jobs (workers, task graph) and other.
function threadGroup(name){
 const t=String(name||'').toLowerCase();
 if(!t)return 'main';
 if(/render|gfx|rhi|gpu|compositor|viz|draw|present|surface/.test(t))return 'render';
 if(/job|worker|taskgraph|task ?graph|threadpool|thread ?pool|background|pool|async|loading/.test(t))return 'jobs';
 if(/main|gamethread|game thread|crbrowsermain|crrenderermain|ui ?thread|^ui$|player/.test(t))return 'main';
 return 'other';
}

// --- Unity Profile Analyzer exports ----------------------------------------------------------------------------
function markerTable(rows,name,{thread='',notes=[]}={}){
 const h=rows[0];
 const c={name:column(h,'name','markername','marker','маркер','название'),median:column(h,'mediantime','median','medianms','медиана'),
  mean:column(h,'meantime','mean','average','avg','avgms','среднее'),min:column(h,'mintime','min','minms'),max:column(h,'maxtime','max','maxms'),
  count:column(h,'counttotal','count','calls','вызовы','вызовов'),countMedian:column(h,'countmedian'),depth:column(h,'mindepth','depth','глубина'),
  thread:column(h,'thread','threads','threadname','поток'),gcMedian:column(h,'gcallocmedianbytes','gcallocmedian','gcmedian'),
  gcTotal:column(h,'gcalloctotalbytes','gcalloctotal','gctotal'),gcCount:column(h,'gcalloccount','gccount'),frames:column(h,'numberofframescontainingmarker'),
  maxFrame:column(h,'maxframeindex','maxindividualframe')};
 if(c.median<0&&c.mean<0)c.median=columnLike(h,/(?:ms|time|время)$/);
 const markers=[];
 for(const r of rows.slice(1)){
  const n=(r[c.name]||'').replace(/^"|"$/g,'').trim();if(!n)continue;
  const median=num(r[c.median>=0?c.median:c.mean]);if(!Number.isFinite(median))continue;
  const at=i=>i>=0?num(r[i]):NaN;
  const th=c.thread>=0?r[c.thread]:thread;
  markers.push({name:n.slice(0,200),thread:th||'',group:threadGroup(th||thread||'main'),median,mean:at(c.mean),min:at(c.min),max:at(c.max),
   count:at(c.count),countMedian:at(c.countMedian),depth:at(c.depth),gcMedian:at(c.gcMedian),gcTotal:at(c.gcTotal),gcCount:at(c.gcCount),
   frames:at(c.frames),maxFrame:at(c.maxFrame)});
 }
 if(c.thread<0&&!thread)notes.push('В экспорте нет колонки потока: считаю маркеры основным потоком (так Profile Analyzer выбирает по умолчанию).');
 return {format:'unity-markers',name,markers,frames:[],memory:[],meta:{},notes};
}
function frameTimes(rows,name){
 const h=rows[0],ms=column(h,'frametimems','frametime','ms'),idx=column(h,'frameindex','frame'),gc=column(h,'gcallocbytes','gcalloc'),at=column(h,'timefromfirstframems');
 const frames=[];
 for(const r of rows.slice(1)){const v=num(r[ms]);if(!Number.isFinite(v))continue;frames.push({i:Number.isFinite(num(r[idx]))?num(r[idx]):frames.length,ms:v,gc:gc>=0?num(r[gc]):NaN,at:at>=0?num(r[at]):NaN});}
 return {format:'unity-frames',name,markers:[],frames,memory:[],meta:{},notes:[]};
}
// Compare view «Marker Comparison» table: Left = before, Right = after (the order Profile Analyzer loads them in).
function compareTable(rows,name){
 const h=rows[0];
 const c={name:column(h,'markername','name'),left:column(h,'leftmedian'),right:column(h,'rightmedian'),cl:column(h,'countleft'),cr:column(h,'countright'),
  tl:column(h,'threadsleft','threadleft'),tr:column(h,'threadsright','threadright'),dl:column(h,'depthleft'),dr:column(h,'depthright'),
  gl:column(h,'gcallocmedianleft'),gr:column(h,'gcallocmedianright')};
 const before=[],after=[];
 for(const r of rows.slice(1)){
  const n=(r[c.name]||'').trim();if(!n)continue;
  const l=num(r[c.left]),rr=num(r[c.right]);
  const thread=r[c.tl]||r[c.tr]||'';
  const base={name:n.slice(0,200),thread,group:threadGroup(thread||'main')};
  if(Number.isFinite(l)&&(l>0||num(r[c.cl])>0))before.push({...base,median:l,count:num(r[c.cl]),depth:num(r[c.dl]),gcMedian:num(r[c.gl])});
  if(Number.isFinite(rr)&&(rr>0||num(r[c.cr])>0))after.push({...base,thread:r[c.tr]||thread,median:rr,count:num(r[c.cr]),depth:num(r[c.dr]),gcMedian:num(r[c.gr])});
 }
 const notes=c.tl<0?['В экспорте сравнения нет колонок потоков: считаю маркеры основным потоком.']:[];
 return {format:'unity-compare',name,pair:[{format:'unity-markers',name:name+' · слева',markers:before,frames:[],memory:[],meta:{},notes},{format:'unity-markers',name:name+' · справа',markers:after,frames:[],memory:[],meta:{},notes:[]}],notes};
}
function compareFrames(rows,name){
 const h=rows[0],l=column(h,'leftframetimems'),r=column(h,'rightframetimems'),lg=column(h,'leftgcallocbytes'),rg=column(h,'rightgcallocbytes'),li=column(h,'leftframeindex'),ri=column(h,'rightframeindex');
 const a=[],b=[];
 for(const row of rows.slice(1)){
  const x=num(row[l]),y=num(row[r]);
  if(Number.isFinite(x))a.push({i:Number.isFinite(num(row[li]))?num(row[li]):a.length,ms:x,gc:lg>=0?num(row[lg]):NaN});
  if(Number.isFinite(y))b.push({i:Number.isFinite(num(row[ri]))?num(row[ri]):b.length,ms:y,gc:rg>=0?num(row[rg]):NaN});
 }
 const cap=(frames,side)=>({format:'unity-frames',name:name+' · '+side,markers:[],frames,memory:[],meta:{},notes:[]});
 return {format:'unity-compare',name,pair:[cap(a,'слева'),cap(b,'справа')],notes:[]};
}

// --- Memory summaries (Memory Profiler tables saved as CSV, or any name + size table) ---------------------------
function bytes(v,unit=''){
 const s=String(v||'').trim();const m=s.match(/^(-?[\d\s.,]+)\s*([kmgt]?i?b|[кмгт]б|байт\p{L}*)?$/iu);if(!m)return NaN;
 const n=num(m[1].replace(/\s/g,''));if(!Number.isFinite(n))return NaN;
 const u=(m[2]||unit).toLowerCase();
 const k=/^(?:k|к)/.test(u)?1024:/^(?:m|м)/.test(u)?1024**2:/^(?:g|г)/.test(u)?1024**3:/^(?:t|т)/.test(u)?1024**4:1;
 return n*k;
}
function memoryTable(rows,name){
 const h=rows[0];
 const n=column(h,'name','description','category','type','object','объект','категория','название');
 let s=columnLike(h,/^(?:allocated|resident|total)?size|bytes|память|размер|memory/);
 const unit=(String(h[s]||'').match(/\((k|m|g)?i?b\)|\b(kb|mb|gb)\b/i)||[])[0]||'';
 const memory=[];
 for(const r of rows.slice(1)){const v=bytes(r[s],unit.replace(/[()]/g,''));const label=(r[n>=0?n:0]||'').trim();if(label&&Number.isFinite(v))memory.push({name:label.slice(0,200),bytes:v});}
 memory.sort((a,b)=>b.bytes-a.bytes);
 return {format:'memory',name,markers:[],frames:[],memory,meta:{},notes:[]};
}

// --- Chrome trace JSON (chrome://tracing, Perfetto UI «Open trace file», engines that write it) ------------------
const FRAME=/^(?:frame|frames|playerloop|player loop|beginframe|begin frame|drawframe|draw frame|gameframe|game frame|frame ?\d+|tick|mainloop|main loop|onframe|update ?frame)$/i;
function chromeTrace(json,name){
 const events=Array.isArray(json)?json:Array.isArray(json?.traceEvents)?json.traceEvents:null;
 if(!events)throw Error('В JSON нет traceEvents — это не трасса Chrome/Perfetto.');
 const threads=new Map(),spans=[],stacks=new Map();
 const tkey=e=>e.pid+':'+e.tid;
 for(const e of events){
  if(!e||typeof e!=='object')continue;
  if(e.ph==='M'&&e.name==='thread_name')threads.set(tkey(e),String(e.args?.name||''));
  else if(e.ph==='X'&&Number.isFinite(+e.ts)&&Number.isFinite(+e.dur))spans.push({name:String(e.name||'?'),key:tkey(e),ts:+e.ts,dur:+e.dur});
  else if(e.ph==='B'&&Number.isFinite(+e.ts)){const k=tkey(e);if(!stacks.has(k))stacks.set(k,[]);stacks.get(k).push({name:String(e.name||'?'),ts:+e.ts});}
  else if(e.ph==='E'&&Number.isFinite(+e.ts)){const st=stacks.get(tkey(e));const open=st?.pop();if(open)spans.push({name:open.name,key:tkey(e),ts:open.ts,dur:+e.ts-open.ts});}
 }
 if(!spans.length)throw Error('В трассе нет событий с длительностью (ph X или B/E).');
 // A trace of one unnamed thread is that program's main thread.
 const single=new Set(spans.map(sp=>sp.key)).size===1&&!threads.size;
 const threadName=k=>threads.get(k)||(single?'Main':'tid '+k.split(':')[1]);
 // Depth per thread from nesting.
 const byThread=new Map();for(const sp of spans){if(!byThread.has(sp.key))byThread.set(sp.key,[]);byThread.get(sp.key).push(sp);}
 for(const list of byThread.values()){list.sort((a,b)=>a.ts-b.ts||b.dur-a.dur);const open=[];for(const sp of list){while(open.length&&open.at(-1).ts+open.at(-1).dur<=sp.ts)open.pop();sp.depth=open.length;sp.parent=open.at(-1)||null;open.push(sp);}}
 // Frames: spans named like a frame on a main-like thread, the shallowest ones.
 let frames=spans.filter(sp=>FRAME.test(sp.name.trim()));
 if(frames.length){const groups=new Map();for(const f of frames){const g=f.key+'|'+f.name;groups.set(g,(groups.get(g)||[]).concat(f));}
  frames=[...groups.values()].sort((a,b)=>b.length-a.length||Math.min(...a.map(x=>x.depth))-Math.min(...b.map(x=>x.depth)))[0].sort((a,b)=>a.ts-b.ts);}
 const notes=[];
 const markers=new Map();
 const add=(sp,frame)=>{const k=sp.key+'\n'+sp.name;let m=markers.get(k);if(!m){m={name:sp.name.slice(0,200),thread:threadName(sp.key),key:sp.key,depth:sp.depth,perFrame:new Map(),durations:[],count:0,total:0};markers.set(k,m);}
  m.depth=Math.min(m.depth,sp.depth);m.count++;m.total+=sp.dur/1000;m.durations.push(sp.dur/1000);if(frame>=0)m.perFrame.set(frame,(m.perFrame.get(frame)||0)+sp.dur/1000);};
 const starts=frames.map(f=>f.ts);
 const frameOf=ts=>{let lo=0,hi=starts.length-1,ans=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(starts[mid]<=ts){ans=mid;lo=mid+1;}else hi=mid-1;}return ans>=0&&ts<frames[ans].ts+frames[ans].dur?ans:-1;};
 for(const sp of spans)add(sp,frames.length?frameOf(sp.ts):-1);
 const median=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
 const out=[...markers.values()].map(m=>{
  const per=frames.length?[...Array(frames.length).keys()].map(i=>m.perFrame.get(i)||0):[];
  const inFrames=per.filter(v=>v>0);
  return {name:m.name,thread:m.thread,group:threadGroup(m.thread),depth:m.depth,count:m.count,
   median:frames.length?median(per):median(m.durations),mean:frames.length?per.reduce((a,b)=>a+b,0)/per.length:m.total/m.count,
   min:frames.length?Math.min(...per):Math.min(...m.durations),max:frames.length?Math.max(...per):Math.max(...m.durations),
   frames:inFrames.length,total:m.total,frameRoot:frames.length&&m.key===frames[0].key&&m.name===frames[0].name};
 });
 if(!frames.length)notes.push('В трассе нет маркеров кадра (Frame, PlayerLoop, BeginFrame…): показываю время на вызов, доли бюджета кадра не считаю.');
 const t0=frames[0]?.ts||0;
 return {format:'chrome-trace',name,markers:out,frames:frames.map((f,i)=>({i,ms:f.dur/1000,gc:NaN,at:(f.ts-t0)/1000})),memory:[],
  meta:{perCall:!frames.length,threads:[...new Set(out.map(m=>m.thread))].length,events:spans.length},notes};
}

// --- Android `adb shell dumpsys gfxinfo <package> framestats` -----------------------------------------------------
// Each PROFILEDATA row is one frame in nanoseconds; rows with non-zero Flags are not regular frames. Phases follow
// the Android docs: UI thread (input, animation, measure/layout, draw) and RenderThread (sync, issue commands).
const PHASES=[['Обработка ввода','HandleInputStart','AnimationStart','main'],['Анимации','AnimationStart','PerformTraversalsStart','main'],
 ['Measure/Layout','PerformTraversalsStart','DrawStart','main'],['Draw (запись команд)','DrawStart','SyncQueued','main'],
 ['Sync (загрузка текстур)','SyncStart','IssueDrawCommandsStart','render'],['Отправка команд на GPU','IssueDrawCommandsStart','FrameCompleted','render']];
function gfxinfo(text,name){
 const lines=String(text).split(/\r?\n/);
 const start=lines.findIndex(l=>/^\s*Flags,/.test(l));
 const meta={};
 const grab=(re,k)=>{const m=String(text).match(re);if(m)meta[k]=num(m[1]);};
 grab(/Total frames rendered:\s*(\d+)/,'total');grab(/Janky frames:\s*(\d+)/,'janky');grab(/50th percentile:\s*(\d+)ms/,'p50');grab(/90th percentile:\s*(\d+)ms/,'p90');
 grab(/95th percentile:\s*(\d+)ms/,'p95');grab(/99th percentile:\s*(\d+)ms/,'p99');grab(/Number Missed Vsync:\s*(\d+)/,'missedVsync');
 grab(/Number Slow UI thread:\s*(\d+)/,'slowUi');grab(/Number Slow bitmap uploads:\s*(\d+)/,'slowBitmap');grab(/Number Slow issue draw commands:\s*(\d+)/,'slowDraw');
 grab(/Number Frame deadline missed:\s*(\d+)/,'deadlineMissed');
 const pkg=String(text).match(/Graphics info for pid \d+ \[([^\]]+)\]/);if(pkg)meta.package=pkg[1];
 const frames=[],phase=PHASES.map(()=>[]);
 if(start>=0){
  const h=lines[start].split(',').map(x=>x.trim()),col=n=>h.indexOf(n);
  for(const line of lines.slice(start+1)){
   if(!/^\s*\d/.test(line))break;
   const v=line.split(',').map(x=>Number(x.trim()));
   if(v[col('Flags')]!==0)continue;
   const iv=v[col('IntendedVsync')],done=v[col('FrameCompleted')];
   if(!(iv>0&&done>iv))continue;
   frames.push({i:frames.length,ms:(done-iv)/1e6,gc:NaN,at:frames.length?(iv-frames[0].iv)/1e6:0,iv});
   PHASES.forEach(([,a,b],k)=>{const x=v[col(a)],y=v[col(b)];if(x>0&&y>=x)phase[k].push((y-x)/1e6);});
  }
 }
 if(!frames.length&&!meta.total)throw Error('Не нашёл ни PROFILEDATA, ни сводки gfxinfo. Снимите: adb shell dumpsys gfxinfo <пакет> framestats');
 const median=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
 const markers=PHASES.map(([label,, ,group],k)=>({name:label,thread:group==='main'?'UI thread':'RenderThread',group,depth:1,count:phase[k].length,
  median:median(phase[k]),mean:phase[k].reduce((a,b)=>a+b,0)/(phase[k].length||1),min:phase[k].length?Math.min(...phase[k]):NaN,max:phase[k].length?Math.max(...phase[k]):NaN})).filter(m=>m.count);
 const notes=['gfxinfo видит только кадры Android View/HWUI. Кадры движка на SurfaceView (Unity, Unreal) сюда не попадают — для игры снимайте профайлер движка.'];
 return {format:'gfxinfo',name,markers,frames:frames.map(({iv,...f})=>f),memory:[],meta,notes};
}

// --- Detection -----------------------------------------------------------------------------------------------------
// What a file is, from its name and the first bytes of its text: a capture reader, or a reason it cannot be read.
function detect(name,text){
 const n=String(name||'').toLowerCase();
 if(/\.(?:data|raw)$/.test(n))return {unsupported:'unity-binary'};
 if(/\.(?:trace|tracev3)$/.test(n)||/\.trace\//.test(n))return {unsupported:'instruments'};
 if(/\.(?:pftrace|perfetto-trace|perfetto)$/.test(n))return {unsupported:'perfetto-proto'};
 if(/\.(?:snap)$/.test(n))return {unsupported:'memory-snapshot'};
 const head=String(text||'').slice(0,4000);
 if(/---PROFILEDATA---|Janky frames:|Graphics info for pid/.test(head)||/^\s*Flags,(?:FrameTimelineVsyncId,)?IntendedVsync/m.test(head))return {kind:'gfxinfo'};
 if(/^\s*[[{]/.test(head)&&/traceEvents|"ph"\s*:/.test(head))return {kind:'chrome-trace'};
 if(/^\s*[[{]/.test(head))return {kind:'json'};
 const firstLine=(head.replace(/^﻿/,'').split(/\r?\n/).find(l=>l.trim())||'');
 const keys=csv(firstLine)[0]?.map(key)||[];
 if(keys.includes('leftmedian')&&keys.includes('rightmedian'))return {kind:'unity-compare'};
 if(keys.includes('leftframetimems')&&keys.includes('rightframetimems'))return {kind:'unity-compare-frames'};
 if(keys.includes('frametimems')||keys.includes('frameoffset')&&keys.some(k=>/frametime/.test(k)))return {kind:'unity-frames'};
 if(keys.some(k=>['mediantime','median','meantime','mean','avgms','медиана','среднее'].includes(k))&&keys.some(k=>['name','markername','marker','маркер','название'].includes(k)))return {kind:'unity-markers'};
 if(keys.some(k=>/size|bytes|память|размер|memory/.test(k))&&!keys.some(k=>/time|ms$/.test(k)))return {kind:'memory'};
 if(keys.length>1&&keys.some(k=>/(?:ms|time|время)$/.test(k))&&keys.some(k=>['name','marker','маркер','название'].includes(k)))return {kind:'unity-markers'};
 return {kind:null};
}
// The capture from a file's text. Throws a readable error for text that is not a supported capture.
function parse(name,text,{thread=''}={}){
 const d=detect(name,text);
 if(d.unsupported)throw Object.assign(Error('unsupported'),{unsupported:d.unsupported,file:name});
 if(d.kind==='gfxinfo')return gfxinfo(text,name);
 if(d.kind==='chrome-trace'||d.kind==='json'){let json;try{json=JSON.parse(String(text));}catch{throw Error('«'+name+'»: JSON повреждён или обрезан.');}return chromeTrace(json,name);}
 const rows=csv(text);
 if(rows.length<2)throw Error('«'+name+'»: в таблице нет строк с данными.');
 if(d.kind==='unity-compare')return compareTable(rows,name);
 if(d.kind==='unity-compare-frames')return compareFrames(rows,name);
 if(d.kind==='unity-frames')return frameTimes(rows,name);
 if(d.kind==='unity-markers')return markerTable(rows,name,{thread});
 if(d.kind==='memory')return memoryTable(rows,name);
 throw Error('«'+name+'»: не узнал формат. Нужен CSV из Profile Analyzer (маркеры или время кадров), трасса Chrome JSON или вывод dumpsys gfxinfo framestats.');
}
// A thread named in the file name (`markers_render.csv`, `jobs.csv`) for marker tables without a thread column.
function threadFromName(name){const n=String(name||'').toLowerCase();return /render|gfx/.test(n)?'Render Thread':/job|worker/.test(n)?'Job Worker':/main/.test(n)?'Main Thread':'';}

module.exports={csv,num,separator,threadGroup,detect,parse,threadFromName,markerTable,frameTimes,compareTable,compareFrames,chromeTrace,gfxinfo,memoryTable,bytes};
