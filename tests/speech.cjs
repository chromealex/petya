const assert = require('assert').strict, { EventEmitter } = require('events');
const { Speech, speechError } = require('../src/speech.cjs');
const settings = { whisperUrl: 'http://127.0.0.1:8080/inference', whisperBinary: '/tmp/whisper-server', whisperModel: '/tmp/base.bin' };
const ok = async () => ({ ok: true, json: async () => ({ status: 'ok' }) });
const offline = async () => { throw new TypeError('fetch failed'); };
let count = 0;
async function test(name, fn) { await fn(); count++; console.log('✓ ' + name); }
(async () => {
 await test('existing server is reused and not stopped by Petya', async () => { let spawns = 0; const s = new Speech({ fetcher: ok, spawnProcess: () => spawns++ }); await s.ensure(settings); s.stop(); assert.equal(spawns, 0); });
 await test('offline server without runtime gives actionable error', async () => { const s = new Speech({ fetcher: offline }); await assert.rejects(s.ensure({ whisperUrl: settings.whisperUrl }), /whisper-server/); });
 await test('concurrent starts launch once and use argument array', async () => { let started = false, spawns = 0; const child = new EventEmitter(); child.kill = () => child.killed = true; const s = new Speech({ fetcher: (...args) => started ? ok(...args) : offline(), exists: () => true, pause: async () => {}, spawnProcess: (exe, args, options) => { spawns++; assert.equal(options.shell, false); assert(args.includes('127.0.0.1')); assert(args.includes('/tmp/base.bin')); started = true; return child; } }); await Promise.all([s.ensure(settings), s.ensure(settings)]); assert.equal(spawns, 1); s.stop(); assert(child.killed); });
 await test('external endpoints and missing models never start processes', async () => { let spawns = 0; const s = new Speech({ fetcher: offline, exists: () => false, spawnProcess: () => spawns++ }); await assert.rejects(s.ensure({ ...settings, whisperUrl: 'https://evil.example/inference' })); await assert.rejects(s.ensure(settings), /Не найден/); assert.equal(spawns, 0); });
 await test('startup timeout terminates the owned child', async () => { const child = new EventEmitter(); child.kill = () => child.killed = true; const s = new Speech({ fetcher: offline, exists: () => true, pause: async () => {}, spawnProcess: () => child }); await assert.rejects(s.ensure(settings), /не успел/); assert(child.killed); });
 await test('loading external server becomes ready without spawning or runtime paths', async () => {
   for (const response of [{ ok: false, status: 503 }, { ok: true, json: async () => ({ status: 'loading' }) }]) {
     let calls = 0, pauses = 0;
     const s = new Speech({ fetcher: async () => ++calls < 4 ? response : ok(), pause: async () => { pauses++; }, spawnProcess: () => { throw new Error('Must reuse loading server'); } });
     const first = s.ensure({ whisperUrl: settings.whisperUrl });
     assert.equal(first, s.ensure(settings));
     assert.equal((await first).ready, true); assert.equal(pauses, 2); assert.equal(calls, 4);
   }
 });
 await test('cold start waits through offline and loading responses with one process', async () => {
   let calls = 0, spawns = 0, pauses = 0;
   const child = new EventEmitter(); child.kill = () => child.killed = true;
   const s = new Speech({ exists: () => true, spawnProcess: () => { spawns++; return child; }, pause: async () => { pauses++; }, fetcher: async () => {
     calls++; if (calls < 3) return offline(); if (calls < 5) return { ok: false, status: 503 }; return ok();
   } });
   assert.equal((await s.ensure(settings)).ready, true); assert.equal(spawns, 1); assert.equal(pauses, 3); s.stop();
 });
 await test('external loading timeout clears pending and allows a later retry', async () => {
   const s = new Speech({ fetcher: async () => ({ ok: false, status: 503 }), pause: async () => {}, spawnProcess: () => { throw new Error('Must not spawn'); } });
   await assert.rejects(s.ensure(settings), /не успел/); assert.equal(s.pending, null);
   s.fetcher = ok; assert.equal((await s.ensure(settings)).ready, true);
 });
 await test('errors distinguish offline, timeout, loading and wrong path', () => { assert(speechError(new TypeError('fetch failed'), settings.whisperUrl).message.includes('Запустить')); for (const [e, pattern] of [[{ name: 'TimeoutError' }, /вовремя/], [{ status: 404 }, /inference/], [{ status: 503 }, /загружает/]]) assert.match(speechError(e, settings.whisperUrl).message, pattern); });
 console.log(`${count} speech tests passed`);
})().catch(e => { console.error(e); process.exitCode = 1; });
