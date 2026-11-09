// «Что изменилось в документе», which document the request means: a pasted Google Docs or Confluence link, a Markdown
// path, or a name («GDD», «спека лиг», «README») looked up among the chat project's tracked Markdown, the connected
// Confluence space's page titles and Google Docs names. Several equally good candidates are a question, never a guess.
const fs=require('node:fs'),path=require('node:path');
const diff=require('./diff.cjs');
const {runGit}=require('./history.cjs');

const GDD=/(?:^|[^\p{L}])(?:gdd|гдд|диздок\p{L}*|геймдизайн\p{L}*|game[\s_-]*design\p{L}*)(?=$|[^\p{L}])/iu;
const GDD_FILE=/(?:^|\/)(?:gdd|game[-_ ]?design[^/]*|геймдизайн[^/]*|диздок[^/]*)(?:\/[^/]*)?\.(?:md|markdown)$/i;
// Words of a document's name in a request («спеку лиг» → «лиг»; README stays).
const GENERIC=/^(?:спек\p{L}*|спецификаци\p{L}*|документ\p{L}*|доку?|страниц\p{L}*|вики|wiki|confluence|конфлюенс\p{L}*|гугл|google|docs?|док\p{L}*|описани\p{L}*|регламент\p{L}*|файл\p{L}*|наш\p{L}*|мо[йяеи]\p{L}*|в|во|на|по|про|о|об|для|из|с|со|и|this|the)$/iu;
function name(subject){
 const t=String(subject||'').replace(/[«»"“”]/g,' ').trim();
 if(GDD.test(t))return {gdd:true,words:['gdd'],text:t};
 const list=t.split(/\s+/).filter(w=>w&&!GENERIC.test(w));
 return {gdd:false,words:list,text:list.join(' ')};
}
function links(text){
 const t=String(text||'');
 const g=require('../../google-workspace.cjs').parseLink(t);
 if(g?.kind==='document')return {source:'google',id:g.id,url:g.url};
 const c=/https?:\/\/[\w.:-]+\/wiki\/(?:spaces\/[^/\s]+\/pages\/(\d+)|pages\/viewpage\.action\?(?:[^\s#]*&)?pageId=(\d+))/i.exec(t);
 if(c)return {source:'confluence',id:c[1]||c[2],url:c[0]};
 const f=/(?:^|[\s«"(])((?:[\w@.-]+\/)*[\w@.-]+\.(?:md|markdown))(?=$|[\s»")?,.!])/i.exec(t);
 if(f)return {source:'git',file:f[1]};
 return null;
}

const repos=roots=>roots.filter(d=>{try{return fs.existsSync(path.join(d,'.git'));}catch{return false;}});
function projectRoots(s){try{return require('../localization/find.cjs').projectRoots(s);}catch{return [];}}

// Tracked Markdown of the project's repositories that fits the name.
async function gitCandidates(s,n,{git=runGit,file}={}){
 const out=[];
 for(const dir of repos(projectRoots(s)).slice(0,4)){
  let files=[];try{files=(await git(dir,['ls-files','-z','--','*.md','*.markdown'])).split('\0').filter(Boolean).slice(0,3000);}catch{continue;}
  for(const rel of files){
   if(/(?:^|\/)(?:node_modules|vendor|Library|Packages)\//.test(rel))continue;
   let score=0;
   if(file)score=rel===file||rel.endsWith('/'+file)?10:path.posix.basename(rel)===path.posix.basename(file)?6:0;
   else if(n.gdd)score=GDD_FILE.test(rel)?8:0;
   else if(n.words.length){
    const base=rel.replace(/\.(?:md|markdown)$/i,'');
    score=diff.overlap(n.text,base)*3;
    if(score&&/^readme$/i.test(path.posix.basename(base))&&!/readme|ридми/i.test(n.text))score=0;
    if(!score&&/readme|ридми/i.test(n.text)&&/^readme$/i.test(path.posix.basename(base)))score=rel.includes('/')?2:4;
    if(score&&/(?:^|\/)docs?\//i.test(rel))score+=1;
   }
   if(score>0)out.push({source:'git',dir,rel,title:rel,label:rel+' · '+path.basename(dir),score});
  }
 }
 return out;
}
function confluenceReady(settings){
 let on;try{on=require('../../modules.cjs').enabled(settings,'confluence');}catch{on=settings.module_confluence!=='false';}
 return on&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
}
async function confluenceCandidates(s,n){
 if(!s.workspace?.api||!confluenceReady(s.settings))return [];
 const terms=n.gdd?['GDD','геймдизайн','Game Design']:[...new Set([...n.words.map(w=>diff.stem(diff.norm(w))),...[...diff.concepts(n.text)].filter(c=>/^[a-z]{4,}$/.test(c))])].filter(w=>/^[\p{L}\p{N} ]{3,40}$/u.test(w)).slice(0,6);
 if(!terms.length)return [];
 const space=String(s.settings.confluenceSpace||'').trim();
 const cql='type = page AND ('+terms.map(t=>'title ~ '+JSON.stringify(/^[\p{L}]+$/u.test(t)&&t.length>=4?t+'*':t)).join(' OR ')+')'+(space?' AND space = '+JSON.stringify(space):'')+' ORDER BY lastmodified DESC';
 const r=await s.workspace.api('/wiki/rest/api/content/search?'+new URLSearchParams({cql,limit:'10'}),{},{...s.settings});
 return (r?.results||[]).filter(p=>p?.id).map(p=>{const title=String(p.title||'');const score=n.gdd?(GDD.test(title)?8:3):diff.overlap(n.text,title)*3;return {source:'confluence',id:String(p.id),title,label:title+' · Confluence',score};}).filter(c=>c.score>0);
}
async function googleCandidates(s,n){
 if(s.settings['extension_google-drive']!=='true'||!s.googleDrive?.search)return [];
 try{if(!require('../google-drive/auth.cjs').connected(s.settings))return [];}catch{return [];}
 const query=n.gdd?'GDD':n.words.join(' ');if(!query.trim())return [];
 const files=await s.googleDrive.search(query,{kind:'document',size:10});
 return (files||[]).filter(f=>f.kind==='document').map(f=>{const score=n.gdd?(GDD.test(f.name)?8:3):Math.max(1,diff.overlap(n.text,f.name))*3;return {source:'google',id:f.id,title:f.name,label:f.name+' · Google Документы',score};});
}

// → {one} | {many:[…]} | {none:true, notes}
async function resolve(s,subject,{git=runGit}={}){
 const link=links(subject);
 if(link?.source==='google')return {one:{source:'google',id:link.id,title:'Google Документ',label:'Google Документ'}};
 if(link?.source==='confluence')return {one:{source:'confluence',id:link.id,title:'Страница Confluence',label:'Страница Confluence'}};
 const n=name(subject);
 if(!n.gdd&&!n.words.length&&!link)return {none:true,notes:[]};
 const notes=[];
 const all=[];
 const tries=[gitCandidates(s,n,{git,file:link?.file})];
 if(!link)tries.push(confluenceCandidates(s,n),googleCandidates(s,n));
 const names=['Репозиторий','Confluence','Google Диск'];
 (await Promise.allSettled(tries)).forEach((r,i)=>{if(r.status==='fulfilled')all.push(...r.value);else notes.push(names[i]+': '+r.reason.message);});
 if(!all.length)return {none:true,notes};
 all.sort((a,b)=>b.score-a.score);
 const top=all.filter(c=>c.score===all[0].score);
 return top.length===1?{one:top[0]}:{many:top.slice(0,8),notes};
}

module.exports={resolve,name,links,GDD,GDD_FILE,projectRoots,repos,confluenceReady};
