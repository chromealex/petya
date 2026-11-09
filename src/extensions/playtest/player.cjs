// «Разбор плейтеста»: «Открыть на этом месте». One small player window (Petya's own, sandboxed, local file only)
// jumps to the moment; if the video cannot play there (codec), the system player opens the file instead
// (without the jump — system players take no start time portably).
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let player=null;
async function playAt(file,at,{title=path.basename(file)}={}){
 const {BrowserWindow,shell}=require('electron');
 const url=pathToFileURL(file).href;
 try{
  if(!player||player.isDestroyed()){
   player=new BrowserWindow({width:960,height:600,title,autoHideMenuBar:true,backgroundColor:'#000',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
   player.webContents.setWindowOpenHandler(()=>({action:'deny'}));player.webContents.on('will-navigate',e=>e.preventDefault());
   player.on('closed',()=>{player=null;});
   await player.loadFile(path.join(__dirname,'player.html'));
  }
  player.setTitle(title);
  await Promise.race([player.webContents.executeJavaScript('window.playAt('+JSON.stringify(url)+','+JSON.stringify(Number(at)||0)+')'),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),15000))]);
  player.show();player.focus();
  return {opened:'player'};
 }catch{
  const error=await shell.openPath(file);
  if(error)throw Error('Не удалось открыть видео: '+error);
  return {opened:'system'};
 }
}
module.exports={playAt};
