// The extension catalog and renderer host data. Descriptors come from src/extension-registry.cjs (bundled
// src/extensions/<id>, installed <userData>/extensions/<id>, and the development folder), validated there;
// live installation, removal and development reloads are src/extension-runtime.cjs.
const fs=require('node:fs');
const path=require('node:path');
const registry=require('../extension-registry.cjs');
const runtime=require('../extension-runtime.cjs');
// Catalog categories: ordered groups, and the category of service modules that have no extension directory.
const groups=registry.categories();
for(const [id,list] of Object.entries(groups.moduleExamples||{}))if(!groups.modules?.[id]||!Array.isArray(list)||!list.every(e=>typeof e==='string'&&e.trim()))throw Error('Invalid module examples '+id);
const descriptors=()=>registry.descriptors();
// Bundled features (and external ones present at startup) for src/features.cjs; later ones are added live.
const features=[...descriptors().filter(d=>d.feature&&d.origin==='bundled').map(d=>require(path.join(d.dir,d.feature))),...runtime.startup()];
const offerOf=d=>registry.cached('offer:'+d.id,()=>{const f=path.join(d.dir,'offer.cjs');return fs.existsSync(f)?registry.load(registry.entry(d.id)||{id:d.id,dir:d.dir,origin:d.origin},f):null;});
let snapshot=()=>[];
require('electron').ipcMain?.on('petya:extension-ui-bootstrap',event=>{event.returnValue=snapshot();});
// Download sizes for this platform: what adding the app downloads (minus what is already here) and what it may
// download on request. Presence comes from the app's optional downloads.cjs ({present(services)} → ids).
const bytesOf=(item,platform=process.platform)=>typeof item.bytes==='object'?(item.bytes[platform]??Math.max(...Object.values(item.bytes))):item.bytes;
// The app's own files (code, cards, icons, bundled data): recursive, symlinks skipped, cached per directory and its
// newest change.
const ownCache=new Map();
function ownBytes(dir){
 let total=0,newest=0;const stack=[dir];let seen=0;
 while(stack.length&&seen<5000){
  const at=stack.pop();let list=[];try{list=fs.readdirSync(at,{withFileTypes:true});}catch{continue;}
  for(const e of list){seen++;const f=path.join(at,e.name);if(e.isSymbolicLink())continue;
   if(e.isDirectory()){if(e.name!=='node_modules'&&!e.name.startsWith('.'))stack.push(f);continue;}
   try{const st=fs.statSync(f);total+=st.size;newest=Math.max(newest,st.mtimeMs);}catch{/* removed meanwhile */}}
 }
 return {total,newest};
}
function own(d){
 const hit=ownCache.get(d.dir);let mtime=0;try{mtime=fs.statSync(d.dir).mtimeMs;}catch{return 0;}
 if(hit&&hit.mtime===mtime)return hit.bytes;
 const bytes=ownBytes(d.dir).total;ownCache.set(d.dir,{mtime,bytes});return bytes;
}
async function sizes(services,{platform=process.platform,timeout=4000,free}={}){
 const out={};
 // Every app has its own size; bundled apps' files already come with Petya (`bundled`), external ones are copied.
 for(const d of descriptors())if(d.dir)out[d.id]={own:own(d),bundled:d.origin==='bundled'||!d.origin,items:[],install:0,optional:0,approx:false};
 await Promise.all(descriptors().filter(d=>d.downloads?.length).map(async d=>{
  let present=[];const file=path.join(d.dir,'downloads.cjs');
  const module=fs.existsSync(file)?registry.load(registry.entry(d.id),file):null;
  if(module)present=await Promise.race([Promise.resolve().then(()=>module.present(services)).catch(()=>[]),new Promise(r=>setTimeout(()=>r([]),timeout))]);
  const items=d.downloads.map(item=>({id:item.id,name:item.name,bytes:bytesOf(item,platform),approx:!!item.approx,optional:!!item.optional,requires:item.requires||'',present:present.includes(item.id)}));
  out[d.id]={...out[d.id],items,install:items.filter(i=>!i.optional&&!i.present).reduce((a,i)=>a+i.bytes,0),optional:items.filter(i=>i.optional&&!i.present).reduce((a,i)=>a+i.bytes,0),approx:items.some(i=>i.approx)};
 }));
 let available=null;try{available=(free||(()=>require('../disk-space.cjs').inspectSpace(require('node:os').homedir(),0).available))();}catch{available=null;}
 return {apps:out,available,reserve:512*1024**2};
}
// `connected` (only for apps that declare `connects`): the app's offer says it is connected (or ready), or one of its
// `connectsKeys` settings is filled. Secrets themselves never leave the main process.
function connected(s,d){
 if(!d.connects)return null;
 const offer=offerOf(d);
 try{if(offer)return !!(offer.connected||offer.ready)(s.settings||{});}catch{return false;}
 return (d.connectsKeys||[]).some(k=>!!String(s.settings?.[k]||'').trim());
}
// Catalog rows: the descriptor, whether it is added and connected, and for external ones whether Petya must
// restart to finish a removal or update.
const rows=s=>descriptors().map(d=>({...d,installed:!d.setting||s.settings[d.setting]==='true',connected:connected(s,d),...d.origin!=='bundled'?{restart:runtime.needsRestart(d.id)}:{}}));
const smokeOnly=s=>{if(!s.smoke)throw Error('Неизвестная функция.');};
module.exports={name:'extensionUI',get descriptors(){return descriptors();},groups,sizes,bytesOf,features,rows,setup(s){
 const catalog=()=>rows(s);
 snapshot=catalog;
 // Plugins may claim a chat turn (e.g. corrections to an open plan) through `turn(services, command)`;
 // external ones only while they are loaded (a removed one stops answering at once).
 const bundledTurns=features.filter(f=>!f.external&&typeof f.turn==='function');
 const extensionTurn=async command=>{for(const f of [...bundledTurns,...runtime.active().filter(w=>w.turn)]){const reply=await f.turn(s,command);if(reply)return reply;}return null;};
 const find=id=>descriptors().find(d=>d.id===id);
 const dialog=()=>require('electron').dialog;
 return {extensionTurn,ipc:{catalog,uninstall(id){const d=find(id);if(!d?.setting)throw Error('Это расширение нельзя удалить отдельно.');s.saveSettings({[d.setting]:'false'});return catalog();},install(id){const d=find(id);if(!d)throw Error('Расширение не найдено.');if(d.setting)s.saveSettings({[d.setting]:'true'});return catalog();},
  // A whole category or the chosen part of it is added in one save.
  installMany(ids){if(!Array.isArray(ids)||ids.length>100)throw Error('Неверный список расширений.');const patch={};for(const id of ids){const d=find(id);if(!d)throw Error('Расширение не найдено: '+id);if(d.setting)patch[d.setting]='true';}if(Object.keys(patch).length)s.saveSettings(patch);return catalog();},
  categories:()=>groups,sizes:options=>sizes(s,options),
  // External extensions. The path always comes from the system dialog, never from the page; the review it
  // returns must be confirmed before anything is installed.
  async choosePackage(kind){
   const folder=kind==='folder';
   const result=await dialog().showOpenDialog(s.win,{title:require('../interface-language.cjs').t(folder?'Папка расширения':'Архив расширения'),properties:[folder?'openDirectory':'openFile'],...folder?{}:{filters:[{name:'Zip',extensions:['zip']}]}});
   if(result.canceled||!result.filePaths[0])return null;
   return runtime.inspect(result.filePaths[0]);
  },
  inspectPath(file){smokeOnly(s);return runtime.inspect(String(file));},
  cancelReview:token=>runtime.cancel(String(token||'')),
  installReviewed:(token,confirmed)=>runtime.install(String(token||''),confirmed),
  removeExternal:id=>runtime.remove(String(id||'')),
  openFolder(id){const d=find(id);if(!d||d.origin==='bundled')throw Error('Расширение не найдено.');return require('electron').shell.openPath(d.dir);},
  problems:()=>registry.problems().filter(p=>p.origin!=='bundled').map(p=>({id:p.id||'',origin:p.origin,message:p.message,where:p.where||''})),
  devStatus:()=>runtime.devStatus(),
  async chooseDevFolder(){const result=await dialog().showOpenDialog(s.win,{title:require('../interface-language.cjs').t('Папка разработки расширения'),properties:['openDirectory','createDirectory']});if(result.canceled||!result.filePaths[0])return runtime.devStatus();return runtime.setDev(result.filePaths[0]);},
  setDevFolderPath(folder){smokeOnly(s);return runtime.setDev(folder?String(folder):null);},
  clearDevFolder:()=>runtime.setDev(null),
  reloadDev:()=>runtime.reload(),
  restart(){if(s.smoke)return false;const {app}=require('electron');app.relaunch({args:process.argv.slice(1).filter(a=>a!=='--hidden')});app.quit();return true;}}};
}};
