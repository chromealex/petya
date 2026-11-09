// Which of the app's downloads (extension.json "downloads") are already on this computer: the engine counts as
// present when any RTS engine is found — the user's own (settings, PATH, ~/RTSEngine) or Petya's download.
const engine=require('./engine.cjs');
module.exports={async present(services){
 let userData='';try{userData=require('electron').app.getPath('userData');}catch{/* outside Electron */}
 return engine.best(engine.detect({settingsPath:services?.settings?.rtsLevelsEnginePath||'',userData}))?['engine']:[];
}};
