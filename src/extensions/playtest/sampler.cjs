// «Разбор плейтеста»: frames from a local video in a hidden, sandboxed window (sampler.html). The window is muted,
// cannot navigate or open others, and is destroyed on cancel or when the work ends. Frames are grabbed in batches,
// so only one batch of model-sized JPEGs is held at a time.
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const active=new Set();
const cancelAll=()=>{for(const win of active)if(!win.isDestroyed())win.destroy();};

// Sample times: one per `step` seconds (≥ 12, ≤ max), spread over the whole clip.
function times(duration,{step=5,min=12,max=90}={}){
 const count=Math.max(Math.min(min,Math.ceil(duration)+1),Math.min(max,Math.ceil(duration/step)+1));
 if(count<=1)return [0];
 return Array.from({length:count},(_,i)=>Math.round(i*(duration-0.05)/(count-1)*100)/100);
}

async function open(file,{signal}={}){
 const {BrowserWindow}=require('electron');
 const win=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
 active.add(win);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.setAudioMuted(true);
 const closed=new Promise((_,reject)=>win.once('closed',()=>reject(Object.assign(Error('Разбор плейтеста отменён.'),{cancelled:true}))));closed.catch(()=>{});
 const stop=()=>{if(!win.isDestroyed())win.destroy();};
 signal?.addEventListener('abort',stop,{once:true});
 const run=(code,ms=60000)=>{
  if(win.isDestroyed())throw Object.assign(Error('Разбор плейтеста отменён.'),{cancelled:true});
  let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Видео не читается: кадры не извлеклись за минуту. Проверьте формат (MP4/H.264 или WebM).')),ms);});
  return Promise.race([win.webContents.executeJavaScript(code),closed,timeout]).finally(()=>clearTimeout(timer));
 };
 const close=()=>{signal?.removeEventListener('abort',stop);active.delete(win);stop();};
 try{
  await Promise.race([win.loadFile(path.join(__dirname,'sampler.html')),closed]);
  const info=await run('window.openSample('+JSON.stringify(pathToFileURL(file).href)+')');
  return {...info,grab:list=>run('window.grabSamples('+JSON.stringify(list)+')',Math.max(60000,list.length*16000)),close};
 }catch(e){close();throw e;}
}
module.exports={open,times,cancelAll};
