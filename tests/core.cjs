const assert = require('assert').strict;
const fs = require('fs');
const vm = require('vm');
const { wake, isJiraCommand, resolve, candidates, adf, localEndpoint } = require('../src/core.cjs');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const now = Date.now();
const make = (id, title, at = now - 1000) => ({ id, title, text: title, source: 'Slack', at });
test('wake word respects Russian boundaries and punctuation', () => { assert.equal(wake('Петя, создай задачу'), 'создай задачу'); assert.equal(wake('Привет, Петя!'), ''); assert.equal(wake('Петяков создал задачу'), null); assert.equal(wake('создай задачу'), null); });
test('unsupported actions cannot create Jira tasks', () => { assert.equal(isJiraCommand('удали задачу'), false); assert.equal(isJiraCommand('заведи таску в жире'), true); });
test('missing context asks instead of inventing requirements', () => assert.equal(resolve('создай задачу', [], now).kind, 'missing'));
test('this feature is ambiguous even when one discussion is newer', () => assert.equal(resolve('заведи таску для этой фичи', [make('1', 'Поиск'), make('2', 'Вход')], now).kind, 'choose'));
test('explicit lexical match can identify discussion', () => assert.equal(resolve('создай задачу: одноразовый код входа', [make('1', 'Одноразовый код входа'), make('2', 'Тёмная тема')], now).context.id, '1'));
test('future and expired context excluded at invocation cutoff', () => { const result = candidates('задача', [make('1', 'Раньше'), make('2', 'После', now + 1), make('3', 'Вчера', now - 8 * 86400000)], now); assert.deepEqual(result.map(c => c.id), ['1']); });
test('meeting groups both speakers but never later speech', () => { const result = candidates('задача', [{ ...make('1', 'Первое'), sessionId: 'session', source: 'Zoom' }, { ...make('2', 'Второе', now - 500), sessionId: 'session', source: 'Микрофон' }, { ...make('3', 'Будущее', now + 500), sessionId: 'session' }], now); assert.equal(result.length, 1); assert(result[0].text.includes('Первое')); assert(result[0].text.includes('Второе')); assert(!result[0].text.includes('Будущее')); });
test('Jira text stays literal ADF text', () => assert.equal(adf('<script>\n\nx').content[0].content[0].text, '<script>'));
test('audio and model endpoints cannot exfiltrate to remote hosts', () => { assert(localEndpoint('http://127.0.0.1:8080/inference')); for (const url of ['https://example.com', 'http://localhost.evil.test', 'http://user:pass@localhost', 'file:///tmp/x']) assert.throws(() => localEndpoint(url)); });
test('WAV has correct format, duration, and clipped samples', () => { const scope = { Float32Array, ArrayBuffer, DataView }; vm.createContext(scope); vm.runInContext(fs.readFileSync(require.resolve('../src/ui/audio.js'), 'utf8'), scope); const wav = scope.toWav([new Float32Array(48000).fill(2)], 48000); const view = new DataView(wav); assert.equal(wav.byteLength, 32044); assert.equal(view.getUint32(24, true), 16000); assert.equal(view.getInt16(44, true), 32767); assert.equal(view.getUint32(40, true), 32000); });
console.log(`${passed} tests passed`);

assert(require('../src/core.cjs').standaloneContext('создай задачу исправить кнопку входа',now,'voice'));
assert.equal(require('../src/core.cjs').standaloneContext('создай задачу для этой фичи',now,'voice'),null);
