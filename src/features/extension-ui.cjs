const fs=require('node:fs');
const path=require('node:path');
const directory=path.join(__dirname,'../extensions');
// Catalog categories: ordered groups, and the category of service modules that have no extension directory.
const groups=JSON.parse(fs.readFileSync(path.join(directory,'categories.json'),'utf8'));
const categoryIds=new Set(groups.categories.map(c=>c.id));
const descriptors=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(directory,e.name,'extension.json')).filter(fs.existsSync).map(file=>{
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 if(d.id!==path.basename(path.dirname(file))||!/^[a-z][a-z0-9-]*$/.test(d.id))throw Error('Invalid extension identity');
 for(const [script] of d.scripts){if(!/^[a-z][a-z0-9-]*\.js$/.test(script)||!fs.existsSync(path.join(path.dirname(file),script)))throw Error('Invalid extension renderer');}
 if(d.feature&&!/^[a-z][a-z0-9-]*\.cjs$/.test(d.feature))throw Error('Invalid extension feature');
 if(d.category!==undefined&&!categoryIds.has(d.category))throw Error('Unknown extension category '+d.category);
 // What the app downloads: [{id,name,bytes|{platform:bytes},approx?,optional?,requires?}].
 for(const item of d.downloads||[]){const sizes=typeof item.bytes==='object'?Object.values(item.bytes):[item.bytes];if(!/^[a-z][a-z0-9-]*$/.test(item.id||'')||!item.name||!sizes.every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Invalid extension download '+d.id);}
 if(d.markup){if(!/^[a-z][a-z0-9-]*\.html$/.test(d.markup))throw Error('Invalid settings template');d.template=fs.readFileSync(path.join(path.dirname(file),d.markup),'utf8');}
 return d;
});
let snapshot=()=>[];
require('electron').ipcMain?.on('petya:extension-ui-bootstrap',event=>{event.returnValue=snapshot();});
// Download sizes for this platform: what adding the app downloads (minus what is already here) and what it may
// download on request. Presence comes from the app's optional downloads.cjs ({present(services)} → ids).
const bytesOf=(item,platform=process.platform)=>typeof item.bytes==='object'?(item.bytes[platform]??Math.max(...Object.values(item.bytes))):item.bytes;
async function sizes(services,{platform=process.platform,timeout=4000,free}={}){
 const out={};
 await Promise.all(descriptors.filter(d=>d.downloads?.length).map(async d=>{
  let present=[];const file=path.join(directory,d.id,'downloads.cjs');
  if(fs.existsSync(file))present=await Promise.race([require(file).present(services).catch(()=>[]),new Promise(r=>setTimeout(()=>r([]),timeout))]);
  const items=d.downloads.map(item=>({id:item.id,name:item.name,bytes:bytesOf(item,platform),approx:!!item.approx,optional:!!item.optional,requires:item.requires||'',present:present.includes(item.id)}));
  out[d.id]={items,install:items.filter(i=>!i.optional&&!i.present).reduce((a,i)=>a+i.bytes,0),optional:items.filter(i=>i.optional&&!i.present).reduce((a,i)=>a+i.bytes,0),approx:items.some(i=>i.approx)};
 }));
 let available=null;try{available=(free||(()=>require('../disk-space.cjs').inspectSpace(require('node:os').homedir(),0).available))();}catch{available=null;}
 return {apps:out,available,reserve:512*1024**2};
}
module.exports={name:'extensionUI',descriptors,groups,sizes,bytesOf,features:descriptors.filter(d=>d.feature).map(d=>require(path.join(directory,d.id,d.feature))),setup(s){
 const catalog=()=>descriptors.map(d=>({...d,installed:!d.setting||s.settings[d.setting]==='true'}));
 snapshot=catalog;
 // Plugins may claim a chat turn (e.g. corrections to an open plan) through `turn(services, command)`.
 const pluginFeatures=module.exports.features.filter(f=>typeof f.turn==='function');
 const extensionTurn=async command=>{for(const f of pluginFeatures){const reply=await f.turn(s,command);if(reply)return reply;}return null;};
 return {extensionTurn,ipc:{catalog,uninstall(id){const d=descriptors.find(d=>d.id===id);if(!d?.setting)throw Error('Это расширение нельзя удалить отдельно.');s.saveSettings({[d.setting]:'false'});return catalog();},install(id){const d=descriptors.find(d=>d.id===id);if(!d)throw Error('Расширение не найдено.');if(d.setting)s.saveSettings({[d.setting]:'true'});return catalog();},
  // A whole category or the chosen part of it is added in one save.
  installMany(ids){if(!Array.isArray(ids)||ids.length>100)throw Error('Неверный список расширений.');const patch={};for(const id of ids){const d=descriptors.find(d=>d.id===id);if(!d)throw Error('Расширение не найдено: '+id);if(d.setting)patch[d.setting]='true';}if(Object.keys(patch).length)s.saveSettings(patch);return catalog();},
  categories:()=>groups,sizes:options=>sizes(s,options)}};
}};
