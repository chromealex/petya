// «Что изменилось в документе», where the document and its versions come from. Only reads.
// - git: a Markdown file of the chat project's repository — `git log` of that file, `git show <rev>:<path>` for each
//   version, uncommitted edits as the newest version (git runs with argument lists, no shell);
// - Confluence Cloud REST v2: `GET /wiki/api/v2/pages/{id}/versions`, `GET /wiki/api/v2/pages/{id}?body-format=storage
//   &version=N` for a version's body, `POST /wiki/api/v2/users-bulk` for authors' names;
// - Google Docs through Drive API v3 with the read-only scope of «Google Диск»: `files.get`, `revisions.list`
//   (`fields=revisions(id,modifiedTime,lastModifyingUser,exportLinks)`) and a revision's export link (Markdown when
//   Google offers it, else plain text).
// Each history → {doc, versions:[{id, label, author, at, text}], base, notes}; `versions` are oldest first, `base` is the
// text before the first of them.
const {execFile}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const diff=require('./diff.cjs');
const MAX_VERSIONS=12,MAX_BYTES=400000;

function runGit(dir,args){
 return new Promise((resolve,reject)=>execFile('git',['-C',dir,...args],{timeout:20000,maxBuffer:16e6,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',LC_ALL:'C',GIT_OPTIONAL_LOCKS:'0'}},(e,out)=>e?reject(e):resolve(String(out||''))));
}
const show=async(git,dir,rev,rel)=>{try{return (await git(dir,['show',rev+':'+rel])).slice(0,MAX_BYTES);}catch{return '';}};

// --- git ----------------------------------------------------------------------------------------------------------------
// range: {mode:'period', since:Date} | {mode:'previous'}
async function gitHistory({dir,rel},range,{git=runGit,now=new Date()}={}){
 const full=path.join(dir,rel);
 const head=fs.existsSync(full)?fs.readFileSync(full,'utf8').slice(0,MAX_BYTES):'';
 let dirty=false;try{dirty=!!(await git(dir,['status','--porcelain','--',rel])).trim();}catch{dirty=false;}
 const fmt=['log','--format=%H%x1f%an%x1f%aI%x1f%s'];
 const parse=out=>out.split('\n').filter(Boolean).map(l=>{const [sha,author,at,subject]=l.split('\x1f');return {sha,author,at:new Date(at).toISOString(),subject};});
 let commits=[];const notes=[];
 if(range.mode==='period'){
  commits=parse(await git(dir,[...fmt,'--since='+range.since.toISOString(),'--until='+now.toISOString(),'--',rel])).reverse();
 }else if(!dirty){
  commits=parse(await git(dir,[...fmt,'-1','--',rel]));
 }
 if(commits.length>MAX_VERSIONS){notes.push('Показаны последние '+MAX_VERSIONS+' правок из '+commits.length+'.');commits=commits.slice(-MAX_VERSIONS);}
 // The text before the first version: the parent of the oldest commit, or HEAD when only uncommitted edits count.
 let base='';
 if(commits.length)base=await show(git,dir,commits[0].sha+'^',rel);
 else if(dirty)base=await show(git,dir,'HEAD',rel);
 const versions=[];
 for(const c of commits)versions.push({id:c.sha.slice(0,8),label:c.subject.slice(0,120),author:c.author,at:c.at,text:await show(git,dir,c.sha,rel),url:''});
 if(dirty)versions.push({id:'worktree',label:'Несохранённые правки',author:'',at:now.toISOString(),text:head,local:true});
 let web='';try{const r=(await git(dir,['remote','get-url','origin'])).trim();const m=/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i.exec(r);web=m?'https://github.com/'+m[1]:'';}catch{web='';}
 if(web)for(const v of versions)if(!v.local)v.url=web+'/commit/'+commits.find(c=>c.sha.startsWith(v.id)).sha;
 return {doc:{source:'git',title:rel,path:rel,repo:path.basename(dir),url:web?web+'/blob/HEAD/'+rel.split('/').map(encodeURIComponent).join('/'):''},base,versions,notes};
}

// --- Confluence -------------------------------------------------------------------------------------------------------
async function confluenceHistory(s,{id},range){
 const settings={...s.settings},api=(route,o={})=>s.workspace.api(route,o,settings);
 const page=await api('/wiki/api/v2/pages/'+encodeURIComponent(id)+'?body-format=storage');
 const current=Number(page?.version?.number)||0;
 if(!current)throw Error('Confluence не вернул версию страницы.');
 const list=[];
 let route='/wiki/api/v2/pages/'+encodeURIComponent(id)+'/versions?'+new URLSearchParams({limit:'50',sort:'-modified-date'});
 for(let i=0;i<4&&route;i++){
  const r=await api(route);
  list.push(...(r?.results||[]));
  const next=String(r?._links?.next||'');route=next.startsWith('/wiki/')?next:next?'/wiki'+next:'';
  if(range.mode==='previous'||list.some(v=>Date.parse(v.createdAt)<+range.since))break;
 }
 const all=list.map(v=>({number:Number(v.number),at:new Date(v.createdAt).toISOString(),authorId:String(v.authorId||''),message:String(v.message||'')})).filter(v=>v.number>0).sort((a,b)=>a.number-b.number);
 let picked=range.mode==='period'?all.filter(v=>Date.parse(v.at)>=+range.since):all.filter(v=>v.number===current);
 const notes=[];
 if(picked.length>MAX_VERSIONS){notes.push('Показаны последние '+MAX_VERSIONS+' правок из '+picked.length+'.');picked=picked.slice(-MAX_VERSIONS);}
 const ids=[...new Set(picked.map(v=>v.authorId).filter(Boolean))];
 const names={};
 if(ids.length){try{const r=await api('/wiki/api/v2/users-bulk',{method:'POST',body:JSON.stringify({accountIds:ids})});for(const u of r?.results||[])names[u.accountId]=String(u.displayName||u.publicName||'');}catch{/* names stay unknown */}}
 const body=async n=>{if(n===current)return diff.storageToMarkdown(page?.body?.storage?.value);const r=await api('/wiki/api/v2/pages/'+encodeURIComponent(id)+'?'+new URLSearchParams({'body-format':'storage',version:String(n)}));return diff.storageToMarkdown(r?.body?.storage?.value);};
 const first=picked[0]?.number||current;
 const base=first>1?await body(first-1):'';
 const versions=[];
 for(const v of picked)versions.push({id:'v'+v.number,label:v.message?'Версия '+v.number+' · '+v.message.slice(0,100):'Версия '+v.number,author:names[v.authorId]||'',at:v.at,text:await body(v.number)});
 const site=String(settings.jiraUrl||'').replace(/\/+$/,'');
 return {doc:{source:'confluence',title:String(page.title||'Страница'),id:String(id),url:site?site+'/wiki/pages/viewpage.action?pageId='+encodeURIComponent(id):''},base,versions,notes};
}

// --- Google Docs ------------------------------------------------------------------------------------------------------
async function googleHistory(s,{id},range,{fetchText}={}){
 const auth=require('../google-drive/auth.cjs');
 const {DriveClient,DRIVE}=require('../google-drive/client.cjs');
 const token=()=>auth.token(s);
 const client=new DriveClient({request:(url,o)=>s.request(url,o),token});
 const file=await client.get(id);
 const r=await client.call(DRIVE+'/files/'+id+'/revisions',{query:new URLSearchParams({pageSize:'200',fields:'revisions(id,modifiedTime,lastModifyingUser(displayName,emailAddress),exportLinks)'})});
 const all=(r?.revisions||[]).map(v=>({id:String(v.id),at:new Date(v.modifiedTime).toISOString(),author:String(v.lastModifyingUser?.displayName||v.lastModifyingUser?.emailAddress||''),links:v.exportLinks||{}})).sort((a,b)=>a.at.localeCompare(b.at));
 if(!all.length)throw Error('Google не вернул ревизии документа.');
 let picked=range.mode==='period'?all.filter(v=>Date.parse(v.at)>=+range.since):all.slice(-1);
 const notes=[];
 if(picked.length>MAX_VERSIONS){notes.push('Показаны последние '+MAX_VERSIONS+' ревизий из '+picked.length+'.');picked=picked.slice(-MAX_VERSIONS);}
 const read=async v=>{
  const url=v.links['text/markdown']||v.links['text/plain'];
  if(!url)return '';
  const text=await (fetchText||defaultFetch)(url,await token());
  return String(text||'').replace(/\r\n?/g,'\n').slice(0,MAX_BYTES);
 };
 const at=all.indexOf(picked[0]);
 const base=at>0?await read(all[at-1]):'';
 const versions=[];
 for(const v of picked)versions.push({id:'r'+v.id,label:'Ревизия '+v.id,author:v.author,at:v.at,text:await read(v)});
 if(picked.some(v=>!v.links['text/markdown']))notes.push('Google отдал ревизии простым текстом: разделы видны только по строкам.');
 return {doc:{source:'google',title:file.name,id,url:file.url},base,versions,notes};
}
// A revision's export link answers text; only Google hosts, with the read token.
async function defaultFetch(url,token){
 const u=new URL(url);
 if(u.protocol!=='https:'||!/(?:^|\.)(?:google\.com|googleapis\.com|googleusercontent\.com)$/.test(u.hostname))throw Error('Неожиданная ссылка ревизии Google.');
 const r=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});
 if(!r.ok){const e=Error('Google не отдал ревизию (HTTP '+r.status+').');e.status=r.status;throw e;}
 if(!/(?:^|\.)(?:google\.com|googleapis\.com|googleusercontent\.com)$/.test(new URL(r.url||url).hostname))throw Error('Неожиданный адрес ревизии Google.');
 return r.text();
}

// --- The comparison ----------------------------------------------------------------------------------------------------
// The base against the newest version, each changed section with who changed it and when (from the version steps).
function changes(history){
 const texts=[history.base,...history.versions.map(v=>v.text)];
 const hunks=diff.compare(history.base,texts[texts.length-1]);
 const touched=new Map();
 history.versions.forEach((v,i)=>{
  for(const h of diff.compare(texts[i],texts[i+1])){const list=touched.get(h.key)||[];list.push({author:v.author,at:v.at,id:v.id});touched.set(h.key,list);}
 });
 for(const h of hunks){
  const list=touched.get(h.key)||[];
  h.by=[...new Set(list.map(x=>x.author).filter(Boolean))].slice(0,5);
  h.at=list.map(x=>x.at).sort().pop()||history.versions.at(-1)?.at||'';
  h.versions=list.map(x=>x.id);
 }
 return hunks;
}

module.exports={runGit,gitHistory,confluenceHistory,googleHistory,changes,MAX_VERSIONS};
