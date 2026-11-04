// Synthetic PCM travels through the production AudioListener and VoiceTurn in real time.
window.runDictationLatency=async function(base64,drafts){
 const result={drafts,transcripts:[],preparations:[],startedAt:new Date().toISOString()};
 const clock=()=>performance.now();const began=clock();let endedAt=Infinity,finished=false;
 const nativeAudio=window.Audio,nativeGet=navigator.mediaDevices.getUserMedia;
 let sourceContext,listener,turn,timer,off;const pending=[];
 const output=new Promise(resolve=>{result.finish=resolve;});
 const finish=error=>{if(finished)return;finished=true;if(error)result.error=String(error.message||error);result.finish();};
 window.Audio=function(...args){const a=new nativeAudio(...args);a.muted=true;a.addEventListener('playing',()=>{if(result.firstVoiceMs===undefined)result.firstVoiceMs=clock()-endedAt;});return a;};window.Audio.prototype=nativeAudio.prototype;
 try{
  stopSpeech.onclick();window.petyaSpeaking=false;await window.petya.prepareVoice(null);await window.petya.dialogueSelect('');
  off=window.petyaEvents.onAnswerChunk(chunk=>{if(!finished&&chunk.text&&result.firstTextMs===undefined)result.firstTextMs=clock()-endedAt;});
  sourceContext=new AudioContext({sampleRate:48000});await sourceContext.resume();
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const audio=await sourceContext.decodeAudioData(bytes.buffer);const destination=sourceContext.createMediaStreamDestination();
  navigator.mediaDevices.getUserMedia=async()=>destination.stream;
  turn=new VoiceTurn({pending:()=>({capturing:listener.active&&listener.voiced&&Date.now()-listener.lastSpeechAt<250,buffered:listener.active&&listener.voiced,transcribing:listener.active&&(listener.busy||listener.queue?.length)}),onTimeout:()=>finish('VoiceTurn timeout'),dispatch:async command=>{
   result.finalTranscript=command;result.dispatchMs=clock()-endedAt;
   try{await Promise.all(pending);window.streamSpeechEnabled=true;const reply=await window.petya.converse(command);result.textMs=clock()-endedAt;result.firstTextMs??=result.textMs;result.answer=reply.text;result.replyError=!!reply.error;result.routing={handled:reply.handled,by:reply.by,selectedTool:reply.selectedTool,resolvedCommand:reply.resolvedCommand};if(!reply.text||reply.handled===false){result.replyError=true;finish('No conversational answer: returned to action routing');return;}await showDialogueReply(reply,true);
    const deadline=clock()+45000;while(result.firstVoiceMs===undefined&&clock()<deadline)await new Promise(r=>setTimeout(r,20));
    finish(result.firstVoiceMs===undefined?'No playback within 45 seconds':null);
   }catch(error){finish(error);}
  }});
  listener=new BenchmarkAudioListener(async(text,at,end,direct)=>{result.transcripts.push({text,afterEndMs:clock()-endedAt});const response=turn.feed(text,at,end,direct);if(drafts&&response.consumed&&!response.cancelled&&turn.parts.length){const command=turn.parts.join(' ');result.preparations.push({text:command,afterEndMs:clock()-endedAt});pending.push(window.petya.prepareVoice(command));}},finish,{segmentSeconds:2.5,allowDirect:()=>true,onSpeech:at=>turn.activity(at),onUnrecognized:()=>{result.unrecognized=(result.unrecognized||0)+1;}});
  await listener.start();navigator.mediaDevices.getUserMedia=nativeGet;
  const input=sourceContext.createBufferSource();input.buffer=audio;input.connect(destination);result.inputDurationMs=audio.duration*1000;
  endedAt=clock()+100+result.inputDurationMs;result.speechEndFromStartMs=endedAt-began;
  input.onended=()=>{result.inputEndedJitterMs=clock()-endedAt;};input.start(sourceContext.currentTime+.1);
  timer=setTimeout(()=>finish('End-to-end timeout'),150000);await output;
 }finally{clearTimeout(timer);turn?.reset();listener?.stop();await window.petya.prepareVoice(null);stopSpeech.onclick();if(typeof off==='function')off();window.Audio=nativeAudio;navigator.mediaDevices.getUserMedia=nativeGet;await sourceContext?.close();delete result.finish;}
 return result;
};
