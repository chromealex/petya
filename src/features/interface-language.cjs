// Interface language setting: system language by default, chosen in Settings → «Языки».
// The renderer reads the dictionary synchronously at startup (preload → petya:interface-language-bootstrap)
// and reloads the window after a change, so every view is rebuilt in the new language.
const language=require('../interface-language.cjs');
require('electron').ipcMain?.on('petya:interface-language-bootstrap',event=>{try{event.returnValue=language.bootstrap();}catch{event.returnValue={language:'ru',preference:'system',strings:{}};}});
module.exports={name:'interfaceLanguage',defaults:{},setup(s){
 return {ipc:{
  get:()=>language.describe(),
  set(preference){const result=language.setPreference(preference);s.refreshTrayMenu?.();return result;}
 },t:language.t};
}};
