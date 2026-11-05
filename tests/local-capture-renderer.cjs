// Exercise the actual isolated capture page with deterministic audio, no OS permissions.
const {app,BrowserWindow,ipcMain}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
app.whenReady().then(async()=>{
 const channel='petya-meeting-11111111-1111-1111-1111-111111111111';let parts=0;
 ipcMain.handle(channel,async(e,method,source,item)=>{if(method==='permission')return true;if(method==='error')throw Error(source);assert.equal(method,'append');assert(['Zoom','Микрофон'].includes(source));assert(item.wav.byteLength>44);parts++;});
 const win=new BrowserWindow({show:false,webPreferences:{preload:path.resolve('src/extensions/zoom-bot/capture-preload.cjs'),additionalArguments:[channel],sandbox:true,contextIsolation:true,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required'}});
 try{
  await win.loadFile(path.resolve('src/extensions/zoom-bot/capture.html'));
  const result=await win.webContents.executeJavaScript(`(async()=>{
   const contexts=[];
   function fake(){const c=new AudioContext(),o=c.createOscillator(),d=c.createMediaStreamDestination();o.frequency.value=220;o.connect(d);o.start();contexts.push(c);return d.stream;}
   navigator.mediaDevices.getDisplayMedia=async()=>fake();navigator.mediaDevices.getUserMedia=async()=>fake();
   await window.startCapture({microphone:true});await new Promise(r=>setTimeout(r,1200));await window.finishCapture();for(const c of contexts)await c.close();return typeof window.petya.transcribe==='undefined';
  })()`,true);
  assert.equal(result,true);assert(parts>=2);console.log('Isolated renderer: real AudioWorklet, two audio sources, encrypted-store IPC boundary and no chat/transcription API passed');
 }finally{win.destroy();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
