// «Свежесть документации», the check by code: what a document refers to (file paths, code symbols, settings,
// versions) and what git says about each of them in the project's repository. A finding always pairs the document's
// line with a git change: the commit that removed or renamed the file, removed the symbol, changed the setting's
// value or the version — or a commit that changed it after the document was last edited.
// git runs read-only (`ls-files`, `grep`, `log`, `show`, `status`); nothing here writes.
const {execFile}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const DAY=86400000;
const MAX_REFS=60,MAX_CHECKS=400;

function runGit(dir,args){
 return new Promise((resolve,reject)=>execFile('git',['-C',dir,...args],{timeout:20000,maxBuffer:16e6,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',LC_ALL:'C',GIT_OPTIONAL_LOCKS:'0'}},(e,out)=>e&&e.code!==1?reject(e):resolve(String(out||''))));
}

// --- References in a document ---------------------------------------------------------------------------------------
const KEYWORDS=new Set('true|false|null|none|None|self|this|void|string|String|int|bool|float|double|async|await|return|const|let|var|static|public|private|class|struct|function|import|export|default|object|Object|Array|Promise|undefined|NaN|TODO|FIXME|README|JSON|HTML|HTTP|HTTPS|API|URL|UTF-8'.split('|'));
const EXT='(?:cs|js|cjs|mjs|ts|tsx|jsx|py|go|rs|java|kt|swift|m|mm|c|cc|cpp|h|hpp|lua|gd|shader|hlsl|json|ya?ml|toml|ini|xml|asset|prefab|unity|asmdef|gradle|plist|sh|ps1|bat|sql|proto|md|txt|cfg|conf|env|lock)';
const PATH_TOKEN=new RegExp('^(?:\\./)?(?:[\\w@.-]+/)*[\\w@.-]+\\.'+EXT+'$|^(?:\\./)?(?:[\\w@.-]+/)+[\\w@.-]+/?$','i');
const PROSE_PATH=new RegExp('(?:^|[\\s(«"\'])((?:\\./)?(?:[\\w@-][\\w@.-]*/)+[\\w@.-]+\\.'+EXT+')(?=$|[\\s),.;:»"\'])','gi');
const SETTING=/^(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|--[a-z][a-z0-9-]{2,}|[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9_-]*){1,4})$/;
const SYMBOL=/^[A-Za-z_][A-Za-z0-9_]*(?:(?:\.|::)[A-Za-z_][A-Za-z0-9_]*)*(?:\(\))?$/;
const VALUE=/(?:\s*[:=]\s*|\s+(?:по\s+умолчанию|default|равен|равно|=)\s*)(-?\d+(?:\.\d+)?)/iu;

// [{n (1-based), text, kind:'path'|'symbol'|'setting'|'version', value, …}] for one document. Fenced code is skipped:
// examples there are not claims about the code.
function refs(text,{manifests={}}={}){
 const out=[],seen=new Set();
 const add=r=>{const key=r.kind+':'+r.value+':'+r.n;if(seen.has(key)||out.length>=MAX_REFS)return;seen.add(key);out.push(r);};
 let fence=false;
 String(text||'').replace(/\r\n?/g,'\n').split('\n').forEach((line,i)=>{
  const n=i+1;
  if(/^\s*(```|~~~)/.test(line)){fence=!fence;return;}
  if(fence||line.length>2000)return;
  const codes=[...line.matchAll(/`([^`\n]{2,120})`/g)].map(m=>m[1].trim());
  for(const raw of codes){
   const t=raw.replace(/:\d+(?::\d+)?$/,'');
   if(/\s/.test(t)||/^https?:/i.test(t))continue;
   if(PATH_TOKEN.test(t)&&(t.includes('/')||new RegExp('\\.'+EXT+'$','i').test(t))){add({n,text:line,kind:'path',value:t.replace(/^\.\//,'').replace(/\/$/,'')});continue;}
   if(SETTING.test(t)&&!/^[a-z]+\.[a-z]+$/.test(t)||/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(t)){
    const v=VALUE.exec(line.slice(line.indexOf(t)+t.length,line.indexOf(t)+t.length+40));
    add({n,text:line,kind:'setting',value:t,...v?{claimed:v[1]}:{}});continue;
   }
   if(SYMBOL.test(t)){
    const name=t.replace(/\(\)$/,'').split(/\.|::/).pop();
    if(name.length<4||KEYWORDS.has(name)||KEYWORDS.has(t))continue;
    if(!/[A-Z_]/.test(name)&&!/\(\)$/.test(t))continue;
    add({n,text:line,kind:'symbol',value:t,name});
   }
  }
  // Paths in prose and relative Markdown links.
  for(const m of line.matchAll(PROSE_PATH)){
   const before=line.slice(0,m.index+1);if(/[a-z]+:\/\/\S*$/i.test(before))continue;
   add({n,text:line,kind:'path',value:m[1].replace(/^\.\//,'')});
  }
  for(const m of line.matchAll(/\]\(((?!https?:|mailto:|#)[^)\s#]+)(?:#[^)]*)?\)/gi))add({n,text:line,kind:'path',value:m[1].replace(/^\.\//,''),link:true});
  // Versions of the engine, the runtime and the project's dependencies.
  const u=/Unity\s+(\d{4}\.\d+(?:\.\d+[abfp]?\d*)?)/i.exec(line);if(u&&manifests.unity)add({n,text:line,kind:'version',value:u[1],product:'Unity'});
  const nd=/Node(?:\.js)?\s+v?(\d{1,2}(?:\.\d+){0,2})(?!\d|\.\d)/i.exec(line);if(nd&&manifests.node)add({n,text:line,kind:'version',value:nd[1],product:'Node.js'});
  for(const [name] of manifests.deps||[]){
   const at=line.indexOf(name);if(at<0)continue;
   const v=/^[`'"]?\s*(?:@|версии|версия|version|v)?\s*[\^~]?v?(\d+\.\d+(?:\.\d+)?)/i.exec(line.slice(at+name.length,at+name.length+24));
   if(v)add({n,text:line,kind:'version',value:v[1],product:name});
  }
 });
 return out;
}

// --- The repository ------------------------------------------------------------------------------------------------
async function repo(dir,{git=runGit}={}){
 const files=(await git(dir,['ls-files','-z'])).split('\0').filter(Boolean).slice(0,60000);
 const set=new Set(files),dirs=new Set(),names=new Map();
 for(const f of files){let d=path.posix.dirname(f);while(d&&d!=='.'){if(dirs.has(d))break;dirs.add(d);d=path.posix.dirname(d);}const b=path.posix.basename(f);if(!names.has(b))names.set(b,f);}
 let remote='';try{remote=(await git(dir,['remote','get-url','origin'])).trim();}catch{remote='';}
 const m=/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i.exec(remote);
 return {dir,files,set,dirs,names,web:m?'https://github.com/'+m[1]:''};
}
// What the project's manifests say about versions (only what exists in the repository).
function manifests(r){
 const read=f=>{try{return r.set.has(f)?fs.readFileSync(path.join(r.dir,f),'utf8'):'';}catch{return '';}};
 const out={deps:[]};
 const unity=/m_EditorVersion:\s*(\S+)/.exec(read('ProjectSettings/ProjectVersion.txt'));if(unity)out.unity={version:unity[1],file:'ProjectSettings/ProjectVersion.txt'};
 const nvm=read('.nvmrc').trim().replace(/^v/,'');
 let pkg=null;try{pkg=JSON.parse(read('package.json')||'null');}catch{pkg=null;}
 if(nvm)out.node={version:nvm,file:'.nvmrc'};else if(pkg?.engines?.node)out.node={version:String(pkg.engines.node).replace(/^[^\d]*/,''),file:'package.json'};
 for(const [k,v] of Object.entries({...pkg?.dependencies,...pkg?.devDependencies}))if(k.length>=3&&/\d/.test(String(v)))out.deps.push([k,{version:String(v).replace(/^[^\d]*/,''),file:'package.json'}]);
 let upm=null;try{upm=JSON.parse(read('Packages/manifest.json')||'null');}catch{upm=null;}
 for(const [k,v] of Object.entries(upm?.dependencies||{}))if(/\d/.test(String(v))&&!/^file:|^https?:/.test(String(v)))out.deps.push([k,{version:String(v),file:'Packages/manifest.json'}]);
 out.deps=out.deps.slice(0,300);
 return out;
}
const FORMAT='%H%x1f%cI%x1f%an%x1f%s';
function commit(line,web){
 const [sha,date,author,subject]=String(line||'').trim().split('\x1f');
 if(!/^[0-9a-f]{40}$/.test(sha||''))return null;
 const at=new Date(date);return {sha,short:sha.slice(0,8),date:isNaN(at)?String(date||''):at.toISOString(),author:String(author||'').slice(0,80),subject:String(subject||'').slice(0,200),url:web?web+'/commit/'+sha:''};
}
const NOT_DOCS=[':(exclude)*.md',':(exclude)*.markdown',':(exclude)docs/**'];
// A version «2022.3» matches «2022.3.10f1»; «18» matches «18.19.0»; «^1.21.4» is «1.21.4».
const sameVersion=(claimed,actual)=>{const a=String(claimed).split('.'),b=String(actual).split(/[.\s]/);return a.every((x,i)=>b[i]!==undefined&&b[i].replace(/[^\d].*$/,'')===x.replace(/[^\d].*$/,''))&&(a.length<=b.length);};

// One reference against the repository → a finding or null.
async function judge(r,ref,doc,{git=runGit,man,budget}){
 const since=doc.edited?new Date(Date.parse(doc.edited)+1000).toISOString():'';
 const log=async(args)=>{if(budget.left--<=0)return null;return commit((await git(r.dir,['log','-1','--format='+FORMAT,...args])).split('\n')[0],r.web);};
 const after=c=>c&&doc.edited&&Date.parse(c.date)>Date.parse(doc.edited);
 if(ref.kind==='path'){
  const base=doc.dir?path.posix.normalize(path.posix.join(doc.dir,ref.value)):ref.value;
  const candidates=[...new Set([ref.value,base].map(p=>p.replace(/^\/+/,'')).filter(p=>p&&!p.startsWith('..')))];
  const name=!ref.value.includes('/');
  const hit=candidates.find(p=>r.set.has(p)||r.dirs.has(p))||(name&&r.names.get(ref.value));
  if(hit){
   if(r.dirs.has(hit)||!since)return null;
   const c=await log(['--since='+since,'--',hit]);
   return after(c)?{problem:'changed',severity:1,change:c,detail:'файл '+hit+' изменён после правки документа'}:null;
  }
  // Gone: the commit that deleted or renamed it (a path that never existed in git is not a claim we can check).
  for(const p of name?[':(glob)**/'+ref.value]:candidates){
   if(budget.left--<=0)return null;
   // The commit that removed the path (limited to it, a rename looks like a deletion), then that whole commit with
   // rename detection to tell a rename from a deletion.
   const c=commit((await git(r.dir,['log','-1','--diff-filter=D','--format='+FORMAT,'--',p])).split('\n')[0],r.web);if(!c)continue;
   budget.left--;
   const rows=(await git(r.dir,['show','-M','--name-status','--format=',c.sha])).split('\n').filter(Boolean).map(l=>l.split('\t'));
   const mine=x=>name?path.posix.basename(x)===ref.value:x===p;
   const st=rows.find(x=>/^R/.test(x[0])&&mine(x[1]))||rows.find(x=>x[0]==='D'&&mine(x[1]));
   if(st&&/^R/.test(st[0])){
    const from=st[1],to=st[2];
    // The document's spelling of the old path is replaced by the same spelling of the new one.
    const next=name?path.posix.basename(to):ref.value===from?to:base===from?path.posix.relative(doc.dir||'.',to):to;
    return {problem:'renamed',severity:3,change:c,detail:from+' → '+to,suggestion:{from:ref.value,to:next}};
   }
   return {problem:'missing',severity:3,change:c,detail:'удалён: '+(st?.[1]||p)};
  }
  return null;
 }
 if(ref.kind==='symbol'||ref.kind==='setting'){
  const term=ref.kind==='symbol'?ref.name:ref.value;
  if(budget.left--<=0)return null;
  const found=(await git(r.dir,['grep','-n','-I','-F','-w','-e',term,'--','.',...NOT_DOCS])).split('\n').filter(Boolean);
  if(!found.length){
   if(budget.left--<=0)return null;
   // The latest commit whose diff touched the word (it is nowhere now, so that commit removed the last one).
   // -S would miss «Connect» → «ConnectAsync» (the substring count does not change).
   const out=await git(r.dir,['log','-1','-G(^|[^A-Za-z0-9_])'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^A-Za-z0-9_]|$)','--format='+FORMAT,'--','.',...NOT_DOCS]);
   const c=commit(out.split('\n')[0],r.web);if(!c)return null;
   // The removed line, and a renamed identifier when the commit added the same line with another name.
   let removed='',renamed='';
   try{
    const diff=(await git(r.dir,['show','--format=','-U0','--no-color',c.sha,'--','.',...NOT_DOCS])).split('\n');
    const minus=diff.filter(l=>l.startsWith('-')&&!l.startsWith('---')&&l.includes(term));
    removed=(minus[0]||'').slice(1).trim().slice(0,200);
    const re=new RegExp('^'+(minus[0]||'').slice(1).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'([A-Za-z_][A-Za-z0-9_]*)')+'$');
    for(const l of diff.filter(x=>x.startsWith('+')&&!x.startsWith('+++'))){const m=re.exec(l.slice(1));if(m&&m[1]!==term){renamed=m[1];break;}}
   }catch{}
   return renamed?{problem:'renamed',severity:3,change:c,detail:term+' → '+renamed+(removed?' · было: '+removed:''),suggestion:{from:term,to:renamed}}
    :{problem:'removed',severity:3,change:c,detail:removed?'удалено: '+removed:'больше нет в коде'};
  }
  if(ref.kind==='setting'&&ref.claimed!=null){
   const esc=term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   const re=new RegExp(esc+'["\']?\\s*[:=]\\s*["\']?(-?\\d+(?:\\.\\d+)?)');
   const line=found.map(l=>({l,m:re.exec(l)})).find(x=>x.m);
   if(line&&Number(line.m[1])!==Number(ref.claimed)){
    const file=line.l.split(':')[0];
    const c=await log(['-G'+esc,'--',file]);
    if(c)return {problem:'value',severity:2,change:c,detail:file+': '+term+' = '+line.m[1]+' (в документе '+ref.claimed+')',suggestion:{from:ref.claimed,to:line.m[1],near:term}};
   }
  }
  if(!since)return null;
  const c=await log(['--since='+since,'-G'+term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'--','.',...NOT_DOCS]);
  return after(c)?{problem:'changed',severity:1,change:c,detail:'код с '+term+' менялся после правки документа'}:null;
 }
 if(ref.kind==='version'){
  const actual=ref.product==='Unity'?man.unity:ref.product==='Node.js'?man.node:man.deps.find(([k])=>k===ref.product)?.[1];
  if(!actual||sameVersion(ref.value,actual.version))return null;
  const c=await log(['--',actual.file]);
  if(!c)return null;
  const to=ref.value.split('.').length<String(actual.version).split('.').length?String(actual.version).split('.').slice(0,ref.value.split('.').length).join('.'):String(actual.version).replace(/^[^\d]*/,'');
  return {problem:'version',severity:2,change:c,detail:actual.file+': '+ref.product+' '+actual.version+' (в документе '+ref.value+')',suggestion:{from:ref.value,to,near:ref.product}};
 }
 return null;
}

// The document's line with the suggestion applied (only when the old text occurs exactly once there).
function fixLine(text,s){
 if(!s)return '';
 const from=String(s.from),count=text.split(from).length-1;
 if(count===1)return text.replace(from,s.to);
 if(s.near){const at=text.indexOf(s.near);if(at>=0){const i=text.indexOf(from,at);if(i>=0)return text.slice(0,i)+s.to+text.slice(i+from.length);}}
 return '';
}

// All documents → findings, grouped by document and sorted by staleness.
async function check(r,docs,{git=runGit,now=new Date()}={}){
 const man=manifests(r);
 const budget={left:MAX_CHECKS};
 const out=[];
 for(const doc of docs){
  const found=[];
  for(const ref of refs(doc.text,{manifests:man})){
   let f=null;try{f=await judge(r,ref,doc,{git,man,budget});}catch{f=null;}
   if(!f)continue;
   const line=fixLine(ref.text,f.suggestion);
   found.push({id:doc.id+'#'+ref.n+':'+ref.kind+':'+ref.value,line:{n:ref.n,text:ref.text.slice(0,400)},ref:{kind:ref.kind,value:ref.value},problem:f.problem,severity:f.severity,
    change:f.change,detail:f.detail,...line&&line!==ref.text?{suggestion:{...f.suggestion,line:line.slice(0,400)}}:{}});
  }
  if(!found.length)continue;
  // The same line and problem once (a path in backticks and in a link).
  const unique=found.filter((f,i)=>found.findIndex(x=>x.line.n===f.line.n&&x.problem===f.problem&&x.ref.value===f.ref.value)===i)
   .sort((a,b)=>b.severity-a.severity||a.line.n-b.line.n).slice(0,25);
  const lag=Math.max(0,...unique.map(f=>doc.edited?Math.round((Date.parse(f.change.date)-Date.parse(doc.edited))/DAY):0));
  out.push({id:doc.id,title:doc.title,source:doc.source,path:doc.path||'',url:doc.url||'',edited:doc.edited||'',score:unique.reduce((n,f)=>n+f.severity,0),lag,
   age:doc.edited?Math.max(0,Math.round((+now-Date.parse(doc.edited))/DAY)):null,findings:unique});
 }
 return out.sort((a,b)=>b.score-a.score||b.lag-a.lag||a.title.localeCompare(b.title));
}

module.exports={runGit,refs,repo,manifests,judge,check,fixLine,sameVersion,commit,FORMAT};
