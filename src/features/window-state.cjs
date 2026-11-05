const fs=require('node:fs'),path=require('node:path');
const installed=new WeakSet();
function fit(bounds,displays){
 if(!bounds||!['x','y','width','height'].every(k=>Number.isFinite(bounds[k])))return null;
 const area=(a)=>Math.max(0,Math.min(bounds.x+bounds.width,a.x+a.width)-Math.max(bounds.x,a.x))*Math.max(0,Math.min(bounds.y+bounds.height,a.y+a.height)-Math.max(bounds.y,a.y));
 const screen=displays.map(d=>d.workArea).sort((a,b)=>area(b)-area(a))[0];if(!screen)return null;
 const width=Math.min(screen.width,Math.max(880,bounds.width)),height=Math.min(screen.height,Math.max(640,bounds.height));
 return {width,height,x:Math.max(screen.x,Math.min(bounds.x,screen.x+screen.width-width)),y:Math.max(screen.y,Math.min(bounds.y,screen.y+screen.height-height))};
}
module.exports={name:'window-state',fit,setup({win}){
 if(!win||installed.has(win))return;installed.add(win);
 const {app,screen}=require('electron'),file=path.join(app.getPath('userData'),'window-state.json');let timer,saved;
 try{saved=JSON.parse(fs.readFileSync(file,'utf8'));const bounds=fit(saved.bounds,screen.getAllDisplays());if(bounds)win.setBounds(bounds);}catch{}
 const save=()=>{clearTimeout(timer);if(win.isDestroyed()||win.isMinimized())return;try{const value={bounds:win.getNormalBounds(),maximized:win.isMaximized(),fullscreen:win.isFullScreen()};fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}catch(error){console.error('Window state:',error.message);}};
 const schedule=()=>{clearTimeout(timer);timer=setTimeout(save,200);};
 for(const event of ['move','resize','maximize','unmaximize','enter-full-screen','leave-full-screen'])win.on(event,schedule);
 for(const event of ['close','hide'])win.on(event,save);
 app.on('before-quit',save);
 win.once('show',()=>{if(saved?.fullscreen)win.setFullScreen(true);else if(saved?.maximized)win.maximize();});
 win.once('closed',()=>{clearTimeout(timer);app.removeListener('before-quit',save);});
}};
