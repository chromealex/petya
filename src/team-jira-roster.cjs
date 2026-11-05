// The team from Jira: people assigned to issues of the allowed projects in the last 90 days, with their
// Jira account, e-mail when visible, and the projects they work in. Used by «Заполни команду» when Slack and
// saved messages give nothing (or Slack is rate-limited).
async function roster(workspace,live){
 const s={...workspace.settings()};
 if(s.module_jira==='false'||!s.jiraUrl)return null;
 const allowed=String(s.jiraProjects||s.jiraProject||'').split(',').map(k=>k.trim()).filter(Boolean);
 if(!allowed.length)return null;
 const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
 const jql='project IN ('+allowed.map(quote).join(',')+') AND assignee IS NOT EMPTY AND updated >= -90d ORDER BY updated DESC';
 const people=new Map();let token;
 for(let page=0;page<5;page++){
  const r=await workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql,maxResults:100,fields:['assignee','project'],...token?{nextPageToken:token}:{}})},s);
  for(const issue of r?.issues||[]){const a=issue.fields?.assignee,key=issue.fields?.project?.key;if(!a?.accountId||a.active===false||a.accountType&&a.accountType!=='atlassian')continue;
   const p=people.get(a.accountId)||{name:String(a.displayName||'').trim(),email:a.emailAddress||'',projects:new Map()};p.projects.set(key,(p.projects.get(key)||0)+1);people.set(a.accountId,p);}
  if(r?.isLast!==false||!r?.nextPageToken)break;token=r.nextPageToken;
 }
 return [...people.entries()].filter(([,p])=>p.name).map(([id,p])=>{const projects=[...p.projects.entries()].sort((a,b)=>b[1]-a[1]);const total=projects.reduce((n,[,c])=>n+c,0);
  return {member:{name:p.name,aliases:'',role:'',projects:projects.map(([k])=>k).join(', '),responsibilities:'',email:p.email,slackId:'',jiraId:id,jiraName:p.name},
   evidence:'Jira: исполнитель '+total+' задач за 90 дней ('+projects.map(([k,c])=>k+' — '+c).join(', ')+')',source:'Jira'};});
}
module.exports={roster};
