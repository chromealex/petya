// Questions from the main process in Petya's own dialog (src/ui/app-dialog.js) instead of the system message box.
// showMessageBox(win, options) keeps Electron's signature and answer ({response, checkboxChecked}); when the window
// is not ready (starting, hidden, reloading) the system dialog is the fallback.
const pending=new Map();let ready=null,seq=0;
function attach(contents){ready=contents;contents.once('did-start-navigation',()=>{if(ready===contents)ready=null;for(const [id,p] of pending){pending.delete(id);p.resolve({response:p.cancelId,checkboxChecked:false});}});}
function answer(id,response){const p=pending.get(id);if(!p)return false;pending.delete(id);const n=Number(response);p.resolve({response:Number.isInteger(n)&&n>=0&&n<p.count?n:p.cancelId,checkboxChecked:false});return true;}
async function showMessageBox(win,options={}){
  if(win&&!win.webContents&&typeof win==='object'&&!options.message){options=win;win=null;}
  const buttons=(options.buttons?.length?options.buttons:['OK']).map(String);
  const cancelLike=b=>/^(Отмена|Cancel|Нет|No|Не сейчас|Not now|Закрыть|Close)$/i.test(String(b).trim());
  const cancelId=Number.isInteger(options.cancelId)?options.cancelId:buttons.length<2?0:buttons.findIndex(cancelLike)>=0?buttons.findIndex(cancelLike):buttons.length-1;
  const target=win&&!win.isDestroyed?.()?win:null;
  const usable=target&&ready&&!ready.isDestroyed()&&target.webContents===ready&&target.isVisible?.()&&!options.checkboxLabel;
  if(!usable){const {dialog}=require('electron');return target?dialog.showMessageBox(target,options):dialog.showMessageBox(options);}
  const id=++seq;
  return new Promise(resolve=>{
    pending.set(id,{resolve,cancelId,count:buttons.length});
    target.webContents.send('app-dialog',{id,message:String(options.message||''),detail:String(options.detail||''),buttons,defaultId:Number.isInteger(options.defaultId)?options.defaultId:0,cancelId});
    if(target.isMinimized?.())target.restore();target.focus?.();
  });
}
// Electron's dialog with showMessageBox replaced: file pickers stay system ones.
const dialog=()=>{const electron=require('electron').dialog;return new Proxy(electron,{get:(target,key)=>key==='showMessageBox'?showMessageBox:target[key]});};
module.exports={showMessageBox,attach,answer,dialog};
