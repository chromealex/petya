#!/usr/bin/env node
// Sets Petya's version everywhere it is written down, so the app, the installer and the release agree.
// Usage: node scripts/bump-version.cjs patch|minor|major|<x.y.z>
// Then add a «## x.y.z — what changed» section at the top of docs/HISTORY.md (the release notes are taken
// from it); tests/version.cjs fails until every place below and that section match package.json.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const file=rel=>path.join(root,rel);
const pkg=JSON.parse(fs.readFileSync(file('package.json'),'utf8'));
const current=pkg.version;
const arg=process.argv[2];
if(!arg){console.error('Usage: node scripts/bump-version.cjs patch|minor|major|<x.y.z>');process.exit(1);}
const [ma,mi,pa]=current.split('.').map(Number);
const next={patch:`${ma}.${mi}.${pa+1}`,minor:`${ma}.${mi+1}.0`,major:`${ma+1}.0.0`}[arg]||arg;
if(!/^\d+\.\d+\.\d+$/.test(next)){console.error('Not a version: '+next);process.exit(1);}
// Every place that carries the version, as [file, current text, next text].
const places=require('./version-places.cjs')(current,next);
for(const [rel,from,to] of places){
 const p=file(rel),text=fs.readFileSync(p,'utf8');
 if(!text.includes(from))throw Error(`${rel}: «${from}» not found`);
 fs.writeFileSync(p,text.split(from).join(to));
}
// package-lock.json: the root package's two version fields only (not dependencies that share the number).
const lock=JSON.parse(fs.readFileSync(file('package-lock.json'),'utf8'));
lock.version=next;if(lock.packages?.[''])lock.packages[''].version=next;
fs.writeFileSync(file('package-lock.json'),JSON.stringify(lock,null,2)+'\n');
console.log(`${current} → ${next}. Now add «## ${next} — …» at the top of docs/HISTORY.md.`);
