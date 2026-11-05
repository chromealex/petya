const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(execFile);
function unpacked(file) { return file.replace(/app\.asar([/\\])/u, 'app.asar.unpacked$1'); }
async function desktopState({meetingLink=false}={}) {
  let stdout;
  if (process.platform === 'darwin') ({ stdout } = await exec(unpacked(path.join(__dirname, '../assets/native/watch-macos')), meetingLink?['--meeting-link']:[], { timeout: 10000, maxBuffer: 1024 * 1024 }));
  else if (process.platform === 'win32') ({ stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', unpacked(path.join(__dirname, 'watch-windows.ps1')), ...(meetingLink?['-MeetingLink']:[])], { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }));
  else throw new Error('Автоопределение Zoom поддерживает macOS и Windows.');
  return JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
}
async function inspectDesktop({ platform, readNative, screenStatus, getSources, explicit = false }) {
  const state = await readNative();
  if (platform !== 'darwin') return state;
  // The helper's TCC identity may differ from Electron's. Actual readable titles
  // are stronger evidence than its preflight result; never request permission here.
  if (state.windows.length) return { ...state, permission: true };
  if (!state.zoomOpen) return { ...state, permission: null };
  if (!explicit && screenStatus() !== 'granted') return state;
  const owned = new Set(state.zoomWindowIds || []);
  const sources = await getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
  const windows = sources.filter(source => owned.has(source.id.split(':')[1]) && source.name).map(source => ({ title: source.name }));
  return { ...state, permission: windows.length || screenStatus() === 'granted' ? true : null, windows };
}
function isMeeting(title) {
  const t = String(title || '').trim().toLowerCase();
  return /^(zoom meeting|zoom webinar|конференция zoom|вебинар zoom)(?:\s*[-—:].*)?$/iu.test(t);
}
function hasMeeting(state) {
  return state.meetingActive === true || state.windows.some(w =>
    isMeeting(w.title) || (w.visible === true && /^zoom floating video window$/iu.test(w.title)));
}
class MeetingMonitor {
  constructor({ inspect, start, stop }) { Object.assign(this, { inspect, start, stop }); this.active = false; this.hits = 0; this.misses = 0; this.busy = false; this.paused = false; this.generation = 0; }
  pause() { this.paused = true; this.generation++; }
  async tick(enabled) {
    if (this.busy) return;
    this.busy = true; const generation = this.generation;
    try {
      if (!enabled) { if (this.active) await this.stop(); this.active = false; this.hits = 0; this.misses = 0; this.paused = false; return { message: 'Автозапись Zoom выключена' }; }
      const state = await this.inspect();
      if (generation !== this.generation) return;
      if (state.permission === false) throw new Error('Разрешите Пете запись экрана/системного звука в настройках ОС для определения окна Zoom.');
      const found = hasMeeting(state);
      if (found) { this.hits++; this.misses = 0; }
      else { this.hits = 0; this.misses++; }
      if (!found && this.misses >= 3) { if (this.active) await this.stop(); this.active = false; this.paused = false; }
      if (found && this.hits >= 2 && !this.active && !this.paused) {
        this.active = true;
        try { await this.start(); if (generation !== this.generation) { await this.stop(); this.active = false; } } catch (e) { this.paused = true; throw e; }
      }
      return { ...state, message: this.paused ? 'Автозапись приостановлена до следующей встречи' : this.active ? 'Обнаружено окно встречи Zoom' : 'Ожидаю окно встречи Zoom' };
    } catch (error) { if (this.active) { await this.stop(); this.active = false; this.paused = true; } throw error; }
    finally { this.busy = false; }
  }
}
module.exports = { inspectDesktop, desktopState, isMeeting, hasMeeting, MeetingMonitor };
