const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let now=1000,id=0,playStalled=false;const timers=new Map(),audio=[],heard=[],commands=[],errors=[],requests=[];
 const schedule=(fn,delay,repeat=0)=>{timers.set(++id,{fn,at:now+delay,repeat});return id;};
 const advance=async ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [key,t]=next;now=t.at;if(context.mic?.node?.port.onmessage)context.mic.node.port.onmessage({data:new Float32Array(1600)});if(t.repeat)t.at+=t.repeat;else timers.delete(key);t.fn();await tick();}now=end;await tick();};
 const track={readyState:'live',stop(){}};
 const context=vm.createContext({document:{dispatchEvent(){}},Event:class{},window:{petya:{ensureSpeech:async()=>({concurrency:2}),permission:async()=>true,transcribe:async wav=>{requests.push(wav);return heard.shift();},synthesizeVoice:async()=> 'wav',stopVoice:async()=>{}}},navigator:{mediaDevices:{getUserMedia:async()=>({getAudioTracks:()=>[track],getTracks:()=>[track]})}},MediaStream:class{},AudioContext:class{constructor(){this.sampleRate=16000;this.audioWorklet={addModule:async()=>{}};this.state='running';}async resume(){this.state='running';}createMediaStreamSource(){return {connect(){},disconnect(){}};}createGain(){return {gain:{},connect(){}};}close(){this.state='closed';}},AudioWorkletNode:class{constructor(){this.port={};}connect(){}disconnect(){}},Date:{now:()=>now},setTimeout:(fn,ms)=>schedule(fn,ms),clearTimeout:key=>timers.delete(key),setInterval:(fn,ms)=>schedule(fn,ms,ms),clearInterval:key=>timers.delete(key),Blob,Uint8Array,atob:()=>'',URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Audio:class{constructor(){this.currentTime=0;this.duration=1;this.ended=false;audio.push(this);}play(){return playStalled?new Promise(()=>{}):Promise.resolve();}pause(){}removeAttribute(){}load(){}},voiceReply:null,stopSpeech:{},notice(){}});
 vm.runInContext(fs.readFileSync('src/ui/audio.js','utf8')+'\n'+fs.readFileSync('src/ui/voice-turn.js','utf8')+`\nthis.mic=new AudioListener((text,at,end,direct)=>{this.texts.push(text);voiceTurn.feed(text,at,end,direct);},e=>this.errors.push(e),{allowDirect:()=>this.focused,onSpeech:at=>voiceTurn.activity(at)});this.texts=[];this.errors=[];this.voiceTurn=new VoiceTurn({pending:()=>({buffered:mic.voiced,transcribing:mic.busy||mic.queue.length}),dispatch:async text=>{this.commands.push(text);await speakReply('Ответ',{continueConversation:true});}});this.commands=[];`,context);
 const source=fs.readFileSync('src/ui/dialogue.js','utf8');vm.runInContext(source.slice(source.indexOf('let speechEpoch=0,'),source.indexOf('const previewVoice=')),context);
 context.focused=true;
 await context.mic.start();
 const frame=level=>context.mic.node.port.onmessage({data:new Float32Array(1600).fill(level)});
 const phrase=async text=>{heard.push(text);frame(.02);frame(.02);for(let i=0;i<7;i++)frame(0);await tick();await advance(1300);};
 for(const [index,text] of ['Ты здесь?','Как дела?','Какие проекты есть?'].entries()){
  await phrase(text);assert.equal(context.commands.length,index+1,'next spoken turn must dispatch');assert.equal(context.window.petyaSpeaking,true);
  const count=requests.length;frame(.02);for(let i=0;i<7;i++)frame(0);assert.equal(requests.length,count,'assistant voice must not be transcribed');
  const output=audio.at(-1);output.currentTime=output.duration;output.ended=true; // deliberately omit ended event
  await advance(800);assert.equal(context.window.petyaSpeaking,false,'lost ended event must recover microphone');assert.equal(context.voiceTurn.active,true,'listen for follow-up without another wake word');
 }
 assert.deepEqual(Array.from(context.texts),['Ты здесь?','Как дела?','Какие проекты есть?']);
 playStalled=true;await phrase('Проверь ещё раз');assert.equal(context.commands.length,4);
 await advance(5600);assert.equal(context.window.petyaSpeaking,false,'stalled playback must release capture');
 playStalled=false;await phrase('Ты здесь?');assert.equal(context.commands.length,5,'speech after playback failure');
 context.mic.context.state='suspended';await advance(1200);assert.equal(context.mic.context.state,'running','suspended capture resumes');
 context.stopSpeech.onclick();assert.equal(context.window.petyaSpeaking,false);assert.equal(context.voiceTurn.active,false);
 await advance(13000);assert.equal(context.commands.length,5,'silence does not submit another command');
 context.focused=false;await phrase('Разговор в другом окне');assert.equal(context.commands.length,5,'background speech needs wake word');
 context.focused=true;await phrase('Назови проекты');assert.equal(context.commands.length,6,'focused window accepts next turn without wake word');
 context.stopSpeech.onclick();
 context.mic.stop();assert.equal(context.errors.length,0);assert.equal(timers.size,0,'playback/turn timers released');
 console.log('Voice conversation: five PCM turns, follow-ups, echo suppression, lost ended event, stalled play promise, cancellation and timer cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
