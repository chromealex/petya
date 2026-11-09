// Embeddings from a local Ollama model (POST /api/embed). Nothing leaves the computer: the endpoint must be the
// local Ollama Petya already uses, never a cloud model.
// MODELS lists what the index accepts. qwen3-embedding:0.6b is the default: multilingual (Russian included),
// 1024-dimensional with Matryoshka training, so its vectors are cut to `keep` dimensions and renormalized, which
// halves the disk and memory per chunk with little loss. Queries get the model's retrieval instruction; documents
// are embedded as they are. bge-m3 is the alternative for an older Ollama that cannot run qwen3-embedding.
const os=require('node:os');
const MODELS={
 'qwen3-embedding:0.6b':{dim:1024,keep:512,bytes:639000000,context:32768,query:'Instruct: Given a search request, retrieve the passages and files that match it\nQuery: '},
 'bge-m3:567m':{dim:1024,keep:1024,bytes:1200000000,context:8192,query:''}
};
const DEFAULT_MODEL='qwen3-embedding:0.6b';
const known=name=>Object.hasOwn(MODELS,name);
// Leave the computer usable while indexing: Ollama gets half of the cores for embeddings.
const threads=()=>Math.max(1,Math.floor((os.cpus()?.length||2)/2));

class Embedder{
 // base(): the local Ollama URL; fetcher: fetch (stubbed in tests).
 constructor({model=DEFAULT_MODEL,base,fetcher=(...a)=>fetch(...a),batch=16,timeout=120000}={}){
  if(!known(model))throw Error('Эта модель не подходит для индекса по смыслу.');
  Object.assign(this,{model,base,fetcher,batch,timeout,spec:MODELS[model]});
  this.dim=this.spec.keep;
 }
 url(route){return new URL(route,this.base());}
 async call(route,body,{signal,timeout=this.timeout}={}){
  const response=await this.fetcher(this.url(route),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined,redirect:'error',
   signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout)});
  if(!response.ok){let detail='';try{detail=(await response.json())?.error||'';}catch{/* no body */}throw Object.assign(Error('Ollama: '+(detail||'HTTP '+response.status)+'.'),{status:response.status});}
  return response.json();
 }
 // Whether the model is on disk ({installed, reachable}); a missing Ollama is not an error here.
 async status({signal}={}){
  try{const tags=await this.call('/api/tags',null,{signal,timeout:5000});const names=(tags?.models||[]).map(m=>m.name);return {reachable:true,installed:names.includes(this.model)};}
  catch(e){return {reachable:false,installed:false,error:e.message};}
 }
 cut(values){
  if(!Array.isArray(values)||values.length<this.dim||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Ollama вернул некорректный вектор.');
  const v=new Float32Array(this.dim);let n=0;for(let i=0;i<this.dim;i++){v[i]=values[i];n+=v[i]*v[i];}
  n=Math.sqrt(n);if(n)for(let i=0;i<this.dim;i++)v[i]/=n;return v;
 }
 // Unit vectors for texts; a query gets the retrieval instruction. Batches of `batch`, input truncated by Ollama.
 async embed(texts,{query=false,signal}={}){
  const out=[];
  for(let i=0;i<texts.length;i+=this.batch){
   const input=texts.slice(i,i+this.batch).map(t=>(query?this.spec.query:'')+String(t).slice(0,8000));
   const r=await this.call('/api/embed',{model:this.model,input,truncate:true,keep_alive:'5m',options:{num_thread:threads()}},{signal});
   if(!Array.isArray(r?.embeddings)||r.embeddings.length!==input.length)throw Error('Ollama вернул не все векторы.');
   for(const e of r.embeddings)out.push(this.cut(e));
  }
  return out;
 }
}

// Download of the embedding model with progress, the same stages as the chat model: start Ollama when it is not
// running, check the free space against the registry manifest, pull, then one test embedding.
async function prepare({model=DEFAULT_MODEL,base,fetcher=(...a)=>fetch(...a),install,checkDisk=require('../disk-space.cjs').checkModelSpace,signal,update=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!known(model))throw Error('Эта модель не подходит для индекса по смыслу.');
 const embedder=new Embedder({model,base,fetcher});
 update('starting','Запускаю Ollama…');
 let state=await embedder.status({signal});
 if(!state.reachable&&install){
  const started=await install.start();signal?.throwIfAborted();
  if(started?.phase!=='done')throw Error(started?.message||'Ollama не запустился.');
  for(let i=0;i<60&&!state.reachable;i++){await wait(1000);signal?.throwIfAborted();state=await embedder.status({signal});}
 }
 if(!state.reachable)throw Error('Ollama не запущен. Запустите его в «Подключения → Ollama» и повторите.');
 if(!state.installed){
  update('checking','Проверяю место для модели '+model+'…');
  await checkDisk(model,fetcher);signal?.throwIfAborted();
  update('pulling','Загружаю модель '+model+'…',{received:0,total:MODELS[model].bytes});
  const response=await fetcher(embedder.url('/api/pull'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:true}),redirect:'error',signal});
  if(!response.ok||!response.body)throw Error('Ollama не начал загрузку модели.');
  await require('../ollama-ready.cjs').readProgress(response.body,value=>update('pulling','Загружаю модель '+model+'…',{received:value.completed||0,total:value.total||0}));
 }
 update('warming','Проверяю модель '+model+'…');
 const [vector]=await embedder.embed(['проверка'],{signal});
 if(!vector||vector.length!==embedder.dim)throw Error('Модель не вернула вектор. Повторите загрузку.');
 return {model,dim:embedder.dim};
}

module.exports={Embedder,MODELS,DEFAULT_MODEL,known,prepare,threads};
