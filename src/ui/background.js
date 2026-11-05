let autoStarting = false, autoGeneration = 0;
window.petyaStartMeetingRecording = async () => {
  if (autoStarting || meeting.active) return;
  autoStarting = true; const generation = ++autoGeneration;
  window.petyaAutoMeetingActive = true; meetingId = '';
  mic.stop(); updateAudio();
  try {
    const config = await window.petya.settings();
    meetingId = await window.petya.feature('meetingMemory','begin');
    // Meeting audio never enters VoiceTurn or its command timeout.
    if (generation !== autoGeneration) { await window.petyaStopAutomaticMeeting(true); return; }
    await meeting.start(true);
    if (generation !== autoGeneration) { await window.petyaStopAutomaticMeeting(true); return; }
    if (config.zoomCaptureMic === 'true') await meetingMic.start(false,selectedMicrophone().id);
    if (generation !== autoGeneration) { await window.petyaStopAutomaticMeeting(true); return; }
    updateAudio(); notice('Записываю встречу Zoom. Расшифрую после её завершения и сохраню в общую память компании.');
  } catch (e) { await window.petyaStopAutomaticMeeting(true); notice(e.message, true); throw e; }
  finally { autoStarting = false; }
};
window.petyaStartAutomaticMeeting = async () => {
  const config=await window.petya.settings();
  if (config.zoomCaptureMode === 'local' && config.zoomAutoRecord === 'true') await window.petyaStartMeetingRecording();
};
window.petyaStopAutomaticMeeting = async () => {
  ++autoGeneration;
  const session = meetingId;
  await Promise.all([meeting.finish(),meetingMic.finish()]);
  window.petyaAutoMeetingActive = false; updateAudio();
  if (session) await window.petya.feature('meetingMemory','finish',session);
};
function renderBackground(state) {
  if (state.error) $('background-status').textContent = state.error;
  else $('background-status').textContent = `${state.zoom?.message || 'Автозапись выключена'} · ${state.slack?.message || 'Slack не обновлялся'}${state.slack?.pending ? ' · осталось запросов: ' + state.slack.pending : ''}`;
}
window.petyaEvents.onBackground(state => { renderBackground(state); if (state.slack?.updatedAt) refreshContexts().catch(e => notice(e.message, true)); });
window.petya.backgroundStatus().then(renderBackground).catch(e => notice(e.message, true));
