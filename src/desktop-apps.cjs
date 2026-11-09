// Desktop programs installed on this computer, for apps that work with one (extension.json "desktop"):
// { "apps": ["Blender", "Blender Foundation"], "required": true }. "required" — the app is useless without the
// program, so «Добавить всю категорию» leaves it out when the program is missing; otherwise a found program
// only makes the catalog suggest its app. Reads folder names of standard install places (no OS permission,
// the same list as the introduction's role guess) and caches them for a minute.
const guess = require('./onboarding-guess.cjs');
let cache = { at: 0, names: [] };
function installed(env) {
  if (!env && Date.now() - cache.at < 60000) return cache.names;
  let names = []; try { names = guess.appNames(env || guess.environment()); } catch { names = []; }
  if (!env) cache = { at: Date.now(), names };
  return names;
}
const norm = value => String(value || '').toLocaleLowerCase('en').replace(/[_\s]+/g, ' ').trim();
// «Blender» matches «Blender», «Blender 4.2», «blender blender» (snap) — not «Blendermate».
function find(patterns, names = installed()) {
  for (const pattern of patterns || []) {
    const p = norm(pattern);
    const hit = names.find(name => { const n = norm(name); return n === p || n.startsWith(p + ' ') || n.replace(/\s*v?\d[\d.]*$/, '') === p; });
    if (hit) return hit;
  }
  return '';
}
const valid = desktop => !!desktop && typeof desktop === 'object' && Array.isArray(desktop.apps) && desktop.apps.length > 0 && desktop.apps.length <= 8
  && desktop.apps.every(a => typeof a === 'string' && a.trim() && a.length <= 60) && (desktop.required === undefined || typeof desktop.required === 'boolean');
module.exports = { installed, find, valid, reset() { cache = { at: 0, names: [] }; } };
