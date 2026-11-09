// Appearance: modes, presets per mode, a custom accent with readable text on it, the text size; stylesheets use
// theme tokens instead of literal colours (scripts/theme-tokens.cjs).
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const a=require('../src/appearance.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'petya-look-')),app={getPath:()=>dir};
assert.deepEqual(a.read(app),a.DEFAULT,'defaults without a file');
assert.deepEqual(a.clean({mode:'neon',dark:'snow',light:'forest',accent:'red',size:'huge'}),a.DEFAULT,'unknown values fall back');
const saved=a.write({mode:'light',light:'paper',accent:'#FF8800',size:'large'},app);
assert.equal(saved.accent,'#ff8800');assert.equal(a.read(app).light,'paper');
const boot=a.bootstrap(app);
assert.equal(boot.tokens.light['--accent'],'#ff8800','the custom accent overrides the preset');assert.equal(boot.tokens.light['--on-accent'],'#14201a','dark text on a light accent');
assert.equal(boot.tokens.light['--bg'],'#f6f2ea','the preset keeps its other tokens');assert.equal(boot.tokens.dark['--accent'],'#ff8800');
assert.equal(a.onAccent('#1f62b4'),'#ffffff');
assert(boot.presets.some(p=>p.mode==='dark')&&boot.presets.some(p=>p.mode==='light'));assert(boot.presets.every(p=>p.preview.bg&&p.preview.accent));
// The stylesheets stay on tokens, so every theme reaches every screen.
const literal=require('../scripts/theme-tokens.cjs').check();
assert.deepEqual(literal,[],'literal colours in stylesheets — run node scripts/theme-tokens.cjs');
assert.equal(require('../scripts/theme-tokens.cjs').rewrite('a{color:#c9ed9d;background:#ffffff0d;border:1px solid #414847}'),'a{color:var(--ok);background:color-mix(in srgb,var(--on) 5%,transparent);border:1px solid var(--line)}');
fs.rmSync(dir,{recursive:true,force:true});
console.log('Appearance: defaults, validation, presets per mode, custom accent with readable text, bootstrap tokens, stylesheets on tokens passed');
