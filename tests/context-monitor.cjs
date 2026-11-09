const assert = require('node:assert/strict');
const { ContextStore, retention, DAY } = require('../src/context-store.cjs');
const { SlackContext, channels } = require('../src/extensions/slack/sync.cjs');
const { MeetingMonitor } = require('../src/meeting-monitor.cjs');
const { candidates } = require('../src/core.cjs');
(async () => {
  let now = 10 * DAY, saved, days = 7;
  const save = data => { saved = structuredClone(data); };
  const store = new ContextStore({ items: [], days: () => days, now: () => now, save });
  store.put([{ id: 'old', at: now - 6 * DAY, text: 'earlier', source: 'Встреча', title: 'Earlier' }, { id: 'new', at: now, text: 'recent', title: 'Recent', source: 'Встреча' }]);
  const restored = new ContextStore({ items: saved, days: () => days, now: () => now, save });
  assert.equal(restored.items.length, 2);
  days = 2; restored.prune(); assert.deepEqual(saved.map(x => x.id), ['new']);
  restored.clear(); assert.equal(saved.length, 0);
  assert.throws(() => retention(8)); assert.throws(() => retention(0));
  const thread = { id: 'thread', source: 'Slack', title: 'Topic', at: now + 1000, messages: [{ at: now - 1, user: 'U', text: 'before' }, { at: now + 1000, user: 'U', text: 'future' }] };
  const result = candidates('task', [thread], now, 7); assert.equal(result.length, 1); assert.ok(result[0].text.includes('before')); assert.ok(!result[0].text.includes('future'));
  // The monitor knows only what meeting sources report: {active}.
  let active = false, starts = 0, stops = 0;
  const monitor = new MeetingMonitor({ inspect: async () => ({ active }), start: async () => { starts++; }, stop: async () => { stops++; } });
  await monitor.tick(true); await monitor.tick(true); assert.equal(starts, 0);
  active = true; await monitor.tick(true); await monitor.tick(true); await monitor.tick(true); assert.equal(starts, 1);
  monitor.pause(); await monitor.tick(true); assert.equal(starts, 1);
  active = false; await monitor.tick(true); await monitor.tick(true); assert.equal(stops, 0); await monitor.tick(true); assert.equal(stops, 1);
  active = true; await monitor.tick(true); await monitor.tick(true); assert.equal(starts, 2); await monitor.tick(false); assert.equal(stops, 2);
  let release; const delayed = new MeetingMonitor({ inspect: async () => ({ active }), start: async () => { await new Promise(r => release = r); }, stop: async () => { stops++; } });
  await delayed.tick(true); const pending = delayed.tick(true); while (!release) await new Promise(r => setImmediate(r)); delayed.pause(); release(); await pending; assert.equal(delayed.active, false);
  assert.deepEqual(channels('C1,D1,G1'), ['C1','D1','G1']); assert.throws(() => channels('https://bad'));
  days = 7; const settings = { slackToken: 'fixture', slackChannels: 'C1', contextDays: '7' };
  let calls = [], rateLimit = false;
  const slack = new SlackContext({ settings: () => settings, store, now: () => now, request: async url => {
    calls.push(url); const u = new URL(url);
    if (rateLimit) { rateLimit = false; const e = new Error('Rate limited'); e.status = 429; e.retryAfter = 120; throw e; }
    if (u.pathname.endsWith('replies')) return { ok: true, messages: [{ ts: String((now - 10000) / 1000) + '.000000', user: 'U2', text: 'reply context' }] };
    return { ok: true, messages: [{ ts: String((now - 20000) / 1000) + '.000000', user: 'U1', text: 'root', reply_count: 1 }], response_metadata: u.searchParams.has('cursor') ? {} : { next_cursor: 'next-page' } };
  } });
  await slack.start(); assert.equal(slack.queue.length, 2); await slack.tick(); assert.ok(store.items.some(x => x.text.includes('reply context')));
  await slack.tick(); assert.equal(calls.length, 2, 'same-method rate limit');
  now += 61000; rateLimit = true; await slack.tick(); const callCount = calls.length;
  now += 61000; await slack.tick(); assert.equal(calls.length, callCount, 'Retry-After respected');
  now += 60000; await slack.tick(); assert.ok(calls.length > callCount);
  let resolve; const stale = new SlackContext({ settings: () => settings, store, now: () => now, request: () => new Promise(r => resolve = r) });
  const request = stale.start(); stale.reset(); resolve({ ok: true, messages: [{ ts: String(now / 1000) + '.000000', text: 'stale response' }] }); await request;
  assert.ok(!store.items.some(x => x.text.includes('stale response')));
  console.log('Context/monitor: retention, restart, cutoff, meeting detection, pause/start race, pagination, threads, rate limits and stale replies passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
