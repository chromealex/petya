let autoOwnMeeting = false, autoOwnMic = false, autoStarting = false, autoGeneration = 0;
window.petyaStartAutomaticMeeting = async () => {
  if (autoStarting || meeting.active) return;
  const config = await window.petya.settings();
  if (config.zoomAutoRecord !== 'true') return;
  autoStarting = true; const generation = ++autoGeneration;
  try {
    meetingId = crypto.randomUUID(); autoOwnMeeting = true; window.petyaAutoMeetingActive = true;
    await meeting.start(true);
    if (generation !== autoGeneration) { meeting.stop(); return; }
    if (config.zoomCaptureMic === 'true' && !mic.active) { autoOwnMic = true; await startSelectedMicrophone(); }
    if (generation !== autoGeneration) { await window.petyaStopAutomaticMeeting(); return; }
    updateAudio(); notice('Автоматически начата расшифровка Zoom. Захватывается весь системный звук' + (autoOwnMic ? ' и микрофон.' : '.'));
    await window.petya.notify('Петя начал расшифровку встречи Zoom. Остановить можно в трее.');
  } catch (e) { await window.petyaStopAutomaticMeeting(); notice(e.message, true); throw e; }
  finally { autoStarting = false; }
};
window.petyaStopAutomaticMeeting = async (flush = false) => {
  ++autoGeneration;
  const owned = autoOwnMeeting;
  if (flush) await Promise.all([autoOwnMeeting ? meeting.finish() : null, autoOwnMic ? mic.finish() : null]);
  else { if (autoOwnMeeting) meeting.stop(); if (autoOwnMic) mic.stop(); }
  autoOwnMeeting = false; autoOwnMic = false; window.petyaAutoMeetingActive = false; updateAudio();
  if (owned) await window.petya.notify('Автоматическая расшифровка Zoom остановлена.');
};
function renderBackground(state) {
  if (state.error) $('background-status').textContent = state.error;
  else $('background-status').textContent = `${state.zoom?.message || 'Автозапись выключена'} · ${state.slack?.message || 'Slack не обновлялся'}${state.slack?.pending ? ' · осталось запросов: ' + state.slack.pending : ''}`;
}
window.petyaEvents.onBackground(state => { renderBackground(state); if (state.slack?.updatedAt) refreshContexts().catch(e => notice(e.message, true)); });
window.petya.backgroundStatus().then(renderBackground).catch(e => notice(e.message, true));
