const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 let commandStarts=0,commandStops=0,meetingStarts=0,micStarts=0,finished=0;
 const window={petya:{settings:async()=>({zoomCaptureMic:'true',zoomAutoRecord:'true',zoomCaptureMode:'local'}),feature:async(name,method)=>method==='begin'?'session':(method==='finish'&&finished++,undefined),backgroundStatus:async()=>({})},petyaEvents:{onBackground(){}}};
 const context={voiceInputLocks:new Set(),window,meetingId:'',mic:{stop(){commandStops++;},start(){commandStarts++;}},meeting:{active:false,async start(){meetingStarts++;this.active=true;},async finish(){this.active=false;}},meetingMic:{async start(){micStarts++;},async finish(){}},selectedMicrophone:()=>({id:'default'}),updateAudio(){},notice(){},refreshContexts:async()=>{},$:()=>({})};
 vm.createContext(context);vm.runInContext(fs.readFileSync('src/ui/background.js','utf8'),context);
 const app=fs.readFileSync('src/ui/app.js','utf8');
 vm.runInContext(app.slice(app.indexOf('async function startSelectedMicrophone(){'),app.indexOf('async function toggleMic(){')),context);
 await window.petyaStartAutomaticMeeting();
 assert.equal(commandStops,1);assert.equal(commandStarts,0);assert.equal(meetingStarts,1);assert.equal(micStarts,1);
 await assert.rejects(context.startSelectedMicrophone(),/Во время встречи/);
 // A late transcription from the old command capture must not feed the chat.
 context.AudioListener=class{constructor(callback){this.callback=callback;}};context.audioError=()=>{};
 const callbackContext=vm.createContext({...context,AudioListener:context.AudioListener});
 vm.runInContext(app.slice(app.indexOf('const mic = new AudioListener('),app.indexOf('}, audioError, { segmentSeconds:2.5'))+'});\nthis.callback=mic.callback;',callbackContext);
 await callbackContext.callback('Не отправлять это в чат',1,2,true);
 await window.petyaStartAutomaticMeeting();assert.equal(meetingStarts,1);
 await window.petyaStopAutomaticMeeting(true);assert.equal(finished,1);assert.equal(window.petyaAutoMeetingActive,false);assert.equal(commandStarts,0);
 context.voiceInputLocks.add('zoom-bot');await assert.rejects(context.startSelectedMicrophone(),/Во время встречи/);
 await callbackContext.callback('Речь встречи не должна попасть в чат',3,4,true);
 assert.equal(commandStarts,0);
 window.petya.settings=async()=>({zoomCaptureMode:'bot'});await assert.rejects(window.petyaStartMeetingRecording(),/отдельный участник/);assert.equal(meetingStarts,1);
 console.log('Meeting isolation: dedicated capture, command mic stopped, restart blocked, late voice text ignored, duplicate start and no mic auto-resume passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
