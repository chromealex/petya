const assert = require('node:assert/strict');
module.exports = async win => {
  const probe = () => win.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('[data-service="ollama"]');
    const progress = panel.querySelector('progress');
    const button = [...panel.querySelectorAll('button')].find(b => /Установить Ollama|Устанавливается|Повторить установку/.test(b.textContent));
    const cancel = [...panel.querySelectorAll('button')].find(b => b.textContent.startsWith('Отменить'));
    return { value: progress.value, text: panel.querySelector('.ollama-install p').textContent, disabled: button.disabled, cancelHidden: cancel.hidden, hidden: panel.querySelector('.ollama-install').hidden };
  })()`);
  await win.webContents.executeJavaScript('window.petya.ollamaInstallStatus()');
  win.webContents.send('ollama-install-progress', { phase: 'downloading', busy: true, message: 'Загрузка Ollama…', received: 5242880, total: 10485760 });
  let state = await probe(); assert.equal(state.value, 50); assert.match(state.text, /50%/); assert.equal(state.disabled, true); assert.equal(state.cancelHidden, false);
  win.webContents.send('ollama-install-progress', { phase: 'installing', busy: true, message: 'Установка Ollama…' });
  state = await probe(); assert.equal(state.cancelHidden, true);
  win.webContents.send('ollama-install-progress', { phase: 'error', busy: false, message: 'Тестовая ошибка' });
  state = await probe(); assert.equal(state.disabled, false); assert.equal(state.text, 'Тестовая ошибка');
  win.webContents.send('ollama-install-progress', { phase: 'idle', busy: false, message: '' });
  console.log('Ollama UI: progress and retry states passed');
};
