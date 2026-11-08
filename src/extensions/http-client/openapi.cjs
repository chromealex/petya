// «API-клиент», OpenAPI/Swagger: finds the spec in the project folders (or the path the user named), reads JSON or
// YAML and lists the endpoints with their servers, so the card can suggest requests. Nothing is fetched or run.
const fs=require('node:fs');
const path=require('node:path');
const NAMES=/^(?:openapi|swagger|api-?docs?|api)(?:[.-][\w.-]*)?\.(?:json|ya?ml)$/i;
const SKIP=new Set(['node_modules','.git','dist','build','vendor','Library','Temp','obj','bin','.venv','venv','__pycache__','Pods','.gradle','target','coverage']);
const METHODS=['get','post','put','patch','delete','head','options'];

function find(roots,{depth=4,limit=20}={}){
 const out=[];
 const walk=(dir,level)=>{
  if(out.length>=limit||level>depth)return;
  let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}
  for(const e of entries){
   if(e.isFile()&&NAMES.test(e.name)){const f=path.join(dir,e.name);try{if(fs.statSync(f).size<8*1024*1024&&/openapi|swagger/i.test(fs.readFileSync(f,'utf8').slice(0,4000)))out.push(f);}catch{/* unreadable */}}
  }
  for(const e of entries)if(e.isDirectory()&&!SKIP.has(e.name)&&!e.name.startsWith('.'))walk(path.join(dir,e.name),level+1);
 };
 for(const r of roots)walk(r,0);
 return out;
}

// A small YAML reader for what specs use: block mappings and sequences by indentation, plain/quoted scalars,
// flow [a, b] lists, comments and block scalars (| >) which are skipped. Anchors and tags are not supported.
function yaml(text){
 const lines=String(text).replace(/\r\n?/g,'\n').split('\n').map(raw=>{const t=raw.replace(/\t/g,'  ');return {indent:t.length-t.trimStart().length,text:stripComment(t.trim())};}).filter(l=>l.text&&l.text!=='---'&&!l.text.startsWith('%'));
 let i=0;
 function scalar(v){
  v=v.trim();
  if(v===''||v==='~'||v==='null')return null;
  if(/^".*"$/.test(v)){try{return JSON.parse(v);}catch{return v.slice(1,-1);}}
  if(/^'.*'$/.test(v))return v.slice(1,-1).replace(/''/g,"'");
  if(/^\[.*\]$/.test(v))return v.slice(1,-1).split(',').map(x=>scalar(x)).filter(x=>x!==null);
  if(/^\{.*\}$/.test(v)){const o={};for(const part of v.slice(1,-1).split(',')){const k=part.indexOf(':');if(k>0)o[scalar(part.slice(0,k))]=scalar(part.slice(k+1));}return o;}
  if(v==='true')return true;if(v==='false')return false;
  if(/^-?\d+(?:\.\d+)?$/.test(v))return Number(v);
  return v;
 }
 function skipBlock(indent){while(i<lines.length&&lines[i].indent>indent)i++;}
 function block(indent){
  if(i>=lines.length)return null;
  if(lines[i].text.startsWith('- ')||lines[i].text==='-')return seq(lines[i].indent);
  return map(lines[i].indent);
 }
 function value(rest,indent){
  if(/^[|>][+-]?\d*$/.test(rest)){skipBlock(indent);return '';}
  if(rest!=='')return scalar(rest);
  if(i<lines.length&&(lines[i].indent>indent||lines[i].indent===indent&&lines[i].text.startsWith('- ')))return block(lines[i].indent);
  return null;
 }
 function map(indent){
  const o={};
  while(i<lines.length&&lines[i].indent===indent&&!lines[i].text.startsWith('- ')){
   const m=/^("(?:[^"\\]|\\.)*"|'[^']*'|[^:]+?)\s*:(?:\s+(.*)|$)/.exec(lines[i].text);
   i++;
   if(!m)continue;
   o[String(scalar(m[1]))]=value((m[2]||'').trim(),indent);
  }
  return o;
 }
 function seq(indent){
  const a=[];
  while(i<lines.length&&lines[i].indent===indent&&(lines[i].text.startsWith('- ')||lines[i].text==='-')){
   const rest=lines[i].text.slice(1).trim();
   if(/^[^"'[{][^:]*:(?:\s|$)/.test(rest)||/^["'][^"']*["']\s*:/.test(rest)){
    // «- key: value» starts a mapping item; its other keys are indented under the dash.
    lines[i]={indent:indent+2,text:rest};a.push(map(indent+2));
   }else{i++;a.push(value(rest,indent));}
  }
  return a;
 }
 return block(0);
}
function stripComment(t){
 if(t.startsWith('#'))return '';
 let q=null;
 for(let k=0;k<t.length;k++){const c=t[k];if(q){if(c===q)q=null;continue;}if(c==='"'||c==="'"){q=c;continue;}if(c==='#'&&/\s/.test(t[k-1]||''))return t.slice(0,k).trimEnd();}
 return t;
}

function parse(text,file=''){
 const s=String(text||'');
 const doc=/^\s*[{[]/.test(s)?JSON.parse(s):yaml(s);
 if(!doc||typeof doc!=='object'||!(doc.openapi||doc.swagger)||!doc.paths)throw Error('Это не OpenAPI/Swagger: нет полей openapi/swagger и paths.');
 let servers=[];
 if(Array.isArray(doc.servers))servers=doc.servers.map(x=>String(x?.url||'')).filter(Boolean);
 else if(doc.host)servers=[(Array.isArray(doc.schemes)&&doc.schemes[0]||'https')+'://'+doc.host+(doc.basePath||'')];
 const endpoints=[];
 for(const [p,item] of Object.entries(doc.paths||{})){
  if(!item||typeof item!=='object')continue;
  for(const m of METHODS){
   const op=item[m];if(!op||typeof op!=='object')continue;
   endpoints.push({method:m.toUpperCase(),path:p,summary:String(op.summary||op.operationId||'').slice(0,160),tag:String(Array.isArray(op.tags)&&op.tags[0]||''),deprecated:!!op.deprecated});
  }
 }
 return {file,title:String(doc.info?.title||path.basename(file)||'API'),version:String(doc.info?.version||''),spec:doc.openapi?'OpenAPI '+doc.openapi:'Swagger '+doc.swagger,servers:servers.slice(0,5),endpoints:endpoints.slice(0,400),total:endpoints.length};
}
module.exports={find,parse,yaml};
