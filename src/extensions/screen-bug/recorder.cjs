// «Запись экрана → баг», the recording: the window or screen the user picked, recorded by a small always-on-top
// control window (recorder.html: a red dot, the time «0:12 / 2:00» and «Стоп»). That window owns the
// MediaRecorder; it runs sandboxed in its own in-memory session whose display-media handler grants exactly the
// chosen source, never another one. It is excluded from the capture itself (content protection). Chunks go to the
// file every second; the recording stops at «Стоп», at the cap (2 minutes), when the source disappears, or when
// the file would pass 150 MB. Never silent: no recording happens without this visible window.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const MAX_MS=120000,MAX_BYTES=150*1024*1024,BITRATE=2500000;
const LABELS={stop:'Стоп',title:'Запись экрана для бага',of:'из'};

function hash(language=require('../../interface-language.cjs')){
 const t=Object.fromEntries(Object.entries(LABELS).map(([k,v])=>[k,language.t(v)]));
 return Object.entries(t).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
}
// Top-right corner of the display the source is on (or the primary one).
function corner(electron,size={width:248,height:52}){
 const d=electron.screen.getPrimaryDisplay().workArea;
 return {x:Math.round(d.x+d.width-size.width-16),y:Math.round(d.y+16),...size};
}

// start({source, file}) → {id, stop(), done: Promise<{file, bytes, duration, poster, reason}>}
async function start({electron=require('electron'),source,file,max=MAX_MS,maxBytes=MAX_BYTES,onState=()=>{}}){
 const {BrowserWindow,session,ipcMain}=electron;
 const channel='petya-screen-bug-'+randomUUID();
 const isolated=session.fromPartition(channel);
 const page=path.join(__dirname,'recorder.html');
 const win=new BrowserWindow({...corner(electron),frame:false,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,alwaysOnTop:true,show:false,hasShadow:true,
  backgroundColor:'#1d2220',title:LABELS.title,webPreferences:{session:isolated,preload:path.join(__dirname,'recorder-preload.cjs'),additionalArguments:[channel],sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,devTools:false}});
 win.setAlwaysOnTop(true,'screen-saver');win.setVisibleOnAllWorkspaces?.(true,{visibleOnFullScreen:true});
 // The control window must not appear in the recording.
 try{win.setContentProtection(true);}catch{/* not supported */}
 const own=wc=>wc===win.webContents;
 isolated.setPermissionCheckHandler((wc,permission)=>own(wc)&&permission==='display-capture');
 isolated.setPermissionRequestHandler((wc,permission,callback)=>callback(own(wc)&&permission==='display-capture'));
 isolated.setDisplayMediaRequestHandler((request,callback)=>{
  if(request.frame!==win.webContents.mainFrame)return callback({});
  callback({video:source});
 },{useSystemPicker:false});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const out=fs.openSync(file,'w',0o600);
 let bytes=0,settled=false,closed=false,resolve,reject;
 const done=new Promise((a,b)=>{resolve=a;reject=b;});
 const cleanup=()=>{if(closed)return;closed=true;ipcMain.removeHandler(channel);try{fs.closeSync(out);}catch{/* closed */}if(!win.isDestroyed())win.destroy();clearTimeout(cap);};
 const finish=(result,error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve({file,bytes,...result});};
 const stop=reason=>{if(settled||win.isDestroyed())return;stopReason=stopReason||reason;win.webContents.executeJavaScript('window.stopRecording()',true).catch(()=>finish({duration:0,poster:'',reason:'closed'}));};
 let stopReason='';
 // A safety net: the page stops itself at `max`, this fires only if it did not.
 const cap=setTimeout(()=>stop('cap'),max+5000);
 ipcMain.handle(channel,async(event,method,arg)=>{
  if(!own(event.sender)||event.senderFrame!==win.webContents.mainFrame)throw Error('Untrusted recorder sender');
  if(method==='chunk'){
   const buf=Buffer.from(arg instanceof ArrayBuffer?new Uint8Array(arg):arg);
   if(bytes+buf.length>maxBytes){stop('size');return {stop:true};}
   fs.writeSync(out,buf);bytes+=buf.length;return {bytes};
  }
  if(method==='started'){onState({recording:true});return true;}
  if(method==='done'){
   const poster=typeof arg?.poster==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(arg.poster)&&arg.poster.length<400000?arg.poster:'';
   finish({duration:Math.max(0,Math.min(max+5000,Number(arg?.duration)||0)),poster,reason:stopReason||String(arg?.reason||'stop').slice(0,20)});return true;
  }
  if(method==='error'){finish(null,Error(String(arg||'').slice(0,300)||'Запись не началась.'));return true;}
  throw Error('Unknown recorder operation');
 });
 win.on('closed',()=>{if(!settled)finish({duration:0,poster:'',reason:'closed'});});
 win.webContents.once('render-process-gone',()=>finish(null,Error('Окно записи закрылось. Сохранённая часть записи — в файле.')));
 try{
  await win.loadFile(page,{hash:hash()});
  win.showInactive();
  await win.webContents.executeJavaScript('window.startRecording('+JSON.stringify({max,bitrate:BITRATE})+')',true);
 }catch(e){finish(null,Error('Запись не началась: '+String(e.message||e).slice(0,200)));}
 return {id:channel,stop:()=>stop('stop'),done};
}
module.exports={start,MAX_MS,MAX_BYTES,LABELS,hash,corner};
