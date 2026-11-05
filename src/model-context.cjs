// One context size for every request to the local model. Ollama reloads the model (and keeps the old
// copy in memory while it can) whenever num_ctx changes, and reserves KV cache for num_ctx × parallel
// slots — mixed 4k/8k/16k/32k requests made llama-server grow to ~40 GB.
const SIZE=16384;
function normalize(url,body){
 if(typeof body!=='string')return body;
 let host='',route='';try{const u=new URL(url);host=u.hostname;route=u.pathname;}catch{return body;}
 if(!['127.0.0.1','localhost','[::1]','::1'].includes(host)||!/\/api\/(?:chat|generate)$/.test(route))return body;
 let data;try{data=JSON.parse(body);}catch{return body;}
 if(!data||typeof data!=='object'||typeof data.model!=='string')return body;
 const requested=Number(data.options?.num_ctx);
 // An explicit small window is the low-memory retry; everything else shares one size.
 if(Number.isFinite(requested)&&requested>0&&requested<=4096)return body;
 data.options={...(data.options||{}),num_ctx:SIZE};
 return JSON.stringify(data);
}
// Ollama keeps a KV cache per parallel slot: many simultaneous generations multiply its memory.
const LIMIT=3;let running=0,peak=0,maxWaiting=0;const waiting=[];
function isModelRequest(url,body){try{const u=new URL(url);return ['127.0.0.1','localhost','[::1]','::1'].includes(u.hostname)&&/\/api\/(?:chat|generate)$/.test(u.pathname)&&typeof body==='string';}catch{return false;}}
function release(){running--;const next=waiting.shift();if(next)next();}
function slot(signal,work){
 const start=()=>{running++;peak=Math.max(peak,running);return Promise.resolve().then(work).finally(release);};
 if(running<LIMIT)return start();
 return new Promise((resolve,reject)=>{
  const go=()=>{signal?.removeEventListener?.('abort',abort);start().then(resolve,reject);};
  const abort=()=>{const i=waiting.indexOf(go);if(i>=0)waiting.splice(i,1);reject(signal.reason||Object.assign(Error('Запрос отменён.'),{name:'AbortError'}));};
  if(signal?.aborted)return abort();signal?.addEventListener?.('abort',abort,{once:true});waiting.push(go);maxWaiting=Math.max(maxWaiting,waiting.length);
 });
}
// peak/maxWaiting: highest values since the last reset (the live check reports them).
const stats=({reset=false}={})=>{const out={running,waiting:waiting.length,limit:LIMIT,peak,maxWaiting};if(reset){peak=running;maxWaiting=waiting.length;}return out;};
module.exports={SIZE,normalize,isModelRequest,slot,stats,LIMIT};
