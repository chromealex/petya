// Opt-in real-time synthetic-audio benchmark; isolated Electron smoke user data only.
const fs=require('node:fs'),path=require('node:path');
module.exports=async win=>{
 const model=process.env.PETYA_TEST_MODEL||'qwen3.5:9b';const directory=process.env.PETYA_AUDIO_FIXTURES||'/private/tmp/petya-dictation-benchmark-audio';
 const js=code=>win.webContents.executeJavaScript('(async()=>('+code+'))()');const cases=JSON.parse(fs.readFileSync(path.join(__dirname,'dictation-latency-cases.json'))).filter(c=>!process.env.PETYA_LATENCY_CASES||process.env.PETYA_LATENCY_CASES.split(',').includes(c.id));
 await js(`window.petya.saveSettings({model:${JSON.stringify(model)},semanticTools:'true',ollamaUrl:'http://127.0.0.1:11434/api/chat'})`);
 const audioSource=fs.readFileSync(path.join(__dirname,'../src/ui/audio.js'),'utf8');const start=audioSource.slice(audioSource.indexOf('  async start(meeting'),audioSource.indexOf('  async drain(')).replace("!meeting && !await window.petya.permission()",'false');
 await win.webContents.executeJavaScript('window.BenchmarkAudioListener=class extends AudioListener{'+start+'};void 0');
 await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'dictation-latency-renderer.js'),'utf8')+';void 0');
 const report={model,method:'Synthetic Silero Eugene PCM replayed at real-time speed through production AudioListener, Qwen ASR, VoiceTurn, IPC converse and speech playback. Output muted. Warm ASR/TTS. Speech end = last non-silent fixture sample plus 10 ms. No live microphone measurement.',cases:[],warmup:{}};
 const out=process.env.PETYA_LATENCY_REPORT||path.join(__dirname,'results','dictation-latency-live.json');fs.mkdirSync(path.dirname(out),{recursive:true});const save=()=>fs.writeFileSync(out,JSON.stringify(report,null,2));
 let t=Date.now();const warm=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:false,think:false,messages:[{role:'user',content:'Ответь одним словом: готов'}],options:{num_ctx:16384,num_predict:10}}),signal:AbortSignal.timeout(120000)});if(!warm.ok)throw Error('Model warmup failed: '+warm.status);await warm.json();report.warmup.modelMs=Date.now()-t;t=Date.now();await js('window.petya.ensureSpeech()');report.warmup.asrMs=Date.now()-t;t=Date.now();await js("window.petya.synthesizeVoice('Готов к проверке.')");report.warmup.ttsMs=Date.now()-t;
 for(const [i,c] of cases.entries())for(const drafts of (i%2?[true,false]:[false,true])){
  console.log('START '+c.id+' '+(drafts?'draft':'baseline'));const audio=fs.readFileSync(path.join(directory,c.id+'.wav')).toString('base64');
  const result=await js(`window.runDictationLatency(${JSON.stringify(audio)},${drafts})`);result.id=c.id;result.input=c.text;result.meaningPassed=new RegExp(c.expected,'iu').test(result.answer||'');report.cases.push(result);save();console.log(JSON.stringify({id:c.id,drafts,dispatchMs:result.dispatchMs,textMs:result.textMs,voiceMs:result.firstVoiceMs,meaning:result.meaningPassed,heard:result.finalTranscript,answer:result.answer,error:result.error}));
 }
 console.log('Latency report: '+out);console.log('Main-topic checks: '+report.cases.filter(r=>r.meaningPassed&&!r.error).length+'/'+report.cases.length+'; inspect answers manually for instruction compliance.');
};
