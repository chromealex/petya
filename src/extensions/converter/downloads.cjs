// Which of the Converter's downloads (extension.json "downloads") are already on this computer: ffmpeg counts as
// present when Petya downloaded it or the system has one (Homebrew, PATH).
const install=require('./ffmpeg-install.cjs');
module.exports={async present(){
 let userData='';try{userData=require('electron').app.getPath('userData');}catch{/* outside Electron */}
 if(userData&&install.installed(userData))return ['ffmpeg'];
 return require('./tools.cjs').detect({own:userData?install.folder(userData):''}).ffmpeg?['ffmpeg']:[];
}};
