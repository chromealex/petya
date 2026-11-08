// Jira evidence for «Кто знает»: issues whose text mentions the subject (JQL `text ~`), with their assignee, reporter
// and commenters. Read-only, through the shared Jira connection (src/workspace.cjs `api`), limited to the projects
// chosen in Jira settings. REST: POST /rest/api/3/search/jql (enhanced search, nextPageToken paging).
const DAY=86400000;
const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';

function connected(settings={}){
 return settings.module_jira!=='false'&&!!settings.jiraUrl&&!!(settings.atlassianCredential||settings.jiraEmail&&settings.jiraToken);
}
function projects(settings={}){return String(settings.jiraProjects||settings.jiraProject||'').split(',').map(k=>k.trim()).filter(k=>/^[A-Z][A-Z0-9_]{0,30}$/.test(k));}

// JQL from search words: only letters, digits and «_» reach the query; Russian stems get a trailing wildcard.
function jql(words,keys){
 const clean=[...new Set(words.map(w=>String(w).replace(/[^\p{L}\p{N}_]/gu,'')).filter(w=>w.length>=3))].slice(0,8);
 if(!clean.length)return '';
 const text='('+clean.map(w=>'text ~ '+quote(/^[а-яё]+$/iu.test(w)?w+'*':w)).join(' OR ')+')';
 return (keys.length?'project IN ('+keys.map(quote).join(',')+') AND ':'')+text+' AND updated >= -730d ORDER BY updated DESC';
}

async function issues(s,words,{max=60}={}){
 const settings={...s.workspace.settings()};
 const query=jql(words,projects(settings));if(!query)return {issues:[],jql:''};
 const out=[];let token='';
 for(let page=0;page<2&&out.length<max;page++){
  const data=await s.workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:query,maxResults:Math.min(50,max-out.length),fields:['summary','status','assignee','reporter','updated','comment'],...token?{nextPageToken:token}:{}})},settings);
  if(!Array.isArray(data?.issues))throw Error('Jira вернула неизвестный ответ на поиск задач.');
  out.push(...data.issues);
  if(data.isLast!==false||!data.nextPageToken)break;token=data.nextPageToken;
 }
 const site=String(settings.jiraUrl||'').replace(/\/+$/,'');
 return {jql:query,site,issues:out.map(i=>{
  const f=i.fields||{},user=u=>u?.accountId?{jira:u.accountId,name:String(u.displayName||''),email:u.emailAddress||''}:null;
  const comments=(f.comment?.comments||[]).map(c=>({author:user(c.author),at:Date.parse(c.created)||0})).filter(c=>c.author);
  return {key:String(i.key||''),summary:String(f.summary||'').slice(0,200),status:String(f.status?.name||''),updated:Date.parse(f.updated)||0,
   assignee:user(f.assignee),reporter:user(f.reporter),comments,url:site&&/^[A-Z][A-Z0-9_]*-\d+$/.test(i.key)?site+'/browse/'+i.key:''};
 })};
}
module.exports={connected,projects,jql,issues,DAY};
