const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const RESERVE = 512 * 1024 ** 2;
function checkSpace(directory, bytes, statfs = fs.statfsSync) {
  let existing = path.resolve(directory);
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  const stat = statfs(existing), available = Number(stat.bavail) * Number(stat.bsize);
  const required = Math.ceil(bytes) + RESERVE;
  if (!Number.isFinite(required) || bytes < 0) throw Error('Не удалось определить размер загрузки.');
  if (available < required) {
    const gb = n => (n / 1024 ** 3).toFixed(1);
    throw Error(`Недостаточно места: требуется ${gb(required)} ГБ с запасом, свободно ${gb(available)} ГБ. Освободите место и повторите загрузку.`);
  }
  return { required, available };
}
async function checkModelSpace(model, fetcher = fetch) {
  const { ModelUpdates } = require('./model-updates.cjs');
  const manifest = await new ModelUpdates({ fetcher }).manifest(model);
  if (!manifest?.size) throw Error('Не удалось определить размер модели. Повторите загрузку позже.');
  // Ollama does not expose its storage path; honor an explicit local override.
  return checkSpace(process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models'), manifest.size);
}
module.exports = { checkSpace, checkModelSpace };
