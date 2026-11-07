const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const execFile = require('node:util').promisify(require('node:child_process').execFile);
async function blenderExecutable() {
  if (process.platform === 'darwin') {
    const binary = '/Applications/Blender.app/Contents/MacOS/Blender';
    try { await fs.access(binary); return binary; } catch { /* Try PATH. */ }
  }
  if (process.platform === 'win32' && process.env.ProgramFiles) {
    const base = path.join(process.env.ProgramFiles, 'Blender Foundation');
    const versions = await fs.readdir(base).catch(() => []);
    const version = versions.filter(name => /^Blender \d/i.test(name)).sort((a,b) => b.localeCompare(a, 'en', {numeric:true}))[0];
    if (version) return path.join(base,version,'blender.exe');
  }
  return 'blender';
}

function animationMode(command) {
  if (/unity|юнити|maya|майе|unreal|анриле/iu.test(command)) return null;
  if (/^\s*(?:не |как |что такое|объясни|расскажи)/iu.test(command)) return null;
  if (/лишн\S* ключ|избыточн\S* ключ|почист\S* ключ|clean.*keyframe/iu.test(command)) return 'clean';
  if (/д[её]рга|рыв[ко]|скач[ок]|д[её]рн|jitter|jerk/iu.test(command) &&
      /анимац|движен|клип|персонаж|походк|кость|кост[ьи]|цикл|animation/iu.test(command)) return 'repair';
  return null;
}

async function render(file, dir, mode, object, tolerance) {
  const script = path.join(dir, 'animation.py');
  await fs.writeFile(script, await fs.readFile(path.join(__dirname, 'animation.py')));
  try {
    await execFile(await blenderExecutable(), ['--background','--factory-startup','--disable-autoexec','--python-exit-code','1',
      '--python',script,'--',file,dir,mode,object,String(tolerance)], {timeout:120000, killSignal:'SIGKILL', maxBuffer:4*1024*1024});
  } catch (error) {
    if (error.code === 'ENOENT') throw Error('Установите Blender на этом компьютере.');
    throw Error('Blender не смог обработать клип. Проверьте файл и активный Action.');
  }
  const result = JSON.parse(await fs.readFile(path.join(dir, 'result.json'), 'utf8'));
  if (result.error) throw Error(result.error);
  return result;
}

function animationEdits(resolveBlend, enabled, confirm, inspect = render) {
  const pending = new Map();
  function clearOnExit() {
    for (const entry of pending.values()) {
      try { require('node:fs').rmSync(entry.dir, {recursive:true,force:true}); } catch { /* OS temp cleanup is the fallback. */ }
    }
  }
  async function source(fileId) {
    if (!enabled()) throw Error('Подключите расширение Blender.');
    const {full, relative} = await resolveBlend(fileId);
    const stat = await fs.stat(full, {bigint:true});
    return {full, relative, version:[full,stat.ino,stat.size,stat.mtimeNs].join('|')};
  }
  async function discard(id) {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    if (!pending.size) process.removeListener('exit',clearOnExit);
    await fs.rm(entry.dir, {recursive:true,force:true});
  }
  async function analyze(fileId, mode, object = '', tolerance = 0.001) {
    if (!['repair','clean'].includes(mode) || typeof object !== 'string' || object.length > 256 ||
        !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) throw Error('Проверьте режим и допуск (от 0 до 1).');
    if (!enabled()) return {install:'blender'};
    const input = await source(fileId);
    if (!await confirm(input.full,'Проанализировать клип Blender?')) throw Error('Анализ отменён.');
    if ((await source(fileId)).version !== input.version) throw Error('Модель изменилась. Повторите поиск.');
    const dir = await fs.mkdtemp(path.join(os.tmpdir(),'petya-motion-'));
    let retained = false;
    try {
      const report = await inspect(input.full, dir, mode, object, tolerance);
      if ((await source(fileId)).version !== input.version) throw Error('Исходник изменился. Повторите анализ.');
      if (!report.changed) return report;
      if (pending.size >= 3) {
        const oldest = [...pending].find(([,entry]) => !entry.busy);
        if (!oldest) throw Error('Дождитесь сохранения предыдущей правки.');
        await discard(oldest[0]);
      }
      if (!pending.size) process.once('exit',clearOnExit);
      const proposalId = randomUUID();
      const timer = setTimeout(() => discard(proposalId).catch(() => {}), 10*60*1000);
      timer.unref();
      pending.set(proposalId, {dir,fileId,version:input.version,timer});
      retained = true;
      return {...report, proposalId};
    } finally { if (!retained) await fs.rm(dir,{recursive:true,force:true}); }
  }
  async function apply(id) {
    const entry = pending.get(id);
    if (!entry || entry.busy) throw Error('Предложение недоступно. Повторите анализ.');
    entry.busy = true;
    try {
      const input = await source(entry.fileId);
      const filename = path.parse(input.full).name + '-edited-' + id.slice(0,8) + '.blend';
      const parent = path.dirname(input.full);
      if (input.version !== entry.version) throw Error('Исходник изменился. Повторите анализ.');
      if (!await confirm(filename,'Сохранить предложенную правку отдельным файлом?')) throw Error('Сохранение отменено.');
      if ((await source(entry.fileId)).version !== entry.version || !pending.has(id)) throw Error('Предложение устарело.');
      const stage = await fs.mkdtemp(path.join(parent,'.petya-motion-'));
      try {
        const staged = path.join(stage,'candidate.blend');
        await fs.copyFile(path.join(entry.dir,'candidate.blend'),staged);
        if ((await source(entry.fileId)).version !== entry.version) throw Error('Подключение изменилось.');
        await fs.link(staged,path.join(parent,filename));
      } finally { await fs.rm(stage,{recursive:true,force:true}); }
      await discard(id);
      return {saved:path.join(path.dirname(input.relative),filename)};
    } finally { entry.busy = false; }
  }
  return {analyze,apply};
}
module.exports = { animationMode, animationEdits };
