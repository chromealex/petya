// Packaging only: resize the imagegen masters and encode native icon containers.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const root = path.resolve(__dirname, '..'), assets = path.join(root, 'assets');
const master = path.join(assets, 'branding/petya-master.png');
const template = path.join(assets, 'branding/petya-template-master.png');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'petya-icons-'));
const iconset = path.join(temp, 'petya.iconset'); fs.mkdirSync(iconset);
function size(source, px, output) { execFileSync('sips', ['-z', String(px), String(px), source, '--out', output], { stdio: 'ignore' }); }
for (const px of [16, 32, 128, 256, 512]) {
  size(master, px, path.join(iconset, `icon_${px}x${px}.png`));
  size(master, px * 2, path.join(iconset, `icon_${px}x${px}@2x.png`));
}
size(master, 1024, path.join(assets, 'app-icon.png'));
size(master, 128, path.join(assets, 'petya.png'));
size(master, 32, path.join(assets, 'tray.png'));
size(master, 64, path.join(assets, 'tray@2x.png'));
size(template, 22, path.join(assets, 'trayTemplate.png'));
size(template, 44, path.join(assets, 'trayTemplate@2x.png'));
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(assets, 'app-icon.icns')]);
const entries = [16, 24, 32, 48, 64, 128, 256].map(px => {
  const name = path.join(temp, `win-${px}.png`); size(master, px, name); return { px, data: fs.readFileSync(name) };
});
const header = Buffer.alloc(6 + 16 * entries.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
let offset = header.length;
entries.forEach(({ px, data }, i) => { const at = 6 + i * 16; header[at] = header[at + 1] = px === 256 ? 0 : px; header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6); header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12); offset += data.length; });
fs.writeFileSync(path.join(assets, 'app-icon.ico'), Buffer.concat([header, ...entries.map(e => e.data)]));
fs.rmSync(temp, { recursive: true });
console.log('Generated PNG, Retina tray, ICNS and multi-size ICO assets.');
