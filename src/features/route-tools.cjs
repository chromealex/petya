// Tools apps add to the semantic tool router (src/semantic-tools.cjs): the local model reads the request and picks one
// bounded read tool — Petya's own (bugs, web, brief, meeting) or an added app's. An app declares
//   "provides": { "route-tool": "<file>.cjs" }
// and the file exports
//   {id, says, order?, rule?, choices?(services) → [{id, name, phrases, enabled}], keepsClarify?(question) → bool,
//    ready?(settings), async run(services, {command, original, route}) → turn result | null}
// `says` is the tool's line in the router prompt («<id>: <says>»), placed among Petya's tools by `order` (bugs 10,
// web 30, brief 35, meeting 50); `rule` is one more sentence after the shared rules. A tool with `choices` lets the
// model pick one of them: the choice comes back as `route.recipeId` (the field the router has always used), and an
// unknown choice comes back empty for the app to ask about. `keepsClarify(question)`: the router's own question is
// the app's (asking which of its choices), so it is shown instead of falling back to the dialogue model.
// A tool counts only while its app is added (and ready). Reading only: a tool never writes by itself.
const KIND='route-tool';
const ID=/^[a-z][a-z0-9-]{1,30}$/;
const RESERVED=['chat','clarify','capability','bugs','web','brief','meeting'];
const registry=()=>require('../extension-registry.cjs');
function load(dir){
 const build=()=>require('./app-links.cjs').scan(dir).filter(x=>x.kind===KIND).flatMap(({provider:p,...x})=>{
  const fn=k=>p[k]===undefined||typeof p[k]==='function';
  if(!p||typeof p.id!=='string'||!ID.test(p.id)||RESERVED.includes(p.id)||typeof p.says!=='string'||!p.says.trim()||typeof p.run!=='function'||!fn('choices')||!fn('keepsClarify')||!fn('ready')||p.rule!==undefined&&typeof p.rule!=='string'){
   const error=Error('Invalid route tool '+x.extension+'/'+x.file+': {id, says, order?, rule?, choices?(services), keepsClarify?(question), ready?(settings), run(services, {command, original, route})}');
   if(x.origin&&x.origin!=='bundled'){registry().report(registry().entry(x.extension),error,x.file);return [];}
   throw error;
  }
  return [{id:p.id,extension:x.extension,setting:x.setting,tool:p}];
 }).sort((a,b)=>(a.tool.order??100)-(b.tool.order??100)||a.id.localeCompare(b.id));
 return dir?build():registry().cached(KIND,build);
}
// The tools of added apps (all of them without settings: tests and the prompt's full shape), in their order.
function list(settings,{tools}={}){
 const all=tools||load();
 if(!settings)return all.map(x=>x.tool);
 return all.filter(x=>{if(x.setting&&settings[x.setting]!=='true')return false;try{return typeof x.tool.ready!=='function'||!!x.tool.ready(settings);}catch{return false;}}).map(x=>x.tool);
}
// The choices the model may pick from (only enabled ones), for every tool that has them.
function choices(s,tools){
 const out=[];
 for(const t of tools){if(typeof t.choices!=='function')continue;let rows=[];try{rows=t.choices(s)||[];}catch{rows=[];}
  for(const r of rows)if(r&&typeof r.id==='string'&&r.enabled!==false)out.push(r);}
 return out;
}
const keepsClarify=(tools,question)=>tools.some(t=>{try{return typeof t.keepsClarify==='function'&&!!t.keepsClarify(String(question||''));}catch{return false;}});
module.exports={KIND,RESERVED,load,list,choices,keepsClarify};
