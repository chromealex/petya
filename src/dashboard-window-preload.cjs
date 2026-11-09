// Preload of the small dashboard window (src/dashboard-window.cjs): it may only read its one dashboard, refresh
// it, pin itself on top and open the dashboard in the main window. No other Petya calls are reachable from it.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('petyaInterfaceLanguage',(()=>{try{return ipcRenderer.sendSync('petya:interface-language-bootstrap');}catch{return {language:'ru',preference:'system',strings:{}};}})());
contextBridge.exposeInMainWorld('petyaAppearance',(()=>{try{return ipcRenderer.sendSync('petya:appearance-bootstrap');}catch{return null;}})());
contextBridge.exposeInMainWorld('petyaEvents',{onAppearance:callback=>ipcRenderer.on('appearance',(_,state)=>callback(state))});
contextBridge.exposeInMainWorld('petyaExtensionDescriptors',(()=>{try{return ipcRenderer.sendSync('petya:extension-ui-bootstrap');}catch{return [];}})());
const call=(name,...args)=>ipcRenderer.invoke('petya-dashboard:'+name,...args).catch(error=>{throw new Error(String(error.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));});
contextBridge.exposeInMainWorld('petyaDashboard',{
  get:()=>call('get'),
  refresh:(widgetId='')=>call('refresh',widgetId),
  top:on=>call('top',!!on),
  openMain:()=>call('main'),
  onUpdate:callback=>ipcRenderer.on('dashboards',(_,state)=>callback(state))
});
