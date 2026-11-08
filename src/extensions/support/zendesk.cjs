// Zendesk as a support source of «Поддержка игроков» (sources.cjs): tickets through the Search API, comments, Help
// Center article search, active macros, and a public reply. Auth: an agent's email and API token,
// `Authorization: Basic base64("{email}/token:{api_token}")` (Admin Center → Apps and integrations → Zendesk API).
const SUBDOMAIN=/^[a-z0-9][a-z0-9-]{0,62}$/;
const STATUSES=new Set(['new','open','pending','hold','solved','closed']);
const PRIORITIES=new Set(['urgent','high','normal','low']);
const DAY=86400000;

// «studio», «studio.zendesk.com» or «https://studio.zendesk.com/agent» → «studio».
function subdomain(value){
 const raw=String(value||'').trim().toLowerCase();if(!raw)return '';
 const host=raw.replace(/^https?:\/\//,'').split(/[/?#]/)[0];
 const name=host.endsWith('.zendesk.com')?host.slice(0,-'.zendesk.com'.length):host;
 if(!SUBDOMAIN.test(name))throw Error('Поддомен Zendesk указан неверно. Пример: mystudio (из mystudio.zendesk.com).');
 return name;
}
function config(settings){
 let sub='';try{sub=subdomain(settings.supportZendeskSubdomain);}catch{sub='';}
 return {subdomain:sub,email:String(settings.supportZendeskEmail||'').trim(),token:String(settings.supportZendeskToken||'').trim()};
}
const ready=settings=>{const c=config(settings);return !!c.subdomain&&/^[^\s@]+@[^\s@]+$/.test(c.email)&&!!c.token;};
const base=settings=>'https://'+config(settings).subdomain+'.zendesk.com';

function explain(error){
 const map={401:'Zendesk не принял email и API-токен. Проверьте их в «Настройки → Поддержка игроков».',
  403:'У учётной записи Zendesk не хватает прав: нужен агент с доступом к тикетам (для ответа — с правом публичных комментариев).',
  404:'Zendesk не нашёл тикет или раздел. Проверьте номер тикета и поддомен.',
  422:'Zendesk не принял запрос: '+String(error.detail||'').slice(0,200),
  429:'Zendesk ограничил число запросов. Повторите через '+Math.ceil(Number(error.retryAfter)||60)+' с.'};
 const e=Error(map[error.status]||error.message||'Zendesk недоступен.');e.status=error.status;e.cause=error;return e;
}
async function api(s,path,{query,method='GET',body,url}={}){
 const c=config(s.settings);
 if(!ready(s.settings))throw Error('Zendesk не подключён.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))if(v!==undefined&&v!==null&&v!=='')params.append(k,String(v));
 const target=url||base(s.settings)+path+(params.size?'?'+params:'');
 // Pagination links must stay on the same Zendesk account.
 if(new URL(target).origin!==base(s.settings))throw Error('Zendesk вернул ссылку на другой адрес.');
 try{
  return await s.request(target,{method,headers:{Authorization:'Basic '+Buffer.from(c.email+'/token:'+c.token).toString('base64'),Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }catch(e){throw explain(e);}
}

const strip=html=>String(html||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
// The earliest active SLA target of a ticket (sideloaded `slas.policy_metrics`).
function sla(t){
 const metrics=(t.slas?.policy_metrics||[]).filter(m=>m&&m.breach_at&&(m.stage==='active'||!m.stage));
 const first=metrics.sort((a,b)=>Date.parse(a.breach_at)-Date.parse(b.breach_at))[0];
 return first?{breachAt:new Date(first.breach_at).toISOString(),metric:String(first.metric||'')}:null;
}
function ticketOf(settings,t,users=new Map()){
 return {id:String(t.id),subject:String(t.subject||t.raw_subject||'').trim(),text:String(t.description||'').trim().slice(0,2000),
  status:STATUSES.has(t.status)?t.status:'open',priority:PRIORITIES.has(t.priority)?t.priority:null,
  created:t.created_at||null,updated:t.updated_at||t.created_at||null,requester:users.get(String(t.requester_id))?.name||'',
  tags:Array.isArray(t.tags)?t.tags.map(String).slice(0,12):[],channel:String(t.via?.channel||''),url:base(settings)+'/agent/tickets/'+t.id,sla:sla(t)};
}
const usersOf=r=>new Map((r?.users||[]).map(u=>[String(u.id),{name:String(u.name||''),agent:u.role&&u.role!=='end-user'}]));

// Up to 3 pages of 100 for a search query, newest first.
async function search(s,query,{pages=3}={}){
 const out=[],users=new Map();let next=null;
 for(let page=0;page<pages;page++){
  const r=next?await api(s,'',{url:next}):await api(s,'/api/v2/search.json',{query:{query,sort_by:'created_at',sort_order:'desc',per_page:100,include:'tickets(users,slas)'}});
  for(const [k,v] of usersOf(r))users.set(k,v);
  out.push(...(r?.results||[]).filter(x=>x&&(x.result_type==='ticket'||!x.result_type)&&x.id));
  next=r?.next_page||null;if(!next)break;
 }
 return {rows:out,users};
}
// Open tickets (any age) and tickets created since `since`, without duplicates.
async function tickets(s,{since}){
 const day=new Date(since.getTime()-DAY).toISOString().slice(0,10);
 const open=await search(s,'type:ticket status<solved');
 const fresh=await search(s,'type:ticket created>'+day);
 const users=new Map([...open.users,...fresh.users]),seen=new Set(),out=[];
 for(const t of [...open.rows,...fresh.rows]){if(seen.has(String(t.id)))continue;seen.add(String(t.id));out.push(ticketOf(s.settings,t,users));}
 return out;
}
async function ticket(s,id){
 if(!/^\d{1,12}$/.test(String(id)))throw Error('Номер тикета — число.');
 const r=await api(s,'/api/v2/tickets/'+id+'.json',{query:{include:'users,slas'}});
 return r?.ticket?ticketOf(s.settings,r.ticket,usersOf(r)):null;
}
async function comments(s,id){
 const r=await api(s,'/api/v2/tickets/'+id+'/comments.json',{query:{include:'users',sort_order:'asc'}});
 const users=usersOf(r);
 return (r?.comments||[]).map(c=>({id:String(c.id),author:users.get(String(c.author_id))?.name||'',agent:!!users.get(String(c.author_id))?.agent,public:c.public!==false,text:String(c.plain_body||strip(c.html_body)||c.body||'').trim().slice(0,3000),created:c.created_at||null}));
}
// Help Center articles for a query (the agent's credentials also read restricted articles).
async function articles(s,query){
 const q=String(query||'').replace(/\s+/g,' ').trim().slice(0,200);if(!q)return [];
 const r=await api(s,'/api/v2/help_center/articles/search.json',{query:{query:q,per_page:5}});
 return (r?.results||[]).filter(a=>a?.html_url).map(a=>({title:String(a.title||''),url:String(a.html_url),snippet:strip(a.snippet||a.body).slice(0,400)}));
}
// Active shared macros with their comment text: the only place a refund or compensation may come from.
async function macros(s){
 const r=await api(s,'/api/v2/macros/active.json',{query:{per_page:100}});
 return (r?.macros||[]).map(m=>({title:String(m.title||''),text:strip((m.actions||[]).filter(a=>/^comment_value/.test(a.field)).map(a=>[].concat(a.value).join(' ')).join(' ')).slice(0,1500)})).filter(m=>m.title);
}
// A public comment on the ticket: exactly the text the user confirmed.
async function reply(s,id,text){
 if(!/^\d{1,12}$/.test(String(id)))throw Error('Номер тикета — число.');
 const r=await api(s,'/api/v2/tickets/'+id+'.json',{method:'PUT',body:{ticket:{comment:{body:String(text),public:true}}}});
 if(!r?.ticket)throw Error('Zendesk не подтвердил ответ.');
 return {url:base(s.settings)+'/agent/tickets/'+id,status:String(r.ticket.status||'')};
}
module.exports={id:'zendesk',name:'Zendesk',subdomain,config,ready,
 hint:settings=>ready(settings)?'':'Zendesk: укажите поддомен, email агента и API-токен в «Настройки → Поддержка игроков» (Admin Center → Apps and integrations → Zendesk API → API-токены).',
 tickets,ticket,comments,articles,macros,reply,explain,ticketOf};
