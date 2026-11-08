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
 if(d.markup){if(!/^[a-z][a-z0-9-]*\.html$/.test(d.markup))throw Error('Invalid settings template');d.template=fs.readFileSync(path.join(path.dirname(file),d.markup),'utf8');}
 return d;
});
let snapshot=()=>[];
require('electron').ipcMain?.on('petya:extension-ui-bootstrap',event=>{event.returnValue=snapshot();});
module.exports={name:'extensionUI',descriptors,groups,features:descriptors.filter(d=>d.feature).map(d=>require(path.join(directory,d.id,d.feature))),setup(s){
 const catalog=()=>descriptors.map(d=>({...d,installed:!d.setting||s.settings[d.setting]==='true'}));
 snapshot=catalog;
 // Plugins may claim a chat turn (e.g. corrections to an open plan) through `turn(services, command)`.
 const pluginFeatures=module.exports.features.filter(f=>typeof f.turn==='function');
 const extensionTurn=async command=>{for(const f of pluginFeatures){const reply=await f.turn(s,command);if(reply)return reply;}return null;};
 return {extensionTurn,ipc:{catalog,uninstall(id){const d=descriptors.find(d=>d.id===id);if(!d?.setting)throw Error('Это расширение нельзя удалить отдельно.');s.saveSettings({[d.setting]:'false'});return catalog();},install(id){const d=descriptors.find(d=>d.id===id);if(!d)throw Error('Расширение не найдено.');if(d.setting)s.saveSettings({[d.setting]:'true'});return catalog();},
  // A whole category or the chosen part of it is added in one save.
  installMany(ids){if(!Array.isArray(ids)||ids.length>100)throw Error('Неверный список расширений.');const patch={};for(const id of ids){const d=descriptors.find(d=>d.id===id);if(!d)throw Error('Расширение не найдено: '+id);if(d.setting)patch[d.setting]='true';}if(Object.keys(patch).length)s.saveSettings(patch);return catalog();},
  categories:()=>groups}};
}};
