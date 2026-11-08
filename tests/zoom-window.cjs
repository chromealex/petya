const assert = require('node:assert/strict');
const { inspectDesktop, isMeeting, hasMeeting } = require('../src/extensions/zoom/window.cjs');
(async () => {
  let calls = 0;
  const base = { platform: 'darwin', readNative: async () => ({ permission: false, zoomOpen: true, windows: [], zoomWindowIds: ['42'] }), screenStatus: () => 'granted', getSources: async options => { calls++; assert.equal(options.thumbnailSize.width, 0); return [{ id: 'window:42:0', name: 'Zoom Meeting' }, { id: 'window:99:0', name: 'Other app' }]; } };
  const result = await inspectDesktop(base); assert.equal(result.permission, true); assert.deepEqual(result.windows, [{ title: 'Zoom Meeting' }]);
  calls = 0; const denied = await inspectDesktop({ ...base, screenStatus: () => 'denied' }); assert.equal(calls, 0); assert.equal(denied.permission, false);
  await inspectDesktop({ ...base, readNative: async () => ({ permission: false, zoomOpen: false, windows: [] }) }); assert.equal(calls, 0);
  const readable = await inspectDesktop({ ...base, readNative: async () => ({ permission: false, zoomOpen: true, windows: [{ title: 'Zoom Meeting' }] }) }); assert.equal(readable.permission, true); assert.equal(calls, 0);
  const stale = await inspectDesktop({ ...base, explicit: true, screenStatus: () => 'denied' }); assert.equal(stale.permission, true); assert.equal(stale.windows.length, 1);
  const noWindows = await inspectDesktop({ ...base, explicit: true, screenStatus: () => 'denied', getSources: async () => [] }); assert.equal(noWindows.permission, null);
  const fs = require('node:fs'); assert.ok(!fs.readFileSync('native/watch-macos.swift','utf8').includes('CGRequestScreenCaptureAccess'));
  assert.ok(isMeeting('Zoom Meeting')); assert.ok(isMeeting('Конференция Zoom')); assert.ok(!isMeeting('Zoom Workplace')); assert.ok(!isMeeting('Slack')); assert.ok(!isMeeting('My call', 'My call'));
  assert.ok(hasMeeting({ windows: [{ title: 'zoom floating video window', visible: true }] }));
  assert.ok(!hasMeeting({ windows: [{ title: 'zoom floating video window', visible: false }, { title: 'Zoom' }, { title: 'ZM_HUD_TOAST_WINDOW' }, { title: 'Zoom Client Healthcheck' }] }));
  assert.ok(hasMeeting({ meetingActive: true, windows: [{ title: 'Custom meeting' }] }));
  console.log('Zoom window: helper/main permission mismatch, no unsolicited permission request, owner filtering, meeting window titles passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
