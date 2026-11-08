// Operating system permissions in one place: the settings checklist and the first-run introduction both use it.
// Each item says whether this platform gates it at all (`needed`), whether a change takes effect only after
// Petya restarts (`restart`, macOS screen recording) and whether a settings section can be opened (`settings`).
const IDS = ['microphone', 'screen', 'accessibility'];
const MAC_PANES = { microphone: 'Privacy_Microphone', screen: 'Privacy_ScreenCapture', accessibility: 'Privacy_Accessibility' };
// Linux has no common permission centre: try the desktop's own privacy page, otherwise the user gets a hint.
const LINUX_SETTINGS = {
  microphone: [['gnome-control-center', ['privacy']], ['systemsettings', ['kcm_mic']]],
  screen: [['gnome-control-center', ['privacy']]]
};
function permissions({ platform, systemPreferences, shell, desktopCapturer, spawn = require('node:child_process').spawn, env = process.env }) {
  const wayland = platform === 'linux' && (env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY);
  let accessibilityAsked = false;
  function state(id) {
    if (platform === 'darwin') {
      if (id === 'accessibility') return systemPreferences.isTrustedAccessibilityClient?.(false) ? 'granted' : accessibilityAsked ? 'denied' : 'not-determined';
      return systemPreferences.getMediaAccessStatus(id);
    }
    if (platform === 'win32') return id === 'microphone' ? systemPreferences.getMediaAccessStatus('microphone') : 'granted';
    // Linux: the microphone is open to desktop apps; on Wayland the system asks about the screen at every capture.
    if (id === 'screen' && wayland) return 'system';
    return 'granted';
  }
  const needed = id => platform === 'darwin' || (platform === 'win32' && id === 'microphone') || (platform === 'linux' && id === 'screen' && wayland);
  const settingsUrl = id => platform === 'darwin' ? 'x-apple.systempreferences:com.apple.preference.security?' + MAC_PANES[id]
    : platform === 'win32' && id === 'microphone' ? 'ms-settings:privacy-microphone' : '';
  const item = id => ({ id, state: state(id), needed: needed(id), restart: platform === 'darwin' && id === 'screen', settings: !!settingsUrl(id) || !!LINUX_SETTINGS[id] && platform === 'linux' });
  const status = () => ({ platform, items: IDS.map(item) });
  function openLinux(id) {
    for (const [command, args] of LINUX_SETTINGS[id] || []) {
      try { const child = spawn(command, args, { detached: true, stdio: 'ignore' }); child.on('error', () => {}); child.unref(); return true; } catch {}
    }
    return false;
  }
  async function request(id) {
    if (!IDS.includes(id)) throw new Error('Неизвестное разрешение.');
    let current = state(id);
    if (current === 'granted') return status();
    if (current === 'restricted') throw new Error('Доступ ограничен политикой системы. Обратитесь к администратору.');
    if (platform === 'darwin') {
      // The system prompt appears only once per app; after that the right Privacy section is the only way.
      if (id === 'microphone' && current === 'not-determined' && await systemPreferences.askForMediaAccess('microphone')) return status();
      if (id === 'screen' && current === 'not-determined') {
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
        if (state('screen') === 'granted') return status();
      }
      if (id === 'accessibility' && !accessibilityAsked) { accessibilityAsked = true; systemPreferences.isTrustedAccessibilityClient?.(true); return status(); }
    }
    const url = settingsUrl(id);
    if (url) await shell.openExternal(url);
    else if (platform === 'linux' && !openLinux(id)) throw new Error('Откройте раздел конфиденциальности в настройках системы.');
    return status();
  }
  return { status, request };
}
module.exports = { permissions, IDS };
