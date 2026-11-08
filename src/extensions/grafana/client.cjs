// Grafana HTTP API, read-only. Auth: a service account token (`Authorization: Bearer <token>`); a Viewer service
// account is enough for everything here. Endpoints (Grafana HTTP API docs):
//   GET  /api/health                         — version, no auth needed (connection test)
//   GET  /api/search?type=dash-db&query=&limit= — dashboards [{uid,title,url,folderTitle,folderUid,tags}]
//   GET  /api/dashboards/uid/<uid>           — {dashboard, meta:{folderTitle,folderUid,url,slug}}
//   GET  /api/library-elements/<uid>         — {result:{model}} for library panels
//   GET  /api/frontend/settings              — {datasources:{<name>:{uid,type}}, defaultDatasource} (legacy refs)
//   POST /api/ds/query                       — {from,to,queries:[{refId,datasource:{uid},…target}]} → {results}
//   GET  /render/d-solo/<uid>/<slug>?panelId= — PNG, only with the Image Renderer plugin and only when enabled
// Nothing here writes to Grafana: the only POST is /api/ds/query, which runs the panel's own read queries.
const TIMEOUT=15000;

// The base URL, path-prefix aware: «https://host/grafana» stays with its prefix; a pasted dashboard or panel link is
// cut before Grafana's own routes. https only, except http on this computer (a local Grafana).
const ROUTES=/\/(?:d|d-solo|dashboards|dashboard|explore|alerting|playlists|login|render|api|goto|connections|admin|org|profile|a|public-dashboards)(?:\/.*)?$/;
function base(value){
 const raw=String(value||'').trim();
 if(!raw)return '';
 let url;try{url=new URL(/^[a-z]+:\/\//i.test(raw)?raw:'https://'+raw);}catch{throw Error('Адрес Grafana указан неверно. Пример: https://grafana.example.com');}
 const local=['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&local))throw Error('Адрес Grafana должен начинаться с https://');
 if(url.username||url.password)throw Error('Адрес Grafana — без логина и пароля: доступ даёт токен сервисного аккаунта.');
 const prefix=url.pathname.replace(ROUTES,'').replace(/\/+$/,'');
 return url.origin+prefix;
}

function config(s){
 const st=s.settings||{};
 let url='';try{url=base(st.grafanaUrl);}catch{url='';}
 return {url,token:String(st.grafanaToken||'').trim(),folder:String(st.grafanaFolder||'').trim(),render:st.grafanaRender==='true'};
}
const connected=settings=>{try{return !!base(settings.grafanaUrl)&&!!String(settings.grafanaToken||'').trim();}catch{return false;}};

// Errors in words: missing access is told apart from a wrong address, a timeout and a refused query.
function explain(e,c){
 const host=(()=>{try{return new URL(c.url).host;}catch{return 'Grafana';}})();
 const detail=(()=>{try{const d=JSON.parse(e?.detail||'null');return String(d?.message||d?.error||'').slice(0,200);}catch{return '';}})();
 const map={
  400:'Grafana не приняла запрос'+(detail?': '+detail:'.'),
  401:'Grafana не приняла токен. Проверьте токен сервисного аккаунта в настройках «Grafana».',
  403:'У сервисного аккаунта Grafana нет доступа к этому (нужна роль Viewer и доступ к папке дашборда).',
  404:'Grafana не нашла это'+(detail?': '+detail:'.')+' Проверьте адрес и UID дашборда.',
  429:'Grafana ограничила число запросов. Повторите позже.',
  500:'Grafana ответила ошибкой сервера'+(detail?': '+detail:'.'),
  502:'Grafana или её источник данных недоступны (HTTP 502).',
  503:'Grafana временно недоступна (HTTP 503).'
 };
 let text=map[e?.status];
 if(!text){
  const code=e?.code||e?.cause?.code||'';
  if(e?.name==='TimeoutError'||e?.name==='AbortError'||/timeout|timed out/i.test(String(e?.message)))text='Grafana ('+host+') не ответила за '+Math.round(TIMEOUT/1000)+' с.';
  else if(/redirect/i.test(String(e?.message)+' '+String(e?.cause?.message)))text='Grafana перенаправила запрос (обычно на страницу входа). Проверьте адрес: с префиксом пути, если Grafana открыта не в корне сайта.';
  else if(/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|EHOSTUNREACH/.test(code)||/fetch failed/i.test(String(e?.message)))text='Grafana недоступна по адресу '+c.url+'. Проверьте адрес и сеть (VPN).';
  else if(e instanceof SyntaxError)text='Адрес '+c.url+' отвечает не как API Grafana. Проверьте адрес.';
  else text=e?.message||'Grafana недоступна.';
 }
 const out=Error(text);out.status=e?.status;out.code=e?.code;out.cause=e;return out;
}

async function api(s,path,{method='GET',query,body}={}){
 const c=config(s);
 if(!c.url)throw Error('Не указан адрес Grafana.');
 if(!c.token)throw Error('Нет токена сервисного аккаунта Grafana.');
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(query||{}))for(const x of [].concat(v))if(x!==undefined&&x!==null&&x!=='')params.append(k,String(x));
 const headers={Authorization:'Bearer '+c.token,Accept:'application/json'};
 if(body!==undefined)headers['Content-Type']='application/json';
 try{return await s.request(c.url+path+(params.size?'?'+params:''),{method,headers,timeoutMs:TIMEOUT,...(body!==undefined?{body:JSON.stringify(body)}:{})});}
 catch(e){throw explain(e,c);}
}

// Connection test: /api/health (version) and an authorized /api/search?limit=1 (the token works).
async function test(s){
 const c=config(s);
 let version='';
 try{const h=await s.request(c.url+'/api/health',{method:'GET',headers:{Accept:'application/json'},timeoutMs:TIMEOUT});version=String(h?.version||'');}
 catch(e){throw explain(e,c);}
 const list=await api(s,'/api/search',{query:{type:'dash-db',limit:1}});
 if(!Array.isArray(list))throw Error('Адрес '+c.url+' отвечает не как API Grafana. Проверьте адрес.');
 return {version,url:c.url};
}

const clean=d=>({uid:String(d.uid||''),title:String(d.title||d.uid||'').slice(0,200),url:String(d.url||''),folder:String(d.folderTitle||'').slice(0,120),folderUid:String(d.folderUid||''),tags:(Array.isArray(d.tags)?d.tags:[]).map(t=>String(t).slice(0,40)).slice(0,8)});
async function search(s,{query='',limit=5000}={}){
 const r=await api(s,'/api/search',{query:{type:'dash-db',query,limit}});
 return (Array.isArray(r)?r:[]).filter(d=>d&&d.uid&&(d.type===undefined||d.type==='dash-db')).map(clean);
}
async function dashboard(s,uid){
 if(!/^[\w-]{1,64}$/.test(String(uid||'')))throw Error('UID дашборда Grafana указан неверно.');
 const r=await api(s,'/api/dashboards/uid/'+encodeURIComponent(uid));
 if(!r?.dashboard)throw Error('Grafana не вернула дашборд '+uid+'.');
 return r;
}
async function libraryPanel(s,uid){
 if(!/^[\w-]{1,64}$/.test(String(uid||'')))throw Error('UID библиотечной панели указан неверно.');
 const r=await api(s,'/api/library-elements/'+encodeURIComponent(uid));
 return r?.result?.model||null;
}
async function frontendSettings(s){return api(s,'/api/frontend/settings');}
async function query(s,{from,to,queries}){return api(s,'/api/ds/query',{method:'POST',body:{from:String(from),to:String(to),queries}});}

// A panel as PNG through the Image Renderer plugin (only when enabled in settings). Binary, so a plain fetch with
// the same token, timeout and no redirects; returns a data: URL for the card.
async function render(s,{uid,slug,panelId,from,to,vars={},width=600,height=280,orgId}){
 const c=config(s);
 if(!c.render)throw Error('Картинки панелей выключены в настройках «Grafana».');
 const p=new URLSearchParams({panelId:String(panelId),from:String(from),to:String(to),width:String(width),height:String(height),theme:'dark'});
 if(orgId)p.set('orgId',String(orgId));
 for(const [k,v] of Object.entries(vars))for(const x of [].concat(v))p.append('var-'+k,String(x));
 let res;
 try{res=await fetch(c.url+'/render/d-solo/'+encodeURIComponent(uid)+'/'+encodeURIComponent(slug||'_')+'?'+p,{headers:{Authorization:'Bearer '+c.token},redirect:'error',signal:AbortSignal.timeout(30000)});}
 catch(e){throw explain(e,c);}
 if(!res.ok)throw explain(Object.assign(Error('HTTP '+res.status),{status:res.status}),c);
 if(!/^image\/png/.test(res.headers.get('content-type')||''))throw Error('Grafana не вернула картинку: нужен плагин Image Renderer.');
 const buf=Buffer.from(await res.arrayBuffer());
 if(buf.length>4*1024*1024)throw Error('Картинка панели слишком большая.');
 return 'data:image/png;base64,'+buf.toString('base64');
}

module.exports={TIMEOUT,base,config,connected,explain,api,test,search,dashboard,libraryPanel,frontendSettings,query,render};
