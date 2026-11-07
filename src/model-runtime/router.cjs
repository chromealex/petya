// Route selected own-model chat requests without exposing the runtime connection.
const {localEndpoint}=require('../core.cjs');
const cancellation=require('../answer-cancel.cjs');
function createRouter({getEndpoint,chat,check=()=>{}}){
 return async function route(url,options={},fallback){
  let body;try{body=typeof options.body==='string'?JSON.parse(options.body):null;}catch{}
  if(body?.model!=='petya-v1')return fallback(url,options);
  const target=new URL(url),configured=new URL(localEndpoint(getEndpoint()));
  // A model-like payload sent to an unrelated integration remains that integration's request.
  if(target.origin!==configured.origin||!['/api/chat','/api/generate'].includes(target.pathname))return fallback(url,options);
  if(target.pathname!=='/api/chat'||target.username||target.password||target.search||target.hash||(options.method||'GET').toUpperCase()!=='POST')throw Error('Модель Пети принимает только POST /api/chat.');
  check();cancellation.check();
  const signals=[options.signal,cancellation.signal()].filter(Boolean);
  const signal=signals.length?AbortSignal.any(signals):undefined;
  signal?.throwIfAborted();
  const onAnswerChunk=options.onAnswerChunk?chunk=>{check();signal?.throwIfAborted();options.onAnswerChunk(chunk);}:undefined;
  const result=await chat(body,{signal,onAnswerChunk});
  check();signal?.throwIfAborted();
  return result;
 };
}
module.exports={createRouter};
