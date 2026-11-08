// «Локализация» as a release check of «Релизный чек-лист» (contract: src/extensions/release-checklist/checks.cjs):
// the project's localization files have no missing or empty strings and no broken placeholders. Read-only — the
// same code checks as the app's card, on the project folders; translating stays the app's own «Сохранить переводы».
const checks=require('./checks.cjs');
const formats=require('./formats.cjs');
const find=require('./find.cjs');
const langs=require('./langs.cjs');

module.exports={
 checks:[{id:'loc.missing',title:'Нет непереведённых строк',group:'Контент'}],
 ready:()=>true,
 async run(s,release){
  const roots=release.roots?.length?release.roots:find.projectRoots(s);
  if(!roots.length)return [{id:'loc.missing',status:'unknown',summary:'У проекта нет папки на компьютере — подключите её в настройках проекта.'}];
  const sets=formats.sets(await find.scan(roots),{source:langs.code(s.settings.localizationSourceLanguage)||'en'});
  if(!sets.length)return [{id:'loc.missing',status:'unknown',summary:'В папке проекта не нашёл файлов локализации.'}];
  const by=new Map();
  for(const set of sets)for(const row of checks.check(set,{ratio:Number(s.settings.localizationLengthRatio)||1.4,limit:0}).rows){
   const a=by.get(row.lang)||{lang:row.lang,total:0,missing:0,empty:0,placeholders:0};
   a.total+=row.total;a.missing+=row.missing;a.empty+=row.empty;a.placeholders+=row.placeholders;by.set(row.lang,a);
  }
  const rows=[...by.values()].sort((a,b)=>(b.missing+b.empty+b.placeholders)-(a.missing+a.empty+a.placeholders));
  if(!rows.length)return [{id:'loc.missing',status:'unknown',summary:'В файлах локализации только исходный язык.'}];
  const bad=rows.filter(r=>r.missing+r.empty+r.placeholders);
  const line=r=>{const name=langs.name(r.lang);return name[0].toUpperCase()+name.slice(1)+': '+[r.missing&&'нет перевода '+r.missing,r.empty&&'пусто '+r.empty,r.placeholders&&'плейсхолдеры '+r.placeholders].filter(Boolean).join(', ');};
  const evidence=(bad.length?bad:rows).slice(0,6).map(r=>({text:bad.length?line(r):langs.name(r.lang)+': переведено всё ('+r.total+')'}));
  if(bad.length){
   const total=bad.reduce((n,r)=>n+r.missing+r.empty,0);
   return [{id:'loc.missing',status:'problem',summary:(total?'Не переведено строк: '+total+' в '+bad.filter(r=>r.missing+r.empty).length+' яз.':'')+(bad.some(r=>r.placeholders)?(total?'; ':'')+'сломаны плейсхолдеры':'')+'.',evidence,action:{label:'Локализация',ask:'что не переведено в локализации'}}];
  }
  return [{id:'loc.missing',status:'ok',summary:'Переведено полностью: '+rows.map(r=>langs.name(r.lang)).join(', ')+'.',evidence}];
 }
};
