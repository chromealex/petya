// «С чего начать» on «Настройки» → «Сервисы» is generated from the apps that declare a quick start (extension.json
// "quickStart", categories.json "moduleQuickStart" for service modules without an app folder); the core names none.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const registry=require('../src/extension-registry.cjs');
const ui=require('../src/features/extension-ui.cjs');
const apps=registry.descriptors().filter(d=>d.quickStart).map(d=>[d.quickStart.order,d.id,d.service||'']);
const modules=Object.entries(ui.groups.moduleQuickStart||{}).map(([id,order])=>[order,id,id]);
assert.deepEqual([...apps,...modules].sort((a,b)=>a[0]-b[0]).map(x=>x[1]),['slack','jira','notion','mail'],'the same four as before, from their declarations');
for(const [,id,service] of [...apps,...modules])assert.ok(!service||ui.groups.modules[service],id+': a service module of the catalog');
// Validation: an order 0–1000, nothing else.
const dir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'petya-qs-'));
const write=quickStart=>fs.writeFileSync(path.join(dir,'extension.json'),JSON.stringify({id:'qs',name:'Q',description:'Q',category:'docs',setting:'extension_qs',settings:false,scripts:[],quickStart}));
write({order:5});assert.equal(registry.validate(dir).quickStart.order,5);
for(const bad of [true,{order:-1},{order:1.5},{order:1,label:'x'}]){write(bad);assert.throws(()=>registry.validate(dir),/quickStart/);}
fs.rmSync(dir,{recursive:true,force:true});
// The core page has no list of apps.
const text=fs.readFileSync(path.join(__dirname,'../src/ui/ux-review.js'),'utf8');
assert.ok(!/\['slack','Slack'\]|\['gmail','Почта'\]|\['notion','Notion'\]/.test(text),'ux-review.js names no quick-start app');
assert.match(text,/quickStart/);
console.log('Quick start: generated from the apps\' declarations (Slack, Jira, Notion, Почта), validated, none named in the core passed');
