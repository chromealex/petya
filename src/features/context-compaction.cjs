// Feature: long chats keep their whole context. After an answer, when the local model is idle, Petya
// compacts the archived part of the chat block by block (both sides of the conversation, with decisions,
// numbers and corrections) and long recent messages. Summaries live in the chat's archive
// (src/conversation-archive.cjs) next to the untouched originals; a summary is made once per block and is
// replaced when the block changes. Until a summary is ready, the extractive archive and head-and-tail
// excerpts stand in for it, so nothing is dropped meanwhile.
const archive=require('../conversation-archive.cjs');
const compactor=require('../context-compactor.cjs');
module.exports={
 name:'context-compaction',
 defaults:{contextCompaction:'true'},
 validate(next){if(next.contextCompaction!==undefined&&!['true','false'].includes(String(next.contextCompaction)))throw Error('Сжатие контекста: true или false.');},
 setup(s){
  const queue=new Set();let timer=null,running=false;
  // Background work never competes with an answer: it waits until no model request and no chat job runs.
  const idle=()=>require('../model-context.cjs').stats().running===0&&!(s.chatJobs?.jobs?.size);
  const enabled=()=>s.settings.contextCompaction!=='false'&&!!s.settings.model;
  const arm=ms=>{clearTimeout(timer);timer=setTimeout(tick,ms);timer.unref?.();};
  function schedule(topic){if(!topic?.id||!enabled())return;queue.add(topic.id);arm(3000);}
  async function tick(){
   if(running||!enabled())return;if(!idle())return arm(5000);
   const id=queue.values().next().value;if(!id)return;
   running=true;
   try{if(!await step(id))queue.delete(id);}
   catch(e){queue.delete(id);if(e?.name!=='AbortError')console.error('Context compaction:',e.message);}
   finally{running=false;}
   if(queue.size)arm(1000);
  }
  // Between model calls the work waits while the user's requests run, so an answer never queues behind it.
  const pause=async()=>{for(let i=0;i<120&&!idle();i++)await new Promise(r=>{const t=setTimeout(r,500);t.unref?.();});};
  const model=()=>({request:s.request,endpoint:s.core.localEndpoint(s.settings.ollamaUrl),model:s.settings.model,strict:true,before:pause});
  // One unit of work: the earliest archived block without a summary, then the earliest long recent
  // message. Returns whether anything was compacted (the queue keeps the chat until nothing is left).
  async function step(id){
   const dialogue=s.dialogue,topic=dialogue?.state?.topics?.find(t=>t.id===id);if(!topic||topic.archived)return false;
   const current=archive.refreshArchive(topic);
   // Only full blocks: the trailing partial block grows with every message and would be redone each time.
   const block=current.chunks.find(c=>!c.compact&&c.to-c.from===archive.BLOCK);
   if(block){
    const text=archive.transcript(topic.messages.slice(block.from,block.to));
    const summary=text.trim()?await compactor.compact({text,purpose:'chat',target:350,...model()}):'';
    // The chat may have changed while the model worked: keep the summary only for the same block.
    if(s.dialogue!==dialogue||!dialogue.state.topics.includes(topic))return false;
    const live=topic.conversationArchive?.chunks?.find(c=>c.from===block.from&&c.to===block.to&&c.sourceHash===block.sourceHash);
    if(!live)return true;
    live.compact=summary||'(пустой блок)';dialogue.persist();return true;
   }
   const long=topic.messages.slice(current.until).find(m=>typeof m?.text==='string'&&m.text.length>archive.LONG&&!current.compacts?.[archive.messageHash(m)]);
   if(long){
    const key=archive.messageHash(long);
    const summary=await compactor.compact({text:archive.transcript([long]),purpose:'chat',target:450,...model()});
    if(s.dialogue!==dialogue||!dialogue.state.topics.includes(topic)||!topic.messages.includes(long)||archive.messageHash(long)!==key)return false;
    const live=topic.conversationArchive||archive.refreshArchive(topic);(live.compacts||={})[key]=summary;dialogue.persist();return true;
   }
   return false;
  }
  return {contextCompaction:{schedule,step,queue}};
 }
};
