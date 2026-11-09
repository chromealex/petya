// The version in package.json is the one shown in the app, sent to clients, badged in the README, and
// described at the top of docs/HISTORY.md (the release workflow takes the notes from that section).
// Change it with: node scripts/bump-version.cjs patch|minor|major
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const version=JSON.parse(read('package.json')).version;
assert.match(version,/^\d+\.\d+\.\d+$/);
for(const [rel,text] of require('../scripts/version-places.cjs')(version))
 assert.ok(read(rel).includes(text),`${rel} does not carry ${version} («${text}»); run node scripts/bump-version.cjs`);
const lock=JSON.parse(read('package-lock.json'));
assert.equal(lock.version,version,'package-lock.json');assert.equal(lock.packages[''].version,version,'package-lock.json packages[""]');
const first=read('docs/HISTORY.md').split('\n').find(l=>l.startsWith('## '));
assert.ok(first&&first.startsWith(`## ${version} `),`docs/HISTORY.md must start with «## ${version} — …» (found «${first}»)`);
// Older versions only go up: no section below the first carries a higher version.
const parse=v=>v.split('.').map(Number),gt=(a,b)=>{for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i];}return false;};
for(const l of read('docs/HISTORY.md').split('\n').filter(l=>/^## \d+\.\d+\.\d+ /.test(l)).slice(1))
 assert.ok(!gt(parse(l.slice(3).split(' ')[0]),parse(version)),`${l} is newer than ${version}`);
console.log(`Version: ${version} in package.json, the app, the README badge and docs/HISTORY.md passed`);
