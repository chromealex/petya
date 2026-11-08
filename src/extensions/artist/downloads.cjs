// Which of the Artist's downloads (extension.json "downloads") are already on this computer.
const path=require('node:path');
module.exports={async present(){
 const {app}=require('electron');
 const runtime=require('./runtime.cjs').createArtistRuntime(path.join(app.getPath('userData'),'artist-runtime'),async()=>false);
 return await runtime.installed().catch(()=>false)?['runtime','model']:[];
}};
