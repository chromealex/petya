const fs=require('node:fs/promises'),path=require('node:path');
const cache=new Map();
async function projectIcon(folder,nativeImage){
 if(!folder)return '';
 const saved=cache.get(folder);if(saved&&Date.now()-saved.at<30000)return saved.value;
 let value='';try{const root=await fs.realpath(folder);for(const dir of ['','assets','public','resources','icons','Assets','Assets/Icons']){
  for(const name of ['app-icon.png','icon.png','logo.png','favicon.png','icon.ico','favicon.ico','logo.webp','logo.jpg']){
   try{const file=await fs.realpath(path.join(root,dir,name));if(!file.startsWith(root+path.sep))continue;const stat=await fs.stat(file);if(!stat.isFile()||stat.size>1024*1024)continue;const image=nativeImage.createFromBuffer(await fs.readFile(file));if(image.isEmpty())continue;value=image.resize({width:32,height:32,quality:'good'}).toDataURL();break;}catch{}
  }if(value)break;
 }}catch{}
 cache.set(folder,{at:Date.now(),value});if(cache.size>100)cache.delete(cache.keys().next().value);return value;
}
module.exports={projectIcon};
