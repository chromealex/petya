// Source messages, not generated summaries, own author/time/body metadata.
// Slack markup is turned into readable parts: people by name, channels by name, links with their labels; attached
// files are listed so the card can open them, and «В обсуждение» opens the Slack app on the message.
const names=new Map(),teams=new Map();
const api=(request,token,method,query)=>request('https://slack.com/api/'+method+'?'+new URLSearchParams(query),{headers:{Authorization:'Bearer '+token}});
async function name(id,token,request){
 if(names.has(id))return names.get(id);if(!token||!request||!/^[UWB][A-Z0-9]+$/.test(id))return null;
 try{const r=await api(request,token,'users.info',{user:id});if(r.ok){const value=r.user?.profile?.display_name||r.user?.real_name||r.user?.name||null;names.set(id,value);return value;}}catch{/* Keep the source ID when the profile is unavailable. */}
 return null;
}
async function team(token,request){
 if(!token||!request)return null;if(teams.has(token))return teams.get(token);
 try{const r=await api(request,token,'auth.test',{});const id=r.ok&&/^[TE][A-Z0-9]+$/.test(r.team_id||'')?r.team_id:null;teams.set(token,id);return id;}catch{return null;}
}
// «<@U1>», «<#C1|general>», «<https://x|подпись>», «<!here>» → parts with text and links.
async function parts(text,lookup){
 const out=[];let last=0;const source=String(text||'');
 for(const m of source.matchAll(/<([^<>\s][^<>]*)>/g)){
  if(m.index>last)out.push({text:source.slice(last,m.index)});last=m.index+m[0].length;
  const [target,label]=m[1].split('|');
  if(/^@[UWB][A-Z0-9]+$/.test(target))out.push({text:'@'+((await lookup(target.slice(1)))||label||target.slice(1))});
  else if(/^#C[A-Z0-9]+$/.test(target))out.push({text:'#'+(label||target.slice(1))});
  else if(/^!(?:here|channel|everyone)$/.test(target))out.push({text:'@'+target.slice(1)});
  else if(/^!subteam\^/.test(target))out.push({text:label||'@группа'});
  else if(/^https?:\/\//.test(target))out.push({link:target,text:label||target.replace(/^https?:\/\/(?:www\.)?/,'').replace(/\/$/,'').slice(0,60)});
  else if(/^mailto:/.test(target))out.push({text:label||target.slice(7)});
  else out.push({text:m[0]});
 }
 if(last<source.length)out.push({text:source.slice(last)});
 return out.map(p=>p.text===undefined?p:{...p,text:p.text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')});
}
const fileId=(contextId,ts,id)=>Buffer.from(JSON.stringify(['slack',contextId,ts,id])).toString('base64url');
async function capture(rows,settings,request){
 const messages=rows.flatMap(row=>row.messages.map(m=>({...m,channel:row.channel,url:row.url,contextId:row.id}))).sort((a,b)=>b.at-a.at).slice(0,20);
 for(const p of require('../../team.cjs').members(settings))if(p.slackId&&p.name&&!names.has(p.slackId))names.set(p.slackId,p.name);
 const token=settings.slackToken,lookup=id=>name(id,token,request),teamId=await team(token,request);
 const out=[];
 for(const m of messages){
  const author=(await lookup(m.user))||m.user||'Автор не указан';
  const body=String(m.text||'').replace(/\nВложения: [^\n]*$/,'');
  const thread=String(m.url||'').match(/\/archives\/([A-Z0-9]+)\/p(\d{10})(\d{6})/);
  const appUrl=teamId&&thread?'slack://channel?'+new URLSearchParams({team:teamId,id:thread[1],message:thread[2]+'.'+thread[3]}):'';
  out.push({author,at:m.at,text:(await parts(body,lookup)).map(p=>p.text).join(''),parts:await parts(body,lookup),channel:m.channel,url:m.url,appUrl,
   files:(m.files||[]).filter(f=>f?.id&&f.name).map(f=>({id:fileId(m.contextId,m.ts,f.id),name:String(f.name).slice(0,200),size:Number(f.size)||0,external:!!(f.is_external||f.mode==='external')}))});
 }
 return out;
}
module.exports={capture,parts,clear:()=>{names.clear();teams.clear();}};
