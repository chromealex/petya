const path=require('node:path');
const labels={text:'Вводит текст',key:'Нажимает клавиши',hotkey:'Нажимает сочетание',click:'Нажимает',drag:'Перетаскивает',scroll:'Прокручивает',focus:'Переключает окно',search:'Ищет в приложении'};
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<100000&&Math.abs(p.y)<100000;
const rect=r=>point(r)&&Number.isFinite(r.width)&&Number.isFinite(r.height)&&r.width>0&&r.height>0&&r.width<100000&&r.height<100000;
class ComputerOverlay{
 constructor({BrowserWindow,screen,platform=process.platform,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{BrowserWindow,screen,platform,setTimer,clearTimer});this.windows={};this.active=false;this.epoch=0;}
 async create(kind){
 const win=new this.BrowserWindow({width:kind==='cursor'?126:256,height:kind==='cursor'?78:58,show:false,frame:false,transparent:true,hasShadow:false,resizable:false,movable:false,focusable:false,skipTaskbar:true,alwaysOnTop:true,acceptFirstMouse:false,webPreferences:{preload:path.join(__dirname,'computer-overlay-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 this.windows[kind]=win;
 win.setIgnoreMouseEvents(true,{forward:true});win.setAlwaysOnTop(true,'screen-saver');
 if(this.platform==='darwin')win.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true,skipTransformProcessType:true});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 await win.loadFile(path.join(__dirname,'ui/computer-overlay.html'),{query:{kind}});return win;
 }
 async begin(action){this.clear();const epoch=this.epoch;this.action=action.type;
 if(!this.loading)this.loading=Promise.all(['cursor','badge'].map(kind=>this.windows[kind]&&!this.windows[kind].isDestroyed()?this.windows[kind]:this.create(kind))).catch(error=>{this.dispose();throw error;}).finally(()=>{this.loading=null;});
 await this.loading;if(epoch!==this.epoch)return;this.active=true;
 }
 dipPoint(p){return this.platform==='win32'?this.screen.screenToDipPoint({x:Math.round(p.x),y:Math.round(p.y)}):p;}
 dipRect(r){return this.platform==='win32'?this.screen.screenToDipRect(null,{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}):r;}
 send(kind,state){const win=this.windows[kind];if(!win||win.isDestroyed())return;win.webContents.send('petya-control-visual',state);win.showInactive();}
 update(event){
 if(!this.active||!event||typeof event!=='object')return;
 if(rect(event.window)){
 const r=this.dipRect(event.window),display=this.screen.getDisplayMatching(r).bounds;
 const x=Math.max(display.x,Math.min(r.x+r.width-264,display.x+display.width-256));
 const y=Math.max(display.y,Math.min(r.y+8,display.y+display.height-58));
 this.windows.badge.setBounds({x:Math.round(x),y:Math.round(y),width:256,height:58});
 this.send('badge',{phase:'active',label:labels[this.action]||'Управляет окном',app:String(event.window.name||'').slice(0,80)});
 }
 if(point(event.pointer)){
 const p=this.dipPoint(event.pointer);
 this.windows.cursor.setBounds({x:Math.round(p.x)-8,y:Math.round(p.y)-8,width:126,height:78});
 this.send('cursor',{phase:'active',label:'Петя',action:this.action});
 }
 }
 finish(success){if(!this.active)return;this.active=false;if(!success){this.clear();return;}
 for(const win of Object.values(this.windows))if(!win.isDestroyed()&&win.isVisible())win.webContents.send('petya-control-visual',{phase:'done',label:'Готово'});
 const epoch=this.epoch;this.timer=this.setTimer(()=>{if(this.epoch===epoch)this.clear();},650);this.timer?.unref?.();
 }
 clear(){this.epoch++;this.active=false;if(this.timer)this.clearTimer(this.timer);this.timer=null;for(const win of Object.values(this.windows))if(!win.isDestroyed())win.hide();}
 dispose(){this.clear();for(const win of Object.values(this.windows))if(!win.isDestroyed())win.destroy();this.windows={};}
}
module.exports={ComputerOverlay,point,rect};
