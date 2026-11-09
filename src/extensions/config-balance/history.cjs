// What changed in the configs between versions, from git: `git log -p` over the config files (a few commits, size
// bounded) tells which files each commit touched; both versions of each touched file are read with `git show` and
// compared object by object, field by field, so the card shows «archer.damage 10 → 12», not diff hunks. Uncommitted
// edits come first as «не закоммичено». Read-only: git is run with argument lists, no shell, short timeouts.
const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {parseConfig}=require('./files.cjs');
const {same}=require('./match.cjs');

function git(cwd,args,{max=8<<20}={}){
 return new Promise((resolve,reject)=>execFile('git',['-c','core.quotepath=off',...args],{cwd,timeout:20000,maxBuffer:max,windowsHide:true,encoding:'utf8'},(e,out)=>e?reject(e):resolve(out)));
}
async function top(dir){try{return (await git(dir,['rev-parse','--show-toplevel'])).trim();}catch{return '';}}
const show=(cwd,rev,file)=>git(cwd,['show',rev+':'+file],{max:4<<20}).catch(()=>null);

// Field changes between two versions of one file: [{object, field, old, new, line}].
function changes(file,before,after){
 const a=before===null?[]:parseConfig(file,before),b=after===null?[]:parseConfig(file,after);
 if(!a||!b)return null;
 const out=[],index=new Map(a.map(o=>[o.id,o]));
 const shown=v=>v&&typeof v==='object'&&!Array.isArray(v)?(v.ref?'ссылка '+(v.guid?v.guid.slice(0,8)+'…':v.fileID):JSON.stringify(v)):Array.isArray(v)?v.join(', '):v;
 for(const o of b){
  const old=index.get(o.id);index.delete(o.id);
  if(!old){out.push({object:o.name||o.id,objectId:o.id,field:'',old:null,new:'добавлен',line:null});continue;}
  for(const f of new Set([...Object.keys(old.fields),...Object.keys(o.fields)])){
   const x=old.fields[f],y=o.fields[f];
   const equal=x&&typeof x==='object'||y&&typeof y==='object'?JSON.stringify(x)===JSON.stringify(y):x===undefined||y===undefined?x===y:same(x,y)&&typeof x===typeof y;
   if(!equal)out.push({object:o.name||o.id,objectId:o.id,field:f,old:x===undefined?null:shown(x),new:y===undefined?null:shown(y),line:o.lines?.[f]||null});
  }
 }
 for(const o of index.values())out.push({object:o.name||o.id,objectId:o.id,field:'',old:'был',new:'удалён',line:null});
 return out;
}

// files: paths relative to `root`. → {repo:bool, versions:[{commit, short, author, date, subject, files, changes}]}.
async function versions(root,files,{commits=5,maxFiles=40}={}){
 const repo=await top(root);if(!repo)return {repo:false,versions:[]};
 const rel=files.slice(0,400).map(f=>path.relative(repo,path.join(root,f)).split(path.sep).join('/'));
 const out=[];
 // Uncommitted edits: the working file against HEAD.
 let dirty=[];try{dirty=(await git(repo,['diff','--name-only','HEAD','--',...rel])).split('\n').filter(Boolean);}catch{dirty=[];}
 if(dirty.length){
  const list=[];
  for(const f of dirty.slice(0,maxFiles)){let now=null;try{now=await fs.readFile(path.join(repo,f),'utf8');}catch{now=null;}const c=changes(f,await show(repo,'HEAD',f),now);if(c?.length)list.push(...c.map(x=>({...x,file:f})));}
  if(list.length)out.push({commit:'',short:'',author:'',date:'',subject:'Не закоммичено',working:true,files:dirty.length,changes:list.slice(0,300)});
 }
 let log='';
 try{log=await git(repo,['log','-n',String(commits),'-p','--no-color','--no-ext-diff','--format=%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s','--',...rel]);}
 catch(e){if(!/maxBuffer/i.test(String(e?.message)))throw e;log=await git(repo,['log','-n',String(commits),'--name-only','--format=%x1e%H%x1f%h%x1f%an%x1f%aI%x1f%s','--',...rel]);}
 let budget=maxFiles;
 for(const record of log.split('\x1e').filter(r=>r.trim())){
  const [headLine,...rest]=record.split('\n');const [commit,short,author,date,subject]=headLine.split('\x1f');
  const body=rest.join('\n');
  const touched=[...new Set([...body.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(m=>m[2]))];
  const names=touched.length?touched:rest.filter(l=>l.trim()&&rel.includes(l.trim())).map(l=>l.trim());
  const list=[];
  for(const f of names){
   if(budget--<=0)break;
   const c=changes(f,await show(repo,commit+'^',f),await show(repo,commit,f));
   if(c)list.push(...c.map(x=>({...x,file:f})));
   else{const hunk=body.split(/^diff --git /m).find(h=>h.startsWith('a/'+f+' '))||'';list.push(...hunk.split('\n').filter(l=>/^[-+](?![-+])/.test(l)).slice(0,10).map(l=>({object:'',field:'',old:l[0]==='-'?l.slice(1).trim():null,new:l[0]==='+'?l.slice(1).trim():null,file:f,line:null})));}
  }
  out.push({commit,short,author,date,subject:subject||'',files:names.length,changes:list.slice(0,300)});
 }
 return {repo:true,root:repo,versions:out};
}
module.exports={versions,changes,top};
