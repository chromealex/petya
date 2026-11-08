// Localization files: attached to the chat or found in the current project's folders (bounded walk).
// Files the app wrote itself (*.petya-<lang>.*) are never read back as sources.
const fs=require('node:fs/promises');
const path=require('node:path');
const formats=require('./formats.cjs');
const langs=require('./langs.cjs');

const SKIP=new Set(['node_modules','.git','.svn','Library','Temp','Logs','obj','Build','Builds','build','dist','out','.gradle','.idea','.vs','Pods','DerivedData','PackageCache','vendor','.venv','venv','__pycache__','coverage','intermediates']);
const OURS=/\.petya-[\w-]+\.[\w.]+$/;
const LOCALE_DIR=/^(?:locales?|i18n|l10n|lang|langs|languages|translations?|localization|localisation|messages|strings)$/i;

// Cheap test by name before reading: which files may hold localization.
function candidate(file){
 const name=path.basename(file),lower=name.toLowerCase();
 if(OURS.test(name))return false;
 if(lower==='strings.xml')return /[\\/]values(?:-[^\\/]+)?[\\/]strings\.xml$/.test(file);
 if(/\.(?:strings)$/.test(lower))return /\.lproj[\\/][^\\/]+$/.test(file);
 if(/\.(?:xcstrings|pot?|csv|tsv|asset)$/.test(lower))return true;
 if(lower.endsWith('.json')){
  if(langs.code(name.slice(0,-5)))return true;
  const parts=file.split(/[\\/]/);return parts.slice(-4,-1).some(p=>langs.code(p))&&parts.some(p=>LOCALE_DIR.test(p));
 }
 return false;
}

async function read(file,limit){
 const st=await fs.stat(file);if(!st.isFile()||st.size>limit)return null;
 return formats.decode(await fs.readFile(file));
}
// Unity .asset files are many; only the head is read first to see whether it is a string table.
async function readUnity(file){
 const handle=await fs.open(file,'r');
 try{const head=Buffer.alloc(4096);const {bytesRead}=await handle.read(head,0,4096,0);const text=head.subarray(0,bytesRead).toString('utf8');
  if(!/m_SharedData:|m_TableCollectionName:/.test(text))return null;}finally{await handle.close();}
 const text=await read(file,20<<20);let meta='';try{meta=await fs.readFile(file+'.meta','utf8');}catch{/* no .meta */}
 return {text,meta};
}

async function parseFile(file){
 try{
  if(/\.asset$/i.test(file)){const r=await readUnity(file);return r?.text?formats.parse(file,r.text,r.meta):null;}
  const text=await read(file,8<<20);return text===null?null:formats.parse(file,text);
 }catch{return null;}
}

async function scan(roots,{depth=9,dirs=6000,assets=4000}={}){
 const files=[];let visited=0,assetCount=0;
 const queue=roots.map(r=>({dir:r,level:0}));
 while(queue.length&&visited<dirs){
  const {dir,level}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(level<depth&&!SKIP.has(item.name)&&!item.name.startsWith('.'))queue.push({dir:full,level:level+1});}
   else if(item.isFile()&&candidate(full)){if(/\.asset$/i.test(item.name)&&++assetCount>assets)continue;files.push(full);}
  }
 }
 const parts=[];for(const f of files){const p=await parseFile(f);if(p)parts.push(p);}
 return parts;
}

// Attached files: read from disk when the path is known, otherwise from the text the chat extracted.
async function attached(s){
 let list=[];try{list=s.attachments?.list?.()||[];}catch{list=[];}
 const out=[];
 for(const f of list){
  const item=s.attachments.pending?.get?.(f.id),name=f.name||'';
  if(!/\.(?:csv|tsv|json|xml|strings|xcstrings|po|pot|asset)$/i.test(name))continue;
  let part=null;
  if(item?.localSourcePath)part=await parseFile(item.localSourcePath);
  else if(typeof item?.text==='string'){
   // Without a path the folder layout is unknown: name the language from the file name where possible.
   const pseudo=/strings\.xml$/i.test(name)?path.join('attached','res','values'+(/(?:^|[-_.])([a-z]{2})(?:[-_.]|$)/.exec(name.replace(/strings\.xml$/i,''))?.[1]?'-'+/(?:^|[-_.])([a-z]{2})(?:[-_.]|$)/.exec(name.replace(/strings\.xml$/i,''))[1]:''),'strings.xml'):path.join('attached',name);
   part=formats.parse(pseudo,item.text);
   if(part)part.attachedOnly=true;
  }
  if(part)out.push({id:f.id,name,part,path:item?.localSourcePath||'',truncated:/первые|сокращ/iu.test(item?.note||'')});
 }
 return out;
}

function projectRoots(s){
 try{
  const state=s.dialogue.state,topic=s.dialogue.active();
  const project=state.projects?.find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId));
 }catch{return [];}
}
module.exports={scan,attached,projectRoots,candidate,parseFile};
