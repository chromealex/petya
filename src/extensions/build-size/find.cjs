// Where the builds come from: files attached to the chat (picked from disk, so their path is known),
// paths written in the request, and APK/AAB/IPA files inside the current project's folders.
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

const EXT=/\.(?:apk|aab|ipa)$/i;
const SKIP=new Set(['node_modules','.git','.svn','Library','Temp','Logs','obj','.gradle','.idea','.vs','Pods','DerivedData','PackageCache','.cxx','intermediates','tmp']);

// Paths written in the request: quoted («…», "…", '…', `…`) or absolute / home-relative without spaces; bare names too.
function written(command){
 const out=[],text=String(command||'');
 const re=/«([^»]+?\.(?:apk|aab|ipa))»|"([^"]+?\.(?:apk|aab|ipa))"|'([^']+?\.(?:apk|aab|ipa))'|`([^`]+?\.(?:apk|aab|ipa))`|((?:~|\/|[A-Za-z]:\\)[^\s"'«»`]+?\.(?:apk|aab|ipa))(?=$|[\s,;.!?)»])|(?:^|[\s(])([\w.+-]+\.(?:apk|aab|ipa))(?=$|[\s,;!?)»]|\.(?:\s|$))/giu;
 let m;while((m=re.exec(text)))out.push((m[1]||m[2]||m[3]||m[4]||m[5]||m[6]).trim());
 return [...new Set(out)].map(p=>p.startsWith('~')?path.join(os.homedir(),p.slice(1)):p);
}

// Build files attached to the chat composer. Only files picked from disk carry a path (big builds are never loaded).
function attached(s){
 let files=[];try{files=s.attachments?.list?.()||[];}catch{files=[];}
 return files.filter(f=>EXT.test(f.name||'')).map(f=>({id:f.id,name:f.name,path:s.attachments.pending?.get?.(f.id)?.localSourcePath||''}));
}

function projectRoots(s){
 try{
  const state=s.dialogue.state,topic=s.dialogue.active();
  const project=state.projects?.find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId));
 }catch{return [];}
}

// APK/AAB/IPA files under the roots, newest first. Bounded walk: depth and directory count are limited.
async function scan(roots,{depth=7,limit=5000}={}){
 const found=[];let visited=0;
 const queue=roots.map(r=>({dir:r,level:0}));
 while(queue.length&&visited<limit){
  const {dir,level}=queue.shift();visited++;
  let items;try{items=await fs.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const item of items){
   const full=path.join(dir,item.name);
   if(item.isDirectory()){if(level<depth&&!SKIP.has(item.name)&&!item.name.startsWith('.')&&!/\.(?:app|xcarchive|dSYM)$/.test(item.name))queue.push({dir:full,level:level+1});}
   else if(item.isFile()&&EXT.test(item.name)){try{const st=await fs.stat(full);found.push({path:full,name:item.name,mtime:st.mtimeMs,size:st.size});}catch{/* vanished */}}
  }
 }
 return found.sort((a,b)=>b.mtime-a.mtime);
}

// Resolves a written path: absolute as is, a bare name against the project roots.
async function resolve(p,roots,found){
 if(path.isAbsolute(p))return p;
 for(const root of roots){const full=path.join(root,p);try{if((await fs.stat(full)).isFile())return full;}catch{/* not here */}}
 return found.find(f=>f.name.toLowerCase()===path.basename(p).toLowerCase())?.path||null;
}

module.exports={written,attached,projectRoots,scan,resolve,EXT};
