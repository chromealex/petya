// Electron 39–44 defaults to CoreAudio Tap, which can return an ended audio
// track despite Screen & System Audio Recording permission. Keep capture on
// ScreenCaptureKit for these versions. Chromium removed this switch in 45.
function configureCapture({ app, platform, electronVersion }) {
  const major = Number(electronVersion.split('.')[0]);
  if (platform !== 'darwin' || major < 39 || major >= 45) return;
  const disabled = new Set(app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean));
  disabled.add('MacCatapLoopbackAudioForScreenShare');
  app.commandLine.appendSwitch('disable-features', [...disabled].join(','));
}

function installCapture({ session, win, entry, desktopCapturer, platform }) {
  const trusted = contents => contents === win.webContents && contents.getURL() === entry;
  session.setPermissionCheckHandler((contents, permission) => trusted(contents) && ['media', 'display-capture'].includes(permission));
  session.setPermissionRequestHandler((contents, permission, callback, details = {}) => {
    // Display video is required by getDisplayMedia even when only audio is consumed.
    // Camera requests are separate and remain denied.
    callback(trusted(contents) && (permission === 'display-capture' || (permission === 'media' && !(details.mediaTypes || []).includes('video'))));
  });
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!trusted(win.webContents) || request.frame !== win.webContents.mainFrame) return callback({});
    let grant = {};
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (sources[0] && request.frame === win.webContents.mainFrame && trusted(win.webContents)) {
        if (request.videoRequested) grant.video = sources[0];
        if (request.audioRequested) grant.audio = 'loopback';
      }
    } catch { /* Deny if enumeration fails; do not grant an invalid source. */ }
    callback(grant);
  // ScreenCaptureKit loopback uses the same explicit display as the video track.
  // Use an explicit display for whole-system audio; no window selection is needed.
  }, { useSystemPicker: false });
}
module.exports = { installCapture, configureCapture };
