// «API-клиент», sending: one HTTP(S) request with node:http(s) — not the browser session, so no cookies, no cached
// credentials and no proxy auth of Petya's own. Limits: a timeout for the whole exchange, at most 5 redirects
// (followed only for GET/HEAD; a cross-origin hop drops Authorization/Cookie), and a response size cap.
const http=require('node:http');
const https=require('node:https');
const zlib=require('node:zlib');

const LIMITS={timeoutMs:20000,maxBytes:5*1024*1024,maxRedirects:5};
const DROP_ON_CROSS_ORIGIN=/^(?:authorization|proxy-authorization|cookie)$/i;

class SendError extends Error{constructor(kind,message,code=''){super(message);this.name='SendError';this.kind=kind;this.code=code;}}
function explain(e){
 const code=e?.code||'';
 if(code==='ENOTFOUND'||code==='EAI_AGAIN')return new SendError('dns','Адрес не найден: такого хоста нет или нет сети.',code);
 if(code==='ECONNREFUSED')return new SendError('refused','Соединение отклонено: на этом адресе и порту никто не слушает.',code);
 if(code==='ECONNRESET'||code==='EPIPE')return new SendError('reset','Сервер оборвал соединение.',code);
 if(code==='EHOSTUNREACH'||code==='ENETUNREACH')return new SendError('unreachable','Хост недоступен из этой сети.',code);
 if(/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)||/certificate/i.test(e?.message||''))return new SendError('tls','Ошибка сертификата HTTPS: '+(e.message||code)+'. Петя не отключает проверку сертификатов.',code);
 return new SendError('failed',e?.message||String(e),code);
}

function once({method,url,headers,body,timeoutMs,maxBytes,signal}){
 return new Promise((resolve,reject)=>{
  let u;try{u=new URL(url);}catch{return reject(new SendError('url','Некорректный адрес: '+url));}
  if(!['http:','https:'].includes(u.protocol))return reject(new SendError('url','Поддерживаются только http и https.'));
  const lib=u.protocol==='https:'?https:http;
  const t0=process.hrtime.bigint(),ms=()=>Number(process.hrtime.bigint()-t0)/1e6;
  const timing={};
  const out={};
  for(const h of headers)out[h.name]=h.value;
  if(!Object.keys(out).some(k=>/^user-agent$/i.test(k)))out['User-Agent']='Petya-API-Client';
  if(!Object.keys(out).some(k=>/^accept-encoding$/i.test(k)))out['Accept-Encoding']='gzip, deflate, br';
  const payload=body?Buffer.from(body):null;
  if(payload&&!Object.keys(out).some(k=>/^content-length$/i.test(k)))out['Content-Length']=String(payload.length);
  // agent:false — a fresh connection, nothing shared with Petya's own requests.
  const req=lib.request(u,{method,headers:out,agent:false},res=>{
   timing.ttfb=ms();
   const encoding=String(res.headers['content-encoding']||'').toLowerCase();
   const stream=encoding==='gzip'||encoding==='x-gzip'?res.pipe(zlib.createGunzip()):encoding==='deflate'?res.pipe(zlib.createInflate()):encoding==='br'?res.pipe(zlib.createBrotliDecompress()):res;
   const chunks=[];let size=0,truncated=false,wire=0;
   res.on('data',c=>{wire+=c.length;});
   stream.on('data',c=>{
    if(truncated)return;
    if(size+c.length>maxBytes){chunks.push(c.subarray(0,maxBytes-size));size=maxBytes;truncated=true;res.destroy();finish();return;}
    chunks.push(c);size+=c.length;
   });
   let done=false;
   const finish=()=>{if(done)return;done=true;clearTimeout(timer);timing.total=ms();
    resolve({status:res.statusCode,statusText:res.statusMessage||'',httpVersion:res.httpVersion,headers:res.rawHeaders.reduce((a,v,i,arr)=>i%2?a:[...a,{name:arr[i],value:arr[i+1]}],[]),body:Buffer.concat(chunks),size,wire,truncated,timing});};
   stream.on('end',finish);
   stream.on('error',e=>{if(truncated)return;done=true;clearTimeout(timer);reject(new SendError('decode','Не удалось распаковать ответ ('+encoding+'): '+e.message));});
   res.on('error',e=>{if(!truncated&&!done){done=true;clearTimeout(timer);reject(explain(e));}});
  });
  req.on('socket',sock=>{sock.once('lookup',()=>{timing.dns=ms();});sock.once('connect',()=>{timing.connect=ms();});sock.once('secureConnect',()=>{timing.tls=ms();});});
  const timer=setTimeout(()=>{const e=new SendError('timeout','Сервер не ответил за '+Math.round(timeoutMs/1000)+' с.','ETIMEDOUT');req.destroy(e);reject(e);},timeoutMs);
  req.on('error',e=>{clearTimeout(timer);reject(e instanceof SendError?e:explain(e));});
  signal?.addEventListener?.('abort',()=>req.destroy(new SendError('aborted','Запрос остановлен.')),{once:true});
  if(payload)req.write(payload);
  req.end();
 });
}

// The whole exchange with redirects. Returns the final response plus the hops it took.
async function send({method,url,headers=[],body=''},{timeoutMs=LIMITS.timeoutMs,maxBytes=LIMITS.maxBytes,maxRedirects=LIMITS.maxRedirects,signal}={}){
 const started=Date.now();
 const hops=[];
 let current={method,url,headers:[...headers],body};
 for(;;){
  const left=timeoutMs-(Date.now()-started);
  if(left<=0)throw new SendError('timeout','Сервер не ответил за '+Math.round(timeoutMs/1000)+' с.','ETIMEDOUT');
  const res=await once({...current,timeoutMs:left,maxBytes,signal});
  const location=res.headers.find(h=>/^location$/i.test(h.name))?.value;
  const redirect=[301,302,303,307,308].includes(res.status)&&location;
  const readOnly=['GET','HEAD'].includes(current.method)||res.status===303;
  if(!redirect||!readOnly)return {...res,url:current.url,method:current.method,redirects:hops,followed:false,stoppedRedirect:redirect?location:''};
  if(hops.length>=maxRedirects)throw new SendError('redirects','Слишком много перенаправлений (больше '+maxRedirects+').');
  let next;try{next=new URL(location,current.url);}catch{return {...res,url:current.url,method:current.method,redirects:hops,stoppedRedirect:location};}
  if(!['http:','https:'].includes(next.protocol))return {...res,url:current.url,method:current.method,redirects:hops,stoppedRedirect:location};
  hops.push({status:res.status,from:current.url,to:next.toString()});
  const cross=new URL(current.url).origin!==next.origin;
  current={method:res.status===303&&current.method!=='HEAD'?'GET':current.method,url:next.toString(),
   headers:current.headers.filter(h=>!(cross&&DROP_ON_CROSS_ORIGIN.test(h.name))&&!/^content-(?:length|type)$/i.test(h.name)),body:''};
 }
}

// What the card shows: JSON (as text, parsed by the renderer), text, an image preview, or just the size.
const CARD_TEXT=256*1024,CARD_IMAGE=1536*1024;
function view(res){
 const type=String(res.headers.find(h=>/^content-type$/i.test(h.name))?.value||'');
 const out={kind:'empty',contentType:type,size:res.size,truncated:res.truncated};
 if(!res.size)return out;
 const image=/^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|avif|bmp)/i.exec(type);
 if(image){
  // SVG is shown as an <img>, so its scripts never run.
  if(res.size<=CARD_IMAGE&&!res.truncated)return {...out,kind:'image',dataUrl:'data:'+type.split(';')[0]+';base64,'+res.body.toString('base64')};
  return {...out,kind:'binary'};
 }
 const text=res.body.toString('utf8');
 const binary=/[\x00-\x08\x0e-\x1a]/.test(text.slice(0,2000))&&!/json|text|xml|javascript/i.test(type);
 if(binary)return {...out,kind:'binary'};
 const trimmed=text.trim();
 if(/json/i.test(type)||/^[{[]/.test(trimmed)){try{JSON.parse(trimmed);return {...out,kind:'json',text:trimmed.length>CARD_TEXT?null:trimmed,preview:trimmed.length>CARD_TEXT?trimmed.slice(0,CARD_TEXT):undefined};}catch{/* not JSON after all */}}
 return {...out,kind:/html/i.test(type)?'html':'text',text:text.slice(0,CARD_TEXT),cut:text.length>CARD_TEXT};
}
module.exports={send,view,SendError,LIMITS};
