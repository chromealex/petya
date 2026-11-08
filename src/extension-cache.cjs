// Cache for plugins: slow-changing lists from services (assignable people, priorities, channels, …) are kept in
// <company data>/extensions/<plugin id>/cache.json. A fresh value is returned as is; a stale one is returned
// at once and refreshed in the background; a missing one is loaded. Each company has its own cache.
const fs=require('node:fs'),path=require('node:path');
const stores=new Map();
function store(root,id){
 if(!/^[a-z][a-z0-9-]{0,40}$/.test(id))throw Error('Некорректное имя расширения.');
 const file=path.join(root,'extensions',id,'cache.json');if(stores.has(file))return stores.get(file);
 let data={};try{data=JSON.parse(fs.readFileSync(file,'utf8'))||{};}catch{}
 const inflight=new Map();
 const save=()=>{try{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(file+'.tmp',file);}catch{}};
 const refresh=(key,load)=>{if(inflight.has(key))return inflight.get(key);const p=Promise.resolve().then(load).then(value=>{data[key]={at:Date.now(),value};save();return value;}).finally(()=>inflight.delete(key));inflight.set(key,p);return p;};
 const api={
  // ttl: how long a value is fresh; maxAge: after this it is not used even as a stale fallback.
  async get(key,load,{ttl=86400000,maxAge=30*86400000,now=Date.now()}={}){
   const hit=data[key];
   if(hit&&now-hit.at<ttl)return hit.value;
   if(hit&&now-hit.at<maxAge){refresh(key,load).catch(()=>{});return hit.value;}
   return refresh(key,load);
  },
  // Plain small state for a plugin (last run day and the like).
  peek(key){return data[key]?.value;},
  set(key,value){data[key]={at:Date.now(),value};save();},
  forget(key){if(key===undefined)data={};else delete data[key];save();},
  file
 };
 stores.set(file,api);return api;
}
module.exports={store,reset(){stores.clear();}};
