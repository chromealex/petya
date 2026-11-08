// The hint panel: a small always-on-top window in the top right corner of the screen that never takes focus (the
// meeting app keeps the keyboard), shown only while there is a hint. Like the computer-control overlay
// (src/computer-overlay.cjs) it is frameless, skips the taskbar and stays over full-screen apps; unlike it, it takes
// clicks (its buttons) without activating Petya. The page talks to the main process over one private channel.
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const WIDTH=360,HEIGHT=164,MARGIN=16;
class HintPanel{
 constructor({electron=()=>require('electron'),onAction=()=>{},platform=process.platform}={}){Object.assign(this,{electron,onAction,platform});this.win=null;this.loading=null;this.channel='petya-meeting-hints-'+randomUUID();}
 async ensure(){
  if(this.win&&!this.win.isDestroyed())return this.win;
  if(this.loading)return this.loading;
  this.loading=(async()=>{
   const {BrowserWindow,ipcMain,screen}=this.electron();
   const area=screen.getPrimaryDisplay().workArea;
   const win=new BrowserWindow({x:Math.round(area.x+area.width-WIDTH-MARGIN),y:Math.round(area.y+MARGIN),width:WIDTH,height:HEIGHT,show:false,frame:false,resizable:false,movable:true,minimizable:false,maximizable:false,fullscreenable:false,
    focusable:false,skipTaskbar:true,alwaysOnTop:true,acceptFirstMouse:true,hasShadow:true,backgroundColor:'#00000000',transparent:true,title:'Подсказки на встрече',
    webPreferences:{preload:path.join(__dirname,'panel-preload.cjs'),additionalArguments:['--petya-hints-channel='+this.channel],contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   win.setAlwaysOnTop(true,'floating');
   if(this.platform==='darwin')win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
   const entry=path.join(__dirname,'panel.html');
   const listener=(event,action,id)=>{if(event.sender!==win.webContents||win.isDestroyed())return;if(typeof action!=='string'||action.length>20)return;try{this.onAction(action,typeof id==='string'?id.slice(0,200):'');}catch{/* a failed action keeps the panel */}};
   ipcMain.on(this.channel,listener);
   win.once('closed',()=>{ipcMain.removeListener(this.channel,listener);if(this.win===win)this.win=null;});
   await win.loadFile(entry);
   this.win=win;return win;
  })();
  try{return await this.loading;}finally{this.loading=null;}
 }
 async show(hint){
  const win=await this.ensure();if(win.isDestroyed())return;
  win.webContents.send(this.channel,{type:'hint',hint});
  if(!win.isVisible())win.showInactive();
 }
 hide(){if(this.win&&!this.win.isDestroyed()&&this.win.isVisible())this.win.hide();}
 dispose(){if(this.win&&!this.win.isDestroyed())this.win.destroy();this.win=null;}
}
module.exports={HintPanel,WIDTH,HEIGHT};
