// Bridge for Petya's own dialogs (src/app-dialog.cjs ↔ src/ui/app-dialog.js).
const bridge=require('../app-dialog.cjs');
function setup(s){
  return {ipc:{
    ready:()=>{const w=s.win;if(w&&!w.isDestroyed())bridge.attach(w.webContents);return true;},
    answer:(id,response)=>bridge.answer(Number(id),response)
  }};
}
module.exports={name:'appDialog',setup};
