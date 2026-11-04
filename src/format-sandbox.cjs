const {BrowserWindow,session}=require('electron');const {randomUUID}=require('node:crypto');
const active=new Set();
async function runFormat(code,bytes,entries=[],timeout=15000){
 if(typeof code!=='string'||code.length>20000)throw Error('Некорректный обработчик формата.');
 const pageURL='data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27; script-src %27unsafe-eval%27; connect-src %27none%27; frame-src %27none%27; form-action %27none%27">';
 const ses=session.fromPartition('petya-format-'+randomUUID());ses.setPermissionRequestHandler((_w,_p,cb)=>cb(false));ses.setPermissionCheckHandler(()=>false);ses.webRequest.onBeforeRequest((d,cb)=>cb({cancel:d.url!==pageURL||d.resourceType!=='mainFrame'}));ses.on('will-download',e=>e.preventDefault());
 ses.enableNetworkEmulation({offline:true});
 const win=new BrowserWindow({show:false,skipTaskbar:true,webPreferences:{session:ses,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,allowRunningInsecureContent:false,backgroundThrottling:false}});active.add(win);win.webContents.setAudioMuted(true);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.on('will-redirect',e=>e.preventDefault());win.webContents.on('will-prevent-unload',e=>e.preventDefault());
 let timer;const closed=new Promise((_,reject)=>{win.once('closed',()=>reject(Error('Чтение формата остановлено.')));win.webContents.once('render-process-gone',()=>reject(Error('Обработчик формата завершился аварийно.')));});closed.catch(()=>{});
 try{const job=(async()=>{await win.loadURL(pageURL);
 const result=await win.webContents.executeJavaScript(`(async()=>{for(const key of ['RTCPeerConnection','webkitRTCPeerConnection','alert','confirm','prompt','print'])Object.defineProperty(globalThis,key,{value:undefined,writable:false,configurable:false});const encoded=${JSON.stringify(bytes.toString('base64'))};const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));const entries=${JSON.stringify(entries)};const slice=Function.call.bind(String.prototype.slice);const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const parse=new AsyncFunction('bytes','entries',${JSON.stringify(code)});const result=await parse(bytes,entries);if(typeof result!=='string'||!result.trim())throw Error('Обработчик не извлёк текст.');return {text:slice(result,0,40000),truncated:result.length>40000};})()`);
 if(!result||typeof result.text!=='string'||!result.text.trim()||result.text.includes('\0'))throw Error('Обработчик не вернул читаемый текст.');return {text:result.text.slice(0,40000),truncated:!!result.truncated};})();
 return await Promise.race([job,closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Обработчик превысил время чтения.')),timeout);})]);
 }finally{clearTimeout(timer);active.delete(win);if(!win.isDestroyed())win.destroy();await ses.clearStorageData();}
}
function stopFormats(){for(const win of active)if(!win.isDestroyed())win.destroy();}
module.exports={runFormat,stopFormats};
