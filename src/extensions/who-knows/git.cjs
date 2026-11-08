// Code evidence for «Кто знает»: who changed the files of a subject and how recently, from the project's git history.
// Files: tracked paths whose parts match the subject (most subject groups first) and files that mention a code
// identifier (`git grep`); commits: `git log --numstat` over those files plus commits whose message names the
// subject. Read-only commands through the shared GitWorkspace runner (no prompts, literal pathspecs, timeouts).
const terms=require('./terms.cjs');
const DAY=86400000;
const MAX_FILES=250,MAX_COMMITS=600;
const SEP='\x1e',FIELD='\x1f';
const FORMAT='--format='+SEP+'%H'+FIELD+'%aN'+FIELD+'%aE'+FIELD+'%at'+FIELD+'%s';

// Half the weight every 120 days: last month's work counts more than a rewrite from two years ago.
const recency=(at,now)=>Math.pow(0.5,Math.max(0,now-at)/(120*DAY));

function parseLog(raw){
 const commits=[];
 for(const block of String(raw||'').split(SEP)){
  if(!block.trim())continue;
  const [head,...rest]=block.split('\n');
  const [hash,name,email,at,subject]=head.split(FIELD);
  if(!/^[0-9a-f]{7,64}$/.test(hash||''))continue;
  const files=[];
  for(const line of rest){
   const m=/^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);if(!m)continue;
   // «dir/{old => new}/file» and «old => new»: the new path counts.
   const file=m[3].replace(/\{[^{}]*? => ([^{}]*)\}/g,'$1').replace(/^.* => /,'').replace(/\/\//g,'/');
   files.push({file,lines:(m[1]==='-'?0:+m[1])+(m[2]==='-'?0:+m[2])});
  }
  commits.push({hash,name:String(name||'').trim(),email:String(email||'').trim().toLowerCase(),at:Number(at)*1000,subject:String(subject||'').trim().slice(0,200),files});
 }
 return commits;
}

// Browser links for commits and files when the remote is GitHub, GitLab or Bitbucket.
function web(remote){
 const r=String(remote||'').trim();
 let m=/^(?:git@|ssh:\/\/git@)([\w.-]+)[:/](.+?)(?:\.git)?\/?$/.exec(r)||/^https:\/\/(?:[^@/]+@)?([\w.-]+)\/(.+?)(?:\.git)?\/?$/.exec(r);
 if(!m)return null;
 const host=m[1].toLowerCase(),repo=m[2].replace(/^\/+/,'');
 if(!/^[\w.-]+\/[\w./-]+$/.test(repo))return null;
 const base='https://'+host+'/'+repo;
 if(host==='github.com'||host.endsWith('.github.com'))return {base,commit:h=>base+'/commit/'+h,file:(h,f)=>base+'/blob/'+h+'/'+f.split('/').map(encodeURIComponent).join('/')};
 if(host==='gitlab.com'||/(?:^|\.)gitlab\./.test(host))return {base,commit:h=>base+'/-/commit/'+h,file:(h,f)=>base+'/-/blob/'+h+'/'+f.split('/').map(encodeURIComponent).join('/')};
 if(host==='bitbucket.org')return {base,commit:h=>base+'/commits/'+h,file:(h,f)=>base+'/src/'+h+'/'+f.split('/').map(encodeURIComponent).join('/')};
 return null;
}

async function quiet(git,root,args){try{return await git(root,args);}catch{return '';}}

// Commits about the subject in one repository: {root, name, head, links, files:[...], commits:[...]}.
async function scan(git,root,query,{now=Date.now(),years=3}={}){
 const since='--since='+new Date(now-years*365*DAY).toISOString();
 const listed=(await git(root,['ls-files','-z'])).split('\0').filter(Boolean);
 const scored=listed.map(f=>({f,n:terms.pathScore(f,query)})).filter(x=>x.n>0);
 const best=Math.max(0,...scored.map(x=>x.n));
 const files=new Set(scored.filter(x=>x.n===best).slice(0,MAX_FILES).map(x=>x.f));
 // Code that uses an identifier, in tracked text files (`git grep` exits 1 when nothing is found).
 if(query.identifiers.length){
  const plain=query.identifiers.filter(i=>!/[\/]/.test(i)&&/^[A-Za-z_][\w.]*$/.test(i));
  if(plain.length){const found=(await quiet(git,root,['grep','-l','-I','-F','--full-name',...plain.flatMap(i=>['-e',i]),'--'])).split('\n').filter(Boolean);for(const f of found.slice(0,MAX_FILES))files.add(f);}
 }
 const pathspec=[...files].slice(0,MAX_FILES);
 const byHash=new Map();
 const add=(list,kind)=>{for(const c of list){const old=byHash.get(c.hash);if(old){old.kinds.add(kind);continue;}byHash.set(c.hash,{...c,kinds:new Set([kind])});}};
 if(pathspec.length)add(parseLog(await git(root,['log','--no-merges','--no-renames',since,'-n',String(MAX_COMMITS),FORMAT,'--numstat','--',...pathspec])),'files');
 // Commit messages that name the subject (English words of four letters and more, identifiers).
 const words=[...query.paths.filter(w=>w.length>=4),...query.identifiers.filter(i=>/^[A-Za-z_]\w+$/.test(i))].slice(0,12);
 if(words.length)add(parseLog(await quiet(git,root,['log','--no-merges','--no-renames',since,'-n','200','-i','-F',...words.map(w=>'--grep='+w),FORMAT,'--numstat'])),'message');
 const head=(await quiet(git,root,['rev-parse','--verify','HEAD'])).trim();
 const remote=(await quiet(git,root,['remote','get-url','origin'])).trim();
 const links=web(remote);
 const commits=[...byHash.values()].map(c=>{
  // Lines in the subject's files; a commit found by its message counts its first files.
  const own=c.files.filter(f=>files.has(f.file));
  const used=own.length?own:c.files.slice(0,5);
  const lines=used.reduce((n,f)=>n+f.lines,0);
  const weight=recency(c.at,now)*(c.kinds.has('files')?1+Math.log10(1+lines):1);
  return {hash:c.hash,short:c.hash.slice(0,8),name:c.name,email:c.email,at:c.at,subject:c.subject,lines,files:used.map(f=>f.file).slice(0,20),fileLines:used,weight,byMessage:!c.kinds.has('files'),
   url:links?links.commit(c.hash):''};
 }).sort((a,b)=>b.at-a.at);
 return {root,name:require('node:path').basename(root),head,links:links?{base:links.base}:null,matchedFiles:files.size,commits,fileUrl:f=>links&&head?links.file(head,f):''};
}
module.exports={scan,parseLog,web,recency};
