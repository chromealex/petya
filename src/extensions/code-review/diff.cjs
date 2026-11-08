// Changes to review for «Код-ревью»: the local working tree against the base branch (git) or a GitHub PR's files,
// parsed into files → hunks → lines with their numbers in the new version. Lock, vendor, generated and binary
// files are skipped with a reason; caps keep the review within what the local model can read.
const fs=require('node:fs');
const path=require('node:path');
const EMPTY_TREE='4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const LIMITS={files:40,fileLines:600,totalLines:3000,untrackedBytes:200*1024,bigBinary:1024*1024};

// Why a file is not reviewed line by line ('' = reviewed).
const SKIP=[
 [/(?:^|\/)(?:package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|Gemfile\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|go\.sum|Podfile\.lock|packages\.lock\.json|gradle\.lockfile|flake\.lock|uv\.lock|mix\.lock|pubspec\.lock)$/i,'lock'],
 [/(?:^|\/)(?:node_modules|vendor|third[_-]party|Pods|Carthage|bower_components|\.yarn)\/|^(?:Library|Temp|Logs|obj)\//,'vendor'],
 [/(?:^|\/)(?:dist|out|coverage|\.next|\.nuxt|__generated__|[Gg]enerated)\/|(?:^|\/)build\/(?!.*\.(?:gradle|kts)$)/,'generated'],
 [/\.(?:min\.js|min\.css|map|pb\.go|g\.cs|designer\.cs|meta|snap)$|(?:^|\/)[^/]*\.generated\.[a-z]+$|_pb2(?:_grpc)?\.py$/i,'generated']
];
const REASON={lock:'lock-файл',vendor:'сторонний код',generated:'сгенерированный файл',binary:'бинарный файл',limit:'сверх лимита',deleted:'удалён'};
function skipReason(file){for(const [re,why] of SKIP)if(re.test(file))return why;return '';}

// One file's unified diff (from `git diff` or GitHub's `patch`) → hunks with numbered lines.
function parseHunks(text){
 const hunks=[];let hunk=null,o=0,n=0;
 for(const raw of String(text||'').split('\n')){
  const head=raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(head){o=Number(head[1]);n=Number(head[2]);hunk={oldStart:o,newStart:n,lines:[]};hunks.push(hunk);continue;}
  if(!hunk||raw.startsWith('\\'))continue;
  const sign=raw[0],body=raw.slice(1);
  if(sign==='+')hunk.lines.push({kind:'add',n:n++,text:body});
  else if(sign==='-')hunk.lines.push({kind:'del',o:o++,text:body});
  else if(sign===' '||raw==='')hunk.lines.push({kind:'ctx',n:n++,o:o++,text:body});
 }
 // A trailing empty string from the final newline is not a context line.
 for(const h of hunks){const last=h.lines.at(-1);if(last&&last.kind==='ctx'&&last.text===''&&!h.lines.some(l=>l!==last&&l.n===last.n))h.lines.pop();}
 return hunks;
}
// Full `git diff` output → [{path, oldPath, status, binary, hunks}].
function parseDiff(text){
 const files=[];let file=null,body=[];
 const flush=()=>{if(file){file.hunks=parseHunks(body.join('\n'));files.push(file);}body=[];};
 for(const line of String(text||'').split('\n')){
  const start=line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if(start){flush();file={path:start[2],oldPath:start[1],status:'modified',binary:false};continue;}
  if(!file)continue;
  if(/^new file mode/.test(line))file.status='added';
  else if(/^deleted file mode/.test(line))file.status='deleted';
  else if(/^rename to /.test(line)){file.status='renamed';file.path=line.slice(10);}
  else if(/^rename from /.test(line))file.oldPath=line.slice(12);
  else if(/^Binary files .* differ$/.test(line))file.binary=true;
  else if(/^\+\+\+ b\//.test(line))file.path=line.slice(6);
  else if(/^(?:---|\+\+\+|index |similarity|dissimilarity|old mode|new mode|copy )/.test(line)&&!body.length)continue;
  else body.push(line);
 }
 flush();
 return files;
}
const count=(file,kind)=>file.hunks.reduce((a,h)=>a+h.lines.filter(l=>l.kind===kind).length,0);
function finish(file){file.additions=file.additions??count(file,'add');file.deletions=file.deletions??count(file,'del');return file;}

// Applies skip rules and caps: reviewed files keep their hunks (a long file is cut to fileLines changed lines,
// `truncated`); the rest go to `skipped` with a reason.
function select(all){
 const files=[],skipped=[];let total=0;
 for(const f of all.map(finish)){
  const why=f.status==='deleted'?'deleted':f.binary?'binary':skipReason(f.path);
  if(why){skipped.push({path:f.path,reason:why,label:REASON[why],additions:f.additions,deletions:f.deletions,bytes:f.bytes});continue;}
  if(files.length>=LIMITS.files||total>=LIMITS.totalLines){skipped.push({path:f.path,reason:'limit',label:REASON.limit,additions:f.additions,deletions:f.deletions});continue;}
  let left=Math.min(LIMITS.fileLines,LIMITS.totalLines-total),kept=[];
  for(const h of f.hunks){if(left<=0)break;const lines=[];for(const l of h.lines){if(l.kind!=='ctx'&&left--<=0)break;lines.push(l);}kept.push({...h,lines});}
  const changed=kept.reduce((a,h)=>a+h.lines.filter(l=>l.kind!=='ctx').length,0);
  total+=changed;
  files.push({...f,hunks:kept,truncated:changed<f.additions+f.deletions});
 }
 return {files,skipped};
}

// --- Local repository ------------------------------------------------------------------------------------------------
const branchLike=name=>/^[A-Za-z0-9][\w.\/-]{0,120}$/.test(name)&&!name.includes('..');
async function exists(git,root,ref){try{await git(root,['rev-parse','--verify','--quiet',ref+'^{commit}']);return true;}catch{return false;}}
// The branch to compare with: the one named, else origin's default branch, else main / master / develop.
async function baseRef(git,root,named){
 if(named){
  if(!branchLike(named))return {missing:named};
  for(const ref of [named,'origin/'+named])if(await exists(git,root,ref))return {ref,name:named};
  return {missing:named};
 }
 try{const head=String(await git(root,['symbolic-ref','--quiet','refs/remotes/origin/HEAD'])).trim().replace(/^refs\/remotes\//,'');if(head&&await exists(git,root,head))return {ref:head,name:head.replace(/^origin\//,'')};}catch{/* no origin HEAD */}
 for(const name of ['main','master','develop','origin/main','origin/master','origin/develop'])if(await exists(git,root,name))return {ref:name,name:name.replace(/^origin\//,'')};
 return {};
}
async function branches(git,root){try{return String(await git(root,['for-each-ref','--format=%(refname:short)','refs/heads/'])).split('\n').map(x=>x.trim()).filter(Boolean).slice(0,12);}catch{return [];}}
// Untracked files are part of «my changes»: shown as added (text only, up to untrackedBytes).
function untrackedFile(root,rel){
 const full=path.join(root,rel);let stat;try{stat=fs.lstatSync(full);}catch{return null;}
 if(!stat.isFile())return null;
 const file={path:rel,oldPath:rel,status:'added',binary:false,hunks:[],bytes:stat.size};
 if(stat.size>LIMITS.untrackedBytes){file.binary=true;file.additions=0;file.deletions=0;return file;}
 const data=fs.readFileSync(full);
 if(data.includes(0)){file.binary=true;file.additions=0;file.deletions=0;return file;}
 const lines=data.toString('utf8').replace(/\n$/,'').split('\n');
 file.hunks=[{oldStart:0,newStart:1,lines:lines.map((text,i)=>({kind:'add',n:i+1,text}))}];
 return file;
}
// Working tree (with uncommitted and untracked changes) against the merge base with the base branch; on the base
// branch itself, only uncommitted changes.
async function local(git,root,{base='',now=Date.now()}={}){
 let branch='';try{branch=String(await git(root,['symbolic-ref','--short','HEAD'])).trim();}catch{branch='';}
 let head='';try{head=String(await git(root,['rev-parse','--verify','HEAD'])).trim();}catch{head='';}
 const found=await baseRef(git,root,base);
 if(found.missing)return {missingBase:found.missing,branches:await branches(git,root)};
 let from=head||EMPTY_TREE,mode='uncommitted';
 if(head&&found.ref&&found.name!==branch){
  try{from=String(await git(root,['merge-base','HEAD',found.ref])).trim()||from;mode='branch';}catch{mode='uncommitted';}
 }
 const listed=String(await git(root,['diff','--no-color','--no-ext-diff','--no-textconv','-M','--name-status','-z',from])).split('\0').filter(Boolean);
 const names=[];for(let i=0;i<listed.length;i++){const st=listed[i];if(/^[RC]/.test(st)){names.push(listed[i+2]);i+=2;}else{names.push(listed[i+1]);i++;}}
 // Read the patch only for files that will be reviewed (the rest would only fill the 4 MB git buffer).
 const reviewable=names.filter(n=>n&&!skipReason(n));
 let parsed=[];
 for(let i=0;i<reviewable.length&&i<LIMITS.files*2;i+=40){
  const out=await git(root,['diff','--no-color','--no-ext-diff','--no-textconv','-M','-U3',from,'--',...reviewable.slice(i,i+40)]);
  parsed.push(...parseDiff(out));
 }
 // Skipped files still appear in the card with their sizes.
 const stat=String(await git(root,['diff','--numstat','-M','-z',from])).split('\0');
 const numbers=new Map();
 for(let i=0;i<stat.length;i++){const m=stat[i].match(/^(-|\d+)\t(-|\d+)\t(.*)$/);if(!m)continue;let name=m[3];if(!name){name=stat[i+2];i+=2;}numbers.set(name,{additions:m[1]==='-'?0:Number(m[1]),deletions:m[2]==='-'?0:Number(m[2]),binary:m[1]==='-'});}
 for(const n of names)if(!parsed.some(f=>f.path===n)){const x=numbers.get(n)||{};parsed.push({path:n,oldPath:n,status:'modified',binary:!!x.binary,hunks:[],additions:x.additions||0,deletions:x.deletions||0});}
 for(const f of parsed){const x=numbers.get(f.path);if(x?.binary)f.binary=true;if(f.binary){try{f.bytes=fs.statSync(path.join(root,f.path)).size;}catch{/* deleted */}}}
 const untracked=String(await git(root,['ls-files','--others','--exclude-standard','-z'])).split('\0').filter(Boolean).slice(0,200);
 for(const rel of untracked){const f=skipReason(rel)?{path:rel,oldPath:rel,status:'added',binary:false,hunks:[],additions:0,deletions:0}:untrackedFile(root,rel);if(f)parsed.push(f);}
 let repoFiles=[];try{repoFiles=String(await git(root,['ls-files','-z'])).split('\0').filter(Boolean).slice(0,50000);}catch{repoFiles=[];}
 const {files,skipped}=select(parsed);
 return {mode,branch:branch||(head?head.slice(0,8):''),base:mode==='branch'?found.name:'',from:from===EMPTY_TREE?'':from.slice(0,12),head:head.slice(0,40),files,skipped,repoFiles:[...repoFiles,...untracked],root,name:path.basename(root),at:now};
}

// --- GitHub PR ------------------------------------------------------------------------------------------------------
// GitHub's pull request files ({filename, status, additions, deletions, patch, previous_filename}).
function fromGitHub(list){
 const parsed=(list||[]).map(f=>({path:String(f.filename||''),oldPath:String(f.previous_filename||f.filename||''),status:f.status==='removed'?'deleted':f.status==='added'?'added':f.status==='renamed'?'renamed':'modified',
  binary:!f.patch&&(Number(f.additions)||0)+(Number(f.deletions)||0)===0&&f.status!=='removed',hunks:parseHunks(f.patch||''),additions:Number(f.additions)||0,deletions:Number(f.deletions)||0,
  // GitHub leaves out the patch of a very large diff: such a file is listed, not reviewed.
  ...(!f.patch&&(Number(f.additions)||0)>0?{tooLarge:true}:{})})).filter(f=>f.path);
 const {files,skipped}=select(parsed.filter(f=>!f.tooLarge));
 for(const f of parsed.filter(f=>f.tooLarge))skipped.push({path:f.path,reason:'limit',label:'GitHub не отдал дифф: слишком большой',additions:f.additions,deletions:f.deletions});
 return {files,skipped};
}

// Lines of the new version around a line, from the file's hunks (context and added lines).
function around(file,line,radius=2){
 const out=[];
 for(const h of file.hunks)for(const l of h.lines)if(l.kind!=='del'&&l.n>=line-radius&&l.n<=line+radius)out.push({n:l.n,text:l.text.slice(0,400),kind:l.kind,target:l.n===line});
 return out;
}
const addedLines=file=>{const m=new Map();for(const h of file.hunks)for(const l of h.lines)if(l.kind==='add')m.set(l.n,l.text);return m;};

module.exports={LIMITS,REASON,EMPTY_TREE,skipReason,parseHunks,parseDiff,select,local,baseRef,fromGitHub,around,addedLines,branchLike};
