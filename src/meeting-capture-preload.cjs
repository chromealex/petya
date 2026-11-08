const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(a=>/^petya-meeting-[a-f0-9-]{36}$/.test(a));
contextBridge.exposeInMainWorld('meetingBridge',{platform:process.platform,permission:()=>ipcRenderer.invoke(channel,'permission'),append:(...args)=>ipcRenderer.invoke(channel,'append',...args),error:message=>ipcRenderer.invoke(channel,'error',message)});
