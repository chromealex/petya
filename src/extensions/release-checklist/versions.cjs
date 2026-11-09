// Release check of «Релизный чек-лист» itself: the version and build numbers in the project files agree with each
// other and with the release. Read from the project folders: Unity ProjectSettings/ProjectSettings.asset
// (bundleVersion, AndroidBundleVersionCode, buildNumber.iPhone), Android build.gradle(.kts) (versionName,
// versionCode) and iOS Info.plist (CFBundleShortVersionString, CFBundleVersion; $(MARKETING_VERSION) and
// $(CURRENT_PROJECT_VERSION) are resolved from the Xcode project). Nothing is written.
const fs=require('node:fs/promises');
const path=require('node:path');
const SKIP=new Set(['node_modules','.git','Library','Temp','Logs','obj','.gradle','.idea','.vs','Pods','DerivedData','build','Build','Builds','intermediates','PackageCache','.cxx','tmp']);

// Bounded walk: files whose name matches, at most `depth` levels and `limit` directories.
async function walk(roots,test,{depth=4,limit=1500}={}){
 const out=[];let visited=0;const queue=roots.map(dir=>({dir,level:0}));
 while(queue.length&&visited<limit){
  const {dir,level}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(level<depth&&!SKIP.has(item.name)&&!item.name.startsWith('.'))queue.push({dir:full,level:level+1});}
   else if(item.isFile()&&test(item.name,full))out.push(full);
  }
 }
 return out;
}
const read=async(file,max=4<<20)=>{try{const st=await fs.stat(file);if(st.size>max)return '';return await fs.readFile(file,'utf8');}catch{return '';}};

function unity(text){
 const v=/^\s*bundleVersion:\s*(.+?)\s*$/m.exec(text)?.[1]||'';
 const android=/^\s*AndroidBundleVersionCode:\s*(\d+)\s*$/m.exec(text)?.[1]||'';
 const block=/^(\s*)buildNumber:\s*\n((?:\1\s+\S.*\n?)+)/m.exec(text)?.[2]||'';
 const ios=/^\s*iPhone:\s*(\S+)\s*$/m.exec(block)?.[1]||'';
 return {version:v.replace(/^['"]|['"]$/g,''),android,ios};
}
function gradle(text){
 const code=/\bversionCode\s*(?:=\s*)?(\d+)/.exec(text)?.[1]||'';
 const name=/\bversionName\s*(?:=\s*)?["']([^"']+)["']/.exec(text)?.[1]||'';
 return {version:name,android:code};
}
function plistValue(text,key){return new RegExp('<key>'+key+'</key>\\s*<string>([^<]*)</string>').exec(text)?.[1]?.trim()||'';}
function pbxValue(text,key){return new RegExp('\\b'+key+'\\s*=\\s*"?([^";\\s]+)"?\\s*;').exec(text)?.[1]||'';}

// Every place a version is written: [{file, kind:'unity'|'android'|'ios', version, android?, ios?}].
async function collect(roots){
 const found=[];
 for(const file of await walk(roots,name=>name==='ProjectSettings.asset',{depth:3})){
  if(path.basename(path.dirname(file))!=='ProjectSettings')continue;
  const u=unity(await read(file));if(u.version||u.android||u.ios)found.push({file,kind:'unity',...u});
 }
 for(const file of await walk(roots,name=>/^build\.gradle(?:\.kts)?$/.test(name),{depth:4})){
  const g=gradle(await read(file,1<<20));if(g.version||g.android)found.push({file,kind:'android',...g});
 }
 const plists=await walk(roots,(name,full)=>name==='Info.plist'&&!/\.(?:app|framework|bundle|appex)\b/.test(full),{depth:4});
 let projects=null;
 for(const file of plists){
  const text=await read(file,1<<20);
  let version=plistValue(text,'CFBundleShortVersionString'),build=plistValue(text,'CFBundleVersion');
  if(!version&&!build)continue;
  // Xcode keeps the numbers in build settings: resolve them from the nearest project.pbxproj.
  if(/^\$\(/.test(version)||/^\$\(/.test(build)){
   projects??=await walk(roots,name=>name==='project.pbxproj',{depth:5});
   const pbx=projects.sort((a,b)=>a.length-b.length).find(p=>path.dirname(path.dirname(p)).startsWith(path.dirname(path.dirname(file))))||projects[0];
   const t=pbx?await read(pbx,8<<20):'';
   if(/^\$\(/.test(version))version=pbxValue(t,'MARKETING_VERSION');
   if(/^\$\(/.test(build))build=pbxValue(t,'CURRENT_PROJECT_VERSION');
  }
  found.push({file,kind:'ios',version,ios:build});
 }
 return found;
}
// «1.5» == «1.5.0» == «v1.5»; anything that is not dotted numbers is compared as written.
function same(a,b){
 const n=v=>{const s=String(v||'').trim().replace(/^v/i,'');return /^\d+(?:\.\d+)*$/.test(s)?s.split('.').map(Number).join('.').replace(/(?:\.0)+$/,''):s;};
 return n(a)===n(b);
}
const KIND={unity:'Unity',android:'Android',ios:'iOS'};

function verdict(found,release,roots){
 const rel=f=>{const root=roots.find(r=>f.startsWith(r));return root?path.relative(root,f)||path.basename(f):path.basename(f);};
 const evidence=found.map(f=>({text:rel(f.file)+': '+[f.version&&'версия '+f.version,f.android&&'Android versionCode '+f.android,f.ios&&'iOS build '+f.ios].filter(Boolean).join(', ')}));
 const problems=[];
 const wrong=found.filter(f=>f.version&&!same(f.version,release.version));
 for(const f of wrong)problems.push(KIND[f.kind]+': версия '+f.version+', а релиз — '+release.version);
 // The same platform's build number written in two places must agree (Unity settings vs exported projects).
 for(const key of ['android','ios']){
  const values=[...new Set(found.map(f=>f[key]).filter(Boolean))];
  if(values.length>1)problems.push((key==='android'?'Android versionCode':'iOS build')+' различается: '+values.join(' и '));
  if(values.some(v=>!/^\d+(?:\.\d+)*$/.test(v)))problems.push((key==='android'?'Android versionCode':'iOS build')+' — не число: '+values.join(', '));
 }
 if(problems.length)return {status:'problem',summary:problems.join('; ')+'.',evidence};
 const parts=[...new Set(found.map(f=>KIND[f.kind]))];
 return {status:'ok',summary:'Версия '+release.version+' везде одинаковая ('+parts.join(', ')+').',evidence};
}

module.exports={
 id:'release-versions',name:'Релизный чек-лист',
 checks:[{id:'versions.consistent',title:'Номера версии и сборки согласованы',group:'Сборка'}],
 ready:()=>true,
 async run(s,release){
  const roots=release.roots||[];
  if(!roots.length)return [{id:'versions.consistent',status:'unknown',summary:'У проекта нет папки на компьютере — подключите её в настройках проекта.'}];
  const found=await collect(roots);
  if(!found.length)return [{id:'versions.consistent',status:'unknown',summary:'В папке проекта не нашёл ProjectSettings.asset, build.gradle или Info.plist с версией.'}];
  return [{id:'versions.consistent',...verdict(found,release,roots)}];
 },
 collect,verdict,unity,gradle,same
};
