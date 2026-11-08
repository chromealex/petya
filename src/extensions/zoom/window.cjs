// Zoom's meeting window on this computer: the native helper (assets/native/watch-macos on macOS, watch-windows.ps1
// on Windows) lists Zoom's windows; a «Zoom Meeting» / «Конференция Zoom» window or the floating video window
// means a meeting is going on. On macOS, when the helper cannot read titles, Electron's own window list (screen
// recording permission, through the neutral src/desktop-windows.cjs) is used for Zoom's window ids only; permission
// is never requested from here.
const { execFile } = require('node:child_process');
const desktopWindows = require('../../desktop-windows.cjs');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(execFile);
function unpacked(file) { return file.replace(/app\.asar([/\\])/u, 'app.asar.unpacked$1'); }
async function desktopState({meetingLink=false}={}) {
  let stdout;
  if (process.platform === 'darwin') ({ stdout } = await exec(unpacked(path.join(__dirname, '../../../assets/native/watch-macos')), meetingLink?['--meeting-link']:[], { timeout: 10000, maxBuffer: 1024 * 1024 }));
  else if (process.platform === 'win32') ({ stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', unpacked(path.join(__dirname, 'watch-windows.ps1')), ...(meetingLink?['-MeetingLink']:[])], { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 }));
  else throw new Error('Автоопределение Zoom поддерживает macOS и Windows.');
  return JSON.parse(stdout.replace(/^﻿/, '').trim());
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
// One inspection at a time; a granted permission seen once is remembered for the session.
let verified = false, running = null;
function inspect(explicit = false, { platform = process.platform, readNative = desktopState, electron = () => require('electron') } = {}) {
  if (running) return explicit ? running.catch(() => {}).then(() => inspect(true, { platform, readNative, electron })) : running;
  running = (async () => {
    let timer;
    try {
      const { systemPreferences } = platform === 'darwin' ? electron() : {};
      const result = await Promise.race([
        inspectDesktop({ platform, readNative, explicit,
          screenStatus: () => verified ? 'granted' : systemPreferences.getMediaAccessStatus('screen'),
          getSources: () => desktopWindows.sources({ electron }) }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('macOS не вернула список окон за 15 секунд. Проверьте, нет ли открытого системного диалога доступа.')), 15000); })
      ]);
      if (result.permission === true) verified = true;
      return result;
    } catch (error) { verified = false; throw error; }
    finally { clearTimeout(timer); }
  })().finally(() => { running = null; });
  return running;
}
module.exports = { inspectDesktop, desktopState, isMeeting, hasMeeting, inspect };
