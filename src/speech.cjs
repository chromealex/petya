const fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const { localEndpoint } = require('./core.cjs');
function speechError(error, endpoint) {
  const origin = new URL(endpoint).origin;
  if (error.status === 404) return new Error('Не найден адрес распознавания. В «Подключения → whisper.cpp» проверьте путь /inference.');
  if (error.status === 503) return new Error('Whisper ещё загружает модель. Подождите и включите микрофон снова.');
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return new Error('Распознавание не ответило вовремя. Проверьте whisper.cpp или выберите более быструю модель.');
  if (error instanceof TypeError || error.cause?.code || error.code === 'ECONNREFUSED') return new Error(`Сервис распознавания недоступен: ${origin}. Откройте «Подключения → whisper.cpp» и нажмите «Запустить распознавание».`);
  return error;
}
// whisper-server children outlive a Petya that was killed or crashed. Remember their PIDs and, on the
// next start, stop the ones still running — after checking that the PID is really a whisper-server.
const registry = {
  file: null,
  load() { try { const v = JSON.parse(fs.readFileSync(this.file, 'utf8')); return Array.isArray(v) ? v.filter(Number.isInteger) : []; } catch { return []; } },
  save(pids) { if (!this.file) return; try { fs.writeFileSync(this.file, JSON.stringify(pids), { mode: 0o600 }); } catch {} },
  add(pid) { if (this.file && Number.isInteger(pid)) this.save([...this.load().filter(p => p !== pid), pid]); },
  remove(pid) { if (this.file) this.save(this.load().filter(p => p !== pid)); }
};
function processList(run) {
  if (process.platform === 'win32') return [];
  try { return String(run('/bin/ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', timeout: 5000 })).split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter(Boolean).map(m => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] })); } catch { return []; }
}
function cleanupOrphans(file, binaries = [], { run = require('node:child_process').execFileSync, kill = (pid, signal) => process.kill(pid, signal), list = () => processList(run) } = {}) {
  registry.file = file;
  const rows = list(), known = registry.load(), stopped = [];
  const ours = row => /whisper-server/.test(row.command) && (known.includes(row.pid) || row.ppid === 1 && binaries.some(b => b && row.command.startsWith(b)));
  for (const row of rows) if (ours(row) && row.pid !== process.pid) { try { kill(row.pid, 'SIGTERM'); stopped.push(row.pid); } catch {} }
  // Windows has no ps; still stop the PIDs we recorded, verified by tasklist.
  if (process.platform === 'win32') for (const pid of known) { try { if (/whisper-server/i.test(String(run('tasklist', ['/FI', 'PID eq ' + pid, '/NH'], { encoding: 'utf8', timeout: 5000, windowsHide: true })))) { kill(pid); stopped.push(pid); } } catch {} }
  registry.save([]);
  return stopped;
}
class Speech {
  constructor({ fetcher = fetch, spawnProcess = spawn, pause = ms => new Promise(r => setTimeout(r, ms)), exists = fs.existsSync } = {}) { this.fetcher = fetcher; this.spawnProcess = spawnProcess; this.pause = pause; this.exists = exists; this.child = null; this.pending = null; }
  async health(endpoint) {
    const u = new URL(localEndpoint(endpoint)); u.pathname = u.pathname.replace(/\/[^/]*$/, '/health'); u.search = ''; u.hash = '';
    const r = await this.fetcher(u.href, { redirect: 'error', signal: AbortSignal.timeout(2500) });
    if (!r.ok) { const e = new Error('Whisper HTTP ' + r.status); e.status = r.status; throw e; }
    const body = await r.json(); if (body.status !== 'ok') { const error = new Error('Whisper ещё не готов.'); error.status = 503; throw error; }
  }
  ensure(settings) {
    if (this.pending) return this.pending;
    this.pending = this.start({ ...settings }).finally(() => { this.pending = null; }); return this.pending;
  }
  async start(s) {
    const endpoint = localEndpoint(s.whisperUrl);
    try { await this.health(endpoint); return { ready: true, message: 'Распознавание готово.' }; } catch (error) {
      if (error.status && error.status !== 503) throw speechError(error, endpoint);
      if (error.status === 503 || this.child && !this.child.killed) return this.waitReady(endpoint);
      if (!s.whisperBinary || !s.whisperModel) throw new Error('Локальный Whisper не запущен. В «Подключения → whisper.cpp» укажите whisper-server и файл модели .bin, затем нажмите «Запустить распознавание».');
      if (!(error instanceof TypeError) && !error.cause?.code && error.status !== 503 && !['TimeoutError', 'AbortError'].includes(error.name)) throw speechError(error, endpoint);
    }
    for (const [file, label] of [[s.whisperBinary, 'whisper-server'], [s.whisperModel, 'модель Whisper']]) if (!path.isAbsolute(file) || !this.exists(file)) throw new Error(`Не найден ${label}. Проверьте путь в подключениях.`);
    const u = new URL(endpoint);
    if (u.pathname !== '/inference') throw new Error('Автозапуск поддерживает путь /inference. Для другого пути запустите сервер вручную.');
    if (this.child && !this.child.killed) throw new Error('Whisper уже запускается или занят. Подождите и повторите проверку.');
    const child = this.spawnProcess(s.whisperBinary, ['-m', s.whisperModel, '--host', u.hostname.replace(/^\[|\]$/g, ''), '--port', u.port || '80', '-l', 'ru', '-t', '4'], { shell: false, windowsHide: true, stdio: 'ignore' });
    this.child = child; let failed = ''; registry.add(child.pid);
    child.once('error', () => { failed = 'Не удалось запустить whisper-server. Проверьте файл и разрешение на запуск.'; if (this.child === child) this.child = null; });
    child.once('exit', code => { registry.remove(child.pid); failed = `Whisper завершился (код ${code}). Проверьте модель и совместимость сервера.`; if (this.child === child) this.child = null; });
    return this.waitReady(endpoint, child, () => failed);
  }
  async waitReady(endpoint, child = this.child, failure = () => '') {
    for (let i = 0; i < 90; i++) {
      const failed = failure();
      if (failed) throw new Error(failed);
      if (child?.killed) throw new Error('Запуск распознавания отменён.');
      try { await this.health(endpoint); } catch (error) {
        if (error.status && error.status !== 503) throw speechError(error, endpoint);
        await this.pause(1000); continue;
      }
      if (failure()) throw new Error(failure());
      if (child?.killed) throw new Error('Запуск распознавания отменён.');
      return { ready: true, message: 'Распознавание готово.' };
    }
    if (child) child.kill(); throw new Error('Whisper не успел загрузить модель. Проверьте модель и перезапустите распознавание.');
  }
  stop() { if (this.child) { this.child.kill(); this.child = null; } }
}
module.exports = { Speech, speechError, cleanupOrphans };
