const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
module.exports=async win=>{
 const {dialog}=require('electron'),original=dialog.showOpenDialog;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'petya-local-ui-'));
 try{
  await fs.writeFile(path.join(root,'README.md'),'Local UI project');
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});
  await win.webContents.executeJavaScript(`(async()=>{
   await window.petya.converse('Работаем над проектом Локальная проверка');
   let state=await window.petya.localProjectStatus();const id=state.activeId;
   if(!id)throw Error('Missing active project');
   const snapshot=await window.petya.localProjectConnect(id);
   if(!snapshot.files.some(f=>f.text==='Local UI project'))throw Error('Folder not read');
   if(!(await window.petya.localProjectStatus()).projects.find(p=>p.id===id).folder)throw Error('Folder not saved');
   document.dispatchEvent(new Event('petya-settings-displayed'));
   await new Promise(r=>setTimeout(r,100));
   const card=document.querySelector('[data-service="localproject"]');
   if(!card||!card.querySelector('.connected')||card.querySelector('select').value!==id)throw Error('Connection card not updated');
   view('settings');window.revealSettings(card);
   card.scrollIntoView();
   await window.petya.converse('Работаем над проектом Другой локальный');
   state=await window.petya.localProjectStatus();if(state.projects.find(p=>p.id===state.activeId).folder)throw Error('Folder leaked to another project');
   await window.petya.localProjectDisconnect(id);
   try{await window.petya.localProjectRefresh(id);throw Error('Disconnected project read');}catch(e){if(!e.message.includes('Подключите'))throw e;}
   await window.petya.converse('Забудь проект Локальная проверка');await window.petya.converse('Забудь проект Другой локальный');
  })()`);
  console.log('local-project UI tests passed');
 }finally{dialog.showOpenDialog=original;await fs.rm(root,{recursive:true,force:true});}
};
