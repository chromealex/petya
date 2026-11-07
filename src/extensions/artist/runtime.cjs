const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const exec = require('node:util').promisify(execFile);
const { pipeline } = require('node:stream/promises');

const release = 'https://github.com/leejet/stable-diffusion.cpp/releases/download/master-1047-984eb06/';
const mac = { file: 'sd-master-984eb06-bin-Darwin-macOS-26.6.2-arm64.zip', size: 37651339, hash: '857a2178db0a745ce841eb9526201605dc7c05a9fb6dd1b50fac6ccf6fbc93a6' };
const windows = { file: 'sd-master-984eb06-bin-win-cpu-x64.zip', size: 18069874, hash: '53d538e6187d31c2c22107ca89cb694494ca5e583f7e1d769cfb6b74926728b8' };
const model = {
  url: 'https://huggingface.co/Comfy-Org/stable-diffusion-1.5/resolve/9cfd069101959ca3828bf9c04a4419870832b74f/v1-5-pruned-emaonly-fp16.safetensors',
  size: 2132696762, hash: 'e9476a13728cd75d8279f6ec8bad753a66a1957ca375a1464dc63b37db6e3916'
};

async function download(asset, file, signal, progress) {
  const response = await fetch(asset.url, { signal });
  if (!response.ok || !response.body) throw Error('Ошибка загрузки компонентов Художника (HTTP ' + response.status + ').');
  const hash = createHash('sha256');
  let bytes = 0;
  await pipeline(response.body, async function* (chunks) {
    for await (const chunk of chunks) {
      bytes += chunk.length;
      if (bytes > asset.size) throw Error('Превышен ожидаемый размер загрузки.');
      hash.update(chunk);
      progress(bytes);
      yield chunk;
    }
  }, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal });
  if (bytes !== asset.size || hash.digest('hex') !== asset.hash) throw Error('Файл Художника не прошёл проверку целостности. Повторите загрузку.');
}

function createArtistRuntime(root, confirmDownload, status = () => {}) {
  let active;
  const directory = path.join(root, '984eb06-sd15');
  const win = process.platform === 'win32';
  const archive = win ? windows : mac;
  const exeName = win ? 'sd-cli.exe' : 'sd-cli';
  const modelName = 'sd15.safetensors';

  async function prepare(signal) {
    // Recover temporary downloads and prompts after an interrupted app session.
    // Petya holds a single-instance lock, and generate() serializes local jobs.
    const entries = await fsp.readdir(root).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    for (const name of entries) {
      if (/^(install|painting)-[A-Za-z0-9]{6}$/.test(name)) {
        await fsp.rm(path.join(root, name), { recursive: true, force: true });
      }
    }
    const installed = await Promise.all([
      fsp.stat(path.join(directory, modelName)).then(s => s.size === model.size, () => false),
      fsp.access(path.join(directory, exeName), fs.constants.X_OK).then(() => true, () => false)
    ]);
    if (installed.every(Boolean)) return;
    if (!(win && process.arch === 'x64' || process.platform === 'darwin' && ['arm64', 'x64'].includes(process.arch))) {
      throw Error('Автоустановка доступна на macOS и Windows x64. Можно указать адрес своего WebUI.');
    }
    const total = archive.size + model.size;
    if (!await confirmDownload(total)) throw Error('Загрузка отменена.');
    signal.throwIfAborted();
    await fsp.mkdir(root, { recursive: true, mode: 0o700 });
    await fsp.rm(directory, { recursive: true, force: true });
    const space = await fsp.statfs(root);
    if (space.bavail * space.bsize < total + 300000000) throw Error('Освободите не менее 2,5 ГБ для установки Художника.');
    const staging = await fsp.mkdtemp(path.join(root, 'install-'));
    try {
      let last = -1;
      const report = bytes => {
        const percent = Math.floor(100 * bytes / total);
        if (percent !== last) status('Загрузка Художника: ' + percent + '%', percent / 100);
        last = percent;
      };
      const zip = path.join(staging, 'engine.zip');
      report(0);
      await download({ ...archive, url: release + archive.file }, zip, signal, report);
      status('Устанавливаю генератор…', 2);
      if (win) await exec(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-xf', zip, '-C', staging], { signal });
      else await exec('/usr/bin/ditto', ['-x', '-k', zip, staging], { signal });
      await fsp.unlink(zip);
      await exec(path.join(staging, exeName), ['--help'], { cwd: staging, signal, windowsHide: true }).catch(cause => {
        signal.throwIfAborted();
        throw Error('Генератор не запустился на этом компьютере. Можно подключить свой сервер Stable Diffusion.', { cause });
      });
      status('Скачиваю модель изображений…', archive.size / total);
      await download(model, path.join(staging, modelName), signal, bytes => report(archive.size + bytes));
      await fsp.rename(staging, directory);
    } finally { await fsp.rm(staging, { recursive: true, force: true }); }
  }

  async function generate({ prompt, width, height, steps }) {
    if (active) throw Error('Художник занят. Дождитесь окончания текущего запроса.');
    active = new AbortController();
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(60 * 60 * 1000)]);
    try {
      await prepare(signal);
      status('Художник рисует…', 2);
      const job = await fsp.mkdtemp(path.join(root, 'painting-'));
      try {
        const output = path.join(job, 'painting.png');
        await fsp.writeFile(path.join(job, 'prompt.txt'), prompt, { mode: 0o600 });
        await exec(path.join(directory, exeName), ['-m', path.join(directory, modelName), '--prompt-file', path.join(job, 'prompt.txt'),
          '--backend', 'cpu', '-W', String(width), '-H', String(height), '--steps', String(steps), '-s', '-1', '-o', output],
          { cwd: directory, signal, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }).catch(cause => {
          signal.throwIfAborted();
          throw Error('Локальный генератор завершился с ошибкой. Проверьте свободную память и повторите рисунок.', { cause });
        });
        return await fsp.readFile(output, 'base64');
      } finally { await fsp.rm(job, { recursive: true, force: true }); }
    } finally { active = null; status('', -1); }
  }
  // Whether the generator and the model are on disk, and the download alone (from settings, with progress).
  const installed = async () => (await Promise.all([
    fsp.stat(path.join(directory, modelName)).then(s => s.size === model.size, () => false),
    fsp.access(path.join(directory, exeName), fs.constants.X_OK).then(() => true, () => false)])).every(Boolean);
  async function install() { if (active) throw Error('Дождитесь завершения работы Художника.'); active = new AbortController(); try { await prepare(active.signal); } finally { active = null; } }
  return { generate, installed, install, stop: () => active?.abort(), remove() {
    if (active) throw Error('Дождитесь завершения работы Художника.');
    fs.rmSync(root, { recursive: true, force: true });
  } };
}
module.exports = { createArtistRuntime };
