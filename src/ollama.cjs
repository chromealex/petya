const fs = require('node:fs');
const path = require('node:path');
function findOllamaApp(platform, home, env = process.env, exists = fs.existsSync) {
  if (platform === 'darwin') return ['/Applications/Ollama.app', path.join(home, 'Applications/Ollama.app')].find(exists);
  if (platform !== 'win32') return undefined;
  const p = path.win32;
  const dirs = [p.join(env.LOCALAPPDATA || p.join(home, 'AppData', 'Local'), 'Programs', 'Ollama'),
    ...(env.PATH || '').split(';').map(s => s.replace(/^"|"$/g, '')).filter(p.isAbsolute)];
  return dirs.map(dir => p.join(dir, 'ollama app.exe')).find(exists);
}
module.exports = { findOllamaApp };
