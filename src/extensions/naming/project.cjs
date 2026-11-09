// Names that already exist in the current project, read-only: texts and keys of its localization files (through
// the «Локализация» app's own parsers) and identifiers in its code. A bounded walk, cached for a few minutes.
const fs=require('node:fs/promises');
const path=require('node:path');
const find=require('../localization/find.cjs');
const formats=require('../localization/formats.cjs');
const checks=require('./checks.cjs');

const SKIP=new Set(['node_modules','.git','.svn','Library','Temp','Logs','obj','Build','Builds','build','dist','out','.gradle','.idea','.vs','Pods','DerivedData','PackageCache','vendor','.venv','venv','__pycache__','coverage','intermediates','Plugins','ThirdParty','third_party']);
const CODE=/\.(?:cs|js|cjs|mjs|ts|tsx|jsx|py|gd|lua|cpp|cc|c|h|hpp|java|kt|swift|m|mm|go|rs)$/i;
const IDENT=/[A-Za-z_][A-Za-z0-9_]{3,}/g;
const cache=new Map();const TTL=5*60000;

async function codeIdentifiers(roots,{files=4000,size=512*1024,depth=8,dirs=6000}={}){
 const ids=new Map();let read=0,visited=0;
 const queue=roots.map(dir=>({dir,level:0}));
 while(queue.length&&visited<dirs&&read<files){
  const {dir,level}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(level<depth&&!SKIP.has(item.name)&&!item.name.startsWith('.'))queue.push({dir:full,level:level+1});continue;}
   if(!item.isFile()||!CODE.test(item.name)||read>=files)continue;
   let text;try{const st=await fs.stat(full);if(st.size>size)continue;text=await fs.readFile(full,'utf8');}catch{continue;}
   read++;
   for(const m of text.matchAll(IDENT)){const k=checks.key(m[0]);if(k.length>=4&&!ids.has(k)&&ids.size<200000)ids.set(k,{text:m[0],where:path.relative(roots.find(r=>full.startsWith(r))||dir,full)});}
  }
 }
 return {ids,files:read};
}
async function localization(roots){
 const out=[];let files=0;
 try{
  const parts=await find.scan(roots);files=new Set(parts.map(p=>p.file)).size;
  for(const set of formats.sets(parts,{source:'en'})){
   for(const lang of set.langs){
    for(const [k,v] of set.values[lang]||[]){
     const text=String(v||'').trim();
     if(text&&text.length<=60&&text.split(/\s+/).length<=6)out.push({text,where:set.name+' · '+k});
    }
   }
   for(const k of set.keys)out.push({text:String(k).split(/[./]/).at(-1),where:set.name+' · ключ',key:true});
  }
 }catch{/* unreadable files are skipped */}
 return {texts:out,files};
}
// The index of a project; `roots` are the project's folders.
async function index(roots,{now=Date.now()}={}){
 const id=roots.join('\n');
 const hit=cache.get(id);if(hit&&now-hit.at<TTL)return hit.value;
 const [loc,code]=await Promise.all([localization(roots),codeIdentifiers(roots)]);
 const value={roots,texts:loc.texts,locFiles:loc.files,ids:code.ids,codeFiles:code.files};
 cache.set(id,{at:now,value});
 return value;
}
// Matches of one candidate: exact first, then similar; at most four shown.
function match(idx,name){
 const found=[];
 for(const t of idx.texts){const r=checks.compare(name,t.text);if(r)found.push({kind:r,text:t.text,where:t.where,source:'localization'});}
 const k=checks.key(name);
 const exact=idx.ids.get(k);if(exact)found.push({kind:'exact',text:exact.text,where:exact.where,source:'code'});
 if(k.length>=5){for(const [id,v] of idx.ids){if(id!==k&&id.startsWith(k)&&id.length<=k.length+14){found.push({kind:'similar',text:v.text,where:v.where,source:'code'});if(found.length>12)break;}}}
 const seen=new Set();
 const list=found.sort((a,b)=>(a.kind==='exact'?0:1)-(b.kind==='exact'?0:1)).filter(m=>{const key=m.kind+'|'+m.text.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
 return {status:list.some(m=>m.kind==='exact')?'taken':list.length?'similar':'free',matches:list.slice(0,4)};
}
function clear(){cache.clear();}
module.exports={index,match,clear,codeIdentifiers,localization};
