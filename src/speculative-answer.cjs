// Draft requests never emit output. Reuse requires both the final turn and the full model input.
function requestKey(body){const {stream,...input}=body;return JSON.stringify(input);}
class SpeculativeAnswer {
 constructor(){this.current=null;this.tail=Promise.resolve();}
 update(text,scope,work){
  if(this.current?.text===text&&this.current.scope===scope)return;
  this.clear();const controller=new AbortController();
  let ready;const state={text,scope,controller,committed:false,ready:new Promise(resolve=>ready=resolve)};this.current=state;
  state.done=this.tail.catch(()=>{}).then(async()=>{
   if(controller.signal.aborted)return;
   try{await work(controller.signal,(body,send)=>{
    controller.signal.throwIfAborted();const key=requestKey(body);
    const response=Promise.resolve().then(()=>send(controller.signal));response.catch(()=>{});
    state.request={key,response};ready();return response;
   });}catch{}finally{ready();}
  });this.tail=state.done;
 }
 commit(text,scope){if(this.current?.text===text&&this.current.scope===scope){this.current.committed=true;return true;}this.clear();return false;}
 async consume(body){
  const state=this.current;if(!state?.committed)return null;
  await Promise.race([state.ready,state.done]);
  if(this.current!==state||state.controller.signal.aborted)return null;
  if(state.request?.key!==requestKey(body)){this.clear();return null;}
  this.current=null;
  try{return await state.request.response;}catch{return null;}
 }
 clear(){this.current?.controller.abort();this.current=null;}
}
module.exports={SpeculativeAnswer,requestKey};
