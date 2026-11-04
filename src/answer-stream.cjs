const {AsyncLocalStorage}=require('node:async_hooks');
const {randomUUID}=require('node:crypto');
const scope=new AsyncLocalStorage();
async function run(emit,work){const state={id:randomUUID(),emit,started:false};try{const result=await scope.run(state,work);return state.started&&result&&typeof result==='object'?{...result,answerStreamId:state.id}:result;}finally{if(state.started)emit({id:state.id,end:true});}}
function report(text){const s=scope.getStore();if(!s)return;if(!s.started){s.started=true;require('./request-progress.cjs').report('Пишу ответ');s.emit({id:s.id,start:true});}s.emit({id:s.id,text});}
// Only the answer of an explicitly understood response may be previewed.
// Decode complete JSON escapes; never expose thinking or unfinished escapes.
function preview(content){
 const m=/^\s*\{\s*"understood"\s*:\s*true\s*,\s*"answer"\s*:\s*"/.exec(content);if(!m)return '';
 let value='';for(let i=m[0].length;i<content.length;i++){
  const c=content[i];if(c==='"')break;if(c<' ')return '';
  if(c!=='\\'){value+=c;continue;}
  const escape=content[i+1];if(!escape)break;
  if(escape==='u'){const hex=content.slice(i+2,i+6);if(hex.length<4)break;if(!/^[0-9a-f]{4}$/i.test(hex))return '';value+=String.fromCharCode(parseInt(hex,16));i+=5;}
  else {const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.hasOwn(escapes,escape))return '';value+=escapes[escape];i++;}
 }
 return value.replace(/[\uD800-\uDBFF]$/,'').slice(0,12000);
}
async function consume(response,onText){
 if(!response.body)throw Error('Empty model stream');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',content='',done=false,last={},shown='',bytes=0,lastEmit=0;
 const line=raw=>{if(!raw.trim())return;const chunk=JSON.parse(raw);if(chunk.error)throw Error(String(chunk.error));if(done)throw Error('Data after completed model stream');
  if(chunk.message?.content!==undefined&&typeof chunk.message.content!=='string')throw Error('Malformed model stream');
  content+=chunk.message?.content||'';if(content.length>100000)throw Error('Model response too large');
  const next=preview(content),now=Date.now();if(next!==shown&&(now-lastEmit>=40||chunk.done)){shown=next;lastEmit=now;onText(next);}
  if(chunk.done===true){done=true;last=chunk;}
 };
 onText('');try{
  while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>2000000)throw Error('Model stream too large');pending+=decoder.decode(part.value,{stream:true});let i;while((i=pending.indexOf('\n'))>=0){line(pending.slice(0,i));pending=pending.slice(i+1);}}
  pending+=decoder.decode();if(pending.trim())line(pending);if(!done)throw Error('Model stream interrupted');
  return {...last,message:{role:'assistant',content}};
 }catch(error){onText('');throw error;}finally{try{await reader.cancel();}catch{}reader.releaseLock();}
}
module.exports={run,report,preview,consume};
