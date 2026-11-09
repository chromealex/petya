// Appearance setting (src/appearance.cjs): light / dark / system, presets, accent, text size. The renderer reads it
// synchronously at startup (preload → petya:appearance-bootstrap) and applies changes live, without a reload; the
// text size is the window's zoom factor, so every pixel size in the stylesheets scales with it.
const appearance=require('../appearance.cjs');
const ZOOM={compact:0.92,normal:1,large:1.12};
require('electron').ipcMain?.on('petya:appearance-bootstrap',event=>{try{event.returnValue=appearance.bootstrap();}catch{event.returnValue={...appearance.DEFAULT,tokens:{dark:{},light:{}},presets:[]};}});
function windows(){try{return require('electron').BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed());}catch{return [];}}
function apply(){
 const state=appearance.bootstrap();
 for(const w of windows()){const wc=w.webContents;if(wc.isDestroyed())continue;
  // Only Petya's own pages: the meeting capture, viewers and the chat browser's web views keep their zoom.
  if(!/\/ui\/(?:index|dashboard-window)\.html/.test(wc.getURL()))continue;
  try{wc.setZoomFactor(ZOOM[state.size]||1);}catch{}
  wc.send('appearance',state);}
 return state;
}
module.exports={name:'appearance',defaults:{},ZOOM,setup(s){
 // The text size of the main window after every load (a reload resets the zoom factor).
 const win=s.win;if(win&&!win.isDestroyed())win.webContents.on('did-finish-load',()=>{try{win.webContents.setZoomFactor(ZOOM[appearance.read().size]||1);}catch{}});
 return {ipc:{
  get:()=>appearance.bootstrap(),
  set(patch){if(!patch||typeof patch!=='object')throw Error('Некорректные настройки оформления.');appearance.write({...appearance.read(),...patch});return apply();},
  reset(){appearance.write(appearance.DEFAULT);return apply();}
 },appearance:{apply}};
}};
