// Grafana dashboard and panel links: parsing a pasted link and building «Открыть в Grafana» links.
// Dashboard: <base>/d/<uid>/<slug>?orgId=1&from=now-7d&to=now&var-league=gold&var-league=silver&viewPanel=3
// Panel image page: <base>/d-solo/<uid>/<slug>?panelId=3. Grafana 11+ (Scenes) writes viewPanel=panel-3.
// <base> may carry a path prefix (https://host/grafana), so everything before /d/ is kept.
const PATH=/^(.*?)\/(d|d-solo)\/([A-Za-z0-9_-]{1,64})(?:\/([^/?#]*))?\/?$/;
const URLS=/https?:\/\/[^\s<>"'«»]+/giu;

const panelNumber=v=>{const m=String(v||'').match(/^(?:panel-)?(\d{1,9})$/);return m?Number(m[1]):null;};

function parse(raw){
 let url;try{url=new URL(String(raw).replace(/[).,;!?]+$/,''));}catch{return null;}
 if(!/^https?:$/.test(url.protocol))return null;
 const m=url.pathname.match(PATH);if(!m)return null;
 const p=url.searchParams,vars={};
 for(const [k,v] of p)if(k.startsWith('var-')&&k.length>4){(vars[k.slice(4)]=vars[k.slice(4)]||[]).push(v);}
 const viewPanel=panelNumber(p.get('viewPanel'))??panelNumber(p.get('editPanel'))??(m[2]==='d-solo'?panelNumber(p.get('panelId')):null);
 const time=v=>{const x=String(v||'').trim();return x&&x.length<=40?x:null;};
 return {base:url.origin+m[1].replace(/\/+$/,''),origin:url.origin,uid:m[3],slug:m[4]?decodeURIComponent(m[4]):'',
  viewPanel,from:time(p.get('from')),to:time(p.get('to')),vars,orgId:/^\d{1,6}$/.test(p.get('orgId')||'')?Number(p.get('orgId')):null,url:url.href};
}
// The first Grafana dashboard/panel link in a chat message.
function find(text){
 for(const m of String(text||'').matchAll(URLS)){const r=parse(m[0]);if(r)return r;}
 return null;
}
// A short link (/goto/<id>) cannot be resolved without following Grafana's redirect.
const shortLink=text=>{for(const m of String(text||'').matchAll(URLS)){try{if(/\/goto\/[\w-]+\/?$/.test(new URL(m[0]).pathname))return true;}catch{/* not a URL */}}return false;};

// Builds a dashboard link with the shown time range, variables and (optionally) one panel.
function dashboard(base,{uid,slug,from,to,vars,viewPanel,orgId}={}){
 const p=new URLSearchParams();
 if(orgId)p.set('orgId',String(orgId));
 if(from)p.set('from',String(from));if(to)p.set('to',String(to));
 for(const [k,v] of Object.entries(vars||{}))for(const x of [].concat(v))if(x!==undefined&&x!==null)p.append('var-'+k,String(x));
 if(viewPanel!==undefined&&viewPanel!==null)p.set('viewPanel',String(viewPanel));
 return base+'/d/'+encodeURIComponent(uid)+(slug?'/'+encodeURIComponent(slug):'')+(p.size?'?'+p:'');
}
const sameServer=(link,base)=>{try{const a=new URL(link.base),b=new URL(base);return a.host===b.host;}catch{return false;}};

module.exports={parse,find,shortLink,dashboard,sameServer,panelNumber};
