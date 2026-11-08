// Cross-app links: one app offers a capability, other apps' cards use it without knowing who provides it.
// An extension declares in its extension.json `"provides": {"<kind>": "<file>.cjs"}` (or a list of files); each
// file exports {id?, name?, label, ready(settings) -> bool, fits?(context) -> bool, hint?(settings) -> string,
// async run(services, payload, check)}. `available(kind, context)` lists only providers whose app is added and
// connected (ready) and that fit the context, in a stable order; `run(kind, id, payload)` calls one of them.
// Nothing here writes on its own: a provider runs only when a card button the user pressed asks for it, and
// providers whose own flows confirm (Jira, Slack, the Programmer) return a prepared chat request instead of writing.
const fs=require('node:fs');
const path=require('node:path');
const directory=path.join(__dirname,'../extensions');
const KINDS=['video-meeting','task-tracker','share-message','code-fix','meeting-recording'];
// Stable order inside a kind; providers not listed follow alphabetically.
const ORDER={'video-meeting':['zoom','google-meet','teams'],'task-tracker':['jira','asana'],'share-message':['slack','telegram'],'code-fix':['coder'],'meeting-recording':['zoom-bot']};

function load(dir=directory){
 const out=[];
 for(const entry of fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(dir,entry.name,'extension.json');if(!fs.existsSync(file))continue;
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const [kind,value] of Object.entries(d.provides||{})){
   if(!KINDS.includes(kind))throw Error('Unknown capability '+kind+' in '+d.id);
   for(const name of [].concat(value)){
    if(!/^[a-z][a-z0-9-]*\.cjs$/.test(name)||!fs.existsSync(path.join(dir,entry.name,name)))throw Error('Invalid capability provider '+d.id+'/'+name);
    const p=require(path.join(dir,entry.name,name));
    if(typeof p.label!=='string'||typeof p.ready!=='function'||typeof p.run!=='function')throw Error('Invalid capability provider '+d.id+'/'+name);
    out.push({kind,id:p.id||d.id,extension:d.id,setting:d.setting||'',name:p.name||d.name,provider:p});
   }
  }
 }
 const rank=(kind,id)=>{const i=(ORDER[kind]||[]).indexOf(id);return i<0?1000:i;};
 return out.sort((a,b)=>KINDS.indexOf(a.kind)-KINDS.indexOf(b.kind)||rank(a.kind,a.id)-rank(b.kind,b.id)||a.id.localeCompare(b.id));
}

// The registry bound to live services: settings are read at call time, never cached.
function create(s,{providers=load()}={}){
 const added=p=>!p.setting||s.settings?.[p.setting]==='true';
 const ready=p=>{try{return added(p)&&!!p.provider.ready(s.settings||{});}catch{return false;}};
 const fits=(p,context)=>{try{return typeof p.provider.fits!=='function'||!!p.provider.fits(context||{},s.settings||{});}catch{return false;}};
 function available(kind,context={}){
  if(!KINDS.includes(kind))throw Error('Неизвестный вид связи между приложениями.');
  return providers.filter(p=>p.kind===kind&&ready(p)&&fits(p,context)).map(p=>{
   let hint='';try{hint=typeof p.provider.hint==='function'?String(p.provider.hint(s.settings||{},context||{})||''):'';}catch{hint='';}
   return {id:p.id,name:p.name,label:p.provider.label,...hint?{hint}:{}};
  });
 }
 async function run(kind,id,payload={}){
  if(!KINDS.includes(kind))throw Error('Неизвестный вид связи между приложениями.');
  const p=providers.find(x=>x.kind===kind&&x.id===id);
  if(!p)throw Error('Такого приложения для этого действия нет.');
  if(!ready(p))throw Error('Приложение «'+p.name+'» не добавлено или не подключено.');
  // Providers re-check right before an external write: the connection may change while they prepare it.
  const check=()=>{if(!ready(p))throw Error('Подключение «'+p.name+'» изменилось. Повторите действие.');};
  return p.provider.run(s,payload&&typeof payload==='object'?payload:{},check);
 }
 return {available,run,providers:()=>providers.map(({kind,id,extension,name})=>({kind,id,extension,name}))};
}

module.exports={name:'appLinks',defaults:{},validate(){},KINDS,ORDER,load,create,
 setup(s){
  const links=create(s);
  return {appLinks:links,ipc:{available:(kind,context)=>links.available(kind,context&&typeof context==='object'?context:{}),run:(kind,id,payload)=>links.run(kind,id,payload)}};
 }};
