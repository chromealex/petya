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
// Background status: the meeting recorder, then each service app's background job (src/features/service-jobs.cjs)
// that reports a status, by job id. A job that saved something new (`updatedAt`) refreshes the materials.
const backgroundJobs = state => Object.entries(state || {}).filter(([key, value]) => key !== 'error' && value && typeof value === 'object' && typeof value.message === 'string');
function renderBackground(state) {
  if (state.error) $('background-status').textContent = state.error;
  else $('background-status').textContent = [localMeetingStatus?.message || 'Встреча не записывается', ...backgroundJobs(state).map(([, job]) => job.message + (job.pending ? ' · осталось запросов: ' + job.pending : ''))].join(' · ');
}
window.petyaEvents.onBackground(state => { renderBackground(state); if (backgroundJobs(state).some(([, job]) => job.updatedAt)) refreshContexts().catch(e => notice(e.message, true)); });
window.petya.backgroundStatus().then(renderBackground).catch(e => notice(e.message, true));
