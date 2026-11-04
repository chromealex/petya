const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const {spokenText}=require('./spoken-text.cjs');
class LocalVoice {
  constructor({ roots, spawnProcess = spawn, languageDir = '' }) { this.languageDir=languageDir; this.roots = roots; this.spawnProcess = spawnProcess; this.child = null; this.pending = null; }
  start() {
    if (this.child) return;
    const binary = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
    const unified = process.platform === 'darwin' && this.roots.find(root => fs.existsSync(path.join(root, 'runtime/tts-multilingual', binary)) && fs.existsSync(path.join(root, 'runtime/models/qwen-tts-base/READY')) && fs.existsSync(path.join(root, 'runtime/models/qwen-tts-base/reference.wav')));
    const root = unified || this.roots.find(root => fs.existsSync(path.join(root, 'runtime/tts', binary)) && fs.existsSync(path.join(root, 'runtime/models/petya-voice.pt')));
    if (!root) throw Error('Локальный мужской голос ещё не установлен. Выполните scripts/setup-voice.py в папке Пети.');
    const child = this.spawnProcess(path.join(root, unified ? 'runtime/tts-multilingual' : 'runtime/tts', binary), ['-u', path.join(__dirname, unified ? 'multilingual-voice.py' : 'local-voice.py'), path.join(root, unified ? 'runtime/models/qwen-tts-base' : 'runtime/models/petya-voice.pt')], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env:{...process.env,PETYA_LANGUAGES_DIR:this.languageDir} });
    this.child = child;
    child.stderr.resume();
    child.stdin.on('error', () => this.fail(child));
    child.once('error', () => this.fail(child));
    child.once('exit', () => this.fail(child));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', line => {
      if (this.child !== child || !this.pending) return;
      const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
      try { const result = JSON.parse(line); if (result.error || typeof result.audio !== 'string') throw Error(result.error ? 'Не удалось озвучить ответ: '+String(result.error).slice(0,400) : 'Не удалось синтезировать ответ локальным голосом.'); pending.resolve(result.audio); }
      catch (error) { pending.reject(error); }
    });
  }
  fail(child) { if (this.child === child) this.stop('Локальный голос завершился. Повторите ответ.'); }
  speak(value, language = 'ru') {
    const text = spokenText(value);
    if (!text) return Promise.resolve(null);
    if (this.pending) this.stop();
    this.start();
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.stop('Озвучивание не ответило вовремя. Повторите ответ.'), 120000) };
      this.child.stdin.write(JSON.stringify({ text, language }) + '\n');
    });
  }
  stop(message = 'Озвучивание остановлено.') {
    const child = this.child; this.child = null;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(Error(message)); this.pending = null; }
    if (child) child.kill();
  }
}
module.exports = { LocalVoice, spokenText };
