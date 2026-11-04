const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('src/ui/dialogue.js','utf8');
const section=source.slice(source.indexOf('let speechEpoch=0,'),source.indexOf('const previewVoice='));
(async()=>{
 let resolveAudio,starts=0,stops=0,arms=0,revoked=0;const audio=[];
 const context={document:{dispatchEvent(){}},Event:class{},window:{petya:{synthesizeVoice:()=>new Promise(r=>{resolveAudio=r;}),stopVoice:async()=>{stops++;}}},voiceReply:null,voiceTurn:{reset(){},arm(){arms++;}},mic:{active:true},stopSpeech:{},notice(){},setTimeout:fn=>fn(),setInterval:()=>1,clearInterval(){},atob:()=>'',Uint8Array,Blob,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>revoked++},Audio:class{constructor(){audio.push(this);}async play(){starts++;}pause(){}removeAttribute(){}load(){}}};
 vm.createContext(context);vm.runInContext(section,context);
 const pending=vm.runInContext("speakReply('Привет')",context);context.stopSpeech.onclick();resolveAudio('audio');await pending;
 assert.equal(starts,0);assert.equal(stops,1);assert.equal(context.window.petyaSpeaking,false);assert.equal(arms,0);
 const next=vm.runInContext("speakReply('Ещё ответ')",context);assert.equal(context.window.petyaSpeaking,false,'microphone stays available during synthesis');resolveAudio('audio');await next;assert.equal(starts,1);assert.equal(context.window.petyaSpeaking,true,'suppress microphone only while playing');
 assert.equal(audio[0].playbackRate,1.0);assert.equal(audio[0].preservesPitch,true);
 audio[0].onended();assert.equal(context.window.petyaSpeaking,false);assert.equal(arms,0,'ordinary reply must not arm the microphone');assert.equal(revoked,1);
 context.voiceReply=async()=>{};const question=vm.runInContext("speakReply('Какой проект?')",context);resolveAudio('audio');await question;audio[1].onended();assert.equal(arms,1,'explicit clarification may accept a reply');context.voiceReply=null;
 const last=vm.runInContext("speakReply('Останови')",context);resolveAudio('audio');await last;context.stopSpeech.onclick();assert.equal(revoked,3);assert.equal(audio[2].onended,null);
 console.log('Voice UI: pitch-preserving tempo, completion, stale synthesis cancellation and resource cleanup passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
