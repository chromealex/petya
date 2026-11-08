// The app ships only the small Whisper base model (142 MB). The better «small» model (466 MB) is downloaded
// once in the background into the user's data folder; base keeps recognition working until it is ready.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const MODEL = {
  name: 'ggml-small.bin',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  size: 487601967,
  sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b'
};
class SpeechModelDownload {
  // root: a folder laid out like the bundled runtime, so the model lands at root/runtime/models/ggml-small.bin.
  constructor({ root, fetcher = fetch, emit = () => {}, freeSpace = dir => { const s = fs.statfsSync(dir); return s.bavail * s.bsize; }, model = MODEL }) {
    Object.assign(this, { root, fetcher, emit, freeSpace, model }); this.state = null; this.pending = null;
  }
  get file() { return path.join(this.root, 'runtime/models', this.model.name); }
  installed() { try { return fs.statSync(this.file).size === this.model.size; } catch { return false; } }
  statuses() { return this.state ? [this.state] : []; }
  update(phase, message, extra = {}) {
    this.state = { code: 'speech-model', label: 'Распознавание речи', title: 'Распознавание речи · модель', phase, message, busy: !['done', 'error'].includes(phase), ...extra };
    this.emit(this.state);
  }
  start() {
    if (this.installed()) return Promise.resolve(this.file);
    if (this.pending) return this.pending;
    this.pending = this.download().catch(error => { this.update('error', error.message); throw error; }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async download() {
    const dir = path.dirname(this.file), temp = this.file + '.download';
    fs.mkdirSync(dir, { recursive: true });
    if (this.freeSpace(dir) < this.model.size + 200 * 1024 ** 2) throw Error('Не хватает места для улучшенной модели распознавания (нужно около 700 МБ). Пока работает базовая модель.');
    this.update('downloading', 'Загрузка улучшенной модели распознавания…', { received: 0, total: this.model.size });
    const response = await this.fetcher(this.model.url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
    if (!response.ok || !response.body?.getReader) throw Error('Не удалось скачать модель распознавания. Пока работает базовая модель.');
    const hash = crypto.createHash('sha256'), out = fs.openSync(temp, 'w', 0o600), reader = response.body.getReader();
    let received = 0, shown = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        received += part.value.length;
        if (received > this.model.size) throw Error('Модель распознавания не прошла проверку.');
        hash.update(part.value); fs.writeSync(out, part.value);
        if (received - shown > 4 * 1024 ** 2) { shown = received; this.update('downloading', 'Загрузка улучшенной модели распознавания…', { received, total: this.model.size }); }
      }
      fs.closeSync(out);
      this.update('verifying', 'Проверка модели…');
      if (received !== this.model.size || hash.digest('hex') !== this.model.sha256) throw Error('Модель распознавания не прошла проверку.');
      fs.renameSync(temp, this.file);
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { try { fs.closeSync(out); } catch {} fs.rmSync(temp, { force: true }); }
    this.update('done', 'Улучшенная модель распознавания установлена.');
    return this.file;
  }
}
module.exports = { SpeechModelDownload, MODEL };
