// Roles and responsibilities for team cards that came with names only (the Slack sidebar, Jira assignees):
// the Slack profile title is the role; the components and labels of the person's recent Jira issues are what
// they work on. Every value is copied from the service, never guessed.
const team=require('./team.cjs');
const norm=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
// Slack: users.list until every wanted person is found (large workspaces have thousands of members and guests),
// waiting once when Slack limits requests; then users.lookupByEmail for those with a known e-mail.
// The result says whether the walk was complete, so the reply never claims «no job title» for an unseen profile.
async function slackProfiles(settings,request,wanted=[],{wait=ms=>new Promise(r=>setTimeout(r,ms)),maxPages=50}={}){
 const token=settings.slackToken||'';const result={profiles:[],complete:false,limited:false};if(settings.module_slack==='false'||!token)return result;
 const call=async url=>{for(let attempt=0;attempt<2;attempt++){try{return await request(url,{headers:{Authorization:'Bearer '+token}});}catch(e){if(attempt||!(e.status===429||/429|ratelimit|ограничил/iu.test(e.message||'')))throw e;result.limited=true;await wait(Math.min(30,Number(e.retryAfter)||20)*1000);}}};
 result.deleted=[];
 const namesOf=(u,p)=>[p.real_name,u.real_name,p.display_name,p.real_name_normalized,p.display_name_normalized,u.name].filter(Boolean).map(norm);
 // Deactivated accounts are remembered separately: they must not become (or stay) team members.
 const add=u=>{if(!u||u.is_bot||u.is_app_user||u.id==='USLACKBOT')return;const p=u.profile||{};
  if(u.deleted){if(!result.deleted.some(x=>x.slackId===u.id))result.deleted.push({slackId:u.id,names:namesOf(u,p),name:String(p.real_name||u.real_name||'').trim()});return;}
  if(!result.profiles.some(x=>x.slackId===u.id))result.profiles.push({slackId:u.id,names:namesOf(u,p),name:String(p.real_name||u.real_name||'').trim(),handle:String(p.display_name||'').trim(),title:String(p.title||'').trim(),email:typeof p.email==='string'?p.email:''});};
 const names=wanted.map(w=>norm(w.name)).filter(Boolean),found=()=>names.every(n=>result.profiles.some(p=>p.names.includes(n)));
 let cursor='';
 try{
  for(let page=0;page<maxPages;page++){
   const data=await call('https://slack.com/api/users.list?'+new URLSearchParams({limit:'200',...cursor?{cursor}:{}}));
   if(!data?.ok||!Array.isArray(data.members)){if(data?.error==='ratelimited')result.limited=true;break;}
   data.members.forEach(add);
   cursor=String(data.response_metadata?.next_cursor||'').trim();
   if(!cursor){result.complete=true;break;}
   if(names.length&&found()){result.complete=true;break;}
  }
 }catch(e){if(e.status===429||/429/.test(e.message||''))result.limited=true;else throw e;}
 for(const w of wanted)if(w.email&&!result.profiles.some(p=>p.names.includes(norm(w.name))||p.email===w.email)){
  try{const data=await call('https://slack.com/api/users.lookupByEmail?'+new URLSearchParams({email:w.email}));if(data?.ok)add(data.user);}catch{}}
 // Many workspaces keep the position in a custom profile field («Должность», «Role») instead of the title.
 const empty=result.profiles.filter(p=>!p.title&&wanted.some(w=>p.names.includes(norm(w.name))||w.email&&p.email===w.email)).slice(0,40);
 if(empty.length){
  let labels=null;
  try{const team=await call('https://slack.com/api/team.profile.get');if(team?.ok)labels=new Map((team.profile?.fields||[]).map(f=>[f.id,String(f.label||'')]));}catch{}
  const roleField=id=>labels?/должност|роль|позици|специализ|title|position|role|job/i.test(labels.get(id)||''):false;
  if(labels)for(const p of empty){try{const data=await call('https://slack.com/api/users.profile.get?'+new URLSearchParams({user:p.slackId}));
   const fields=data?.ok?data.profile?.fields||{}:{};const hit=Object.entries(fields).find(([id,f])=>roleField(id)&&String(f?.value||'').trim());
   if(hit)p.title=String(hit[1].value).trim().slice(0,160);}catch{}}
 }
 return result;
}
// Jira: components and labels of the person's issues in the last 90 days, most frequent first.
async function jiraWork(workspace,people){
 const s={...workspace.settings()};if(s.module_jira==='false'||!s.jiraUrl)return new Map();
 const allowed=String(s.jiraProjects||s.jiraProject||'').split(',').map(k=>k.trim()).filter(Boolean);if(!allowed.length)return new Map();
 const quote=v=>'"'+String(v).replace(/["\\]/g,'\\$&')+'"';
 const r=await workspace.api('/rest/api/3/search/jql',{method:'POST',body:JSON.stringify({jql:'project IN ('+allowed.map(quote).join(',')+') AND assignee IS NOT EMPTY AND updated >= -90d ORDER BY updated DESC',maxResults:100,fields:['assignee','components','labels','project']})},s);
 const work=new Map();
 for(const issue of r?.issues||[]){const a=issue.fields?.assignee;if(!a?.accountId||a.active===false)continue;const w=work.get(a.accountId)||{name:norm(a.displayName),displayName:String(a.displayName||'').trim(),email:a.emailAddress||'',projects:new Map(),topics:new Map()};
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
  if(profile)m.accounts=team.mergeAccounts(m.accounts,{slack:{id:profile.slackId,name:profile.name,handle:profile.handle,title:profile.title,email:profile.email}});
  const job=(m.jiraId&&work.get(m.jiraId))||[...work.entries()].find(([,w])=>w.name===name||profile&&profile.names.includes(w.name))?.[1];
  const id=m.jiraId||[...work.entries()].find(([,w])=>w===job)?.[0];
  if(job&&id)m.accounts=team.mergeAccounts(m.accounts,{jira:{id,name:job.displayName||m.jiraName||'',email:job.email}});
  if(job){if(!m.jiraId&&id)m.jiraId=id;if(!m.projects&&job.projects.size)m.projects=top(job.projects,4).join(', ');
   const topics=top(job.topics,4);if(!m.responsibilities&&topics.length){m.responsibilities=topics.join(', ');notes.push('обязанности по компонентам и меткам задач Jira');}
   if(!m.email&&job.email)m.email=job.email;}
  const slackProfile=m.slackProfile;delete m.slackProfile;let member=row.member;try{member=team.validate([m])[0];}catch{}
  return {...row,member,slackProfile,evidence:row.evidence+(notes.length?' · '+notes.join(', '):'')};});
}
module.exports={slackProfiles,jiraWork,enrich};
