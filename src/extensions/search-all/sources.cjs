// «Поиск по всему», the app's own (core) sources. Each is read-only and uses what Petya already has:
// - memory: what Petya keeps in the company's context memory — Slack threads, Telegram chats, mail, Jira/Confluence/
//   Notion pages the user saved, recorded meeting speech, other materials (per message or speech segment);
// - mail: Gmail search (messages.list q=) of every connected Google account and Outlook (Graph /me/messages?$search);
// - files: a bounded text search in the chat project's folders (skips build/vendor folders, binary and large files),
//   plus files found by meaning in the semantic index.
// Sources that belong to other apps (Slack search, Confluence/Notion, Jira, the glossary, Google Drive, …) are
// declared by those apps as `search-source` providers (registry.cjs). An adapter returns
// {items:[{source, id, title, text, url, at, meta}], note?, state?}. Timeouts and failures are handled by the caller;
// each source is reported on the card with its count or why it is missing.
const fs=require('node:fs');
const path=require('node:path');
const Q=require('./query.cjs');
const {isMeeting}=require('../../meeting-talk.cjs');
const one=v=>String(v??'').replace(/\s+/g,' ').trim();
const https=u=>/^https:\/\//.test(String(u||''))?String(u):'';

// Which list a stored material belongs to.
function kindOf(item){
 if(isMeeting(item))return 'meetings';
 const s=String(item.source||'');
 if(/^slack/i.test(s))return 'slack';if(/^telegram/i.test(s))return 'telegram';if(/gmail|почт|outlook|mail/i.test(s))return 'mail';
 if(/jira/i.test(s))return 'jira';if(/confluence/i.test(s))return 'confluence';if(/notion/i.test(s))return 'notion';return 'notes';
}
// A Slack message link from its thread link and ts (…/archives/C1/p<ts>, thread_ts for a reply).
function slackLink(threadUrl,ts){
 try{
  const u=new URL(threadUrl);if(u.protocol!=='https:'||!/(?:^|\.)slack\.com$/.test(u.hostname))return '';
  const root=/\/p(\d{16})$/.exec(u.pathname)?.[1],digits=String(ts||'').replace('.','');
  if(!root||!/^\d{16}$/.test(digits))return u.href;
  return u.origin+u.pathname.replace(/p\d{16}$/,'p'+digits)+(digits!==root?'?thread_ts='+root.slice(0,10)+'.'+root.slice(10):'');
 }catch{return '';}
}
function memoryItems(s){try{return s.memory?.prune?.()||[];}catch{return [];}}

// Context memory, filtered by the terms first (a cheap regular expression), then split into messages and segments.
function memory(s,terms){
 const re=Q.pattern(terms);if(!re)return {items:[],kinds:new Set()};
 const has=text=>{re.lastIndex=0;return re.test(Q.norm(text));};
 const items=[],kinds=new Set();
 for(const m of memoryItems(s)){
  const kind=kindOf(m);kinds.add(kind);
  if(Array.isArray(m.messages)&&m.messages.length){
   for(const x of m.messages){
    if(!has(x.text))continue;
    const url=kind==='slack'?slackLink(m.url,x.ts):https(m.url);
    items.push({source:kind,id:kind+':'+m.id+':'+(x.ts||x.id||x.at),title:one(m.title).slice(0,140)||(kind==='slack'?'Slack':'Telegram'),text:String(x.text||'').slice(0,4000),url,at:Number(x.at)||Number(m.at)||0,meta:one(x.user).slice(0,80)+(m.channel?' · #'+one(m.channel).slice(0,60):''),thread:m.id});
   }
   continue;
  }
  if(!has(m.text)&&!has(m.title))continue;
  if(kind==='meetings'){
   items.push({source:'meetings',id:'meetings:'+m.id,title:one(m.title).replace(/\s+·\s+.*$/,'').slice(0,140)||'Встреча',text:String(m.text||'').slice(0,4000),url:'',at:Number(m.at)||0,meta:one(m.speaker).slice(0,80),thread:m.sessionId||m.id});
   continue;
  }
  items.push({source:kind,id:kind+':'+m.id,title:one(m.title).slice(0,160)||one(m.source),text:String(m.text||'').slice(0,6000),url:https(m.url),at:Number(m.at)||0,meta:kind==='notes'?one(m.source).slice(0,60):''});
 }
 return {items,kinds};
}

function mailAccounts(s){try{return s.mailAccounts?.accounts?.()||[];}catch{return [];}}
async function mail(s,words){
 const accounts=mailAccounts(s),out=[],notes=[];
 const google=accounts.filter(a=>a.provider==='Google'),microsoft=accounts.filter(a=>a.provider==='Microsoft');
 // Gmail: any of the words ({a b} is OR), the last two years.
 const q='{'+words.slice(0,6).map(w=>/\s/.test(w)?'"'+w.replace(/"/g,'')+'"':w).join(' ')+'} newer_than:2y';
 await Promise.all([
  ...google.map(async a=>{
   try{const rows=await s.mailAccounts.google.client(a.id).search(q,6);
    for(const m of rows)out.push({source:'mail',id:'mail:'+m.id,title:one(m.subject).slice(0,200)||'(без темы)',text:String(m.text||'').slice(0,6000),url:/^[a-f0-9]+$/i.test(m.id)?'https://mail.google.com/mail/u/'+encodeURIComponent(a.email||0)+'/#all/'+m.id:'',at:Number(m.at)||Date.parse(m.date)||0,meta:one(m.from).slice(0,120)});}
   catch(e){notes.push((a.email||'Gmail')+': '+e.message);}
  }),
  ...microsoft.map(async a=>{
   try{
    const client=s.mailAccounts.microsoft.client(a.id.replace(/^microsoft:/,''));
    const token=await client.access();
    const search='"'+words.slice(0,6).map(w=>w.replace(/["\\]/g,'')).join(' OR ')+'"';
    const r=await client.json('https://graph.microsoft.com/v1.0/me/messages?$search='+encodeURIComponent(search)+'&$top=8&$select=id,subject,from,receivedDateTime,bodyPreview,webLink',{headers:{Authorization:'Bearer '+token}});
    for(const m of r?.value||[])out.push({source:'mail',id:'outlook:'+m.id,title:one(m.subject).slice(0,200)||'(без темы)',text:String(m.bodyPreview||'').slice(0,4000),url:https(m.webLink),at:Date.parse(m.receivedDateTime)||0,meta:one(m.from?.emailAddress?.name||m.from?.emailAddress?.address).slice(0,120)});
   }catch(e){notes.push((a.email||'Outlook')+': '+e.message);}
  })
 ]);
 if(!out.length&&notes.length&&notes.length===accounts.length)throw Error(notes.join('; '));
 return {items:out,note:notes.join('; ')};
}

// Project folders of the current chat.
function projectRoots(s){
 try{
  const state=s.dialogue.state,topic=s.dialogue.active();
  const project=state.projects?.find(p=>p.id===(topic?.projectId||state.activeProjectId));
  return require('../../project-folders.cjs').projectFolders(project,s.projectMemory?.get?.(project?.memoryId||topic?.projectMemoryId)).filter(p=>{try{return fs.statSync(p).isDirectory();}catch{return false;}});
 }catch{return [];}
}
const SKIP=new Set(['node_modules','.git','.svn','.hg','Library','Temp','Logs','obj','Obj','bin','Build','build','Builds','dist','out','.idea','.vs','.vscode','.gradle','Pods','DerivedData','__pycache__','.venv','venv','.next','coverage','target','.cache','vendor','Packages','UserSettings','MemoryCaptures']);
const TEXT=/\.(?:md|markdown|txt|rst|adoc|json|ya?ml|toml|ini|cfg|conf|xml|csv|tsv|cs|js|cjs|mjs|ts|tsx|jsx|py|java|kt|kts|swift|m|mm|h|hpp|c|cc|cpp|go|rs|rb|php|lua|gd|shader|hlsl|glsl|cginc|sql|html|css|scss|sh|ps1|bat|gradle|asmdef|uxml|uss|po|strings|properties|proto|graphql|tf)$/i;
// Files whose text or path mentions the terms: a breadth-first walk with limits on files, bytes and time.
async function files(s,terms,{roots=projectRoots(s),deadline=Date.now()+3500,maxFiles=4000,maxBytes=40*1024*1024,maxFileBytes=512*1024}={}){
 if(!roots.length)return {state:'off',items:[],note:'У проекта чата нет папки на компьютере.'};
 const re=Q.pattern(terms);if(!re)return {items:[]};
 const out=[];let read=0,bytes=0,stopped='';
 const queue=roots.map(r=>({dir:r,root:r,depth:0}));
 while(queue.length&&!stopped){
  const {dir,root,depth}=queue.shift();
  let entries=[];try{entries=await fs.promises.readdir(dir,{withFileTypes:true});}catch{continue;}
  for(const e of entries){
   if(Date.now()>deadline){stopped='время';break;}
   if(e.name.startsWith('.')&&e.name!=='.github')continue;
   const full=path.join(dir,e.name);
   if(e.isDirectory()){if(!SKIP.has(e.name)&&depth<12)queue.push({dir:full,root,depth:depth+1});continue;}
   if(!e.isFile()||!TEXT.test(e.name))continue;
   if(read>=maxFiles){stopped='файлы';break;}
   let stat;try{stat=await fs.promises.stat(full);}catch{continue;}
   if(stat.size>maxFileBytes)continue;
   if(bytes+stat.size>maxBytes){stopped='объём';break;}
   read++;bytes+=stat.size;
   const rel=path.relative(root,full);
   let text;try{text=await fs.promises.readFile(full,'utf8');}catch{continue;}
   if(text.includes('\u0000'))continue;
   re.lastIndex=0;const inPath=re.test(Q.norm(rel));re.lastIndex=0;
   const lines=[];
   if(re.test(Q.norm(text))){
    const all=text.split('\n');
    for(let i=0;i<all.length&&lines.length<4;i++){re.lastIndex=0;if(re.test(Q.norm(all[i])))lines.push({line:i+1,text:all[i].trim().slice(0,300)});}
   }
   if(!lines.length&&!inPath)continue;
   out.push({source:'files',id:'file:'+full,title:rel,text:lines.map(l=>l.text).join('\n'),url:'',at:stat.mtimeMs,meta:lines.length?'строка '+lines[0].line:'',path:full,line:lines[0]?.line||0});
   if(out.length>=60){stopped='совпадения';break;}
  }
 }
 return {items:out,note:stopped?'Поиск в файлах остановлен по лимиту ('+stopped+'): прочитано '+read+' файлов.':'',read};
}

// Files found by meaning in the semantic index (s.semanticIndex, collection «files» of «Поиск файлов по смыслу»),
// limited to the chat project's folders like the word search. Nothing when the index is absent, off or not ready.
async function indexedFiles(s,question,{roots=projectRoots(s),k=10}={}){
 const index=s.semanticIndex;
 if(!index?.enabled?.('files')||!roots.length)return [];
 const r=await index.search('files',question,{k,filter:{pathPrefix:roots.map(r=>r.endsWith(path.sep)?r:r+path.sep)}});
 return (r?.hits||[]).filter(h=>h.meta?.path).map(h=>{
  const full=h.meta.path,root=roots.find(r=>full.startsWith(r+path.sep))||path.dirname(full),l=h.loc||{};
  const where=l.slide?'слайд '+l.slide:l.page?'стр. '+l.page:l.line?'строка '+l.line:'';
  return {source:'files',id:'file:'+full,title:path.relative(root,full),text:String(h.text||'').slice(0,1200),url:'',at:Number(h.meta.mtime)||0,meta:where?where+' · по смыслу':'по смыслу',path:full,line:l.line||0};
 });
}
module.exports={memory,mail,mailAccounts,files,indexedFiles,projectRoots,kindOf,slackLink,memoryItems};
