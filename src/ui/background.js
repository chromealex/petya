// The dedicated capture renderer keeps recording independently of chat navigation.
window.petyaStartMeetingRecording=()=>window.petya.feature('meetingMemory','startCapture');
window.petyaStartAutomaticMeeting=()=>window.petyaStartMeetingRecording();
window.petyaStopAutomaticMeeting=()=>window.petya.feature('meetingMemory','stopCapture');
let localMeetingStatus;
function localCaptureProgress(state){
 // Another company's meeting recorded in the background has ended: show this company's own recorder again.
 if(state.elsewhere&&!state.busy){window.petya.feature('meetingMemory','captureStatus').then(next=>{if(!next.elsewhere||next.busy)localCaptureProgress(next);}).catch(()=>{});return;}
 localMeetingStatus=state;
 window.petyaAutoMeetingActive=state.busy;
 document.dispatchEvent(new CustomEvent('petya-voice-input-lock',{detail:{id:'local-meeting',locked:state.busy||state.present}}));
 if(state.busy)mic.stop();updateAudio();
}
window.petyaEvents.onLocalMeeting(localCaptureProgress);
window.petya.feature('meetingMemory','captureStatus').then(localCaptureProgress).catch(()=>{});
function renderBackground(state) {
  if (state.error) $('background-status').textContent = state.error;
  else $('background-status').textContent = `${localMeetingStatus?.message || 'Встреча не записывается'} · ${state.slack?.message || 'Slack не обновлялся'}${state.slack?.pending ? ' · осталось запросов: ' + state.slack.pending : ''}`;
}
window.petyaEvents.onBackground(state => { renderBackground(state); if (state.slack?.updatedAt) refreshContexts().catch(e => notice(e.message, true)); });
window.petya.backgroundStatus().then(renderBackground).catch(e => notice(e.message, true));
