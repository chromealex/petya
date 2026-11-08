// A dashboard in its own small window, on top of other windows by default — to keep an eye on it while working
// elsewhere. The window gets a narrow preload (src/dashboard-window-preload.cjs): read, refresh, pin on top,
// open in Petya. Requests are accepted only from these windows' own page.
const path=require('node:path');
const PAGE=path.join(__dirname,'ui','dashboard-window.html');
// One instance per app: IPC handlers are registered once; a company switch only hands over the new feature api.
let instance=null;
function create(options){
  if(instance){instance.closeAll();Object.assign(instance.options,options);return instance;}
  const o=options,{BrowserWindow,ipcMain,shell}=o;
  const api={peek:(...a)=>o.api.peek(...a),refresh:(...a)=>o.api.refresh(...a),watch:(...a)=>o.api.watch(...a)};
  const show=id=>o.show(id);
  const windows=new Map();// dashboard id → window
  const owner=event=>{
    for(const [id,win] of windows){
      if(win.isDestroyed()||event.sender!==win.webContents)continue;
      const frame=event.senderFrame;let url;try{url=new URL(frame?.url||'');}catch{return null;}
      if(frame!==win.webContents.mainFrame||url.protocol!=='file:'||path.normalize(decodeURIComponent(url.pathname)).replace(/^\\(?=[A-Za-z]:)/,'')!==path.normalize(PAGE).replace(/^\\(?=[A-Za-z]:)/,''))return null;
      return {id,win};
    }
    return null;
  };
  const handle=(name,fn)=>ipcMain.handle('petya-dashboard:'+name,async (event,...args)=>{const who=owner(event);if(!who)throw Error('Недопустимый источник запроса.');return fn(who,...args);});
  handle('get',({id})=>api.peek(id));
  handle('refresh',({id},widgetId)=>api.refresh(id,typeof widgetId==='string'?widgetId:''));
  handle('top',({win},on)=>{win.setAlwaysOnTop(!!on,'floating');return win.isAlwaysOnTop();});
  handle('main',({id})=>{show(id);return true;});
  function open(id,title){
    const existing=windows.get(id);if(existing&&!existing.isDestroyed()){existing.show();existing.focus();return existing;}
    const win=new BrowserWindow({width:460,height:700,minWidth:320,minHeight:260,alwaysOnTop:true,show:!o.smoke,title:'Петя · '+title,backgroundColor:'#111415',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'dashboard-window-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.setAlwaysOnTop(true,'floating');
    require('./external-links.cjs')(win.webContents,url=>o.smoke?Promise.resolve():shell.openExternal(url),()=>{});
    windows.set(id,win);api.watch(id,true);
    win.on('closed',()=>{if(windows.get(id)===win)windows.delete(id);api.watch(id,false);});
    win.loadFile(PAGE,{query:{id}});
    return win;
  }
  const send=payload=>{const win=windows.get(payload.id);if(win&&!win.isDestroyed())win.webContents.send('dashboards',payload);};
  const closeAll=()=>{for(const win of windows.values())if(!win.isDestroyed())win.destroy();windows.clear();};
  instance={open,send,closeAll,windows,options:o};return instance;
}
module.exports={create,PAGE,current:()=>instance};
