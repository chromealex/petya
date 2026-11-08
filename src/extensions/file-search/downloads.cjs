// Which of the app's downloads (extension.json "downloads") are already here: the embedding model counts as present
// when the local Ollama lists it.
module.exports={async present(services){
 try{
  const {localEndpoint}=require('../../core.cjs');
  const model=services?.settings?.semanticIndexModel||require('../../semantic-index/embedder.cjs').DEFAULT_MODEL;
  const r=await fetch(new URL('/api/tags',new URL(localEndpoint(services?.settings?.ollamaUrl))),{signal:AbortSignal.timeout(3000),redirect:'error'});
  const names=((await r.json())?.models||[]).map(m=>m.name);
  return names.includes(model)?['embedding-model']:[];
 }catch{return [];}
}};
