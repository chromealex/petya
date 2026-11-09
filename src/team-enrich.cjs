// Roles and responsibilities for team cards that came with names only (a service sidebar, Jira assignees):
// the service profile title is the role (profiles from a team source, src/team-sources.cjs, e.g. the Slack app); the components and labels of the person's recent Jira issues are what
// they work on. Every value is copied from the service, never guessed.
const team=require('./team.cjs');
const norm=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
// Jira: components and labels of the person's issues in the last 90 days, most frequent first.
async function jiraWork(workspace,people){
 const s={...workspace.settings()};if(s.module_jira==='false'||!s.jiraUrl)return new Map();
 const allowed=String(s.jiraProjects||s.jiraProject||'').split(',').map(k=>k.trim()).filter(Boolean);if(!allowed.length)return new Map();
 const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
 const r=await workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:'project IN ('+allowed.map(quote).join(',')+') AND assignee IS NOT EMPTY AND updated >= -90d ORDER BY updated DESC',maxResults:100,fields:['assignee','components','labels','project']})},s);
 const work=new Map();
 for(const issue of r?.issues||[]){const a=issue.fields?.assignee;if(!a?.accountId||a.active===false)continue;const w=work.get(a.accountId)||{name:norm(a.displayName),displayName:String(a.displayName||'').trim(),image:String(a.avatarUrls?.['48x48']||''),email:a.emailAddress||'',projects:new Map(),topics:new Map()};
  const key=issue.fields?.project?.key;if(key)w.projects.set(key,(w.projects.get(key)||0)+1);
  for(const t of [...(issue.fields?.components||[]).map(c=>c?.name),...(issue.fields?.labels||[])].filter(Boolean))w.topics.set(t,(w.topics.get(t)||0)+1);
  work.set(a.accountId,w);}
 return work;
}
const top=(map,n)=>[...map.entries()].sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k);
// Fills only empty fields; the evidence says where each value came from.
function enrich(rows,slack=[],work=new Map()){
 const profiles=Array.isArray(slack)?slack:slack.profiles||[];
 return rows.map(row=>{const m={...row.member},notes=[];
  const name=norm(m.name);
  // By Slack ID, by name, or by the e-mail Jira knows (names often differ between Slack and Jira).
  const jiraEmail=(m.jiraId&&work.get(m.jiraId)?.email)||[...work.values()].find(w=>w.name===name)?.email||'';
  const profile=profiles.find(p=>m.slackId&&p.slackId===m.slackId)||profiles.find(p=>p.names.includes(name))||profiles.find(p=>p.email&&(p.email===m.email||p.email===jiraEmail));
  m.slackProfile=profile?(profile.title?'title':'empty'):'missing';
  if(profile){if(!m.role&&profile.title){m.role=profile.title;notes.push('роль из профиля Slack');}if(!m.slackId)m.slackId=profile.slackId;if(!m.email&&profile.email)m.email=profile.email;}
  if(profile)m.accounts=team.mergeAccounts(m.accounts,{slack:{id:profile.slackId,name:profile.name,handle:profile.handle,title:profile.title,email:profile.email,image:profile.image}});
  // Phone, birthday and other contacts from the Slack profile fill empty fields; plugins (birthdays, Telegram) use them.
  if(profile){if(!m.phone&&profile.phone)m.phone=profile.phone;if(!m.birthday&&profile.birthday)m.birthday=profile.birthday;
   const extra=Object.fromEntries(Object.entries(profile.contacts||{}).map(([k,v])=>[k,/^https:\/\//.test(v)?{url:v}:{handle:v}]));if(Object.keys(extra).length)m.accounts=team.mergeAccounts(m.accounts,extra);}
  const job=(m.jiraId&&work.get(m.jiraId))||[...work.entries()].find(([,w])=>w.name===name||profile&&profile.names.includes(w.name))?.[1];
  const id=m.jiraId||[...work.entries()].find(([,w])=>w===job)?.[0];
  if(job&&id)m.accounts=team.mergeAccounts(m.accounts,{jira:{id,name:job.displayName||m.jiraName||'',email:job.email,image:job.image}});
  if(job){if(!m.jiraId&&id)m.jiraId=id;if(!m.projects&&job.projects.size)m.projects=top(job.projects,4).join(', ');
   const topics=top(job.topics,4);if(!m.responsibilities&&topics.length){m.responsibilities=topics.join(', ');notes.push('обязанности по компонентам и меткам задач Jira');}
   if(!m.email&&job.email)m.email=job.email;}
  const slackProfile=m.slackProfile;delete m.slackProfile;let member=row.member;try{member=team.validate([m])[0];}catch{}
  return {...row,member,slackProfile,evidence:row.evidence+(notes.length?' · '+notes.join(', '):'')};});
}
module.exports={jiraWork,enrich};
