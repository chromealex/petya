// «Мониторинг», HTTP: one request with node:http(s) for the monitoring APIs and the uptime probes.
// - proxies are respected: the system/Electron proxy (`resolveProxy`, set by the feature from the app session) or
//   HTTPS_PROXY / HTTP_PROXY / ALL_PROXY with NO_PROXY; HTTPS goes through a CONNECT tunnel, so the server's
//   certificate is still read (TLS expiry); localhost is always direct;
// - TLS is always verified; a timeout covers the whole exchange; the body is capped;
// - redirects are not followed (a probe reports a 3xx as it is);
// - only GET/HEAD, and POST for the one confirmed write (an Alertmanager silence) — the caller decides.
const http=require('node:http');
const https=require('node:https');
const tls=require('node:tls');

const LIMITS={timeoutMs:15000,maxBytes:4*1024*1024};
// SNI only for names (RFC 6066: not for IP addresses).
const sni=host=>require('node:net').isIP(host.replace(/^\[|\]$/g,''))?undefined:host;
let systemResolver=null;
// The feature sets the Electron session resolver: url → Promise<'DIRECT' | 'PROXY host:port; …'>.
function useSystemProxy(fn){systemResolver=typeof fn==='function'?fn:null;}

function noProxy(host){
 const list=String(process.env.NO_PROXY||process.env.no_proxy||'').split(/[,\s]+/).filter(Boolean);
 return list.some(p=>p==='*'||host===p.replace(/^\./,'')||host.endsWith(p.startsWith('.')?p:'.'+p));
}
const LOCAL=/^(?:localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/i;
// '' for a direct connection, or the proxy URL (http://host:port).
async function proxyFor(url,{resolveProxy}={}){
 const u=new URL(url);
 if(LOCAL.test(u.hostname))return '';
 const resolver=resolveProxy===undefined?systemResolver:resolveProxy;
 if(resolver){
  try{
   const r=String(await resolver(url)||'');
   const m=/(?:^|;)\s*(?:PROXY|HTTPS)\s+([^\s;]+)/i.exec(r);
   if(m)return /^https?:\/\//.test(m[1])?m[1]:'http://'+m[1];
   if(/^\s*DIRECT/i.test(r))return '';
  }catch{/* fall back to the environment */}
 }
 if(noProxy(u.hostname))return '';
 const env=u.protocol==='https:'?process.env.HTTPS_PROXY||process.env.https_proxy||process.env.ALL_PROXY||process.env.all_proxy:process.env.HTTP_PROXY||process.env.http_proxy||process.env.ALL_PROXY||process.env.all_proxy;
 return env&&/^https?:\/\//.test(env)?env:'';
}

class HttpError extends Error{constructor(message,{status=0,code='',kind='failed'}={}){super(message);this.name='HttpError';this.status=status;this.code=code;this.kind=kind;}}
function explain(e){
 const code=e?.code||'';
 if(e instanceof HttpError)return e;
 if(code==='ENOTFOUND'||code==='EAI_AGAIN')return new HttpError('Адрес не найден (DNS).',{code,kind:'dns'});
 if(code==='ECONNREFUSED')return new HttpError('Соединение отклонено.',{code,kind:'refused'});
 if(code==='ECONNRESET'||code==='EPIPE')return new HttpError('Сервер оборвал соединение.',{code,kind:'reset'});
 if(code==='EHOSTUNREACH'||code==='ENETUNREACH')return new HttpError('Хост недоступен.',{code,kind:'unreachable'});
 if(/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)||/certificate/i.test(e?.message||''))return new HttpError('Ошибка сертификата: '+(e.message||code),{code,kind:'tls'});
 return new HttpError(e?.message||String(e),{code});
}
function certInfo(socket){
 try{
  const c=socket?.getPeerCertificate?.();if(!c||!c.valid_to)return null;
  const to=Date.parse(c.valid_to);
  return {validTo:Number.isFinite(to)?new Date(to).toISOString():null,subject:String(c.subject?.CN||''),issuer:String(c.issuer?.O||c.issuer?.CN||'')};
 }catch{return null;}
}

// A CONNECT tunnel through an HTTP proxy, then TLS to the target over it.
function tunnel(proxy,u,timeoutMs){
 return new Promise((resolve,reject)=>{
  const p=new URL(proxy),port=u.port||443;
  const headers={Host:u.hostname+':'+port};
  if(p.username)headers['Proxy-Authorization']='Basic '+Buffer.from(decodeURIComponent(p.username)+':'+decodeURIComponent(p.password)).toString('base64');
  const req=http.request({host:p.hostname,port:p.port||80,method:'CONNECT',path:u.hostname+':'+port,headers,timeout:timeoutMs});
  req.on('connect',(res,socket)=>{
   if(res.statusCode!==200){socket.destroy();return reject(new HttpError('Прокси отказал: HTTP '+res.statusCode,{kind:'proxy'}));}
   resolve(tls.connect({socket,servername:sni(u.hostname)}));
  });
  req.on('timeout',()=>req.destroy(new HttpError('Прокси не ответил вовремя.',{kind:'timeout'})));
  req.on('error',reject);req.end();
 });
}

// → {status, headers, body (string), ms, ttfb, cert|null, proxied}
async function request(url,{method='GET',headers={},body,timeoutMs=LIMITS.timeoutMs,maxBytes=LIMITS.maxBytes,resolveProxy}={}){
 let u;try{u=new URL(url);}catch{throw new HttpError('Некорректный адрес: '+url,{kind:'url'});}
 if(!['http:','https:'].includes(u.protocol))throw new HttpError('Поддерживаются только http и https.',{kind:'url'});
 if(!['GET','HEAD','POST'].includes(method))throw new HttpError('Метод '+method+' не используется.',{kind:'url'});
 const proxy=await proxyFor(url,{resolveProxy});
 const started=process.hrtime.bigint(),ms=()=>Math.round(Number(process.hrtime.bigint()-started)/1e6);
 const deadline=AbortSignal.timeout(timeoutMs);
 const out={...headers};if(body!==undefined&&!Object.keys(out).some(k=>/^content-type$/i.test(k)))out['Content-Type']='application/json';
 if(body!==undefined)out['Content-Length']=Buffer.byteLength(body);
 const options={method,headers:out,signal:deadline};
 if(proxy&&u.protocol==='https:'){
  const socket=await tunnel(proxy,u,timeoutMs).catch(e=>{throw explain(e);});
  Object.assign(options,{host:u.hostname,port:u.port||443,path:u.pathname+u.search,servername:sni(u.hostname),createConnection:()=>socket,agent:false});
 }else if(proxy){
  const p=new URL(proxy);
  Object.assign(options,{host:p.hostname,port:p.port||80,path:u.href});
  if(p.username)out['Proxy-Authorization']='Basic '+Buffer.from(decodeURIComponent(p.username)+':'+decodeURIComponent(p.password)).toString('base64');
 }else Object.assign(options,{host:u.hostname,port:u.port||(u.protocol==='https:'?443:80),path:u.pathname+u.search,servername:sni(u.hostname)});
 const lib=u.protocol==='https:'?https:http;
 return await new Promise((resolve,reject)=>{
  const req=lib.request(options,res=>{
   const ttfb=ms(),cert=u.protocol==='https:'?certInfo(res.socket):null;
   const chunks=[];let size=0,cut=false;
   res.on('data',c=>{if(cut)return;size+=c.length;if(size>maxBytes){cut=true;chunks.push(c.subarray(0,Math.max(0,c.length-(size-maxBytes))));res.destroy();finish();}else chunks.push(c);});
   const finish=()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8'),ms:ms(),ttfb,cert,proxied:!!proxy,cut});
   res.on('end',finish);res.on('error',e=>cut?null:reject(explain(e)));
  });
  req.on('error',e=>reject(e?.name==='AbortError'||deadline.aborted?new HttpError('Нет ответа за '+Math.round(timeoutMs/1000)+' с.',{kind:'timeout'}):explain(e)));
  if(body!==undefined)req.write(body);
  req.end();
 });
}

// JSON API call: non-2xx is an error with the status; the body is parsed.
async function json(url,{method='GET',headers={},body,timeoutMs,resolveProxy}={}){
 const r=await request(url,{method,headers:{Accept:'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),timeoutMs,resolveProxy});
 if(r.status<200||r.status>=300){
  let detail='';try{const d=JSON.parse(r.body);detail=d.error||d.message||'';}catch{detail='';}
  const what=r.status===401||r.status===403?'нет доступа (проверьте токен)':r.status===404?'адрес API не найден (проверьте адрес)':'HTTP '+r.status;
  throw new HttpError('Сервис ответил: '+what+(detail?' — '+String(detail).slice(0,200):''),{status:r.status,kind:'http'});
 }
 if(!r.body)return null;
 try{return JSON.parse(r.body);}catch{throw new HttpError('Сервис вернул не JSON.',{kind:'format'});}
}
// Authorization header from a saved secret: «user:password» → Basic, anything else → Bearer.
function auth(token){
 const t=String(token||'').trim();if(!t)return {};
 return /^[^\s:]+:[^\s]+$/.test(t)&&!/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(t)?{Authorization:'Basic '+Buffer.from(t).toString('base64')}:{Authorization:'Bearer '+t};
}
// A base URL from settings: https (or http for a local/LAN address), no credentials, no trailing slash.
function base(value){
 const v=String(value||'').trim().replace(/\/+$/,'');if(!v)return '';
 let u;try{u=new URL(v);}catch{throw Error('Адрес «'+v.slice(0,80)+'» — не URL.');}
 if(!['http:','https:'].includes(u.protocol))throw Error('Адрес должен начинаться с https://');
 if(u.username||u.password)throw Error('Не пишите логин и пароль в адресе — для этого есть поле токена.');
 return u.origin+u.pathname.replace(/\/+$/,'');
}

module.exports={request,json,auth,base,proxyFor,useSystemProxy,HttpError,LIMITS};
