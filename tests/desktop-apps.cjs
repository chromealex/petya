// Apps that work with a desktop program: finding the program, manifests and the catalog rules.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const desktop = require('../src/desktop-apps.cjs');
const guess = require('../src/onboarding-guess.cjs');

const mac = ['Blender', 'Unity Hub', 'zoom.us', 'Telegram', 'Blendermate', 'Slack'];
assert.equal(desktop.find(['Blender', 'Blender Foundation'], mac), 'Blender');
assert.equal(desktop.find(['Blender'], ['Blendermate']), '', 'a longer name is another program');
assert.equal(desktop.find(['Blender', 'Blender Foundation'], ['Blender Foundation']), 'Blender Foundation', 'Windows install folder');
assert.equal(desktop.find(['Blender'], ['Blender 4.2']), 'Blender 4.2');
assert.equal(desktop.find(['Blender'], ['blender blender']), 'blender blender', 'snap desktop file');
assert.equal(desktop.find(['zoom.us', 'Zoom'], mac), 'zoom.us');
assert.equal(desktop.find(['Unity Hub', 'Unity'], ['Unity Hub']), 'Unity Hub');
assert.equal(desktop.find(['Discord'], mac), '');

// Windows per-user installs (Telegram Desktop, Zoom) are found in the profile folders.
const win = { platform: 'win32', home: 'C:/Users/a', env: { LOCALAPPDATA: 'L', APPDATA: 'R', ProgramFiles: 'P' }, list: dir => ({ P: ['Blender Foundation'], L: ['Discord'], R: ['Telegram Desktop', 'Zoom'] })[dir] || [] };
const names = desktop.installed(win);
assert.equal(desktop.find(['Telegram', 'Telegram Desktop'], names), 'Telegram Desktop');
assert.equal(desktop.find(['Discord'], names), 'Discord');
assert.equal(desktop.find(['Blender', 'Blender Foundation'], names), 'Blender Foundation');
assert.ok(guess.appNames(win).includes('Zoom'));

// Manifest field.
assert.ok(desktop.valid({ apps: ['Blender'], required: true }));
for (const bad of [{}, { apps: [] }, { apps: ['x'], required: 'yes' }, { apps: [''] }, { apps: Array(9).fill('a') }]) assert.ok(!desktop.valid(bad));
const manifest = id => JSON.parse(fs.readFileSync(path.join(__dirname, '../src/extensions', id, 'extension.json'), 'utf8'));
for (const id of ['blender', 'unity', 'layout']) assert.equal(manifest(id).desktop.required, true, id + ' is useless without its program');
for (const id of ['zoom', 'telegram', 'discord', 'teams', 'slack', 'github']) assert.ok(manifest(id).desktop && !manifest(id).desktop.required, id + ' is only suggested');
const registry = require('../src/extension-registry.cjs');
assert.ok(registry.descriptors().some(d => d.id === 'blender' && d.desktop), 'bundled manifests with "desktop" stay valid');

// Catalog: «Добавить всю категорию» skips apps whose program is missing; found programs are suggested.
const catalog = fs.readFileSync(path.join(__dirname, '../src/ui/app-catalog.js'), 'utf8');
assert.match(catalog, /missing=unadded\.filter\(i=>!notHere\(i\)\)/);
assert.match(catalog, /function suggestFromComputer/);
console.log('Desktop apps: program search on macOS/Windows/Linux names, manifests and catalog rules passed');
