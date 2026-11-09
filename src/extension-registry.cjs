// One list of extension directories for every registry that scans them: the catalog and renderer host
// (features/extension-ui.cjs), offers, app links and meeting sources (features/app-links.cjs scan), chat replies
// (desktop-reply.cjs), chat result and change adapters, downloads.
//
// Three origins, in this order:
//  - bundled:  src/extensions/<id>/ (shipped inside the app; validation errors are programming errors and throw);
//  - external: <userData>/extensions/<id>/ (installed from a folder or .zip by the user, see extension-install.cjs);
//  - dev:      one development folder chosen in settings, loaded in place and reloaded on save.
// Bundled ids always win: an external or development extension with a bundled id is refused, never merged.
// An external extension that fails validation is left out and reported (`problems()`); Petya keeps running.
// External code runs in the main process with Petya's rights: this is trust on install, not a sandbox.
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const BUNDLED=path.join(__dirname,'extensions');
const SCHEME='petya-ext';
const ID=/^[a-z][a-z0-9-]{0,63}$/;
const FILE=/^[a-z][a-z0-9-]*\.(?:js|cjs|svg|html)$/;
// Files a renderer may fetch through petya-ext:// (never .cjs: main-process code is not served).
const MIME={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.woff2':'font/woff2','.json':'application/json; charset=utf-8'};
const LIMIT={files:1000,depth:6};

// Custom scheme for external renderer files; must be declared before the app is ready.
try{const {protocol,app}=require('electron');if(protocol?.registerSchemesAsPrivileged&&app&&!app.isReady())protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true,corsEnabled:true}}]);}catch{/* plain Node (unit tests) */}

let rev=0,cache=new Map(),problems=[];
const loadProblems=new Map(); // key → problem of a file that failed to load or set up, until that extension reloads
const unloaded=new Set(); // removed external ids whose main-process code stays loaded until restart
const listeners=new Set();

// <userData>/extensions, or PETYA_EXTENSIONS_DIR (tests). null in plain Node without the variable.
function root(){
 if(process.env.PETYA_EXTENSIONS_DIR)return path.resolve(process.env.PETYA_EXTENSIONS_DIR);
 try{const {app}=require('electron');if(app?.getPath)return path.join(app.getPath('userData'),'extensions');}catch{}
 return null;
}
const devConfig=()=>root()&&path.join(root(),'.dev-folder.json');
function devFolder(){try{const value=JSON.parse(fs.readFileSync(devConfig(),'utf8')).folder;return typeof value==='string'&&path.isAbsolute(value)?value:null;}catch{return null;}}
function setDevFolder(folder){
 const file=devConfig();if(!file)throw Error('Папка расширений недоступна.');
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(folder)fs.writeFileSync(file,JSON.stringify({folder:path.resolve(folder)}),{mode:0o600});else fs.rmSync(file,{force:true});
 invalidate();
}

const inside=(dir,file)=>{const r=path.relative(dir,file);return !!r&&!r.startsWith('..')&&!path.isAbsolute(r);};
const camel=id=>id.replace(/-([a-z0-9])/g,(_,c)=>c.toUpperCase());
// Every file of an extension directory; symlinks are refused (they could point anywhere on the disk).
function walk(dir,depth=0,out=[]){
 if(depth>LIMIT.depth)throw Error('Слишком глубокая вложенность папок');
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);
  if(e.isSymbolicLink())throw Error('Символьная ссылка внутри расширения: '+path.relative(dir,file));
  if(e.isDirectory()){if(e.name!=='.git')walk(file,depth+1,out);}
  else if(e.isFile())out.push(file);
  if(out.length>LIMIT.files)throw Error('Слишком много файлов (больше '+LIMIT.files+')');
 }
 return out;
}

// A monochrome SVG of the extension's folder, inlined for the renderer: no scripts, styles, links or url().
function icon(dir,file,id){
 if(typeof file!=='string'||!/^[a-z][a-z0-9-]*\.svg$/.test(file))throw Error('Invalid extension icon '+id);
 const svg=fs.readFileSync(path.join(dir,file),'utf8').trim();
 if(svg.length>20000||!/^<svg[\s>]/.test(svg)||!svg.endsWith('</svg>')||/<script|<style|foreignObject|<!|\son[a-z]+\s*=|href|url\(/i.test(svg))throw Error('Unsafe extension icon '+id);
 return svg;
}
// Places in Petya's own interface (docs/extensions.md §8a): rail pages and tabs on pages. The shape is checked here;
// whether a tab's page exists and whether two apps claim one page id is decided by the renderer
// (src/ui/extension-places.js), which knows the core pages and every live extension.
const UI_GROUPS=['assistant','work','setup'];
const UI_ID=/^[a-z][a-z0-9-]{0,39}$/,UI_RENDER=/^[A-Za-z_$][\w$]{0,63}$/;
function validateUi(d,dir){
 const ui=d.ui,where='extension '+d.id+': ui';
 if(!ui||typeof ui!=='object'||Array.isArray(ui)||Object.keys(ui).some(k=>!['pages','tabs','personFields'].includes(k)))throw Error(where+' is {"pages": [...], "tabs": [...], "personFields": [...]}');
 const title=(value,at)=>{if(typeof value!=='string'||!value.trim()||value.length>40)throw Error(where+at+'.title: a Russian name up to 40 characters');};
 const render=(value,at)=>{if(typeof value!=='string'||!UI_RENDER.test(value))throw Error(where+at+'.render: the name of a window function from "scripts"');};
 if(!d.scripts.length)throw Error(where+': renderers come from "scripts", none declared');
 const pages=ui.pages===undefined?[]:ui.pages,tabs=ui.tabs===undefined?[]:ui.tabs,fields=ui.personFields===undefined?[]:ui.personFields;
 if(!Array.isArray(pages)||pages.length>4)throw Error(where+'.pages: a list of up to 4 pages');
 if(!Array.isArray(tabs)||tabs.length>8)throw Error(where+'.tabs: a list of up to 8 tabs');
 if(!Array.isArray(fields)||fields.length>4)throw Error(where+'.personFields: a list of up to 4 fields');
 const ids=new Set();
 pages.forEach((p,i)=>{
  const at='.pages['+i+']';
  if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['id','title','icon','after','group','render'].includes(k)))throw Error(where+at+': {id, title, icon?, after? | group?, render}');
  if(!UI_ID.test(p.id||'')||ids.has(p.id))throw Error(where+at+'.id: a unique id of latin letters, digits and dashes');
  ids.add(p.id);title(p.title,at);render(p.render,at);
  if(p.after!==undefined&&p.group!==undefined)throw Error(where+at+': "after" or "group", not both');
  if(p.after!==undefined&&!UI_ID.test(p.after))throw Error(where+at+'.after: the id of a rail item («team», «history», another page)');
  if(p.group!==undefined&&!UI_GROUPS.includes(p.group))throw Error(where+at+'.group: one of '+UI_GROUPS.join(', '));
  if(p.icon!==undefined)p.iconSvg=icon(dir,p.icon,d.id);
 });
 tabs.forEach((t,i)=>{
  const at='.tabs['+i+']';
  if(!t||typeof t!=='object'||Object.keys(t).some(k=>!['page','title','render','order'].includes(k)))throw Error(where+at+': {page, title, render, order?}');
  if(!UI_ID.test(t.page||''))throw Error(where+at+'.page: the id of a page («learning», «team», another app\'s page)');
  title(t.title,at);render(t.render,at);
  if(t.order!==undefined&&!(Number.isInteger(t.order)&&t.order>=0&&t.order<=1000))throw Error(where+at+'.order: an integer 0–1000');
 });
 // Person fields: a field on every card of «Команда» (src/ui/person-fields.js); `key` is where the value is kept in the
 // person record.
 const keys=new Set();
 fields.forEach((f,i)=>{
  const at='.personFields['+i+']';
  if(!f||typeof f!=='object'||Object.keys(f).some(k=>!['key','title','render','order'].includes(k)))throw Error(where+at+': {key, title, render, order?}');
  if(typeof f.key!=='string'||!/^[a-z][A-Za-z0-9]{0,30}$/.test(f.key)||keys.has(f.key))throw Error(where+at+'.key: a unique camelCase name of latin letters and digits');
  keys.add(f.key);title(f.title,at);render(f.render,at);
  if(f.order!==undefined&&!(Number.isInteger(f.order)&&f.order>=0&&f.order<=1000))throw Error(where+at+'.order: an integer 0–1000');
 });
}

// Reads and checks one extension.json. `external` adds the rules for code Petya did not ship: the catalog
// switch is exactly extension_<id>, no service-module flags, required presentation fields, no symlinks.
function validate(dir,{external=false,expectId}={}){
 const file=path.join(dir,'extension.json');
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 const groups=categories();
 const {KINDS,REGISTRIES}=kinds();
 if(!d||typeof d!=='object'||!ID.test(d.id||'')||(expectId!==undefined&&d.id!==expectId))throw Error('Invalid extension identity');
 if(!Array.isArray(d.scripts))throw Error('Invalid extension renderer '+d.id);
 for(const pair of d.scripts){const [script,after]=Array.isArray(pair)?pair:[];if(!/^[a-z][a-z0-9-]*\.js$/.test(script||'')||!fs.existsSync(path.join(dir,script))||typeof after!=='string'||!/^[a-z][a-z0-9-]*\.js$/.test(after))throw Error('Invalid extension renderer');}
 if(d.feature&&(!/^[a-z][a-z0-9-]*\.cjs$/.test(d.feature)||external&&!fs.existsSync(path.join(dir,d.feature))))throw Error('Invalid extension feature');
 if(d.category!==undefined&&!groups.categories.some(c=>c.id===d.category))throw Error('Unknown extension category '+d.category);
 for(const item of d.downloads||[]){const sizes=item&&typeof item.bytes==='object'?Object.values(item.bytes):[item?.bytes];if(!/^[a-z][a-z0-9-]*$/.test(item?.id||'')||!item.name||!sizes.every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid extension download '+d.id);}
 if(d.examples!==undefined&&!(Array.isArray(d.examples)&&d.examples.length&&d.examples.length<=6&&d.examples.every(e=>typeof e==='string'&&e.trim()&&e.length<=120)))throw Error('Invalid extension examples '+d.id);
 if(d.icon!==undefined)d.iconSvg=icon(dir,d.icon,d.id);
 if(d.ui!==undefined)validateUi(d,dir);
 if(d.uses!==undefined&&!(Array.isArray(d.uses)&&d.uses.every(k=>KINDS.includes(k))))throw Error('Invalid extension uses '+d.id);
 if(d.provides!==undefined){
  if(!d.provides||typeof d.provides!=='object'||Array.isArray(d.provides))throw Error('Invalid extension provides '+d.id);
  for(const [kind,value] of Object.entries(d.provides)){
   if(!KINDS.includes(kind)&&!REGISTRIES.includes(kind))throw Error('Unknown capability '+kind+' in '+d.id);
   for(const name of [].concat(value))if(!/^[a-z][a-z0-9-]*\.cjs$/.test(name)||!fs.existsSync(path.join(dir,name)))throw Error('Invalid capability provider '+d.id+'/'+name);
  }
 }
 if(d.desktop!==undefined&&!require('./desktop-apps.cjs').valid(d.desktop))throw Error('Invalid extension desktop '+d.id+': {"apps": ["Program name"], "required": true|false}');
 if(d.connects!==undefined&&!(typeof d.connects==='string'&&d.connects.trim()))throw Error('Invalid extension connects '+d.id);
 if(d.connectsKeys!==undefined&&!(Array.isArray(d.connectsKeys)&&d.connectsKeys.every(k=>/^[A-Za-z][\w-]*$/.test(k))))throw Error('Invalid extension connectsKeys '+d.id);
 if(d.results!==undefined&&!(d.results&&typeof d.results==='object'&&!Array.isArray(d.results)&&Object.entries(d.results).every(([k,v])=>/^[A-Za-z][\w-]{0,63}$/.test(k)&&/^[A-Za-z_$][\w$]{0,63}$/.test(v))))throw Error('Invalid extension results '+d.id);
 if(d.version!==undefined&&!(typeof d.version==='string'&&/^\d{1,6}(?:\.\d{1,6}){0,3}$/.test(d.version)))throw Error('Invalid extension version '+d.id+': use digits and dots, e.g. 1.2.0');
 if(d.author!==undefined&&!(typeof d.author==='string'&&d.author.trim()&&d.author.length<=120))throw Error('Invalid extension author '+d.id);
 if(d.markup){if(!/^[a-z][a-z0-9-]*\.html$/.test(d.markup))throw Error('Invalid settings template');d.template=fs.readFileSync(path.join(dir,d.markup),'utf8');}
 if(external){
  if(typeof d.name!=='string'||!d.name.trim()||d.name.length>80)throw Error('Нужно название (name, до 80 символов)');
  if(typeof d.description!=='string'||!d.description.trim()||d.description.length>400)throw Error('Нужно описание (description, до 400 символов)');
  if(!d.category)throw Error('Нужна категория (category) из src/extensions/categories.json');
  if(d.setting!=='extension_'+d.id)throw Error('Переключатель должен называться "extension_'+d.id+'" (setting)');
  if(d.service!==undefined||d.connectsKeys!==undefined&&!d.connects)throw Error('Поле service доступно только встроенным модулям');
  if(typeof d.settings!=='boolean')throw Error('Укажите settings: true или false');
  walk(dir);
  // Translations of the extension's own interface text: locales/<code>.json = {"strings": {"Русский": "English"}}.
  const locales=path.join(dir,'locales');
  if(fs.existsSync(locales))for(const name of fs.readdirSync(locales)){
   let strings;try{strings=JSON.parse(fs.readFileSync(path.join(locales,name),'utf8')).strings;}catch{strings=null;}
   if(!/^[a-z]{2}\.json$/.test(name)||!strings||typeof strings!=='object'||Object.entries(strings).some(([k,v])=>typeof k!=='string'||typeof v!=='string'))throw Error('locales/'+name+': нужен {"strings": {"русский текст": "перевод"}}');
  }
 }
 return d;
}

// Directory entries {id, dir, origin} of every origin, bundled first. Refusals go to problems().
function entries(){
 return remember('entries',()=>{
  problems=[];
  const out=[];
  const bundled=fs.readdirSync(BUNDLED,{withFileTypes:true}).filter(e=>e.isDirectory()&&fs.existsSync(path.join(BUNDLED,e.name,'extension.json'))).map(e=>e.name).sort((a,b)=>a<b?-1:a>b?1:0);
  for(const id of bundled)out.push({id,dir:path.join(BUNDLED,id),origin:'bundled'});
  const taken=new Set(bundled);
  const refuse=(id,dir,origin,message)=>problems.push({id,dir,origin,message});
  const top=root();
  let names=[];try{names=top?fs.readdirSync(top,{withFileTypes:true}):[];}catch{names=[];}
  const external=[];
  for(const e of names.sort((a,b)=>a.name<b.name?-1:1)){
   if(e.name.startsWith('.'))continue;
   const dir=path.join(top,e.name);
   if(e.isSymbolicLink()){refuse(e.name,dir,'external','Папка расширения не может быть символьной ссылкой');continue;}
   if(!e.isDirectory())continue;
   if(!ID.test(e.name)){refuse(e.name,dir,'external','Некорректное имя папки: латиница, цифры и дефис');continue;}
   if(taken.has(e.name)){refuse(e.name,dir,'external','Совпадает со встроенным расширением «'+e.name+'»: стороннее расширение не может заменить встроенное');continue;}
   if(unloaded.has(e.name))continue;
   external.push({id:e.name,dir,origin:'external'});
  }
  const dev=devFolder();
  let devEntry=null;
  if(dev){
   try{
    const id=JSON.parse(fs.readFileSync(path.join(dev,'extension.json'),'utf8')).id;
    if(!ID.test(id||''))throw Error('Некорректный id в extension.json');
    if(taken.has(id))throw Error('Совпадает со встроенным расширением «'+id+'»: выберите другой id');
    devEntry={id,dir:dev,origin:'dev'}; // loaded even if an installed copy waits for a restart
   }catch(error){refuse('',dev,'dev',error.code==='ENOENT'?'В папке разработки нет extension.json':error.message);}
  }
  // The development copy replaces an installed copy of the same extension while it is being worked on.
  for(const x of external)if(!devEntry||x.id!==devEntry.id)out.push(x);
  if(devEntry)out.push(devEntry);
  return out;
 });
}
// Validated descriptors; an external one that fails is reported and left out.
function descriptors(){
 return remember('descriptors',()=>{
  const out=[];
  for(const entry of entries()){
   if(entry.origin==='bundled'){out.push(decorate(validate(entry.dir,{expectId:entry.id}),entry));continue;}
   try{out.push(decorate(validate(entry.dir,{external:true,expectId:entry.origin==='external'?entry.id:undefined}),entry));}
   catch(error){problems.push({id:entry.id,dir:entry.dir,origin:entry.origin,message:error.message});}
  }
  return out;
 });
}
function decorate(d,entry){
 Object.defineProperty(d,'dir',{value:entry.dir,enumerable:false});
 d.origin=entry.origin;
 // Where the renderer loads the extension's files from: bundled files beside index.html, the rest through the
 // petya-ext:// scheme (rev busts the script cache after a reload).
 d.base=entry.origin==='bundled'?'../extensions/'+d.id+'/':SCHEME+'://'+d.id+'/';
 if(entry.origin!=='bundled')d.rev=rev;
 return d;
}
// Live extensions only (descriptor valid): [{id, dir, origin}].
const live=()=>remember('live',()=>{const ok=new Set(descriptors().map(d=>d.id));return entries().filter(e=>ok.has(e.id));});
// A named file of every live extension that has it: [{id, dir, origin, file}].
function files(name){
 if(!/^[a-z][a-z0-9-]*\.cjs$/.test(name))throw Error('Invalid extension file');
 return live().map(e=>({...e,file:path.join(e.dir,name)})).filter(e=>fs.existsSync(e.file));
}
// Requires an extension's main-process file. Bundled failures throw; an external failure is reported and null.
function load(entry,file){
 try{return require(file);}
 catch(error){if(entry.origin==='bundled')throw error;report(entry,error,file);return null;}
}
function report(entry,error,file){
 loadProblems.set(entry.dir+'|'+(file||''),{id:entry.id,dir:entry.dir,origin:entry.origin,message:error.message,where:where(entry.dir,error,file)});
 for(const f of listeners)try{f({type:'problem',id:entry.id});}catch{}
}
// «feature.cjs:12» from an error's stack (or the file itself), for notifications about a broken extension.
function where(dir,error,file){
 const text=String(error?.stack||'');
 const re=/((?:[A-Za-z]:)?[^\s():]+):(\d+)(?::\d+)?/g;let m;
 while((m=re.exec(text)))if(inside(dir,m[1]))return path.relative(dir,m[1]).split(path.sep).join('/')+':'+m[2];
 return file&&inside(dir,file)?path.relative(dir,file).split(path.sep).join('/'):'';
}
function find(id){return descriptors().find(d=>d.id===id)||null;}
function entry(id){return live().find(e=>e.id===id)||null;}

function remember(key,build){if(!cache.has(key))cache.set(key,build());return cache.get(key);}
// Registries cache what they built per revision: `cached('offers', build)`.
function cached(key,build){return remember('x:'+key,build);}
function invalidate(){rev++;cache=new Map();try{require('./interface-language.cjs').reset();}catch{}for(const f of listeners)try{f({type:'changed',rev});}catch{}}
function subscribe(f){listeners.add(f);return ()=>listeners.delete(f);}
function categories(){return remember('categories',()=>JSON.parse(fs.readFileSync(path.join(BUNDLED,'categories.json'),'utf8')));}
function kinds(){const {KINDS,REGISTRIES}=require('./features/app-links.cjs');return {KINDS,REGISTRIES};}

// Removing an external extension whose code cannot be unloaded: it disappears from every registry now and its
// module stays in memory until Petya restarts.
function unload(id){unloaded.add(id);invalidate();}
function reinstate(id){if(unloaded.delete(id))invalidate();}
const isUnloaded=id=>unloaded.has(id);

// Forgets cached modules of one extension directory (development reload, update, removal) — nothing else.
function forget(dir){for(const key of Object.keys(require.cache))if(inside(dir,key))delete require.cache[key];for(const key of loadProblems.keys())if(key.startsWith(dir+'|'))loadProblems.delete(key);}

// A file the renderer may load through petya-ext://<id>/<path>: only from a live external or development
// extension, only inside its own directory (no `..`, no hidden files, no symlinks), only whitelisted types.
function rendererFile(id,pathname){
 const e=entry(id);
 if(!e||e.origin==='bundled')throw Error('not found');
 let rel;try{rel=decodeURIComponent(String(pathname||'')).replace(/^\/+/,'');}catch{throw Error('bad path');}
 const parts=rel.split('/');
 if(!rel||parts.length>LIMIT.depth+1||parts.some(p=>!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(p)||p.includes('..')))throw Error('bad path');
 const type=MIME[path.extname(rel).toLowerCase()];
 if(!type)throw Error('type not allowed');
 let at=e.dir;
 for(const p of parts){at=path.join(at,p);const st=fs.lstatSync(at);if(st.isSymbolicLink())throw Error('symlink');}
 const real=fs.realpathSync(at),base=fs.realpathSync(e.dir);
 if(!inside(base,real)||!fs.statSync(real).isFile())throw Error('outside');
 return {file:real,type};
}

// External extensions resolve relative requires as if they lived in src/extensions/<id>/: `require('../app-kit.cjs')`
// works unchanged in a bundled, installed or development copy. Only paths that leave the extension's own
// directory are mapped; everything inside it resolves normally.
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(typeof request==='string'&&request.startsWith('.')&&parent?.filename){
  for(const e of entries()){
   if(e.origin==='bundled'||!inside(e.dir,parent.filename))continue;
   const target=path.resolve(path.dirname(parent.filename),request);
   if(inside(e.dir,target)||target===e.dir)break;
   return resolve.call(this,path.resolve(BUNDLED,e.id,path.relative(e.dir,target)),parent,...rest);
  }
 }
 return resolve.call(this,request,parent,...rest);
};

module.exports={BUNDLED,SCHEME,ID,FILE,MIME,UI_GROUPS,root,devFolder,setDevFolder,validate,entries,descriptors,live,files,load,report,where,find,entry,
 cached,invalidate,subscribe,categories,unload,reinstate,isUnloaded,forget,rendererFile,walk,camel,inside,
 problems:()=>{descriptors();return [...problems,...loadProblems.values()];},get rev(){return rev;}};
