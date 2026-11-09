// «Размер билда» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// the two newest builds of one kind in the project folders are compared; sharp growth or debug symbols in the build
// are problems, the other warnings are listed. Read-only: only the ZIP directories are read.
const path=require('node:path');
const analyze=require('./analyze.cjs');
const find=require('./find.cjs');
const MB=1024*1024;
// Growth that needs a look before a release: over 10% or over 20 MB.
const MAX_SHARE=0.10,MAX_BYTES=20*MB;

module.exports={
 checks:[{id:'build.size',title:'Размер билда без резкого роста и замечаний',group:'Сборка'}],
 ready:()=>true,
 async run(s,release){
  const roots=release.roots?.length?release.roots:find.projectRoots(s);
  if(!roots.length)return [{id:'build.size',status:'unknown',summary:'У проекта нет папки на компьютере — подключите её в настройках проекта.'}];
  const found=await find.scan(roots);
  if(!found.length)return [{id:'build.size',status:'unknown',summary:'В папке проекта нет APK, AAB или IPA.'}];
  const ext=path.extname(found[0].name).toLowerCase(),same=found.filter(f=>path.extname(f.name).toLowerCase()===ext).slice(0,2);
  const builds=[];for(const f of same)builds.push(await analyze.inspect(f.path));
  const card=builds.length===2?await analyze.diff(builds[0],builds[1]):await analyze.single(builds[0]);
  const newer=card.builds.at(-1),older=card.builds.length>1?card.builds[0]:null;
  const evidence=[{text:newer.name+(newer.version?' ('+newer.version+(newer.build?', '+newer.build:'')+')':'')+': '+analyze.fmt(newer.bytes)+(older?', было '+analyze.fmt(older.bytes)+' в '+older.name:'')}];
  const problems=[];
  if(newer.version&&release.version&&String(newer.version).replace(/(?:\.0)+$/,'')!==String(release.version).replace(/(?:\.0)+$/,''))evidence.push({text:'Последний билд в папке — версии '+newer.version+', не '+release.version+'.'});
  if(older){const d=newer.bytes-older.bytes;if(d>MAX_BYTES||older.bytes&&d/older.bytes>MAX_SHARE)problems.push('билд вырос на '+analyze.fmt(d)+' ('+Math.round(d/older.bytes*1000)/10+'%)');}
  const warns=card.warnings.filter(w=>w.level==='warn');
  if(warns.some(w=>w.kind==='debug'))problems.push('в билде отладочные символы');
  for(const w of warns.slice(0,4))evidence.push({text:w.text});
  const action={label:'Размер билда',ask:older?'сравни размер двух последних билдов':'из чего состоит последний билд'};
  if(problems.length)return [{id:'build.size',status:'problem',summary:problems.join('; ')[0].toUpperCase()+problems.join('; ').slice(1)+'.',evidence,action}];
  return [{id:'build.size',status:'ok',summary:older?'Рост '+analyze.signed(newer.bytes-older.bytes)+' — в пределах нормы.':'Сравнить не с чем: в папке один билд '+ext.slice(1).toUpperCase()+'.',evidence,action}];
 }
};
