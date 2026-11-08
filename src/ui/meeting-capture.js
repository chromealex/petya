window.petyaPlatform=window.meetingBridge.platform;
window.petya={permission:()=>window.meetingBridge.permission()};
const fail=error=>window.meetingBridge.error(error.message).catch(()=>{});
const systemAudio=new AudioListener(()=>{},fail,{recordSegment:item=>window.meetingBridge.append('Встреча',item)});
const ownAudio=new AudioListener(()=>{},fail,{recordSegment:item=>window.meetingBridge.append('Микрофон',item)});
window.startCapture=async config=>{await systemAudio.start(true);if(config.microphone)await ownAudio.start(false,config.deviceId||'');};
window.finishCapture=()=>Promise.all([systemAudio.finish(),ownAudio.finish()]);
