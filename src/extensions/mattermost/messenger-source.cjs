// «Mattermost» as a `messenger-source` (docs/foundations/messengers.md): the channels chosen in its settings, their
// posts, threads, search and the users' statuses, in the shared message shape. Read-only. Only chosen channels are
// read, searched or listed — the same rule as the app itself.
const client=require('./client.cjs');

// Mattermost posts → raw messages of the foundation. `names` is a Map from client.users().
function convert(posts,{url,channels,names}){
 const byId=new Map(channels.map(c=>[c.id,c]));
 return posts.map(p=>{
  const c=byId.get(p.channel_id)||{id:p.channel_id,name:p.channel_id,display:p.channel_id,teamName:''};
  const u=names.get(p.user_id)||{name:p.props?.override_username||p.user_id,bot:false};
  return {id:p.id,channel:{id:c.id,name:c.display||c.name},thread:p.root_id||(Number(p.reply_count)>0?p.id:null),replyTo:p.root_id||null,
   author:{id:p.user_id,name:u.name},bot:!!u.bot||!!p.props?.from_bot||!!p.props?.from_webhook,text:String(p.message||''),at:Number(p.create_at)||0,
   url:client.permalink(url,c.teamName,p.id),replies:Number(p.reply_count)||0,files:(p.file_ids||[]).length};
 });
}
async function read(services,posts,cache){
 const c=client.config(services.settings);
 const names=await client.users(services,posts.map(p=>p.user_id),cache);
 return convert(posts,{url:c.url,channels:c.channels,names});
}
const chosen=(services,id)=>{const ch=client.config(services.settings).channels.find(c=>c.id===id);if(!ch)throw Error('Этот канал Mattermost не выбран в настройках.');return ch;};

module.exports={
 id:'mattermost',name:'Mattermost',
 names:[/mattermost|маттермост\p{L}*|матермост\p{L}*/iu],
 ready:settings=>settings.extension_mattermost==='true'&&client.connected(settings),
 hint:settings=>client.config(settings).token?'Отметьте каналы в «Настройки → Mattermost».':'Укажите сервер и личный токен в «Настройки → Mattermost».',
 convert,read,
 async channels(services){
  const c=client.config(services.settings);
  return c.channels.map(ch=>({id:ch.id,name:ch.display||ch.name,kind:'channel',url:client.channelUrl(c.url,ch.teamName,ch.name)}));
 },
 async messages(services,{channel,since,until,limit,check}){
  chosen(services,channel);
  const posts=await client.posts(services,channel,{since:Date.parse(since),until:Date.parse(until),pages:Math.min(3,Math.ceil(limit/200))});check();
  return {messages:await read(services,posts),truncated:posts.length>=limit};
 },
 async thread(services,{id,check}){
  const posts=await client.thread(services,id);check();
  if(posts.length)chosen(services,posts[0].channel_id);
  return {messages:await read(services,posts)};
 },
 async search(services,{query,since,limit,check}){
  const c=client.config(services.settings),allowed=new Set(c.channels.map(x=>x.id));
  const teams=[...new Set(c.channels.map(x=>x.team))].slice(0,5);
  const found=[];
  for(const team of teams){found.push(...(await client.search(services,team,query,{perPage:Math.min(100,limit)})).filter(p=>allowed.has(p.channel_id)&&p.create_at>=Date.parse(since)));check();}
  return {messages:await read(services,found)};
 },
 async presence(services,{users}){
  return (await client.statuses(services,users)).map(x=>({user:x.user,status:x.status,at:x.at}));
 }
};
