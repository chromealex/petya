const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('petyaControlVisual',{listen:callback=>ipcRenderer.on('petya-control-visual',(_event,state)=>callback(state))});
