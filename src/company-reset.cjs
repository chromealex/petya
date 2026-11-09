// «Удалить все компании»: every company's data goes to the Trash and Petya starts from the introduction.
// The first company keeps its data in the app's root folder next to app-wide files, and Electron holds its
// session files open while running, so the removal is two-phase: request() writes a marker and Petya
// restarts; apply() runs at the next start before anything opens the folder, moves everything except the
// app-wide KEEP list into one `.removed-companies-<time>` folder and resets the company list. The caller
// then moves that folder to the Trash. Nothing is deleted here.
const fs = require('node:fs'), path = require('node:path');
const MARKER = 'reset-companies.json';
// App-wide data: downloaded models and runtimes, installed extensions, interface language, window size,
// macOS access state, and Chromium's own app-level files (Local State holds the key of the OS secret storage).
const KEEP = new Set([
  'artist-runtime', 'claude-usage.json', 'coder-worktrees', 'computer-access.json', 'extensions', 'image-generator',
  'interface-language.json', 'petya-models', 'petya-runtime', 'runtime', 'skill-packages', 'speech', 'voice-languages',
  'whisper-pids.json', 'window-state.json', '.dev-folder.json', '.staging',
  'Local State', 'SingletonLock', 'SingletonSocket', 'SingletonCookie', 'Crashpad', 'Dictionaries', 'logs', MARKER
]);
function request(root, fsImpl = fs) {
  fsImpl.mkdirSync(root, { recursive: true });
  fsImpl.writeFileSync(path.join(root, MARKER), JSON.stringify({ at: Date.now() }));
}
const pending = (root, fsImpl = fs) => fsImpl.existsSync(path.join(root, MARKER));
function apply(root, { fsImpl = fs, now = Date.now() } = {}) {
  if (!pending(root, fsImpl)) return null;
  const removed = path.join(root, '.removed-companies-' + now);
  fsImpl.mkdirSync(removed, { recursive: true });
  const move = (from, to) => { fsImpl.mkdirSync(path.dirname(to), { recursive: true }); fsImpl.renameSync(from, to); };
  for (const name of fsImpl.readdirSync(root)) {
    if (KEEP.has(name) || name.startsWith('.removed-companies-')) continue;
    move(path.join(root, name), path.join(removed, name));
  }
  // The first company's per-app data (journal, caches) shares the folder of installed extensions:
  // an installed extension has its extension.json; anything else there is company data.
  const extensions = path.join(root, 'extensions');
  let entries = []; try { entries = fsImpl.readdirSync(extensions, { withFileTypes: true }); } catch { entries = []; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const dir = path.join(extensions, entry.name);
    if (entry.isDirectory() && fsImpl.existsSync(path.join(dir, 'extension.json'))) continue;
    move(dir, path.join(removed, 'extensions', entry.name));
  }
  fsImpl.rmSync(path.join(root, MARKER), { force: true });
  return removed;
}
module.exports = { MARKER, KEEP, request, pending, apply };
