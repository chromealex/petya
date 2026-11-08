// Live external extensions: set up, torn down, installed, removed and reloaded without restarting Petya.
//
// Bundled feature modules are set up by main.cjs in one loop. External ones (<userData>/extensions/<id>/ and the
// development folder, see extension-registry.cjs) are wrapped here and set up by `bind`, so the stricter rules
// for code Petya did not ship apply: the feature name is the camelCase id, its settings keys are namespaced,
// setup may return only `{ipc, <name>}` (no flat merge over other services), and a failure is a notification,
// never a crash. Registries (offers, app links, meeting sources, replies, results) re-read the registry after
// every change, so adding or removing an extension updates them at once.
//
// What cannot be live: main-process code without `teardown()` keeps running after removal or update. Such an
// extension is switched off everywhere at once and Petya asks to restart (not rebuild) to unload it.
const fs=require('node:fs'),path=require('node:path');
const registry=require('./extension-registry.cjs');
const installer=require('./extension-install.cjs');
const t=text=>{try{return require('./interface-language.cjs').t(text);}catch{return text;}};

const wrappers=new Map(); // id → wrapper (also present in main's features list while loaded)
const restart=new Map();  // id → reason Petya must restart to finish
const reviews=new Map();  // token → staged package awaiting confirmation
let ctx=null,served=false,guarded=false,watcher=null,watching='',timer=null;
const devWarned=new Set();
const failed=new Set(); // ids whose last load failed: the next successful load replaces the error notification

const keyAllowed=(id,name,key)=>key==='extension_'+id||key.startsWith(name)&&(key.length===name.length||/[A-Z0-9_]/.test(key[name.length]));
// The rules for an external feature.cjs; a broken module is refused with a message for its author.
function check(module,d){
 const name=registry.camel(d.id);
 if(!module||typeof module!=='object')throw Error('feature.cjs должен экспортировать объект { name, defaults, validate, setup, turn }');
 if(module.name!==name)throw Error('name в feature.cjs должен быть «'+name+'» (id в camelCase)');
 for(const hook of ['setup','validate','turn','teardown','migrate'])if(module[hook]!==undefined&&typeof module[hook]!=='function')throw Error(hook+' в feature.cjs должен быть функцией');
 const defaults=module.defaults||{};
 if(typeof defaults!=='object'||Array.isArray(defaults))throw Error('defaults в feature.cjs должен быть объектом');
 for(const [key,value] of Object.entries(defaults)){
  if(!keyAllowed(d.id,name,key))throw Error('Настройка «'+key+'» должна начинаться с «'+name+'» (или быть extension_'+d.id+')');
  if(typeof value!=='string')throw Error('Значение по умолчанию «'+key+'» должно быть строкой');
 }
 for(const key of module.secrets||[])if(typeof key!=='string'||!Object.hasOwn(defaults,key)||!keyAllowed(d.id,name,key))throw Error('Секрет «'+key+'» должен быть среди defaults и начинаться с «'+name+'»');
}
// The object main.cjs keeps in its features list (defaults, secrets, validate, migrate); `external` marks it so
// main's own setup loop leaves it to `bind`.
// An extension without feature.cjs gets a wrapper too: it carries the catalog switch (extension_<id>) into
// the settings defaults, so adding it is saved like any other setting.
function wrap(entry,d){
 const file=d.feature?path.join(entry.dir,d.feature):'';
 const module=file?registry.load(entry,file):{name:registry.camel(d.id)};
 if(!module)return null;
 try{check(module,d);}catch(error){registry.report(entry,error,file);return null;}
 const id=d.id;
 const w={name:module.name,external:id,origin:entry.origin,dir:entry.dir,module,state:'loaded',codeless:!file,
  defaults:{['extension_'+id]:'false',...module.defaults},secrets:[...(module.secrets||[])],
  validate(next){if(w.state==='active'&&module.validate)module.validate(next);},
  migrate(...args){try{module.migrate?.(...args);}catch(error){registry.report(entry,error,file);}}};
 if(module.turn)w.turn=(s,command)=>w.state==='active'?module.turn(s,command):null;
 return w;
}
// External features present at startup, for src/features.cjs (their defaults and secrets are known before the
// settings file is read).
function startup(){
 const out=[];
 for(const d of registry.descriptors())if(d.origin!=='bundled'){
  const w=wrap(registry.entry(d.id),d);
  if(w){wrappers.set(d.id,w);out.push(w);}
 }
 return out;
}
const active=()=>[...wrappers.values()].filter(w=>w.state==='active');

function send(payload){try{const win=ctx?.services.win;if(win&&!win.isDestroyed())win.webContents.send('extension-runtime',payload);}catch{}}
// Notifications about external extensions: one stable id per extension and kind.
function notify(id,{title,text,kind='info',restart:ask=false,folder=false,key='state'}){
 const d=registry.find(id);
 send({type:'notice',notice:{id:'extension-'+key+':'+id,extension:id,title:title||(d?.name||id),text,kind,restart:ask,folder}});
}
function problem(id,error,file){
 const entry=registry.entry(id)||{id,dir:wrappers.get(id)?.dir||'',origin:'external'};
 if(error)registry.report(entry,error,file);
 failed.add(id);
 const p=registry.problems().filter(x=>x.id===id).at(-1);
 notify(id,{key:'error',kind:'error',title:t('Ошибка расширения')+' «'+(registry.find(id)?.name||id)+'»',text:(p?.where?p.where+': ':'')+(p?.message||error?.message||''),folder:true});
}

// Sets up one wrapper in the live services, refusing names other features already use.
function setupOne(w){
 const {services,featureIpc}=ctx;
 if(featureIpc.has(w.name)||w.name in services)throw Error('Имя «'+w.name+'» уже занято другой функцией Пети.');
 const out=w.module.setup?.(services)??{};
 if(!out||typeof out!=='object')throw Error('setup должен вернуть объект');
 const {ipc,...provided}=out;
 const extra=Object.keys(provided).filter(k=>k!==w.name);
 if(extra.length){try{w.module.teardown?.();}catch{}throw Error('setup может вернуть только { ipc, '+w.name+' }, а вернул: '+extra.join(', '));}
 if(ipc!==undefined&&(typeof ipc!=='object'||!ipc))throw Error('ipc должен быть объектом функций');
 if(ipc)featureIpc.set(w.name,ipc);
 if(Object.hasOwn(provided,w.name))Object.defineProperty(services,w.name,{value:provided[w.name],enumerable:true,configurable:true});
 w.state='active';
}
function detach(w){
 if(!ctx)return;
 if(ctx.featureIpc.get(w.name)!==undefined)ctx.featureIpc.delete(w.name);
 if(Object.getOwnPropertyDescriptor(ctx.services,w.name)?.configurable)delete ctx.services[w.name];
 const i=ctx.features.indexOf(w);if(i>=0)ctx.features.splice(i,1);
}
function start(w){
 try{setupOne(w);return true;}
 catch(error){w.state='failed';detach(w);problem(w.external,error,path.join(w.dir,'feature.cjs'));return false;}
}

// Adds an extension that is now on disk (installed or the development folder): its feature is required, its
// defaults and secrets join the settings, setup runs, registries re-read. → {restart?}
function activate(id){
 registry.invalidate();
 const d=registry.find(id);
 if(!d){const p=registry.problems().find(x=>x.id===id||x.dir===registry.devFolder());if(p)notify(id,{key:'error',kind:'error',title:t('Расширение не загружено'),text:p.message,folder:true});return {loaded:false};}
 if(!ctx)return {loaded:true};
 const w=wrap(registry.entry(id),d);
 // (wrap already reported why: a syntax error with its file and line, or a rule of check())
 if(!w){problem(id,null);return {loaded:false};}
 wrappers.set(id,w);
 ctx.adopt(w);ctx.features.push(w);
 const ok=start(w);
 registry.invalidate();
 return {loaded:ok};
}
// Tears an extension down. With `teardown()` it is gone; without, it is switched off everywhere now and its
// code waits for a restart (`keep` leaves it in the registry: used by the development reload).
async function deactivate(id,{keep=false}={}){
 const w=wrappers.get(id);
 const dir=w?.dir||registry.entry(id)?.dir;
 if(!w){if(dir)registry.forget(dir);registry.invalidate();return {restart:false};}
 const clean=w.codeless||typeof w.module.teardown==='function';
 if(clean&&!w.codeless){try{await w.module.teardown();}catch(error){problem(id,error);}}
 detach(w);w.state='stopped';wrappers.delete(id);
 if(dir)registry.forget(dir);
 if(!clean&&!keep){registry.unload(id);restart.set(id,'unload');return {restart:true};}
 registry.invalidate();
 return {restart:!clean};
}

// Re-applies external features to a new services object (startup and every company switch).
function bind({services,featureIpc,features,adopt}){
 ctx={services,featureIpc,features,adopt};
 serve();guard();
 for(const w of wrappers.values())if(['loaded','active'].includes(w.state)&&features.includes(w))start(w);
 watch();
 installer.sweep(registry.root());
 // Startup problems (a broken extension.json, a feature that threw) as notifications once the window is up.
 const win=services.win;
 const report=()=>{for(const p of registry.problems())if(p.origin!=='bundled')notify(p.id||'dev',{key:'error',kind:'error',title:t('Расширение не загружено'),text:(p.where?p.where+': ':'')+p.message,folder:!!p.id});};
 if(win&&!win.isDestroyed())win.webContents.once('did-finish-load',()=>setTimeout(report,500));
}

// petya-ext://<id>/<file> → a file of a live external or development extension (see registry.rendererFile).
function serve(){
 if(served)return;
 const {protocol}=require('electron');
 if(!protocol?.handle)return;
 served=true;
 protocol.handle(registry.SCHEME,request=>{
  try{
   const url=new URL(request.url);
   if(request.method!=='GET')return new Response('',{status:405});
   const {file,type}=registry.rendererFile(url.hostname,url.pathname);
   return new Response(fs.readFileSync(file),{headers:{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff',
    // Only Petya's own page (file://, origin «null») may read script errors with file and line.
    'access-control-allow-origin':'null'}});
  }catch{return new Response('',{status:404});}
 });
}
// The window never loads files of external extensions directly from disk: only through petya-ext://.
function guard(){
 if(guarded)return;
 const {session}=require('electron');
 const ses=session?.defaultSession;if(!ses)return;
 guarded=true;
 ses.webRequest.onBeforeRequest({urls:['file://*/*']},(details,callback)=>{
  let file='';try{file=require('node:url').fileURLToPath(details.url);}catch{return callback({cancel:true});}
  const roots=[registry.root(),registry.devFolder()].filter(Boolean);
  callback({cancel:roots.some(r=>registry.inside(r,file)||path.resolve(file)===path.resolve(r))});
 });
}

// --- Installing, updating and removing ---------------------------------------------------------------------
function prune(){for(const [token,r] of reviews)if(Date.now()-r.at>30*60000){installer.discard(r,registry.root());reviews.delete(token);}}
function inspect(source){
 const root=registry.root();if(!root)throw Error('Папка расширений недоступна.');
 prune();
 fs.mkdirSync(root,{recursive:true});
 const staged=installer.stage(source,root);
 reviews.set(staged.token,staged);
 const current=registry.find(staged.descriptor.id)||(wrappers.get(staged.descriptor.id)?{version:'',origin:'external'}:null);
 return installer.review(staged,current&&current.origin!=='bundled'?current:null);
}
function cancel(token){const r=reviews.get(token);if(r){installer.discard(r,registry.root());reviews.delete(token);}return true;}
// Installs a reviewed package only with the explicit confirmation from the review dialog.
async function install(token,confirmed){
 if(confirmed!==true)throw Error('Установка не подтверждена.');
 const staged=reviews.get(token);
 if(!staged)throw Error('Проверка устарела. Выберите расширение заново.');
 reviews.delete(token);
 const id=staged.descriptor.id,root=registry.root();
 const devCopy=registry.entry(id)?.origin==='dev';
 let ask=false;
 if(registry.entry(id)?.origin==='external'||wrappers.has(id)&&!devCopy)ask=(await deactivate(id,{keep:true})).restart;
 installer.commit(staged,root);
 registry.forget(path.join(root,id));
 if(ask){
  // The old code is still running: the new version loads after a restart.
  registry.unload(id);restart.set(id,'update');
  notify(id,{title:staged.descriptor.name,text:t('Новая версия загрузится после перезапуска Пети.'),restart:true});
  return {id,restart:true,catalog:catalog()};
 }
 registry.reinstate(id);
 const result=devCopy?{loaded:true}:activate(id);
 if(ctx?.services.saveSettings)ctx.services.saveSettings({['extension_'+id]:'true'});
 send({type:'changed',id});
 return {id,restart:false,loaded:result.loaded,catalog:catalog()};
}
async function remove(id){
 const e=registry.entry(id)||(wrappers.get(id)?.origin==='external'?{id,dir:wrappers.get(id).dir,origin:'external'}:null);
 const dir=e?.dir||path.join(registry.root()||'',id);
 if(!registry.ID.test(id||'')||e?.origin==='bundled'||e?.origin==='dev'||!registry.root()||!fs.existsSync(dir)||!registry.inside(registry.root(),dir))throw Error('Это расширение нельзя удалить отсюда.');
 const {restart:ask}=await deactivate(id);
 const {shell}=require('electron');
 let trashed=false;
 if(shell?.trashItem&&!ctx?.services.smoke){try{await shell.trashItem(dir);trashed=true;}catch{trashed=false;}}
 if(!trashed)fs.rmSync(dir,{recursive:true,force:true});
 if(ask)notify(id,{text:t('Расширение удалено. Перезапустите Петю, чтобы выгрузить его код.'),restart:true});
 send({type:'changed',id});
 return {id,restart:ask,catalog:catalog()};
}
function catalog(){return ctx?require('./features/extension-ui.cjs').rows(ctx.services):[];}

// --- Development folder ---------------------------------------------------------------------------------------
function devStatus(){
 const folder=registry.devFolder();
 const d=folder?registry.descriptors().find(x=>x.origin==='dev'):null;
 const problems=folder?registry.problems().filter(p=>p.origin==='dev'||d&&p.id===d.id&&p.dir===folder):[];
 return {folder:folder||'',id:d?.id||'',name:d?.name||'',watching:!!watcher,problems:problems.map(p=>({message:p.message,where:p.where||''}))};
}
async function setDev(folder){
 const previous=registry.descriptors().find(x=>x.origin==='dev');
 if(previous)await deactivate(previous.id,{keep:true});
 registry.setDevFolder(folder||null);
 watch();
 const d=folder?registry.descriptors().find(x=>x.origin==='dev'):null;
 if(d){
  // An installed copy of the same id is replaced by the development copy while it is set.
  if(wrappers.has(d.id))await deactivate(d.id,{keep:true});
  activate(d.id);
  if(ctx?.services.saveSettings&&ctx.services.settings?.['extension_'+d.id]!=='true')ctx.services.saveSettings({['extension_'+d.id]:'true'});
 }else if(folder){
  const p=registry.problems().find(x=>x.origin==='dev'||x.dir===folder);
  if(p)notify('dev',{key:'error',kind:'error',title:t('Расширение не загружено'),text:p.message});
 }else if(previous&&fs.existsSync(path.join(registry.root()||'',previous.id))){registry.reinstate(previous.id);activate(previous.id);}
 send({type:'changed',id:d?.id||previous?.id||''});
 return devStatus();
}
// Reload on save: teardown → forget the folder's modules → validate → setup → the renderer reloads its scripts
// and redraws the chat's cards.
async function reload(){
 const folder=registry.devFolder();if(!folder)return devStatus();
 const before=registry.descriptors().find(x=>x.origin==='dev');
 if(before){
  const w=wrappers.get(before.id);
  if(w&&!w.codeless&&typeof w.module.teardown!=='function'&&!devWarned.has(before.id)){devWarned.add(before.id);notify(before.id,{key:'teardown',kind:'attention',text:t('В feature.cjs нет teardown(): таймеры и обработчики прежней версии остаются до перезапуска Пети.')});}
  await deactivate(before.id,{keep:true});
 }
 registry.forget(folder);registry.invalidate();
 const d=registry.descriptors().find(x=>x.origin==='dev');
 if(!d){
  const p=registry.problems().find(x=>x.origin==='dev'||x.dir===folder);
  failed.add(before?.id||'dev');
  notify(before?.id||'dev',{key:'error',kind:'error',title:t('Расширение не загружено'),text:p?.message||t('В папке разработки нет расширения.')});
  send({type:'changed',id:before?.id||''});return devStatus();
 }
 const {loaded}=activate(d.id);
 if(loaded){
  send({type:'reload',id:d.id,rev:registry.rev});
  // Quiet on ordinary saves (the redrawn card is the feedback); an error card is replaced when the fix loads.
  if(failed.delete(d.id))notify(d.id,{key:'error',kind:'success',title:d.name,text:t('Ошибка исправлена, расширение перезагружено.')});
 }else send({type:'changed',id:d.id});
 return devStatus();
}
function watch(){
 const folder=registry.devFolder()||'';
 if(folder===watching&&(watcher||!folder))return;
 watcher?.close();watcher=null;watching=folder;
 if(!folder||!fs.existsSync(folder))return;
 try{
  watcher=fs.watch(folder,{recursive:true},(_event,name)=>{
   if(name&&/(?:^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)|~$|\.swp$/.test(String(name)))return;
   clearTimeout(timer);timer=setTimeout(()=>reload().catch(error=>notify('dev',{key:'error',kind:'error',text:error.message})),300);
  });
 }catch(error){notify('dev',{key:'error',kind:'error',text:error.message});}
}

module.exports={wrap,startup,active,bind,activate,deactivate,inspect,cancel,install,remove,devStatus,setDev,reload,check,
 needsRestart:id=>restart.get(id)||'',restarts:()=>[...restart.keys()],isExternal:f=>!!f?.external,
 stopWatching(){watcher?.close();watcher=null;watching='';clearTimeout(timer);}};
