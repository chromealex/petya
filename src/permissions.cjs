function permissions({ platform, systemPreferences, shell, desktopCapturer }) {
  const supported = ['darwin', 'win32'].includes(platform);
  const status = () => ({ platform, items: ['microphone', 'screen'].map(id => ({
    id, state: supported ? systemPreferences.getMediaAccessStatus(id) : 'unknown'
  })) });
  async function request(id) {
    if (!['microphone', 'screen'].includes(id)) throw new Error('Неизвестное разрешение.');
    if (!supported) throw new Error('Откройте настройки разрешений вашей ОС.');
    let state = systemPreferences.getMediaAccessStatus(id);
    if (state === 'granted') return status();
    if (state === 'restricted') throw new Error('Доступ ограничен политикой системы. Обратитесь к администратору.');
    if (platform === 'darwin' && id === 'microphone' && state === 'not-determined') {
      if (await systemPreferences.askForMediaAccess('microphone')) return status();
    }
    if (platform === 'darwin' && id === 'screen' && state === 'not-determined') {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
      if (systemPreferences.getMediaAccessStatus('screen') === 'granted') return status();
    }
    const url = platform === 'darwin'
      ? 'x-apple.systempreferences:com.apple.preference.security?' + (id === 'microphone' ? 'Privacy_Microphone' : 'Privacy_ScreenCapture')
      : 'ms-settings:privacy-microphone';
    await shell.openExternal(url);
    return status();
  }
  return { status, request };
}
module.exports = { permissions };
