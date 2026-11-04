const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
async function temporaryMedia(name){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'petya-media-'));return {filePath:path.join(directory,path.basename(name)),cleanup:()=>fs.rm(directory,{recursive:true,force:true})};}
module.exports={temporaryMedia};
