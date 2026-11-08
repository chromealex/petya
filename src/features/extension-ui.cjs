const fs=require('node:fs');
const path=require('node:path');
const directory=path.join(__dirname,'../extensions');
const descriptors=fs.readdirSync(directory,{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>path.join(directory,e.name,'extension.json')).filter(fs.existsSync).map(file=>{
 const d=JSON.parse(fs.readFileSync(file,'utf8'));
 if(d.id!==path.basename(path.dirname(file))||!/^[a-z][a-z0-9-]*$/.test(d.id))throw Error('Invalid extension identity');
 for(const [script] of d.scripts){if(!/^[a-z][a-z0-9-]*\.js$/.test(script)||!fs.existsSync(path.join(path.dirname(file),script)))throw Error('Invalid extension renderer');}
 if(d.feature&&!/^[a-z][a-z0-9-]*\.cjs$/.test(d.feature))throw Error('Invalid extension feature');
 if(d.markup){if(!/^[a-z][a-z0-9-]*\.html$/.test(d.markup))throw Error('Invalid settings template');d.template=fs.readFileSync(path.join(path.dirname(file),d.markup),'utf8');}
 return d;
});
let snapshot=()=>[];
require('electron').ipcMain?.on('petya:extension-ui-bootstrap',event=>{event.returnValue=snapshot();});
module.exports={name:'extensionUI',descriptors,features:descriptors.filter(d=>d.feature).map(d=>require(path.join(directory,d.id,d.feature))),setup(s){
 const catalog=()=>descriptors.map(d=>({...d,installed:!d.setting||s.settings[d.setting]==='true'}));
 snapshot=catalog;
 // Plugins may claim a chat turn (e.g. corrections to an open plan) through `turn(services, command)`.
 const pluginFeatures=module.exports.features.filter(f=>typeof f.turn==='function');
 const extensionTurn=async command=>{for(const f of pluginFeatures){const reply=await f.turn(s,command);if(reply)return reply;}return null;};
 return {extensionTurn,ipc:{catalog,uninstall(id){const d=descriptors.find(d=>d.id===id);if(!d?.setting)throw Error('Это расширение нельзя удалить отдельно.');s.saveSettings({[d.setting]:'false'});return catalog();},install(id){const d=descriptors.find(d=>d.id===id);if(!d)throw Error('Расширение не найдено.');if(d.setting)s.saveSettings({[d.setting]:'true'});return catalog();}}};
}};
