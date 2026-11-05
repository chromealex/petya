const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const registry=require('../src/features/extension-ui.cjs');
const directory=path.resolve(__dirname,'../src/extensions');
const folders=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name);
assert.deepEqual(registry.descriptors.map(d=>d.id).sort(),folders.sort());
for(const entry of registry.descriptors){
 assert.equal(typeof entry.settings,'boolean');
 if(entry.settings)assert(entry.scripts.some(([file])=>file==='settings.js'));
 for(const [file] of entry.scripts)assert(fs.existsSync(path.join(directory,entry.id,file)));
}
const settings={artistEnabled:'false'},s={settings,saveSettings:next=>Object.assign(settings,next)};
const {ipc}=registry.setup(s);
assert.equal(ipc.catalog().find(e=>e.id==='artist').installed,false);
ipc.install('artist');assert.equal(settings.artistEnabled,'true');
assert.throws(()=>ipc.install('../../main'));
assert.equal(registry.features.filter(f=>f.name==='artist').length,1);
console.log('Extension UI: every extension declares settings ownership, local renderer paths and installation state.');
