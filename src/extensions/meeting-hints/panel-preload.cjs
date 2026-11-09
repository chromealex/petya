// The hint panel's bridge: hints in, the user's button presses out, over the channel the main process named.
const {contextBridge,ipcRenderer}=require('electron');
const channel=(process.argv.find(a=>a.startsWith('--petya-hints-channel='))||'').split('=')[1]||'';
contextBridge.exposeInMainWorld('petyaInterfaceLanguage',(()=>{try{return ipcRenderer.sendSync('petya:interface-language-bootstrap');}catch{return {language:'ru',preference:'system',strings:{}};}})());
contextBridge.exposeInMainWorld('meetingHints',{
 listen:callback=>{if(channel)ipcRenderer.on(channel,(_event,message)=>callback(message));},
 act:(action,id)=>{if(channel)ipcRenderer.send(channel,String(action),String(id||''));}
});
