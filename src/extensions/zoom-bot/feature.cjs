// «Петя в Zoom»: settings of the local meeting capture (system audio and, optionally, the microphone).
// The capture itself runs in src/features/meeting-memory.cjs (LocalMeeting); there is no meeting bot and no Zoom
// sign-in. Profiles saved with the removed bot mode keep their start mode and are recorded locally.
const MODES=['off','ask','auto'];
function validate(next){
 if(!MODES.includes(next.zoomBotMode))throw Error('Проверьте режим записи встреч.');
}
module.exports={name:'zoomBot',defaults:{zoomBotMode:'auto'},validate,
 setup(s){
  const status=()=>({mode:s.settings.zoomBotMode,microphone:s.settings.zoomCaptureMic!=='false'});
  const configure=input=>{
   if(s.meetingRecording?.('captureStatus')?.busy)throw Error('Сначала завершите текущую запись встречи.');
   const values={zoomBotMode:input?.mode};
   if(typeof input?.microphone==='boolean')values.zoomCaptureMic=String(input.microphone);
   s.saveSettings(values,true);return status();
  };
  return {ipc:{status,configure}};
 }
};
