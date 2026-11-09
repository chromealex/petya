// Mattermost REST API v4 (https://api.mattermost.com/) calls of «Mattermost», with a personal access token:
// `Authorization: Bearer <token>` against the user's own server (`<server>/api/v4/...`). Read: the user, teams,
// channels, posts of a channel, a thread, post search, users by ids, statuses. Write: one post, only from a card the
// user confirmed (src/extensions/mattermost/feature.cjs).
const ID=/^[a-z0-9]{26}$/;
const LIMIT=16383;// Mattermost's maximum post length (MaxMessageSize in recent versions; 4000 on very old servers)
const TYPES={O:'channel',P:'channel',G:'group',D:'direct'};

// The server address: https (http only for this computer), no path tricks, no trailing slash.
function server(value){
 const v=String(value||'').trim().replace(/\/+$/,'');if(!v)return '';
 let u;try{u=new URL(/^[a-z]+:\/\//i.test(v)?v:'https://'+v);}catch{return '';}
 const local=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
 if(u.protocol!=='https:'&&!(u.protocol==='http:'&&local))return '';
 if(u.username||u.password||u.search||u.hash)return '';
 return (u.origin+u.pathname).replace(/\/+$/,'');
}
// Settings: the server, the token (secret) and the chosen channels as JSON [{id, name, display, team, teamName, type}].
function channelsOf(value){
 let list;try{list=JSON.parse(String(value||'[]'));}catch{return [];}
 if(!Array.isArray(list))return [];
 return list.filter(c=>c&&ID.test(String(c.id))&&ID.test(String(c.team||''))&&TYPES[c.type]).map(c=>({id:String(c.id),name:String(c.name||c.id).slice(0,64),display:String(c.display||c.name||c.id).slice(0,64),
  team:String(c.team),teamName:String(c.teamName||'').slice(0,64),type:String(c.type)})).slice(0,25);
}
function config(settings){
 return {url:server(settings.mattermostUrl),token:String(settings.mattermostToken||'').trim(),channels:channelsOf(settings.mattermostChannels)};
}
const connected=settings=>{const c=config(settings);return !!c.url&&!!c.token&&c.channels.length>0;};
const permalink=(url,teamName,post)=>url&&teamName&&ID.test(String(post))?url+'/'+encodeURIComponent(teamName)+'/pl/'+post:'';
const channelUrl=(url,teamName,name)=>url&&teamName&&name?url+'/'+encodeURIComponent(teamName)+'/channels/'+encodeURIComponent(name):'';
// A permalink of this server: https://chat.example.com/<team>/pl/<post id> → the post id.
function postOfLink(text,url){
 const m=String(text||'').match(/https?:\/\/[^\s<>«»"]+\/pl\/([a-z0-9]{26})/i);
 if(!m)return null;
 try{const u=new URL(m[0]);if(url&&!(u.origin+u.pathname).startsWith(url+'/'))return null;}catch{return null;}
 return m[1];
}

// Errors in words the user can act on; the HTTP status stays on the error.
function explain(error){
 let detail={};try{detail=JSON.parse(error.detail||'{}');}catch{detail={};}
 const map={401:'Mattermost не принял токен. Проверьте его в «Настройки → Mattermost».',
  403:'У токена нет доступа к этому каналу или действию в Mattermost.',
  404:'Mattermost не нашёл канал, сообщение или адрес API. Проверьте адрес сервера в «Настройки → Mattermost».',
  413:'Сообщение слишком длинное для Mattermost.',
  429:'Mattermost ограничил число запросов. Повторите через '+Math.ceil(Number(error.retryAfter)||5)+' сек.',
  501:'На сервере Mattermost выключено то, что нужно для запроса (например, личные токены доступа).'};
 const e=Error(map[error.status]||(error.status?'Mattermost ответил ошибкой '+error.status+(detail.message?': '+String(detail.message).slice(0,200):'.'):error.message||'Mattermost недоступен.'));
 e.status=error.status;e.id=detail.id||'';e.cause=error;return e;
}
async function api(s,path,{query,method='GET',body}={}){
 const c=config(s.settings);
 if(!c.url)throw Error('Укажите адрес сервера Mattermost в «Настройки → Mattermost».');
 if(!c.token)throw Error('Нет токена Mattermost.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')params.append(k,String(v));
 try{
  return await s.request(c.url+'/api/v4'+path+(params.size?'?'+params:''),{method,timeoutMs:20000,headers:{Authorization:'Bearer '+c.token,Accept:'application/json','X-Requested-With':'XMLHttpRequest',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }catch(e){throw explain(e);}
}
const need=v=>{const x=String(v||'');if(!ID.test(x))throw Error('Некорректный идентификатор Mattermost.');return x;};

// --- Settings helpers -----------------------------------------------------------------------------------------------
async function me(s){const r=await api(s,'/users/me');if(!r?.id)throw Error('Mattermost вернул некорректный профиль.');return {id:r.id,username:String(r.username||''),name:[r.first_name,r.last_name].filter(Boolean).join(' ')||String(r.username||'')};}
async function teams(s){
 const r=await api(s,'/users/me/teams');if(!Array.isArray(r))throw Error('Mattermost вернул некорректный список команд.');
 return r.filter(t=>ID.test(String(t.id))&&!t.delete_at).map(t=>({id:t.id,name:String(t.name||''),display:String(t.display_name||t.name||'')}));
}
async function channels(s,team){
 const r=await api(s,'/users/me/teams/'+need(team)+'/channels');if(!Array.isArray(r))throw Error('Mattermost вернул некорректный список каналов.');
 return r.filter(c=>ID.test(String(c.id))&&!c.delete_at&&(c.type==='O'||c.type==='P')).map(c=>({id:c.id,name:String(c.name||''),display:String(c.display_name||c.name||''),team,type:c.type,purpose:String(c.purpose||'').slice(0,200)}))
  .sort((a,b)=>a.display.localeCompare(b.display));
}

// --- Reading -----------------------------------------------------------------------------------------------------------
// A PostList {order, posts} → posts in order, without system messages (joins, header changes) and deleted ones.
function postsOf(list){
 const order=Array.isArray(list?.order)?list.order:Object.keys(list?.posts||{});
 return order.map(id=>list.posts?.[id]).filter(p=>p&&ID.test(String(p.id))&&!p.delete_at&&!String(p.type||'').startsWith('system_'));
}
// Names of users by id, cached per call site in `cache` (a Map).
async function users(s,ids,cache=new Map()){
 const want=[...new Set(ids.filter(id=>ID.test(String(id))&&!cache.has(id)))].slice(0,200);
 if(want.length){
  const r=await api(s,'/users/ids',{method:'POST',body:want});
  for(const u of Array.isArray(r)?r:[])cache.set(u.id,{name:[u.first_name,u.last_name].filter(Boolean).join(' ')||u.nickname||u.username||u.id,username:String(u.username||''),bot:!!u.is_bot});
 }
 return cache;
}
// Posts of a channel created after `since` (ms), newest first; at most `pages` pages of 200.
async function posts(s,channel,{since=0,until=Date.now(),pages=3}={}){
 const out=[];
 for(let page=0;page<pages;page++){
  const r=await api(s,'/channels/'+need(channel)+'/posts',{query:{page,per_page:200}});
  const list=postsOf(r);let older=false;
  for(const p of list){if(p.create_at<since){older=true;break;}if(p.create_at<=until)out.push(p);}
  if(older||(r?.order||[]).length<200)break;
 }
 return out;
}
async function thread(s,post){return postsOf(await api(s,'/posts/'+need(post)+'/thread'));}
async function post(s,id){return api(s,'/posts/'+need(id));}
// Post search in one team (terms in Mattermost's search syntax; quoted phrases, «from:», «in:» are passed as typed).
async function search(s,team,terms,{perPage=60}={}){
 const r=await api(s,'/teams/'+need(team)+'/posts/search',{method:'POST',body:{terms:String(terms).slice(0,200),is_or_search:false,include_deleted_channels:false,time_zone_offset:0,page:0,per_page:perPage}});
 return postsOf(r);
}
async function statuses(s,ids){
 const want=[...new Set(ids.filter(id=>ID.test(String(id))))].slice(0,200);if(!want.length)return [];
 const r=await api(s,'/users/status/ids',{method:'POST',body:want});
 return (Array.isArray(r)?r:[]).map(x=>({user:x.user_id,status:x.status,at:x.last_activity_at||0}));
}

// --- Writing (only from a card button the user pressed) ----------------------------------------------------------------
async function send(s,channel,message,{root=null}={}){
 const text=String(message||'');
 if(!text.trim())throw Error('Напишите текст сообщения.');
 if(text.length>LIMIT)throw Error('Сообщение длиннее '+LIMIT+' символов — Mattermost его не примет. Сократите текст.');
 const r=await api(s,'/posts',{method:'POST',body:{channel_id:need(channel),message:text,...(root?{root_id:need(root)}:{})}});
 if(!r?.id)throw Error('Mattermost не подтвердил отправку.');
 return {id:r.id,at:new Date(Number(r.create_at)||Date.now()).toISOString()};
}

module.exports={ID,LIMIT,TYPES,server,channelsOf,config,connected,permalink,channelUrl,postOfLink,explain,api,me,teams,channels,postsOf,users,posts,thread,post,search,statuses,send};
