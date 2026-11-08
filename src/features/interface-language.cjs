// Interface language setting: system language by default, chosen in Settings → «Языки».
// The renderer reads the dictionary synchronously at startup (preload → petya:interface-language-bootstrap)
// and reloads the window after a change, so every view is rebuilt in the new language.
const language=require('../interface-language.cjs');
require('electron').ipcMain?.on('petya:interface-language-bootstrap',event=>{try{event.returnValue=language.bootstrap();}catch{event.returnValue={language:'ru',preference:'system',strings:{}};}});
module.exports={name:'interfaceLanguage',defaults:{},setup(s){
 return {ipc:{
  get:()=>language.describe(),
  set(preference){const result=language.setPreference(preference);s.refreshTrayMenu?.();return result;},
  // The page cannot reload itself: the main window blocks renderer navigation (external-links.cjs), so a
  // location.reload() was silently cancelled. The main process reloads it instead.
  reload(){const contents=s.win?.webContents;if(!contents||contents.isDestroyed())throw Error('Окно Пети недоступно.');setTimeout(()=>{if(!contents.isDestroyed())contents.reload();},50);return true;}
 },t:language.t};
}};
