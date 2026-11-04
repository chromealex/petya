const {WebContentsView,ipcMain}=require('electron');const path=require('node:path');
// Trusted local toolbar is separate from the untrusted service page.
module.exports=function addBrowserToolbar(win,{label,actionLabel,onAction,onReturn}){
 const page=win.pageView;win.toolbarHeight=52;
 const toolbar=new WebContentsView({webPreferences:{preload:path.join(__dirname,'browser-toolbar-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 win.contentView.addChildView(toolbar);
 const resize=()=>{if(win.isDestroyed())return;const [width,height]=win.getContentSize();if(page)page.setBounds({x:0,y:52,width,height:Math.max(0,height-52)});toolbar.setBounds({x:0,y:0,width,height:52});};
 const update=()=>{if(toolbar.webContents.isDestroyed())return;toolbar.webContents.send('browser-toolbar-state',{label,actionLabel,url:win.webContents.getURL()});};
 const invoke=async(event,action)=>{if(event.sender!==toolbar.webContents)return;try{if(action==='return')onReturn();else if(action==='back'&&win.webContents.navigationHistory.canGoBack())win.webContents.navigationHistory.goBack();else if(action==='reload')win.webContents.reload();else if(action==='read'){toolbar.webContents.send('browser-toolbar-busy',true);await onAction();}}catch(error){toolbar.webContents.send('browser-toolbar-error',error.message);}finally{if(!toolbar.webContents.isDestroyed())toolbar.webContents.send('browser-toolbar-busy',false);}};
 ipcMain.on('browser-toolbar-action',invoke);toolbar.webContents.setWindowOpenHandler(()=>({action:'deny'}));toolbar.webContents.on('will-navigate',e=>e.preventDefault());
 toolbar.webContents.on('did-finish-load',update);win.webContents.on('did-navigate',update);win.webContents.on('did-navigate-in-page',update);win.on('resize',resize);
 win.on('closed',()=>{ipcMain.removeListener('browser-toolbar-action',invoke);if(!toolbar.webContents.isDestroyed())toolbar.webContents.close();});
 toolbar.webContents.loadFile(path.join(__dirname,'ui/browser-toolbar.html'));resize();
 return toolbar;
};
