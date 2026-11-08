// «Размер билда»: what an APK, AAB or IPA consists of and what grew between two builds.
// Everything is computed by code from the ZIP central directory (compressed and uncompressed sizes, CRC);
// only the manifest / Info.plist and ELF section tables are read from file data, each with a size limit.
const fs=require('node:fs/promises');
const path=require('node:path');
const zip=require('./zip.cjs');
const meta=require('./meta.cjs');

const MB=1024*1024;
const LABELS={dex:'Код (dex)',binary:'Бинарник приложения',frameworks:'Frameworks',unity:'Unity Data',addressables:'Addressables (aa/)',
 streaming:'StreamingAssets',assets:'Прочие ассеты',resources:'Ресурсы',debug:'Отладочные символы',other:'Прочее'};
const label=cat=>cat.startsWith('native:')?'Нативные · '+cat.slice(7):LABELS[cat]||cat;

function kindOf(file,entries){
 const ext=path.extname(file).slice(1).toLowerCase();
 if(['apk','aab','ipa'].includes(ext))return ext;
 if(entries.some(e=>e.name==='AndroidManifest.xml'))return 'apk';
 if(entries.some(e=>/^base\/manifest\/AndroidManifest\.xml$/.test(e.name)))return 'aab';
 if(entries.some(e=>/^Payload\/[^/]+\.app\//.test(e.name)))return 'ipa';
 return null;
}
const DEBUG=/\.dSYM\/|\.(?:debug|dbg|sym|pdb|mdb)$|\.sym\.so$|^Symbols\/|^BUNDLE-METADATA\/com\.android\.tools\.build\.debugsymbols\//i;

// Category of one archive path. For AAB the module (base, feature or asset pack) is returned too.
function classify(kind,name){
 if(DEBUG.test(name))return {cat:'debug'};
 if(kind==='ipa'){
  const m=/^Payload\/([^/]+)\.app\/(.*)$/.exec(name);if(!m)return {cat:'other'};
  const [,app,rest]=m;
  if(rest===app)return {cat:'binary'};
  if(rest.startsWith('Frameworks/'))return {cat:'frameworks'};
  if(/^Data\/Raw\/aa\//.test(rest))return {cat:'addressables'};
  if(rest.startsWith('Data/Raw/'))return {cat:'streaming'};
  if(rest.startsWith('Data/'))return {cat:'unity'};
  if(/\.(?:car|nib|storyboardc|lproj|xib)(?:\/|$)|\.lproj\/|\.(?:png|jpe?g|pdf|strings)$/i.test(rest))return {cat:'resources'};
  if(/^(?:_CodeSignature|SC_Info|PlugIns|Watch|embedded\.mobileprovision)/.test(rest))return {cat:'other'};
  return {cat:'assets'};
 }
 let module='',rest=name;
 if(kind==='aab'){
  if(/^(?:BUNDLE-METADATA|META-INF)\/|^BundleConfig\.pb$/.test(name))return {cat:'other'};
  const i=name.indexOf('/');module=i>0?name.slice(0,i):'';rest=i>0?name.slice(i+1):name;
  if(rest.startsWith('dex/'))return {cat:'dex',module};
  if(rest==='resources.pb')return {cat:'resources',module};
  if(rest.startsWith('root/'))rest=rest.slice(5);
 }
 const lib=/^lib\/([^/]+)\/[^/]+$/.exec(rest);
 if(lib)return {cat:'native:'+lib[1],module};
 if(/^classes\d*\.dex$/.test(rest))return {cat:'dex',module};
 if(rest.startsWith('assets/aa/'))return {cat:'addressables',module};
 if(rest.startsWith('assets/bin/Data/'))return {cat:'unity',module};
 if(rest.startsWith('assets/'))return {cat:/(?:^|\/)StreamingAssets\//.test(rest)?'streaming':'assets',module};
 if(rest==='resources.arsc'||rest.startsWith('res/'))return {cat:'resources',module};
 return {cat:'other',module};
}

// Normalized path for matching files between two builds (the .app folder name may change between IPAs).
const key=(kind,name)=>kind==='ipa'?name.replace(/^Payload\/[^/]+\.app\//,'App/'):name;

async function version(file,kind,entries){
 try{
  if(kind==='apk'){const e=entries.find(x=>x.name==='AndroidManifest.xml');return e?meta.apkManifest(await zip.read(file,e,8*MB)):null;}
  if(kind==='aab'){const e=entries.find(x=>x.name==='base/manifest/AndroidManifest.xml');return e?meta.aabManifest(await zip.read(file,e,8*MB)):null;}
  if(kind==='ipa'){const e=entries.find(x=>/^Payload\/[^/]+\.app\/Info\.plist$/.test(x.name));return e?meta.infoPlist(await zip.read(file,e,4*MB)):null;}
 }catch{return null;}
 return null;
}

// Reads one build: entries with categories, totals and identity. `check` is called between steps (cancel).
async function inspect(file,check=()=>{}){
 const stat=await fs.stat(file);
 if(!stat.isFile())throw Error(path.basename(file)+': это не файл.');
 const {entries:raw,fileSize}=await zip.list(file);check();
 const kind=kindOf(file,raw);
 if(!kind)throw Error(path.basename(file)+': не похоже на APK, AAB или IPA.');
 const entries=raw.map(e=>({...e,...classify(kind,e.name),key:key(kind,e.name)}));
 const info=await version(file,kind,raw)||{};check();
 return {file,name:path.basename(file),kind,mtime:stat.mtimeMs,bytes:fileSize,entries,id:info.id||'',version:info.version||'',build:info.build||'',appName:info.name||''};
}

function sums(entries,by){
 const out=new Map();
 for(const e of entries){const k=by(e);if(k===null)continue;const row=out.get(k)||{compressed:0,size:0,count:0};row.compressed+=e.compressed;row.size+=e.size;row.count++;out.set(k,row);}
 return out;
}

// Debug sections in uncompressed (stored) .so files: read only the ELF section table.
async function elfFindings(b,limit=12){
 const out=[];
 const libs=b.entries.filter(e=>e.cat.startsWith('native:')&&e.method===0&&/\.so$/.test(e.name)).sort((x,y)=>y.size-x.size).slice(0,limit);
 for(const e of libs){try{const r=await meta.elfDebug((from,length)=>zip.range(b.file,e,from,length),e.size);if(r?.bytes>0)out.push({path:e.name,bytes:r.bytes,sections:r.sections});}catch{/* unreadable library: skip */}}
 return out;
}

const fmt=n=>{const a=Math.abs(n);return a>=MB*1000?(n/MB/1024).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ГБ':a>=MB?(n/MB).toLocaleString('ru-RU',{maximumFractionDigits:1})+' МБ':a>=1024?Math.round(n/1024).toLocaleString('ru-RU')+' КБ':n+' Б';};
const signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));

async function warnings(b){
 const out=[],total=b.entries.reduce((n,e)=>n+e.compressed,0)||1;
 if(b.kind==='apk'){
  const stored=b.entries.filter(e=>e.cat.startsWith('native:')&&e.method===0&&/\.so$/.test(e.name));
  if(stored.length){const bytes=stored.reduce((n,e)=>n+e.size,0);
   out.push({level:'warn',kind:'stored-so',text:stored.length+' .so в APK не сжаты ('+fmt(bytes)+'). Так бывает при extractNativeLibs=false: библиотеки грузятся без распаковки, но APK больше. Если APK раздаётся напрямую — включите сжатие (useLegacyPackaging) или раздавайте AAB.'});}
 }
 const abis=[...new Set(b.entries.filter(e=>e.cat.startsWith('native:')).map(e=>e.cat.slice(7)))];
 const x86=abis.filter(a=>/^x86/.test(a));
 if(x86.length&&b.kind!=='ipa'){const bytes=b.entries.filter(e=>x86.includes(e.cat.slice(7))).reduce((n,e)=>n+e.compressed,0);
  out.push({level:'warn',kind:'abi',text:'В билде есть '+x86.join(', ')+' ('+fmt(bytes)+'): эти ABI нужны в основном эмуляторам.'});}
 // Duplicates: same CRC and size under different paths (ignoring signatures and tiny files).
 const groups=new Map();
 for(const e of b.entries){if(e.size<4096||/^META-INF\//.test(e.name))continue;const k=e.crc+':'+e.size;const g=groups.get(k)||[];g.push(e);groups.set(k,g);}
 const dups=[...groups.values()].filter(g=>g.length>1).map(g=>({paths:g.map(e=>e.name),wasted:g.slice(1).reduce((n,e)=>n+e.compressed,0)})).sort((x,y)=>y.wasted-x.wasted);
 if(dups.length){const wasted=dups.reduce((n,d)=>n+d.wasted,0);
  out.push({level:wasted>=MB?'warn':'info',kind:'duplicates',text:'Одинаковые файлы в разных местах: '+dups.length+' '+(dups.length===1?'группа':'групп(ы)')+', лишние '+fmt(wasted)+'. Например: '+dups[0].paths.slice(0,3).join(', ')+'.',groups:dups.slice(0,20)});}
 // Huge single assets (code is reported by category, not here).
 const huge=b.entries.filter(e=>['unity','addressables','streaming','assets','resources','other'].includes(e.cat)&&(e.compressed>=20*MB||e.size>=50*MB||e.compressed>=5*MB&&e.compressed/total>=0.15)).sort((x,y)=>y.compressed-x.compressed);
 for(const e of huge.slice(0,5))out.push({level:'warn',kind:'huge',path:e.name,text:'Крупный файл: '+e.name+' — '+fmt(e.compressed)+' в архиве ('+fmt(e.size)+' распаковано).'});
 const debug=b.entries.filter(e=>e.cat==='debug');
 if(debug.length){const bytes=debug.reduce((n,e)=>n+e.compressed,0);
  const metadata=debug.every(e=>/^BUNDLE-METADATA\//.test(e.name));
  out.push(metadata?{level:'info',kind:'debug',text:'В AAB лежат отладочные символы ('+fmt(bytes)+') в BUNDLE-METADATA — на устройства они не попадают, Google Play использует их для стектрейсов.'}:
   {level:'warn',kind:'debug',text:'В билд попали отладочные символы: '+debug.length+' файл(ов), '+fmt(bytes)+' (например, '+debug[0].name+'). Загружайте их в сервис крэшей отдельно.'});}
 for(const f of await elfFindings(b))out.push({level:'warn',kind:'debug',path:f.path,text:f.path+' не очищена от символов: '+f.sections.slice(0,4).join(', ')+' — '+fmt(f.bytes)+'.'});
 return out;
}

// Which of two builds is older: versionCode/CFBundleVersion, then version name, then numbers in the name, then mtime.
function compareVersions(a,b){const x=String(a).split(/[^\d]+/).filter(Boolean).map(Number),y=String(b).split(/[^\d]+/).filter(Boolean).map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d;}return 0;}
function order(a,b){
 if(/^\d+$/.test(a.build)&&/^\d+$/.test(b.build)&&a.build!==b.build)return {older:+a.build<+b.build?a:b,newer:+a.build<+b.build?b:a,basis:a.kind==='ipa'?'по CFBundleVersion':'по versionCode'};
 if(a.version&&b.version&&compareVersions(a.version,b.version)){const d=compareVersions(a.version,b.version);return {older:d<0?a:b,newer:d<0?b:a,basis:'по версии'};}
 const named=compareVersions(a.name.replace(/\.[^.]+$/,''),b.name.replace(/\.[^.]+$/,''));
 if(named&&/\d/.test(a.name)&&/\d/.test(b.name))return {older:named<0?a:b,newer:named<0?b:a,basis:'по номеру в имени файла'};
 return {older:a.mtime<=b.mtime?a:b,newer:a.mtime<=b.mtime?b:a,basis:'по дате изменения файла'};
}

function summary(b){return {name:b.name,path:b.file,kind:b.kind,version:b.version,build:b.build,id:b.id,mtime:b.mtime,bytes:b.bytes,
 compressed:b.entries.reduce((n,e)=>n+e.compressed,0),size:b.entries.reduce((n,e)=>n+e.size,0),files:b.entries.length};}
const CAT_ORDER=['native','dex','binary','frameworks','unity','addressables','streaming','assets','resources','debug','other'];
const rank=c=>{const i=CAT_ORDER.indexOf(c.split(':')[0]);return i<0?99:i;};
const NOTE={apk:'Это размер самого APK. Загрузка из Google Play может отличаться: стор сжимает загрузку и для AAB отдаёт split APK только под ABI, язык и плотность экрана устройства.',
 aab:'AAB — это не то, что скачивает пользователь: Google Play собирает из него split APK под ABI, язык и экран устройства, поэтому загрузка заметно меньше суммы модулей. Точный размер — в Play Console (App size) или bundletool get-size total.',
 ipa:'Это размер IPA. Загрузка из App Store отличается: App Thinning оставляет только ресурсы под устройство, а бинарник шифруется и сжимается хуже — смотрите App Store Connect → App Size или отчёт Xcode «App Thinning Size Report».'};

// One build: categories, modules, largest files and warnings.
async function single(b){
 const cats=sums(b.entries,e=>e.cat);
 const categories=[...cats].map(([k,v])=>({key:k,label:label(k),...v})).sort((x,y)=>rank(x.key)-rank(y.key)||y.compressed-x.compressed);
 const modules=b.kind==='aab'?[...sums(b.entries,e=>e.module||null)].map(([name,v])=>({name,...v})).sort((x,y)=>y.compressed-x.compressed):[];
 const sorted=[...b.entries].sort((x,y)=>y.compressed-x.compressed);
 return {mode:'single',kind:b.kind,builds:[summary(b)],categories,modules,
  largest:sorted.slice(0,15).map(e=>({path:e.name,cat:e.cat,compressed:e.compressed,size:e.size,stored:e.method===0})),
  files:sorted.slice(0,300).map(e=>({path:e.name,cat:e.cat,compressed:e.compressed,size:e.size})),fileCount:b.entries.length,
  warnings:await warnings(b),note:NOTE[b.kind]};
}

// Two builds: totals with delta, category deltas, top grown files, warnings of the newer one.
async function diff(x,y){
 const {older,newer,basis}=order(x,y);
 const before=new Map(older.entries.map(e=>[e.key,e])),after=new Map(newer.entries.map(e=>[e.key,e]));
 const catBefore=sums(older.entries,e=>e.cat),catAfter=sums(newer.entries,e=>e.cat);
 const empty={compressed:0,size:0,count:0};
 const categories=[...new Set([...catBefore.keys(),...catAfter.keys()])].map(k=>({key:k,label:label(k),...(catAfter.get(k)||empty),before:catBefore.get(k)||empty}))
  .sort((p,q)=>rank(p.key)-rank(q.key)||q.compressed-p.compressed);
 const rows=[];
 for(const k of new Set([...before.keys(),...after.keys()])){const a=before.get(k),b=after.get(k);
  rows.push({path:(b||a).name,cat:(b||a).cat,before:a?.compressed||0,after:b?.compressed||0,beforeSize:a?.size||0,afterSize:b?.size||0,delta:(b?.compressed||0)-(a?.compressed||0),status:!a?'new':!b?'removed':'changed'});}
 const grown=rows.filter(r=>r.delta>0).sort((p,q)=>q.delta-p.delta);
 const changed=rows.filter(r=>r.delta!==0).sort((p,q)=>Math.abs(q.delta)-Math.abs(p.delta));
 const modules=newer.kind==='aab'?(()=>{const m0=sums(older.entries,e=>e.module||null),m1=sums(newer.entries,e=>e.module||null);return [...new Set([...m0.keys(),...m1.keys()])].map(name=>({name,...(m1.get(name)||empty),before:m0.get(name)||empty})).sort((p,q)=>q.compressed-p.compressed);})():[];
 return {mode:'diff',kind:newer.kind,builds:[summary(older),summary(newer)],basis,categories,modules,
  grown:grown.slice(0,15),added:rows.filter(r=>r.status==='new').length,removed:rows.filter(r=>r.status==='removed').length,
  files:changed.slice(0,300).map(r=>({path:r.path,cat:r.cat,before:r.before,after:r.after,delta:r.delta,status:r.status})),fileCount:changed.length,
  warnings:await warnings(newer),note:NOTE[newer.kind]};
}

// Short chat text for the card.
function text(card){
 const [a,b]=card.builds;
 const id=v=>v.version?' '+v.version+(v.build?' ('+v.build+')':''):'';
 if(card.mode==='single'){
  const top=[...card.categories].sort((p,q)=>q.compressed-p.compressed).slice(0,3).map(c=>c.label+' '+fmt(c.compressed)).join(', ');
  return a.name+id(a)+': '+fmt(a.bytes)+' ('+fmt(a.size)+' распаковано). Больше всего: '+top+'.'+(card.warnings.some(w=>w.level==='warn')?' Есть замечания — в карточке.':'');
 }
 const d=b.bytes-a.bytes,pct=a.bytes?Math.round(d/a.bytes*1000)/10:0;
 const cats=card.categories.map(c=>({...c,d:c.compressed-c.before.compressed})).filter(c=>c.d).sort((p,q)=>Math.abs(q.d)-Math.abs(p.d)).slice(0,2);
 return 'Старый: '+a.name+id(a)+', новый: '+b.name+id(b)+' ('+card.basis+'). '+(d>0?'Билд вырос':'Билд уменьшился')+' на '+fmt(Math.abs(d))+' ('+(pct>0?'+':'')+pct.toLocaleString('ru-RU')+'%): '+fmt(a.bytes)+' → '+fmt(b.bytes)+'.'+
  (cats.length?' Главное: '+cats.map(c=>c.label+' '+signed(c.d)).join(', ')+'.':'')+(card.grown[0]?' Больше всего вырос '+card.grown[0].path+' ('+signed(card.grown[0].delta)+').':'');
}

// «Что сжать?»: concrete steps for the biggest categories and the warnings, from the card data only.
const TIPS={
 native:'Нативные библиотеки: оставьте только arm64-v8a (и armeabi-v7a, если нужны старые устройства); для IL2CPP — Managed Stripping Level: High и Strip Engine Code; раздавайте AAB, чтобы устройство качало одну ABI.',
 dex:'Код (dex): включите R8 (minifyEnabled) и уберите неиспользуемые SDK и рекламные адаптеры.',
 binary:'Бинарник: Strip Linked Product / Deployment Postprocessing, Managed Stripping Level: High, проверьте отключение bitcode.',
 frameworks:'Frameworks: уберите неиспользуемые SDK; UnityFramework уменьшается теми же настройками stripping, что и IL2CPP.',
 unity:'Unity Data: сжатие текстур ASTC (+ Crunch для UI), Max Size текстур по реальному размеру на экране, аудио — Vorbis с качеством 50–70% и Streaming для музыки, сжатие билда LZ4HC; посмотрите Build Report в Editor.log.',
 addressables:'Addressables: вынесите редко нужные группы в Remote (CDN) или Play Asset Delivery / On-Demand Resources; проверьте дубли зависимостей (Analyze → Check Duplicate Bundle Dependencies).',
 streaming:'StreamingAssets Unity не сжимает: сожмите файлы сами или переведите на Addressables с загрузкой по требованию.',
 assets:'Прочие ассеты: на Android сюда попадают StreamingAssets — Unity их не сжимает; проверьте, что нет исходников и лишних форматов (PSD, WAV), и что большие файлы сжаты.',
 resources:'Ресурсы: WebP вместо PNG, shrinkResources для Android, удалите неиспользуемые картинки и лишние языки (resConfigs).',
 debug:'Отладочные символы: не кладите их в билд — загружайте в Crashlytics/Sentry отдельно.',
 other:'Прочее: посмотрите крупные файлы из списка «Показать все файлы».'};
function advice(card){
 const families=new Map();
 for(const c of card.categories){const k=c.key.split(':')[0];families.set(k,(families.get(k)||0)+c.compressed);}
 const lines=[...families].filter(([,n])=>n>0).sort((p,q)=>q[1]-p[1]).slice(0,4).map(([k,n])=>{const [name,tip]=TIPS[k].split(/: (.*)/s);return '• '+name+' — '+fmt(n)+'. '+tip[0].toUpperCase()+tip.slice(1);});
 const warn=card.warnings.filter(w=>w.level==='warn').slice(0,4).map(w=>'• '+w.text);
 return 'Что сжать в '+card.builds.at(-1).name+' (по убыванию размера):\n'+lines.join('\n')+(warn.length?'\n\nЗамечания:\n'+warn.join('\n'):'');
}

module.exports={inspect,single,diff,order,classify,kindOf,text,advice,fmt,signed,label,compareVersions};
