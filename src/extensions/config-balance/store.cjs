// Confirmed mappings and schema overrides per project (keyed by the project folder), in `config-balance.json` in
// the company data folder (mode 600). Nothing else is stored: tables and configs are read fresh every time.
const fs=require('node:fs');
const path=require('node:path');
const memory=new Map();
function file(s){return s.dataRoot?path.join(s.dataRoot,'config-balance.json'):'';}
function load(s){
 const f=file(s);if(!f)return memory.get('state')||{projects:{}};
 try{const v=JSON.parse(fs.readFileSync(f,'utf8'));return v&&typeof v.projects==='object'?v:{projects:{}};}catch{return {projects:{}};}
}
function save(s,state){
 const f=file(s);if(!f){memory.set('state',state);return;}
 fs.mkdirSync(path.dirname(f),{recursive:true});
 fs.writeFileSync(f+'.tmp',JSON.stringify(state,null,1),{mode:0o600});fs.renameSync(f+'.tmp',f);
}
const project=(s,root)=>load(s).projects[root]||{mappings:[],rules:{}};
function update(s,root,fn){const state=load(s);const p=state.projects[root]||{mappings:[],rules:{}};fn(p);p.at=new Date().toISOString();state.projects[root]=p;save(s,state);return p;}
// A mapping: {source:{id,label,type,…}, set:{id,label}, key:{column,field}, columns:[{column,field}]}; one per source.
function saveMapping(s,root,mapping){return update(s,root,p=>{p.mappings=[{...mapping,confirmed:true},...(p.mappings||[]).filter(m=>m.source.id!==mapping.source.id)].slice(0,20);});}
function setRule(s,root,setId,field,rule){return update(s,root,p=>{p.rules=p.rules||{};p.rules[setId]=p.rules[setId]||{};if(rule)p.rules[setId][field]=rule;else delete p.rules[setId][field];});}
module.exports={load,project,saveMapping,setRule};
