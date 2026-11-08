// Which of the playtest app's downloads (extension.json "downloads") are already on this computer: the frame model
// counts as present when any local vision model is installed in Ollama (gemma3:4b or another one).
const vision=require('./vision.cjs');
module.exports={async present(services){
 let names=[];
 try{const r=await services?.optionalModels?.installed?.();names=Array.isArray(r)?r:r?.names||[];}catch{names=[];}
 return vision.pickModel(names,services?.optionalModels?.catalog||[])?['vision-model']:[];
}};
