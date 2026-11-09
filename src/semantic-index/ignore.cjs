// What a file-walking index collection must never read: dependency and build folders, binaries, secrets.
// `.gitignore` rules (with nesting and negation) come on top of the built-in lists; text that looks like a
// credential is redacted before it is chunked, so a key in a README never reaches the index.
const fs=require('node:fs');
const path=require('node:path');

// Folder names skipped anywhere in a tree: VCS, package managers, engine and IDE caches, build outputs, the macOS
// ~/Library (and Unity's Library) — they are huge, generated and say nothing about the user's own work.
const DIRS=new Set(['.git','.svn','.hg','node_modules','bower_components','vendor','Pods','Carthage','.venv','venv','__pycache__','.mypy_cache','.pytest_cache','.tox',
 'Library','Temp','Logs','obj','UserSettings','MemoryCaptures','Intermediate','Binaries','Saved','DerivedDataCache','.godot','.import',
 'build','Build','Builds','dist','out','target','DerivedData','.gradle','.dart_tool','.build','.next','.nuxt','.svelte-kit','.parcel-cache','coverage','.cache','.terraform',
 '.idea','.vs','.vscode','.Trash','Caches','$RECYCLE.BIN','System Volume Information']);
// Credentials by file name: env files, keys, keystores, provisioning, password databases, cloud service accounts.
const SECRET_FILES=[/^\.env(?:\.(?!example$|sample$|template$)[\w.-]+)?$/i,/\.(?:pem|key|p12|pfx|keystore|jks|mobileprovision|provisionprofile|kdbx|ovpn|asc|gpg)$/i,
 /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,/^\.(?:netrc|npmrc|pypirc|htpasswd|git-credentials)$/i,/^credentials(?:[._-][\w.-]*)?$/i,/^secrets?(?:[._-][\w.-]*)?$/i,
 /service[-_]?account[\w.-]*\.json$/i,/^google-services\.json$/i,/^GoogleService-Info\.plist$/i];
// Credential-shaped text inside an indexed file: replaced with a marker before chunking and embedding.
const SECRET_TEXT=[/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,/\bAKIA[0-9A-Z]{16}\b/g,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
 /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,/\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g,/\bAIza[0-9A-Za-z_-]{35}\b/g,/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
 /((?:password|passwd|пароль|secret|token|api[_-]?key)\s*[:=]\s*)(["']?)[^\s"']{6,}\2/giu];
const REDACTED='[скрыто]';

const isSecretFile=name=>SECRET_FILES.some(r=>r.test(path.basename(String(name||''))));
function redact(text){
 let out=String(text||''),hits=0;
 for(const r of SECRET_TEXT){r.lastIndex=0;out=out.replace(r,(m,prefix)=>{hits++;return typeof prefix==='string'&&/[:=]\s*$/.test(prefix)?prefix+REDACTED:REDACTED;});}
 return {text:out,redacted:hits};
}
// Bytes that are not text: a NUL in the first 8 KB.
function isBinary(buffer){const n=Math.min(buffer.length,8192);for(let i=0;i<n;i++)if(buffer[i]===0)return true;return false;}

// One .gitignore file → rules {negate, dirOnly, regex}. Paths are tested relative to the file's folder with «/».
function gitignore(text){
 const rules=[];
 for(let line of String(text||'').split(/\r?\n/)){
  if(!line||line.startsWith('#'))continue;
  line=line.replace(/(?<!\\)\s+$/,'');if(!line)continue;
  let negate=false;if(line.startsWith('!')){negate=true;line=line.slice(1);}else if(line.startsWith('\\!')||line.startsWith('\\#'))line=line.slice(1);
  let dirOnly=false;if(line.endsWith('/')){dirOnly=true;line=line.slice(0,-1);}
  if(!line)continue;
  const anchored=line.includes('/');if(line.startsWith('/'))line=line.slice(1);
  let re='';
  for(let i=0;i<line.length;i++){
   const c=line[i];
   if(c==='*'){
    if(line[i+1]==='*'){
     const before=i===0||line[i-1]==='/',after=line[i+2]==='/'||i+2===line.length;
     if(before&&after){re+=line[i+2]==='/'?'(?:.*/)?':'.*';i+=line[i+2]==='/'?2:1;continue;}
    }
    re+='[^/]*';
   }else if(c==='?')re+='[^/]';
   else if(c==='['){const end=line.indexOf(']',i+1);if(end<0){re+='\\[';continue;}let set=line.slice(i+1,end);if(set.startsWith('!'))set='^'+set.slice(1);re+='['+set.replace(/\\/g,'\\\\')+']';i=end;}
   else if(c==='\\'&&i+1<line.length){re+=line[++i].replace(/[.*+?^${}()|[\]\\/]/g,'\\$&');}
   else re+=c.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&');
  }
  // Without a slash the pattern matches a name at any depth; a matched folder also covers what is inside it.
  rules.push({negate,dirOnly,regex:new RegExp('^'+(anchored?'':'(?:.*/)?')+re+'(?:/.*)?$')});
 }
 return rules;
}
// Last matching rule wins; a rule for folders only applies to a folder or to what lies inside one.
function verdict(rules,relative,isDir){
 let result;
 for(const r of rules){
  if(!r.regex.test(relative))continue;
  if(r.dirOnly&&!isDir&&!r.regex.test(relative.split('/').slice(0,-1).join('/')||'\0'))continue;
  result=!r.negate;
 }
 return result;
}

// Ignore rules for one root folder: built-in lists, then every .gitignore from the root down to the file's folder.
class Ignorer{
 constructor(root,{extra=[],read=file=>fs.readFileSync(file,'utf8')}={}){
  this.root=path.resolve(root);this.read=read;this.cache=new Map();this.extra=gitignore(extra.join('\n'));
 }
 rules(dir){
  if(this.cache.has(dir))return this.cache.get(dir);
  let rules=[];try{rules=gitignore(this.read(path.join(dir,'.gitignore')));}catch{rules=[];}
  if(this.cache.size>5000)this.cache.clear();
  this.cache.set(dir,rules);return rules;
 }
 ignored(file,isDir=false){
  const abs=path.resolve(file),name=path.basename(abs);
  const rel=path.relative(this.root,abs);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))return !!rel;
  const parts=rel.split(path.sep);
  if(parts.some((p,i)=>DIRS.has(p)&&(i<parts.length-1||isDir)))return true;
  if(!isDir&&isSecretFile(name))return true;
  const posix=parts.join('/');
  if(verdict(this.extra,posix,isDir))return true;
  // Nested .gitignore files: each folder's rules apply to paths relative to that folder; deeper files win.
  let ignored=false;
  for(let i=0;i<parts.length;i++){
   const dir=path.join(this.root,...parts.slice(0,i));
   const v=verdict(this.rules(dir),parts.slice(i).join('/'),isDir);
   if(v!==undefined)ignored=v;
  }
  return ignored;
 }
}

module.exports={DIRS,SECRET_FILES,isSecretFile,redact,isBinary,gitignore,verdict,Ignorer,REDACTED};
