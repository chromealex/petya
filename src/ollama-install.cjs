const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { findOllamaApp } = require('./ollama.cjs');
const exec = promisify(execFile);
const urls = { darwin: 'https://ollama.com/download/Ollama-darwin.zip', win32: 'https://ollama.com/download/OllamaSetup.exe' };
const limit = 4 * 1024 ** 3;
async function download(url, file, { fetcher = fetch, signal, progress }) {
  const response = await fetcher(url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Не удалось скачать Ollama (HTTP ${response.status}).`);
  if (response.url && !response.url.startsWith('https://')) throw new Error('Небезопасный адрес загрузки Ollama.');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > limit) throw new Error('Файл установки слишком большой.');
  const output = await fs.open(file, 'wx', 0o600);
  let received = 0, last = 0;
  try {
    for await (const chunk of response.body) {
      signal.throwIfAborted(); received += chunk.length;
      if (received > limit) throw new Error('Файл установки слишком большой.');
      await output.writeFile(chunk);
      if (Date.now() - last > 150) { progress(received, total); last = Date.now(); }
    }
    if (!received || (total && received !== total)) throw new Error('Загрузка прервалась. Повторите установку.');
    progress(received, total);
  } finally { await output.close(); }
}
class OllamaInstaller {
  constructor({ platform = process.platform, home = os.homedir(), fetcher = fetch, run = exec, find = findOllamaApp, open, emit = () => {} } = {}) {
    Object.assign(this, { platform, home, fetcher, run, find, open, emit });
    this.state = { phase: 'idle', busy: false, message: '' };
  }
  update(phase, message, extra = {}) {
    this.state = { phase, message, busy: !['idle', 'done', 'error', 'cancelled'].includes(phase), received: 0, total: 0, ...extra };
    this.emit(this.state); return this.state;
  }
  start() {
    if (this.pending) return this.pending;
    this.controller = new AbortController();
    this.pending = this.install().catch(error => this.update(this.controller.signal.aborted ? 'cancelled' : 'error', this.controller.signal.aborted ? 'Загрузка отменена.' : `Не удалось установить Ollama: ${error.message}`)).finally(() => { this.pending = null; });
    return this.pending;
  }
  cancel() { if (['preparing', 'downloading'].includes(this.state.phase)) this.controller?.abort(); return this.state; }
  async install() {
    this.update('preparing', 'Подготовка установки…');
    if (!urls[this.platform]) throw new Error('Установка из Пети доступна на macOS и Windows.');
    let target = this.find(this.platform, this.home);
    if (target) return this.launch(target);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'petya-ollama-'));
    try {
      const file = path.join(dir, this.platform === 'darwin' ? 'Ollama.zip' : 'OllamaSetup.exe');
      this.update('downloading', 'Загрузка Ollama…');
      await download(urls[this.platform], file, { fetcher: this.fetcher, signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(60 * 60 * 1000)]), progress: (received, total) => this.update('downloading', 'Загрузка Ollama…', { received, total }) });
      this.controller.signal.throwIfAborted();
      if (this.platform === 'darwin') {
        this.update('extracting', 'Распаковка Ollama…');
        const unpacked = path.join(dir, 'unpacked');
        await this.run('/usr/bin/ditto', ['-x', '-k', file, unpacked], { timeout: 300000 });
        const source = path.join(unpacked, 'Ollama.app');
        this.update('verifying', 'Проверка подписи приложения…');
        await this.run('/usr/bin/codesign', ['--verify', '--deep', '--strict', source], { timeout: 120000 });
        await this.run('/usr/sbin/spctl', ['--assess', '--type', 'execute', source], { timeout: 120000 });
        const { stdout } = await this.run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(source, 'Contents/Info.plist')]);
        if (stdout.trim() !== 'com.electron.ollama') throw new Error('Архив не содержит приложение Ollama.');
        this.update('installing', 'Установка Ollama…');
        const applications = path.join(this.home, 'Applications');
        await fs.mkdir(applications, { recursive: true });
        // Stage on the destination volume. Do not leave a partial app after a failed copy.
        const stage = await fs.mkdtemp(path.join(applications, '.petya-ollama-'));
        try {
          await this.run('/usr/bin/ditto', [source, path.join(stage, 'Ollama.app')], { timeout: 300000 });
          target = this.find(this.platform, this.home);
          if (!target) {
            target = path.join(applications, 'Ollama.app');
            await fs.rename(path.join(stage, 'Ollama.app'), target);
          }
        } finally { await fs.rm(stage, { recursive: true, force: true }); }
      } else {
        this.update('verifying', 'Проверка подписи установщика…');
        const script = "$s = Get-AuthenticodeSignature -LiteralPath $env:PETYA_OLLAMA_INSTALLER; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch '(^|, )O=Ollama Inc\\.(,|$)') { throw 'Invalid Ollama signature' }";
        await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PETYA_OLLAMA_INSTALLER: file }, timeout: 120000, windowsHide: true });
        this.update('installing', 'Установка Ollama…');
        try { await this.run(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', '/SP-', '/CURRENTUSER'], { timeout: 900000, windowsHide: true }); }
        catch (error) { if (error.code !== 3010) throw error; }
        target = this.find(this.platform, this.home);
        if (!target) throw new Error('Установщик завершился, но Ollama не найден.');
      }
      return await this.launch(target);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
  async launch(target) {
    this.update('starting', 'Запуск Ollama…');
    const error = await this.open(target);
    if (error) throw new Error('Ollama установлен, но не запустился. Нажмите «Запустить Ollama».');
    return this.update('done', 'Ollama установлен и запускается. Выберите и загрузите модель в Ollama, затем подключите её здесь.');
  }
}
module.exports = { OllamaInstaller, download };
