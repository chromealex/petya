const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { OllamaInstaller, download } = require('../src/ollama-install.cjs');
(async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ollama-install-test-'));
  try {
    const events = [], runs = []; let opens = 0, downloads = 0;
    const options = { platform: 'darwin', home, find: () => undefined, open: async () => { opens++; return ''; }, emit: s => events.push(s),
      fetcher: async () => { downloads++; return new Response('archive', { headers: { 'content-length': '7' } }); },
      run: async (file, args) => {
        runs.push(file);
        if (file.endsWith('ditto')) {
          const target = args[0] === '-x' ? path.join(args[3], 'Ollama.app') : args[1];
          await fs.mkdir(target, { recursive: true }); await fs.writeFile(path.join(target, 'fixture'), 'test');
        }
        return { stdout: 'com.electron.ollama\n' };
      }
    };
    const install = new OllamaInstaller(options);
    const first = install.start(); assert.equal(first, install.start());
    assert.equal((await first).phase, 'done'); assert.equal(downloads, 1); assert.equal(opens, 1);
    assert.equal(await fs.readFile(path.join(home, 'Applications/Ollama.app/fixture'), 'utf8'), 'test');
    assert.ok(events.some(s => s.received === 7 && s.total === 7));
    assert.ok(runs.includes('/usr/sbin/spctl'));
    const failed = new OllamaInstaller({ ...options, run: async () => { throw new Error('signature rejected'); } });
    assert.equal((await failed.start()).phase, 'error'); assert.equal(opens, 1);
    const existing = new OllamaInstaller({ ...options, find: () => '/existing/Ollama.app' });
    const before = downloads; assert.equal((await existing.start()).phase, 'done'); assert.equal(downloads, before);
    let ready;
    const waiting = new Promise(r => ready = r);
    const cancelled = new OllamaInstaller({ ...options, fetcher: (_url, { signal }) => new Promise((_r, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); ready(); }) });
    const pending = cancelled.start(); await waiting; cancelled.cancel();
    assert.equal((await pending).phase, 'cancelled');
    await fs.rm(path.join(home, 'Applications/Ollama.app'), { recursive: true });
    cancelled.fetcher = options.fetcher;
    assert.equal((await cancelled.start()).phase, 'done');
    await assert.rejects(download('https://example.test', path.join(home, 'short'), { signal: new AbortController().signal, fetcher: async () => new Response('short', { headers: { 'content-length': '99' } }), progress: () => {} }), /прервалась/);
    let unknown;
    await download('https://example.test', path.join(home, 'unknown'), { signal: new AbortController().signal, fetcher: async () => new Response('abc'), progress: (received, total) => unknown = { received, total } });
    assert.deepEqual(unknown, { received: 3, total: 0 });
    console.log('Ollama install: progress, unknown length, truncation, duplicate clicks, existing app, signature failure, cancellation and retry passed');
  } finally { await fs.rm(home, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
