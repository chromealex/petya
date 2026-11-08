// Sentry REST API calls of «Крэши» (sentry.io or a self-hosted Sentry): organizations, projects, releases,
// the organization issue stream with 14-day per-issue stats, release-health sessions, and resolve/reopen.
// Auth: an internal-integration or user auth token, `Authorization: Bearer <token>`.
// Scopes: org:read, project:read, event:read; resolving an issue also needs event:write.
const DEFAULT_URL='https://sentry.io';
const SLUG=/^[a-z0-9][a-z0-9_.-]{0,99}$/i;

function base(value){
 const raw=String(value||'').trim()||DEFAULT_URL;
 let url;try{url=new URL(raw);}catch{throw Error('Адрес Sentry указан неверно. Пример: https://sentry.io');}
 const local=['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw Error('Адрес Sentry должен начинаться с https://');
 if(url.username||url.password||url.search||url.hash)throw Error('Адрес Sentry — только сайт, без логина и параметров. Пример: https://sentry.example.com');
 return url.origin+url.pathname.replace(/\/+$/,'');
}
function config(s){
 const token=String(s.settings.sentryToken||'').trim(),org=String(s.settings.sentryOrg||'').trim();
 const projects=String(s.settings.sentryProjects||'').split(',').map(p=>p.trim()).filter(Boolean);
 return {url:base(s.settings.sentryUrl),token,org,projects,environment:String(s.settings.sentryEnvironment||'').trim(),query:String(s.settings.sentryQuery||'').trim()};
}
const connected=s=>{try{const c=config(s);return !!c.token&&!!c.org;}catch{return false;}};

// Errors in words the user can act on; the HTTP status stays on the error.
function explain(error){
 const map={401:'Sentry не принял токен. Проверьте его в настройках «Крэши».',403:'Токену Sentry не хватает прав (нужны org:read, project:read, event:read; для «Решено» — event:write).',404:'Sentry не нашёл организацию или проект. Проверьте slug в настройках «Крэши».',429:'Sentry ограничил число запросов. Повторите через минуту.'};
 const e=Error(map[error.status]||error.message||'Sentry недоступен.');e.status=error.status;e.cause=error;return e;
}
async function api(s,path,{query,method='GET',body}={}){
 const c=config(s);
 if(!c.token)throw Error('Нет токена Sentry.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))for(const x of [].concat(v))if(x!==undefined&&x!==null&&x!=='')params.append(k,String(x));
 const url=c.url+'/api/0'+path+(params.size?'?'+params:'');
 try{
  return await s.request(url,{method,headers:{Authorization:'Bearer '+c.token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 }catch(e){throw explain(e);}
}
const org=s=>{const o=config(s).org;if(!SLUG.test(o))throw Error('Укажите slug организации Sentry в настройках «Крэши».');return encodeURIComponent(o);};

async function organizations(s){
 const r=await api(s,'/organizations/',{query:{member:1}});
 if(!Array.isArray(r))throw Error('Sentry вернул некорректный список организаций.');
 return r.map(o=>({slug:String(o.slug||''),name:String(o.name||o.slug||'')})).filter(o=>SLUG.test(o.slug));
}
async function projects(s){
 const r=await api(s,'/organizations/'+org(s)+'/projects/',{query:{per_page:100}});
 if(!Array.isArray(r))throw Error('Sentry вернул некорректный список проектов.');
 return r.map(p=>({id:String(p.id),slug:String(p.slug||''),name:String(p.name||p.slug||''),platform:String(p.platform||'')})).filter(p=>/^\d+$/.test(p.id)&&SLUG.test(p.slug));
}
// Releases whose version contains the asked number: «1.4.2» finds «com.game@1.4.2+102».
async function releases(s,version,projectIds){
 const r=await api(s,'/organizations/'+org(s)+'/releases/',{query:{query:version,project:projectIds,per_page:25}});
 if(!Array.isArray(r))return [];
 const escaped=version.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const exact=new RegExp('(?:^|[@\\s/v-])'+escaped+'(?:$|[+\\s(-])','i');
 return r.filter(x=>exact.test(String(x.version||''))).map(x=>({version:String(x.version),date:x.dateReleased||x.dateCreated||x.firstEvent||null}));
}
// Unresolved issues of the chosen projects for a period, most events first, with 14-day daily stats per issue.
async function issues(s,{projectIds,query,environment,statsPeriod,start,end,limit=100}){
 const r=await api(s,'/organizations/'+org(s)+'/issues/',{query:{project:projectIds,query,environment:environment||undefined,
  ...(statsPeriod?{statsPeriod}:{start,end}),groupStatsPeriod:'14d',sort:'freq',limit,shortIdLookup:0}});
 if(!Array.isArray(r))throw Error('Sentry вернул некорректный список крэшей.');
 return r;
}
// Crash-free sessions and users for a release; null when release health is not set up (no sessions sent).
async function crashFree(s,{projectIds,versions,environment,statsPeriod,start,end}){
 const r=await api(s,'/organizations/'+org(s)+'/sessions/',{query:{field:['crash_free_rate(session)','crash_free_rate(user)','sum(session)'],project:projectIds,
  query:versions.map(v=>'release:'+JSON.stringify(v)).join(' OR '),environment:environment||undefined,...(statsPeriod?{statsPeriod}:{start,end}),interval:'1d',includeSeries:0}});
 const totals=r?.groups?.[0]?.totals;
 if(!totals||!Number(totals['sum(session)']))return null;
 const rate=v=>typeof v==='number'&&v>=0&&v<=1?v:null;
 return {sessions:rate(totals['crash_free_rate(session)']),users:rate(totals['crash_free_rate(user)']),total:Number(totals['sum(session)'])};
}
const issueId=id=>{if(typeof id!=='string'||!/^\d{1,20}$/.test(id))throw Error('Некорректный ID крэша Sentry.');return id;};
// Bulk-mutate endpoint with one id: the same call Sentry's own issue stream uses for «Resolve».
async function setStatus(s,id,status){
 if(!['resolved','unresolved'].includes(status))throw Error('Некорректный статус.');
 const r=await api(s,'/organizations/'+org(s)+'/issues/',{method:'PUT',query:{id:issueId(id)},body:{status}});
 if(r&&r.status&&r.status!==status)throw Error('Sentry не подтвердил изменение статуса.');
 return {id,status};
}
// Link to the same list in Sentry's UI.
function issuesUrl(s,{projectIds,query,environment,statsPeriod,start,end}){
 const p=new URLSearchParams();for(const id of projectIds||[])p.append('project',id);
 if(query)p.set('query',query);if(environment)p.set('environment',environment);
 if(statsPeriod)p.set('statsPeriod',statsPeriod);else if(start){p.set('start',start);p.set('end',end);}
 return config(s).url+'/organizations/'+org(s)+'/issues/?'+p;
}
module.exports={DEFAULT_URL,SLUG,base,config,connected,api,organizations,projects,releases,issues,crashFree,setStatus,issuesUrl,explain};
