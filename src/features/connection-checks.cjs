// Connection checks of service cards in «Настройки» → «Сервисы» that apps own: what «Сохранить и проверить» saves and
// checks (window.petya.connectService(service, input)), the check on opening the window
// (checkSavedConnection(service)) and the guide link (connectionGuide(service)). Petya's own services stay in
// src/connections.cjs; an app's card declares
//   "provides": { "connection-check": "<file>.cjs" }
// and the file exports {service, fields: [settingKey], guide?: 'https://…', configured(settings) → bool,
//   async check(settings, request) → {ready, message}} — `fields` are the only settings the card may save (tokens get
// their «clear_» twin), `configured` says whether there is anything to check, `check` reads the service once without
// changing anything. Example: «Notion» (src/extensions/notion/connection-check.cjs).
const KIND='connection-check';
const registry=()=>require('../extension-registry.cjs');
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  if(!p||typeof p.service!=='string'||!/^[a-z][a-z0-9-]{0,40}$/.test(p.service)||!Array.isArray(p.fields)||!p.fields.every(k=>typeof k==='string'&&/^[A-Za-z][\w]{0,60}$/.test(k))||typeof p.configured!=='function'||typeof p.check!=='function'||p.guide!==undefined&&!(typeof p.guide==='string'&&/^https:\/\//.test(p.guide))){
   const error=Error('Invalid connection check '+x.extension+'/'+x.file+': {service, fields, guide?, configured(settings), check(settings, request)}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{service:p.service,extension:x.extension,setting:x.setting,check:p}];
 }).sort((a,b)=>a.service.localeCompare(b.service));
 return dir?build():registry().cached(KIND,build);
}
// The check of a service, or null. `checks` (tests) replaces the registry.
const find=(service,{checks}={})=>typeof service==='string'?(checks||load()).find(x=>x.service===service)?.check||null:null;
module.exports={KIND,load,find};
