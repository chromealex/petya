// Roles and responsibilities for team cards that came with names only (the Slack sidebar, Jira assignees):
// the Slack profile title is the role; the components and labels of the person's recent Jira issues are what
// they work on. Every value is copied from the service, never guessed.
const team=require('./team.cjs');
const norm=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
// Slack: one users.list walk (a single API method, light on rate limits); a limit or an error leaves cards as they are.
async function slackProfiles(settings,request){
 const token=settings.slackToken||'';if(settings.module_slack==='false'||!token)return [];
 const out=[];let cursor='';
 for(let page=0;page<10;page++){
  const data=await request('https://slack.com/api/users.list?'+new URLSearchParams({limit:'200',...cursor?{cursor}:{}}),{headers:{Authorization:'Bearer '+token}});
  if(!data?.ok||!Array.isArray(data.members))break;
  for(const u of data.members){if(u.deleted||u.is_bot||u.is_app_user||u.id==='USLACKBOT')continue;const p=u.profile||{};
   out.push({slackId:u.id,names:[p.real_name,u.real_name,p.display_name,u.name].filter(Boolean).map(norm),name:String(p.real_name||u.real_name||'').trim(),title:String(p.title||'').trim(),email:typeof p.email==='string'?p.email:''});}
  cursor=String(data.response_metadata?.next_cursor||'').trim();if(!cursor)break;
 }
 return out;
}
// Jira: components and labels of the person's issues in the last 90 days, most frequent first.
async function jiraWork(workspace,people){
 const s={...workspace.settings()};if(s.module_jira==='false'||!s.jiraUrl)return new Map();
 const allowed=String(s.jiraProjects||s.jiraProject||'').split(',').map(k=>k.trim()).filter(Boolean);if(!allowed.length)return new Map();
 const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
 const r=await workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:'project IN ('+allowed.map(quote).join(',')+') AND assignee IS NOT EMPTY AND updated >= -90d ORDER BY updated DESC',maxResults:100,fields:['assignee','components','labels','project']})},s);
 const work=new Map();
 for(const issue of r?.issues||[]){const a=issue.fields?.assignee;if(!a?.accountId)continue;const w=work.get(a.accountId)||{name:norm(a.displayName),email:a.emailAddress||'',projects:new Map(),topics:new Map()};
  const key=issue.fields?.project?.key;if(key)w.projects.set(key,(w.projects.get(key)||0)+1);
  for(const t of [...(issue.fields?.components||[]).map(c=>c?.name),...(issue.fields?.labels||[])].filter(Boolean))w.topics.set(t,(w.topics.get(t)||0)+1);
  work.set(a.accountId,w);}
 return work;
}
const top=(map,n)=>[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);
// Fills only empty fields; the evidence says where each value came from.
function enrich(rows,profiles=[],work=new Map()){
 return rows.map(row=>{const m={...row.member},notes=[];
  const name=norm(m.name);
  const profile=profiles.find(p=>m.slackId&&p.slackId===m.slackId)||profiles.find(p=>p.names.includes(name));
  if(profile){if(!m.role&&profile.title){m.role=profile.title;notes.push('роль из профиля Slack');}if(!m.slackId)m.slackId=profile.slackId;if(!m.email&&profile.email)m.email=profile.email;}
  const job=(m.jiraId&&work.get(m.jiraId))||[...work.entries()].find(([,w])=>w.name===name||profile&&profile.names.includes(w.name))?.[1];
  const id=m.jiraId||[...work.entries()].find(([,w])=>w===job)?.[0];
  if(job){if(!m.jiraId&&id)m.jiraId=id;if(!m.projects&&job.projects.size)m.projects=top(job.projects,4).join(', ');
   const topics=top(job.topics,4);if(!m.responsibilities&&topics.length){m.responsibilities=topics.join(', ');notes.push('обязанности по компонентам и меткам задач Jira');}
   if(!m.email&&job.email)m.email=job.email;}
  let member=row.member;try{member=team.validate([m])[0];}catch{}
  return {...row,member,evidence:row.evidence+(notes.length?' · '+notes.join(', '):'')};});
}
module.exports={slackProfiles,jiraWork,enrich};
