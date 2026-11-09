// «Профайлер» ↔ «Unity Editor»: Unity's Profiler «Save» (.data) is binary and is not decoded. When the Unity Editor
// app is added and its MCP for Unity server publishes `manage_profiler` with `get_frame_timing` (FrameTimingManager),
// the card can take one live reading of CPU main / render thread and GPU frame times. The call goes through the
// Unity app's own `invoke`, which shows its confirmation dialog and checks the chat and connection; a server without
// that tool answers «не опубликован», and the card then explains the CSV export instead.
const FIELDS=[
 ['cpuMainThreadFrameTime','main','CPU: основной поток'],
 ['cpuRenderThreadFrameTime','render','CPU: рендер-поток'],
 ['gpuFrameTime','render','GPU'],
 ['cpuMainThreadPresentWaitTime','main','Ожидание Present']
];
const norm=k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,'');
// Numbers by normalized key anywhere in the answer (structuredContent or JSON text; snake_case or camelCase).
function collect(value,out=new Map(),depth=0){
 if(depth>6||!value||typeof value!=='object')return out;
 for(const [k,v] of Object.entries(value)){if(typeof v==='number'&&Number.isFinite(v))out.set(norm(k),v);else if(typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim()))out.set(norm(k),Number(v));else collect(v,out,depth+1);}
 return out;
}
function reading(result){
 let data=result?.structuredContent;
 if(!data){const text=result?.content?.find(b=>b.type==='text')?.text;try{data=JSON.parse(text);}catch{data=null;}}
 const found=collect(data);
 const frame=found.get('cpuframetime');
 const parts=FIELDS.map(([k,group,label])=>({key:k,group,label,ms:found.get(norm(k))})).filter(p=>Number.isFinite(p.ms)&&p.ms>=0);
 if(!parts.length&&!Number.isFinite(frame))throw Error('Unity не вернула тайминги кадра (FrameTimingManager). Включите Frame Timing Stats в Player Settings или экспортируйте CSV из Profile Analyzer.');
 return {frame:Number.isFinite(frame)?Math.round(frame*100)/100:null,parts:parts.map(p=>({...p,ms:Math.round(p.ms*100)/100})),at:Date.now()};
}
const usable=s=>s.settings?.module_unity==='true'&&typeof s.unity?.invoke==='function';
async function live(s){
 if(!usable(s))throw Error('Добавьте и подключите «Unity Editor» в каталоге приложений.');
 const topic=s.dialogue.active();if(!topic)throw Error('Откройте чат с карточкой профайлера.');
 let result;
 try{result=await s.unity.invoke(topic.id,'call_tool',{name:'manage_profiler',arguments:{action:'get_frame_timing'}});}
 catch(e){if(/не опубликован/i.test(e.message))throw Error('В подключённом MCP for Unity нет инструмента manage_profiler. Экспортируйте CSV из Window → Analysis → Profile Analyzer (Export).');throw e;}
 if(result?.editors)throw Error('Открыто несколько редакторов Unity — выберите один в «Unity Editor» и повторите.');
 if(result?.isError)throw Error(result.content?.find(b=>b.type==='text')?.text||'Unity сообщила об ошибке.');
 return reading(result);
}
module.exports={live,reading,usable,FIELDS};
