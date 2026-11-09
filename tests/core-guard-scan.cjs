// Shared scan of the service guards (tests/core-mail-guard.cjs, core-notion-guard.cjs, core-google-play-guard.cjs):
// Petya's core files — src/*.cjs|js, src/features/*.cjs apart from the extension plumbing (extension-*.cjs, which
// names whatever apps declare), src/ui (js, html, css) — must not name a service outside the allowed lines. Comment
// lines are not checked: they are neither logic nor interface text.
// `allowed`: {file: {why, lines?: RegExp}} — `lines` matches the only lines (trimmed) that may name the service;
// without it the whole file may (a table of every service module). A stale allowance fails too.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function coreFiles(){
 const files=[];
 const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory()){if(e.name!=='vendor')walk(rel,filter);}else if(filter(rel))files.push(rel);}};
 for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js)$/.test(e.name))files.push('src/'+e.name);
 walk('src/features',f=>/\.cjs$/.test(f)&&!/^src\/features\/extension-[a-z-]+\.cjs$/.test(f));
 walk('src/ui',f=>/\.(?:js|html|css)$/.test(f));
 return files;
}
const comment=line=>/^(?:\/\/|\/\*|\*)/.test(line);
function scan({service,words,allowed}){
 const files=coreFiles(),problems=[],used=new Set();
 for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8');if(!words.test(text))continue;
  const allow=allowed[file];
  text.split(/\r?\n/).forEach((raw,i)=>{
   const line=raw.trim();if(!words.test(line)||comment(line))return;
   if(allow&&(!allow.lines||allow.lines.test(line))){used.add(file);return;}
   problems.push(file+':'+(i+1)+': '+line.slice(0,160));
  });
 }
 assert.deepEqual(problems,[],service+' belongs to its app; the core has none of its logic, requires or interface text');
 for(const file of Object.keys(allowed))assert.ok(used.has(file),'remove the stale allowance for '+file+' ('+service+')');
 return files.length;
}
module.exports={scan,coreFiles,root};
