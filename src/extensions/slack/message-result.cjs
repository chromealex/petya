// Source messages, not generated summaries, own author/time/body metadata.
async function capture(rows,settings,request){
 const messages=rows.flatMap(row=>row.messages.map(m=>({...m,channel:row.channel,url:row.url}))).sort((a,b)=>b.at-a.at).slice(0,20);
 const names=new Map(require('../../team.cjs').members(settings).filter(p=>p.slackId).map(p=>[p.slackId,p.name]));
 for(const id of new Set(messages.map(m=>m.user).filter(Boolean))){
  if(names.has(id)||!settings.slackToken||!request)continue;
  try{const r=await request('https://slack.com/api/users.info?'+new URLSearchParams({user:id}),{headers:{Authorization:'Bearer '+settings.slackToken}});if(r.ok)names.set(id,r.user?.profile?.display_name||r.user?.real_name||r.user?.name);}catch{/* Keep the source ID when the profile is unavailable. */}
 }
 return messages.map(m=>({author:names.get(m.user)||m.user||'Автор не указан',at:m.at,text:String(m.text||''),channel:m.channel,url:m.url}));
}
module.exports={capture};
