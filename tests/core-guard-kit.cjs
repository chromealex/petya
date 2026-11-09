// Shared scan for the core guards (tests/core-*-guard.cjs): which lines of Petya's core files — src/*.cjs|js|ps1,
// src/features/*.cjs (the extension plumbing src/features/extension-*.cjs aside) and src/ui (vendor aside) — match
// a service's words, apart from the lines an allowance names. An allowance is {why, lines?} per file: without
// `lines` the whole file may use the words. Returns {files, problems, stale}: `stale` lists allowances no longer
// needed, so the allowlist stays honest.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
function coreFiles(){
 const files=[];
 const walk=(dir,filter)=>{for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const rel=dir+'/'+e.name;if(e.isDirectory()){if(rel!=='src/ui/vendor')walk(rel,filter);}else if(filter(rel))files.push(rel);}};
 for(const e of fs.readdirSync(path.join(root,'src'),{withFileTypes:true}))if(e.isFile()&&/\.(?:cjs|js|ps1)$/.test(e.name))files.push('src/'+e.name);
 walk('src/features',f=>/\.cjs$/.test(f)&&!/^src\/features\/extension-[a-z-]+\.cjs$/.test(f));
 walk('src/ui',f=>/\.(?:js|html|css)$/.test(f));
 return files;
}
function scan(words,allowed){
 const files=coreFiles(),problems=[];
 for(const file of files){
  const text=fs.readFileSync(path.join(root,file),'utf8');if(!words.test(text))continue;
  const allow=allowed[file];if(allow&&!allow.lines)continue;
  text.split(/\r?\n/).forEach((line,i)=>{if(words.test(line)&&!(allow?.lines?.test(line.trim())))problems.push(file+':'+(i+1)+': '+line.trim().slice(0,140));});
 }
 const stale=Object.keys(allowed).filter(file=>!fs.existsSync(path.join(root,file))||!words.test(fs.readFileSync(path.join(root,file),'utf8')));
 return {files,problems,stale};
}
module.exports={root,coreFiles,scan};
