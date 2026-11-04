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
module.exports={SIZE,normalize};
