const {localEndpoint}=require('./core.cjs');const cache=new Map();
function standaloneKnowledge(command,topic={},supplementalContext=''){
 return !supplementalContext&&!topic.lastData&&!(topic.messages||[]).some(m=>m.role==='user'&&m.text!==command)&&/^(?:что такое|что означает|как называется|како[йея]|кто (?:автор|написал)|переведи)/iu.test(command)&&!/(?:проект|задач|роль|специализац|должност|сотруд|коллег|команд|мо[йяеё]|моего|нашего|наш|парол|баланс|сч[её]т|почт|канал|релиз|jira|slack)/iu.test(command);
}
async function selectKnowledgeModel(settings,request){
 if(!/^qwen3(?::|$)/iu.test(settings.model||''))return null;
 const base=new URL(localEndpoint(settings.ollamaUrl)),key=base.origin;const previous=cache.get(key);if(previous&&Date.now()-previous.at<60000)return previous.model;
 let model=null;
 try{const tags=await request(new URL('/api/tags',base).href,{method:'GET'});const candidate=tags?.models?.find(m=>m.name==='gemma3:4b'&&!m.remote_host&&!m.remote_model);
  if(candidate){const info=await request(new URL('/api/show',base).href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:candidate.name})});if(!info.remote_host&&!info.remote_model&&info.capabilities?.includes('completion'))model=candidate.name;}
 }catch{/* Keep the selected model when local discovery is unavailable. */}
 cache.set(key,{at:Date.now(),model});return model;
}
module.exports={standaloneKnowledge,selectKnowledgeModel};
