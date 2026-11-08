// The files of the chosen folders that the index may read: text-like files only, without dependency and build
// folders, hidden folders, .gitignore'd paths and secrets (src/semantic-index/ignore.cjs), within size limits.
// The walk yields to the event loop as it goes and stops at the item limit.
const fs=require('node:fs');
const path=require('node:path');
const {Ignorer}=require('../../semantic-index/ignore.cjs');
const {typeOf}=require('../../semantic-index/chunk.cjs');

// File kinds the card shows (meta.type) by extension; anything else is not indexed.
const KIND={pdf:'pdf',docx:'doc',pptx:'slides',xlsx:'sheet',md:'markdown',markdown:'markdown',mdx:'markdown',rst:'markdown',adoc:'markdown',
 txt:'text',text:'text',rtf:'text',csv:'text',tsv:'text',log:'text',json:'text',yaml:'text',yml:'text',toml:'text',ini:'text',cfg:'text',xml:'text',html:'text',htm:'text',tex:'text'};
const DOCUMENT=new Set(['pdf','docx','pptx','xlsx']);
// Big generated text that is not the user's writing (Unity serialized assets, lockfiles, minified bundles, maps).
const NOISE=/(?:\.(?:unity|prefab|asset|mat|meta|anim|controller|physicMaterial|lighting|spriteatlas|map)$|\.min\.(?:js|css)$|(?:^|[\\/])(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Podfile\.lock|Cargo\.lock|composer\.lock|poetry\.lock|Gemfile\.lock)$)/i;
const LIMITS={text:1024*1024,document:30*1024*1024,depth:14,dirs:20000};

function kindOf(file){
 const ext=path.extname(file).slice(1).toLowerCase();
 if(!ext)return null;
 if(KIND[ext])return KIND[ext];
 return typeOf(file)==='code'?'code':null;
}
function indexable(file,size){
 const kind=kindOf(file);if(!kind||NOISE.test(file))return null;
 const ext=path.extname(file).slice(1).toLowerCase();
 if(size>(DOCUMENT.has(ext)?LIMITS.document:LIMITS.text)||size===0)return null;
 return kind;
}

// Entries {id, version, meta} of every indexable file under `roots` (deduplicated, nested roots once).
async function walk(roots,{max=20000,gate=async()=>{},signal}={}){
 const out=[],seen=new Set();let dirs=0;
 const unique=[...new Set(roots.map(r=>path.resolve(r)))].filter(r=>!roots.some(o=>{const p=path.resolve(o);return p!==r&&r.startsWith(p+path.sep);}));
 for(const root of unique){
  let stat;try{stat=fs.statSync(root);}catch{continue;}
  if(!stat.isDirectory())continue;
  const ignorer=new Ignorer(root);
  const stack=[[root,0]];
  while(stack.length&&out.length<max){
   signal?.throwIfAborted();
   const [dir,depth]=stack.pop();
   if(++dirs>LIMITS.dirs)return out;
   if(dirs%50===0)await gate();
   let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{continue;}
   for(const e of entries){
    if(e.name.startsWith('.')||e.isSymbolicLink())continue;
    const full=path.join(dir,e.name);
    if(e.isDirectory()){if(depth<LIMITS.depth&&!ignorer.ignored(full,true))stack.push([full,depth+1]);continue;}
    if(!e.isFile()||seen.has(full))continue;
    if(!kindOf(full)||ignorer.ignored(full,false))continue;
    let st;try{st=fs.statSync(full);}catch{continue;}
    const kind=indexable(full,st.size);if(!kind)continue;
    seen.add(full);
    out.push({id:full,version:Math.round(st.mtimeMs)+':'+st.size,meta:{path:full,title:path.basename(full),type:kind,mtime:Math.round(st.mtimeMs),size:st.size,root}});
    if(out.length>=max)break;
   }
  }
 }
 return out;
}

module.exports={walk,kindOf,indexable,KIND,NOISE,LIMITS};
