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
// Catalog presentation: every app the catalog lists has example phrases and an icon; service modules without
// an extension directory get examples from categories.json; connection status never exposes secrets.
const listed=registry.descriptors.filter(d=>d.setting&&!d.service);
for(const d of listed){assert(d.examples?.length>=2,d.id+' has examples');assert(d.iconSvg?.startsWith('<svg'),d.id+' has an icon');assert(!/<script|href|\son\w+=/i.test(d.iconSvg));}
for(const id of ['unity','telegram','slack','jira','confluence','asana'])assert(registry.descriptors.find(d=>d.id===id).examples.length>=3,id+' has examples');
for(const id of ['notion','ai','googleplay','gmail','web'])assert(registry.groups.moduleExamples[id].length>=3,id+' has module examples');
for(const c of registry.groups.categories)assert(Number.isFinite(c.hue),c.id+' has a hue');
const links=require('../src/features/app-links.cjs');
for(const d of registry.descriptors)for(const kind of d.uses||[])assert(links.KINDS.includes(kind));
const s2={settings:{extension_crashes:'true','extension_pull-requests':'true',extension_github:'true',githubToken:'ghp_secret'},saveSettings(){}};
const rows=registry.setup(s2).ipc.catalog(),row=id=>rows.find(e=>e.id===id);
assert.equal(row('crashes').connected,false,'added Crashes without a connected crash source needs connecting');
assert.equal(row('pull-requests').connected,true);assert.equal(row('github').connected,true);
assert.equal(row('regex-cron').connected,null,'apps without a service have no connection state');
assert(!JSON.stringify(rows).includes('ghp_secret'),'secrets stay in the main process');
s2.settings.extension_sentry='true';s2.settings.sentryToken='t';s2.settings.sentryOrg='o';assert.equal(row('crashes').connected,false,'catalog rows are a snapshot');assert.equal(registry.setup(s2).ipc.catalog().find(e=>e.id==='sentry').connected,true,'Sentry is connected by its own token');assert.equal(registry.setup(s2).ipc.catalog().find(e=>e.id==='crashes').connected,true);
console.log('Extension UI: every extension declares settings ownership, local renderer paths and installation state; catalog examples, icons and connection state.');
