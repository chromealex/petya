// Slack profiles of the wanted people, for the team fill (team-source `profiles`, src/team-sources.cjs) and the
// «имена из Jira, должности из Slack» list (jira-people.cjs): titles, e-mails, phones, birthdays and other contacts.
const team=require('../../team.cjs');
const norm=v=>String(v||'').toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
// Slack: users.list until every wanted person is found (large workspaces have thousands of members and guests),
// waiting once when Slack limits requests; then users.lookupByEmail for those with a known e-mail.
// The result says whether the walk was complete, so the reply never claims «no job title» for an unseen profile.
async function slackProfiles(settings,request,wanted=[],{wait=ms=>new Promise(r=>setTimeout(r,ms)),maxPages=50}={}){
 // A Slack connected by sign-in (slackCredential) has no token here: the request pipeline adds it (src/service-oauth.cjs).
 const token=settings.slackToken||'';const result={profiles:[],complete:false,limited:false};if(settings.module_slack==='false'||!(token||settings.slackCredential))return result;
 const call=async url=>{for(let attempt=0;attempt<2;attempt++){try{return await request(url,{headers:{Authorization:'Bearer '+token}});}catch(e){if(attempt||!(e.status===429||/429|ratelimit|ограничил/iu.test(e.message||'')))throw e;result.limited=true;await wait(Math.min(30,Number(e.retryAfter)||20)*1000);}}};
 result.deleted=[];
 const namesOf=(u,p)=>[p.real_name,u.real_name,p.display_name,p.real_name_normalized,p.display_name_normalized,u.name].filter(Boolean).map(norm);
 // Deactivated accounts are remembered separately: they must not become (or stay) team members.
 const add=u=>{if(!u||u.is_bot||u.is_app_user||u.id==='USLACKBOT')return;const p=u.profile||{};
  if(u.deleted){if(!result.deleted.some(x=>x.slackId===u.id))result.deleted.push({slackId:u.id,names:namesOf(u,p),name:String(p.real_name||u.real_name||'').trim()});return;}
  if(!result.profiles.some(x=>x.slackId===u.id))result.profiles.push({slackId:u.id,names:namesOf(u,p),name:String(p.real_name||u.real_name||'').trim(),handle:String(p.display_name||'').trim(),title:String(p.title||'').trim(),email:typeof p.email==='string'?p.email:'',phone:String(p.phone||'').trim().slice(0,40),birthday:'',contacts:{},image:p.is_custom_image===false?'':String(p.image_192||p.image_72||'')});};
 const names=wanted.map(w=>norm(w.name)).filter(Boolean),found=()=>names.every(n=>result.profiles.some(p=>p.names.includes(n)));
 let cursor='';
 try{
  for(let page=0;page<maxPages;page++){
   const data=await call('https://slack.com/api/users.list?'+new URLSearchParams({limit:'200',...cursor?{cursor}:{}}));
   // Any other refusal (missing_scope: the connection may not read profiles) is said in the reply, not swallowed.
   if(!data?.ok||!Array.isArray(data.members)){if(data?.error==='ratelimited')result.limited=true;else if(data?.error)result.error=data.error==='missing_scope'?'подключению Slack не хватает разрешения users:read (и users:read.email для почты) — переподключите Slack':String(data.error);break;}
   data.members.forEach(add);
   cursor=String(data.response_metadata?.next_cursor||'').trim();
   if(!cursor){result.complete=true;break;}
   if(names.length&&found()){result.complete=true;break;}
  }
 }catch(e){if(e.status===429||/429/.test(e.message||''))result.limited=true;else throw e;}
 for(const w of wanted)if(w.email&&!result.profiles.some(p=>p.names.includes(norm(w.name))||p.email===w.email)){
  try{const data=await call('https://slack.com/api/users.lookupByEmail?'+new URLSearchParams({email:w.email}));if(data?.ok)add(data.user);}catch{}}
 // Custom profile fields: the position when the title is empty, the birthday, other messengers and networks.
 const wantedProfiles=result.profiles.filter(p=>wanted.some(w=>p.names.includes(norm(w.name))||w.email&&p.email===w.email)).slice(0,40);
 if(wantedProfiles.length){
  let labels=null;
  try{const team=await call('https://slack.com/api/team.profile.get');if(team?.ok)labels=new Map((team.profile?.fields||[]).map(f=>[f.id,String(f.label||'')]));}catch{}
  const kind=id=>{const l=labels?.get(id)||'';
   if(/должност|роль|позици|специализ|title|position|role|job/i.test(l))return 'title';
   if(/день\s*рожд|дата\s*рожд|birth|\bdob\b|др\b/i.test(l))return 'birthday';
   for(const [k,re] of [['telegram',/telegram|телеграм|\btg\b/i],['instagram',/instagram|инстаграм/i],['whatsapp',/whats\s*app|ватсап/i],['linkedin',/linked\s*in/i],['github',/git\s*hub/i],['phone',/телефон|phone|мобильн/i]])if(re.test(l))return k;return '';};
  if(labels)for(const p of wantedProfiles){try{const data=await call('https://slack.com/api/users.profile.get?'+new URLSearchParams({user:p.slackId}));
   for(const [id,f] of Object.entries(data?.ok?data.profile?.fields||{}:{})){const value=String(f?.value||'').trim().slice(0,160);if(!value)continue;const k=kind(id);
    if(k==='title'&&!p.title)p.title=value;else if(k==='birthday')p.birthday=team.birthday(value)||'';else if(k==='phone'&&!p.phone)p.phone=value.slice(0,40);else if(k)p.contacts[k]=value;}}catch{}}
 }
 return result;
}
module.exports={slackProfiles};
