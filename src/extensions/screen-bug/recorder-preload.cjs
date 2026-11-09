// The control window's bridge (sandboxed): chunks, start, the end and errors go to the main process on the window's
// own channel; nothing else is exposed.
const {contextBridge,ipcRenderer}=require('electron');
const channel=process.argv.find(a=>/^petya-screen-bug-[a-f0-9-]{36}$/.test(a));
contextBridge.exposeInMainWorld('petyaRecorder',{
 chunk:buffer=>ipcRenderer.invoke(channel,'chunk',buffer),
 started:()=>ipcRenderer.invoke(channel,'started'),
 done:info=>ipcRenderer.invoke(channel,'done',info),
 error:message=>ipcRenderer.invoke(channel,'error',String(message||''))
});
