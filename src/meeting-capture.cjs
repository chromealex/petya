const path=require('node:path'),{pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto');
// Meeting capture: a separate sandboxed renderer (src/ui/meeting-capture.html) owns the system audio and the
// microphone; chat renderers have no audio buffers.
class LocalCapture {
 constructor({append,onError}){Object.assign(this,{append,onError});this.win=null;}
 async start(config){
  const {BrowserWindow,session,ipcMain,systemPreferences,desktopCapturer}=require('electron');
  const channel='petya-meeting-'+randomUUID(),file=path.join(__dirname,'ui','meeting-capture.html'),entry=pathToFileURL(file).href;
  const isolated=session.fromPartition(channel);
  this.win=new BrowserWindow({show:false,webPreferences:{session:isolated,preload:path.join(__dirname,'meeting-capture-preload.cjs'),additionalArguments:[channel],sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
  const win=this.win;
  require('./capture.cjs').installCapture({session:isolated,win,entry,desktopCapturer,platform:process.platform});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  ipcMain.handle(channel,async(event,method,...args)=>{
   if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||win.webContents.getURL()!==entry)throw Error('Untrusted capture sender');
   if(method==='permission')return process.platform!=='darwin'||systemPreferences.askForMediaAccess('microphone');
   if(method==='append')return this.append(...args);
   if(method==='error'){this.onError(new Error(String(args[0]).slice(0,500)));return;}
   throw Error('Unknown capture operation');
  });
  this.cleanup=()=>ipcMain.removeHandler(channel);
  win.webContents.once('render-process-gone',()=>this.onError(Error('Процесс записи остановился. Сохранённые фрагменты доступны для обработки.')));
  try{await win.loadFile(file);await win.webContents.executeJavaScript('window.startCapture('+JSON.stringify(config)+')',true);}
  catch(e){this.destroy();throw e;}
 }
 async finish(){const win=this.win;if(!win||win.isDestroyed())return;try{await win.webContents.executeJavaScript('window.finishCapture()',true);}finally{this.destroy();}}
 destroy(){this.cleanup?.();this.cleanup=null;if(this.win&&!this.win.isDestroyed()){this.win.webContents.removeAllListeners('render-process-gone');this.win.destroy();}this.win=null;}
}
module.exports={LocalCapture};
