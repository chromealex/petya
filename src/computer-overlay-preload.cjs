const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petyaInterfaceLanguage',(()=>{try{return ipcRenderer.sendSync('petya:interface-language-bootstrap');}catch{return {language:'ru',preference:'system',strings:{}};}})());
contextBridge.exposeInMainWorld('petyaControlVisual',{listen:callback=>ipcRenderer.on('petya-control-visual',(_event,state)=>callback(state))});
