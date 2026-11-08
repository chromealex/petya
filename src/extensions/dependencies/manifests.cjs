// «Зависимости», reading the project: which manifests exist and what they declare. Pure parsing, no network:
// package.json/package-lock.json, requirements*.txt and pyproject.toml, Unity Packages/manifest.json with
// packages-lock.json, Gradle build files and the version catalog, CocoaPods Podfile.lock. Plus version helpers.
const fs=require('node:fs');
const path=require('node:path');

const read=file=>{try{return fs.readFileSync(file,'utf8');}catch{return null;}};
const json=file=>{const t=read(file);if(t===null)return null;try{return JSON.parse(t);}catch{return undefined;}};
const isFile=p=>{try{return fs.statSync(p).isFile();}catch{return false;}};
const SKIP=new Set(['node_modules','.git','Library','Temp','Logs','obj','build','Build','dist','Pods','.gradle','venv','.venv','__pycache__','DerivedData']);

// Manifests under the project folders: the folder itself and up to two levels below (monorepos, android/, ios/).
function discover(folders,{depth=2,limit=1500}={}){
 const found={npm:[],pip:[],unity:[],gradle:[],pods:[]};let visited=0;
 const visit=(dir,level)=>{
  if(visited++>limit)return;
  let names;try{names=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  const files=new Set(names.filter(d=>d.isFile()).map(d=>d.name));
  if(files.has('package.json'))found.npm.push(dir);
  const reqs=[...files].filter(f=>/^requirements[\w.-]*\.txt$/i.test(f)).sort();
  if(reqs.length||files.has('pyproject.toml'))found.pip.push({dir,files:[...reqs,...files.has('pyproject.toml')?['pyproject.toml']:[]]});
  if(isFile(path.join(dir,'Packages','manifest.json'))&&names.some(d=>d.isDirectory()&&d.name==='Assets'))found.unity.push(dir);
  if(files.has('build.gradle')||files.has('build.gradle.kts'))found.gradle.push(dir);
  if(files.has('Podfile.lock'))found.pods.push(dir);
  if(level>=depth)return;
  for(const d of names)if(d.isDirectory()&&!d.isSymbolicLink()&&!d.name.startsWith('.')&&!SKIP.has(d.name))visit(path.join(dir,d.name),level+1);
 };
 for(const f of [...new Set(folders)])visit(f,0);
 for(const k of Object.keys(found))found[k]=found[k].filter((x,i,a)=>a.findIndex(y=>(y.dir||y)===(x.dir||x))===i);
 return found;
}

// --- npm ---
function npmProject(dir){
 const pkg=json(path.join(dir,'package.json'));
 if(!pkg)return {dir,error:pkg===undefined?'package.json не читается как JSON.':'Нет package.json.',deps:[]};
 const lock=json(path.join(dir,'package-lock.json'))||null;
 const deps=[];
 for(const [field,dev] of [['dependencies',false],['devDependencies',true],['optionalDependencies',false]])
  for(const [name,spec] of Object.entries(pkg[field]||{})){
   const installed=lock?.packages?.['node_modules/'+name]?.version||lock?.dependencies?.[name]?.version||json(path.join(dir,'node_modules',name,'package.json'))?.version||null;
   deps.push({name,spec:String(spec),dev,installed});
  }
 return {dir,name:pkg.name||path.basename(dir),deps,lockfile:lock?'package-lock.json':isFile(path.join(dir,'yarn.lock'))?'yarn.lock':isFile(path.join(dir,'pnpm-lock.yaml'))?'pnpm-lock.yaml':null,hasLock:!!lock};
}

// --- pip ---
const PEP=/^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*((?:[<>=!~]=?|===)\s*[^;#\s,]+(?:\s*,\s*(?:[<>=!~]=?|===)\s*[^;#\s,]+)*)?/;
function requirement(line){
 const clean=line.replace(/\s+#.*$/,'').trim();
 if(!clean||clean.startsWith('#')||clean.startsWith('-')||/^(?:git\+|https?:|file:|\.{0,2}\/)/.test(clean))return null;
 const m=PEP.exec(clean);if(!m)return null;
 const spec=(m[3]||'').replace(/\s+/g,'');
 const pin=/^===?([^,]+)$/.exec(spec);
 return {name:m[1],spec,pinned:pin?pin[1]:null};
}
const norm=name=>name.toLowerCase().replace(/[-_.]+/g,'-');
function pipProject({dir,files}){
 const deps=new Map();
 for(const file of files){
  const text=read(path.join(dir,file))||'';
  if(file==='pyproject.toml'){
   // [project] dependencies = ["requests>=2.31", …] and [tool.poetry.dependencies] name = "^1.2".
   const arr=/^\s*dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(text);
   if(arr)for(const m of arr[1].matchAll(/["']([^"']+)["']/g)){const r=requirement(m[1]);if(r)deps.set(norm(r.name),{...r,file});}
   const poetry=/^\[tool\.poetry(?:\.group\.[\w-]+)?\.dependencies\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(text);
   if(poetry)for(const m of poetry[1].matchAll(/^\s*([A-Za-z0-9][\w.-]*)\s*=\s*(?:"([^"]*)"|\{[^}]*version\s*=\s*"([^"]*)")/gm)){
    if(m[1].toLowerCase()==='python')continue;const v=m[2]??m[3]??'';const pin=/^=?=?(\d[\w.]*)$/.exec(v);
    deps.set(norm(m[1]),{name:m[1],spec:v,pinned:pin&&!/^[\^~]/.test(v)?pin[1]:null,file});
   }
  }else for(const line of text.split(/\r?\n/)){const r=requirement(line);if(r&&!deps.has(norm(r.name)))deps.set(norm(r.name),{...r,file});}
 }
 return {dir,files,deps:[...deps.values()]};
}

// --- Unity Package Manager ---
const PREVIEW=/-(?:preview|pre|exp|alpha|beta)(?:[.\d]|$)/i;
function unityProject(dir){
 const manifest=json(path.join(dir,'Packages','manifest.json'));
 if(!manifest)return {dir,error:'Packages/manifest.json не читается.',deps:[]};
 const lock=json(path.join(dir,'Packages','packages-lock.json'))?.dependencies||{};
 const deps=Object.entries(manifest.dependencies||{}).map(([name,spec])=>{
  const l=lock[name]||{};spec=String(spec);
  const source=l.source||(/^(?:git\+|https?:|ssh:|git@)|\.git(?:#|$)/.test(spec)?'git':/^file:/.test(spec)?'local':'registry');
  const version=source==='registry'||source==='builtin'?(l.version||spec):l.version||spec;
  const flags=[];
  if(source==='git')flags.push('git');
  if(source==='local'||source==='embedded'||/^file:/.test(spec))flags.push('file');
  if(PREVIEW.test(version))flags.push('preview');
  return {name,spec,version,source,flags,builtin:source==='builtin'||/^com\.unity\.modules\./.test(name),hash:l.hash||null};
 });
 const editor=(read(path.join(dir,'ProjectSettings','ProjectVersion.txt'))||'').match(/m_EditorVersion:\s*(\S+)/)?.[1]||null;
 return {dir,name:path.basename(dir),editor,deps};
}

// --- Gradle (list only) ---
function gradleProject(dir){
 const deps=new Map();
 const files=['build.gradle','build.gradle.kts','app/build.gradle','app/build.gradle.kts'].map(f=>path.join(dir,f)).filter(isFile);
 for(const file of files){
  const text=read(file)||'';
  for(const m of text.matchAll(/\b(implementation|api|compileOnly|runtimeOnly|testImplementation|androidTestImplementation|kapt|ksp|classpath|annotationProcessor)\s*\(?\s*["']([\w.-]+):([\w.-]+):([^"'\s)]+)["']/g))
   deps.set(m[2]+':'+m[3],{name:m[2]+':'+m[3],version:m[4],config:m[1],file:path.relative(dir,file)});
 }
 const catalog=read(path.join(dir,'gradle','libs.versions.toml'));
 if(catalog){
  const versions=Object.fromEntries([...(/^\[versions\]([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(catalog)?.[1]||'').matchAll(/^\s*([\w.-]+)\s*=\s*"([^"]+)"/gm)].map(m=>[m[1],m[2]]));
  const libs=/^\[libraries\]([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(catalog)?.[1]||'';
  for(const m of libs.matchAll(/^\s*[\w.-]+\s*=\s*(?:"([\w.-]+):([\w.-]+):([^"]+)"|\{([^}]*)\})/gm)){
   if(m[1]){deps.set(m[1]+':'+m[2],{name:m[1]+':'+m[2],version:m[3],config:'catalog',file:'gradle/libs.versions.toml'});continue;}
   const body=m[4];const module=/module\s*=\s*"([^"]+)"/.exec(body)?.[1]||((g,n)=>g&&n?g+':'+n:null)(/group\s*=\s*"([^"]+)"/.exec(body)?.[1],/name\s*=\s*"([^"]+)"/.exec(body)?.[1]);
   if(!module)continue;
   const version=/version\.ref\s*=\s*"([^"]+)"/.exec(body)?.[1];
   deps.set(module,{name:module,version:version?versions[version]||'?':(/version\s*=\s*"([^"]+)"/.exec(body)?.[1]||'?'),config:'catalog',file:'gradle/libs.versions.toml'});
  }
 }
 return {dir,deps:[...deps.values()]};
}
// --- CocoaPods (list only) ---
function podsProject(dir){
 const text=read(path.join(dir,'Podfile.lock'))||'';
 const block=/^PODS:\s*$([\s\S]*?)(?=^\S)/m.exec(text+'\nEND:')?.[1]||'';
 const deps=[...block.matchAll(/^ {2}- "?([^\s"(]+) \(([^)]+)\)"?:?\s*$/gm)].map(m=>({name:m[1],version:m[2]}));
 return {dir,deps};
}

// --- versions ---
// Numeric release parts and a pre-release marker: «1.2.3», «2.0.0-beta.1», «1.0rc1», «2024.1.0f1» (Unity editor).
function parse(v){
 const s=String(v||'').trim().replace(/^[v=]+/,'');
 const m=/^(\d+(?:\.\d+)*)(.*)$/.exec(s);if(!m)return null;
 const rest=m[2];
 return {nums:m[1].split('.').map(Number),pre:/^[-.]?(?:a|b|rc|alpha|beta|pre|preview|dev|exp|c)\d*/i.test(rest)||/^-/.test(rest),raw:s};
}
function compare(a,b){
 const x=parse(a),y=parse(b);if(!x||!y)return 0;
 for(let i=0;i<Math.max(x.nums.length,y.nums.length);i++){const d=(x.nums[i]||0)-(y.nums[i]||0);if(d)return d<0?-1:1;}
 if(x.pre!==y.pre)return x.pre?-1:1;
 return x.raw<y.raw?-1:x.raw>y.raw?1:0;
}
// patch / minor / major from current to target; a 0.x minor bump is breaking, so it counts as major.
function kind(current,target){
 const x=parse(current),y=parse(target);if(!x||!y||compare(current,target)>=0)return null;
 const [a1=0,b1=0]=x.nums,[a2=0,b2=0]=y.nums;
 if(a1!==a2)return 'major';
 if(b1!==b2)return a1===0?'major':'minor';
 return 'patch';
}
// Does a PEP 440-style specifier («>=2.0,<3», «~=1.4», «==1.2.*») allow this version?
function allows(spec,version){
 if(!spec)return true;
 return spec.split(',').every(part=>{
  const m=/^(===?|!=|<=|>=|~=|<|>)(.+)$/.exec(part.trim());if(!m)return true;
  const [,op,want]=m;
  if(want.endsWith('.*')){const prefix=want.slice(0,-2);const ok=version===prefix||version.startsWith(prefix+'.');return op==='!='?!ok:ok;}
  const c=compare(version,want);
  if(op==='~='){const p=parse(want).nums;const upper=p.length<2?String(p[0]+1):[...p.slice(0,p.length-2),p[p.length-2]+1].join('.');return c>=0&&compare(version,upper)<0;}
  return {'==':c===0,'===':c===0,'!=':c!==0,'<=':c<=0,'>=':c>=0,'<':c<0,'>':c>0}[op];
 });
}
module.exports={discover,npmProject,pipProject,unityProject,gradleProject,podsProject,requirement,parse,compare,kind,allows,norm,PREVIEW};
