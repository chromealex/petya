const {roles,projectMatch}=require('../../team-roles.cjs');
const team=require('../../team.cjs');
async function resolveRecipients({role,channel,topic,settings,request,token}){
 const api=async(method,args={})=>{const d=await request('https://slack.com/api/'+method+'?'+new URLSearchParams(args),{headers:{Authorization:'Bearer '+token}});if(!d?.ok)throw Error('Не удалось проверить получателей в Slack: '+(d?.error||'неполный ответ')+'. Сообщение не отправлено.');return d;};
 async function pages(method,args){let cursor='',rows=[];const seen=new Set();for(let i=0;i<50;i++){const d=await api(method,{...args,limit:'200',...cursor?{cursor}:{}});if(!Array.isArray(d.members))throw Error('Slack вернул неполный состав. Сообщение не отправлено.');rows.push(...d.members);cursor=String(d.response_metadata?.next_cursor||'').trim();if(!cursor){if(d.has_more)throw Error('Slack вернул неполный состав.');return rows;}if(seen.has(cursor))throw Error('Slack повторил страницу участников.');seen.add(cursor);}throw Error('Состав слишком большой. Уточните рабочий канал.');}
 const memberIds=new Set(await pages('conversations.members',{channel:channel.id}));
 const users=await pages('users.list',{}),byId=new Map(users.map(u=>[u.id,u]));
 if([...memberIds].some(id=>!byId.has(id)))throw Error('Slack вернул не все профили участников. Сообщение не отправлено.');
 const active=u=>u&&!u.deleted&&!u.is_bot&&!u.is_app_user&&u.id!=='USLACKBOT'&&/^[UW][A-Z0-9]+$/.test(u.id);
 const local=team.members(settings),mapped=new Map(),unresolved=[];
 for(const row of local){
  const inProject=projectMatch(row,topic);if(inProject===false)continue;
  const exact=row.slackId?users.filter(u=>u.id===row.slackId):row.email?users.filter(u=>u.profile?.email?.toLowerCase()===row.email.toLowerCase()):[];
  if(exact.length!==1){if(roles(row.role).has(role))unresolved.push(row.name);continue;}
  const u=exact[0];if(!active(u))continue;
  if(inProject===true&&roles(row.role).has(role)&&!memberIds.has(u.id))unresolved.push(row.name+' (нет в выбранном канале)');
  if(!mapped.has(u.id))mapped.set(u.id,[]);mapped.get(u.id).push(row);
 }
 for(const member of topic.projectMembers||[]){
  const u=byId.get(member.id);if(active(u)&&!memberIds.has(u.id)&&roles(u.profile?.title||'').has(role)&&!unresolved.some(n=>n.startsWith(member.name)))unresolved.push(member.name+' (нет в выбранном канале)');
 }
 if(unresolved.length)throw Error('Не могу отметить всех: '+unresolved.join(', ')+'. Уточните Slack ID в команде или канал и повторите поручение.');
 const recipients=[];
 for(const id of memberIds){const u=byId.get(id);if(!active(u))continue;
  // An explicit different-project entry must not be included merely because of channel membership.
  const allLocal=local.filter(r=>r.slackId===id||!r.slackId&&r.email&&r.email.toLowerCase()===u.profile?.email?.toLowerCase());
  if(allLocal.length&&allLocal.every(r=>projectMatch(r,topic)===false))continue;
  const entries=mapped.get(id)||[],known=entries.map(r=>r.role).filter(Boolean);
  if(known.length>1&&new Set(known.map(r=>[...roles(r)].sort().join(','))).size>1)throw Error('В справочнике противоречат роли участника '+(u.real_name||id)+'. Уточните карточки команды.');
  const roleText=known[0]||u.profile?.title||'';
  if(roles(roleText).has(role))recipients.push({id,name:u.profile?.real_name||u.real_name||u.name||id,role:roleText});
 }
 if(!recipients.length)throw Error('Не нашёл подтверждённых участников этой роли. Укажите роли и Slack ID в команде или заполните должности в профилях Slack, затем повторите поручение.');
 if(recipients.length>100)throw Error('Найдено больше 100 получателей. Уточните проект или группу.');
 return recipients.sort((a,b)=>a.id.localeCompare(b.id));
}
module.exports={resolveRecipients};
