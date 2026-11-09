// «Свежесть документации», the documents: Markdown of the project's repository (tracked files; ADRs, changelogs and
// vendored folders are history, not claims about the code), Confluence pages of the connected space, and Google Docs
// the «Google Диск» connection can read. Each → {id, source, title, path?, url?, dir?, edited (ISO), text}.
// Everything here only reads.
const fs=require('node:fs'),path=require('node:path');
const MAX_PROJECT=300,MAX_BYTES=300000,MAX_REMOTE=25;
const SKIP=/(?:^|\/)(?:node_modules|vendor|third[-_]?party|Library|Packages\/com\.|\.github)\/|(?:^|\/)docs\/adr\/|(?:^|\/)(?:CHANGELOG|CHANGES|HISTORY|LICENSE|NOTICE)[^/]*$/i;

async function project(r,{git}){
 const docs=r.files.filter(f=>/\.(?:md|markdown)$/i.test(f)&&!SKIP.test(f)).slice(0,MAX_PROJECT);
 let dirty=new Set();
 try{dirty=new Set((await git(r.dir,['status','--porcelain','-z','--','*.md','*.markdown'])).split('\0').filter(Boolean).map(l=>l.slice(3)));}catch{dirty=new Set();}
 const out=[];
 for(const f of docs){
  let text='';try{const full=path.join(r.dir,f);const st=fs.statSync(full);if(st.size>MAX_BYTES)continue;text=fs.readFileSync(full,'utf8');}catch{continue;}
  // Edited: the last commit touching it, or now when it has uncommitted changes.
  let edited='';
  if(dirty.has(f))edited=new Date().toISOString();
  else{try{const d=new Date((await git(r.dir,['log','-1','--format=%cI','--',f])).trim());edited=isNaN(d)?'':d.toISOString();}catch{edited='';}}
  out.push({id:'project:'+f,source:'project',title:f,path:f,dir:path.posix.dirname(f)==='.'?'':path.posix.dirname(f),edited,text});
 }
 return out;
}

// --- Confluence (shared Atlassian connection; the space chosen there) --------------------------------------------------
function confluenceReady(settings){
 let on;try{on=require('../../modules.cjs').enabled(settings,'confluence');}catch{on=settings.module_confluence!=='false';}
 return on&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
}
// Storage XHTML → text that keeps inline code as `code` and block structure as lines.
function storageText(html){
 return String(html||'')
  .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<\/ac:structured-macro>/gi,'\n```\n```\n')
  .replace(/<code>([\s\S]*?)<\/code>/gi,(m,c)=>'`'+c.replace(/<[^>]+>/g,'')+'`')
  .replace(/<(?:br|\/p|\/h\d|\/li|\/tr|\/pre)\b[^>]*>/gi,'\n').replace(/<li\b[^>]*>/gi,'- ').replace(/<[^>]+>/g,'')
  .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')
  .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
async function confluence(s){
 const settings=s.settings,space=String(settings.confluenceSpace||'').trim();
 if(!confluenceReady(settings))return {docs:[],used:false};
 if(!space)return {docs:[],used:false,note:'Confluence: выберите пространство в подключении Atlassian — проверяю только его.'};
 const cql='space = '+JSON.stringify(space)+' AND type = page ORDER BY lastmodified DESC';
 const r=await s.workspace.api('/wiki/rest/api/content/search?'+new URLSearchParams({cql,limit:String(MAX_REMOTE),expand:'body.storage,version'}),{},settings);
 const site=String(settings.jiraUrl).replace(/\/+$/,'');
 const docs=(r?.results||[]).filter(p=>p&&p.id).map(p=>({id:'confluence:'+p.id,source:'confluence',title:String(p.title||'Страница').slice(0,200),url:site+'/wiki/pages/viewpage.action?pageId='+encodeURIComponent(p.id),
  edited:String(p.version?.when||''),text:storageText(p.body?.storage?.value).slice(0,MAX_BYTES)}));
 return {docs,used:true};
}

// --- Google Docs («Google Диск» connection) --------------------------------------------------------------------------
async function google(s){
 if(s.settings['extension_google-drive']!=='true')return {docs:[],used:false};
 const auth=require('../google-drive/auth.cjs');
 if(!auth.connected(s.settings))return {docs:[],used:false};
 const {DriveClient,query}=require('../google-drive/client.cjs');
 const workspace=require('../../google-workspace.cjs');
 const client=new DriveClient({request:(url,o)=>s.request(url,o),token:()=>auth.token(s)});
 const list=await client.list({q:query({kind:'document',fullText:false}),order:'modifiedTime desc',size:MAX_REMOTE});
 const docs=[];
 for(const f of list.files.filter(x=>x.kind==='document').slice(0,MAX_REMOTE)){
  try{const d=workspace.docText(await client.document(f.id));docs.push({id:'google:'+f.id,source:'google',title:f.name,url:f.url,edited:f.modified,text:String(d.text||'').slice(0,MAX_BYTES)});}catch{}
 }
 return {docs,used:true};
}

module.exports={project,confluence,google,confluenceReady,storageText,SKIP};
