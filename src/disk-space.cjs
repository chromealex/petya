const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const RESERVE = 512 * 1024 ** 2;
function inspectSpace(directory, bytes, statfs = fs.statfsSync) {
  let existing = path.resolve(directory);
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  const stat = statfs(existing), available = Number(stat.bavail) * Number(stat.bsize);
  const required = Math.ceil(bytes) + RESERVE;
  if (!Number.isFinite(required) || bytes < 0) throw Error('Не удалось определить размер загрузки.');
  return { required, available, reserve: RESERVE, downloadBytes: bytes, enough: available >= required, missing: Math.max(0, required - available) };
}
function checkSpace(directory, bytes, statfs = fs.statfsSync) {
  const result = inspectSpace(directory, bytes, statfs);
  const { required, available } = result;
  if (!result.enough) {
    const gb = n => (n / 1024 ** 3).toFixed(1);
    throw Error(`Недостаточно места: требуется ${gb(required)} ГБ с запасом, свободно ${gb(available)} ГБ. Освободите место и повторите загрузку.`);
  }
  return result;
}
async function checkModelSpace(model, fetcher = fetch) {
  const { ModelUpdates } = require('./model-updates.cjs');
  const manifest = await new ModelUpdates({ fetcher }).manifest(model);
  if (!manifest?.size) throw Error('Не удалось определить размер модели. Повторите загрузку позже.');
  // Ollama does not expose its storage path; honor an explicit local override.
  return checkSpace(process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models'), manifest.size);
}
async function inspectModelSpace(model, { fetcher = fetch, statfs = fs.statfsSync } = {}) {
  const directory = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
  const base = { checkedAt: Date.now(), storage: process.env.OLLAMA_MODELS ? 'environment' : 'default',
    estimate: true, note: 'Проверен локальный каталог OLLAMA_MODELS или ~/.ollama/models. Если сервер хранит модели на другом диске, результат к нему не относится. Полный размер модели учитывается без вычета уже загруженных слоёв.' };
  const space = inspectSpace(directory, 0, statfs);
  if (!model) return { ...base, available: space.available, reserve: RESERVE, status: 'space_only' };
  try {
    const { ModelUpdates } = require('./model-updates.cjs');
    const manifest = await new ModelUpdates({ fetcher }).manifest(model);
    if (!manifest?.size) throw Error('Не удалось определить размер модели.');
    const result = inspectSpace(directory, manifest.size, statfs);
    return { ...base, ...result, model, status: result.enough ? 'sufficient' : 'insufficient' };
  } catch (error) {
    return { ...base, model, available: space.available, reserve: RESERVE, enough: null, status: 'unknown', error: error.message };
  }
}
module.exports = { checkSpace, checkModelSpace, inspectSpace, inspectModelSpace };
