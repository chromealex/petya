const assert = require('node:assert/strict');
const {CommandProgress} = require('../src/ui/command-progress.js');
(async () => {
  let writes = 0, reads = 0, fail = true;
  const p = new CommandProgress();
  await p.start('запрос', async flow => {
    await flow.step('write', 'Отправляю', async () => ++writes);
    await flow.step('read', 'Читаю', async () => { reads++; if (fail) throw Error('Нет сети'); return 42; }, true);
  });
  assert.equal(p.state, 'error'); assert(p.failed); fail = false;
  await p.retry(); assert.equal(writes, 1); assert.equal(reads, 2); assert.equal(p.state, 'done'); assert.equal(p.failed, null);
  await p.start('отправка', flow => flow.step('send', 'Отправляю', async () => { writes++; throw Error('Timeout'); }));
  assert.equal(p.failed, null); await p.retry(); assert.equal(writes, 2);
  let release; const waiting = p.start('долгая операция', () => new Promise(r => release = r));
  assert.equal(await p.start('дубликат', () => { throw Error('Must not run'); }), false);
  release(); await waiting;
  await p.start('ожидание', async flow => flow.update('waiting', 'Жду уточнения')); assert.equal(p.state, 'waiting');
  for (const text of ['повтори', 'Петя, повтори!', 'Попробуй ещё раз', 'повтори запрос']) assert(CommandProgress.isRetry(text), text);
  assert(!CommandProgress.isRetry('повтори отправку всем'));
  console.log('Command progress: resume without duplicate writes, uncertain send, concurrency and voice retry passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
