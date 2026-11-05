const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 let commandStarts=0,commandStops=0,meetingStarts=0,finished=0,listener;
 const window={petya:{feature:async(name,method)=>{if(method==='startCapture'){meetingStarts++;listener({busy:true,present:true});}if(method==='stopCapture'){finished++;listener({busy:false,present:false});}return {busy:false,present:false};},backgroundStatus:async()=>({})},petyaEvents:{onBackground(){},onLocalMeeting(fn){listener=fn;}}};
 const context={voiceInputLocks:new Set(),window,document:{dispatchEvent(){}},CustomEvent:class{constructor(name,options){Object.assign(this,options);}},mic:{stop(){commandStops++;},start(){commandStarts++;}},meeting:{active:false},selectedMicrophone:()=>({id:'default'}),updateAudio(){},notice(){},refreshContexts:async()=>{},$:()=>({})};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/ui/background.js','utf8'),context);await new Promise(r=>setImmediate(r));
 const app=fs.readFileSync('src/ui/app.js','utf8');vm.runInContext(app.slice(app.indexOf('async function startSelectedMicrophone(){'),app.indexOf('async function toggleMic(){')),context);
 await window.petyaStartAutomaticMeeting();assert.equal(commandStops,1);assert.equal(commandStarts,0);assert.equal(meetingStarts,1);
 await assert.rejects(context.startSelectedMicrophone(),/Во время встречи/);
 const callbackContext=vm.createContext({...context,AudioListener:class{constructor(callback){this.callback=callback;}},audioError(){}});
 vm.runInContext(app.slice(app.indexOf('const mic = new AudioListener('),app.indexOf('}, audioError, { segmentSeconds:2.5'))+'});\nthis.callback=mic.callback;',callbackContext);
 await callbackContext.callback('Не отправлять это в чат',1,2,true);
 await window.petyaStopAutomaticMeeting();assert.equal(finished,1);assert.equal(window.petyaAutoMeetingActive,false);assert.equal(commandStarts,0);
 context.voiceInputLocks.add('local-meeting');await assert.rejects(context.startSelectedMicrophone(),/Во время встречи/);
 console.log('Meeting isolation: remote renderer status stops chat mic, blocks late text, no microphone auto-resume');
})().catch(e=>{console.error(e);process.exitCode=1;});
