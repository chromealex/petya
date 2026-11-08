// «Мониторинг», built-in uptime checks: Petya polls the user's endpoints itself.
// A probe is one GET (or HEAD) — never POST, never a body, no cookies, no stored credentials — through the
// proxy (http.cjs), with a timeout. It records the status code, the latency, the days until the TLS certificate
// expires, and whether the expected keyword is in the body. Results are kept 30 days in the local store.
const H=require('./http.cjs');
const DAY=86400000,MIN=60000;

const clean=v=>String(v??'').trim();
// A check as the user saved it, validated: {id, name, url, method, expect, keyword, intervalMin, timeoutSec, service, enabled}.
function validate(raw){
 const url=clean(raw?.url);
 let u;try{u=new URL(url);}catch{throw Error('Адрес проверки — полный URL, например https://api.example.com/health');}
 if(!['https:','http:'].includes(u.protocol))throw Error('Проверять можно только https:// (или http:// для локальных адресов).');
 if(u.protocol==='http:'&&!/^(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|\[?::1)/.test(u.hostname))throw Error('Для внешних адресов — только https://');
 if(u.username||u.password)throw Error('Логин и пароль в адресе проверки не храню.');
 const method=clean(raw?.method||'GET').toUpperCase();
 if(!['GET','HEAD'].includes(method))throw Error('Проверка делает только GET или HEAD — ничего не отправляет.');
 const expect=clean(raw?.expect||'200-399');
 if(!/^\d{3}(?:-\d{3})?(?:,\s*\d{3}(?:-\d{3})?)*$/.test(expect))throw Error('Ожидаемый код: 200, 200-299 или 200,204.');
 const keyword=clean(raw?.keyword).slice(0,200);
 if(keyword&&method==='HEAD')throw Error('Ключевое слово ищется в теле ответа — нужен GET.');
 const interval=Math.round(Number(raw?.intervalMin??5));
 if(!(interval>=1&&interval<=60))throw Error('Интервал — от 1 до 60 минут.');
 const timeout=Math.round(Number(raw?.timeoutSec??10));
 if(!(timeout>=1&&timeout<=60))throw Error('Таймаут — от 1 до 60 секунд.');
 const service=clean(raw?.service||u.hostname).toLowerCase().replace(/\s+/g,'-').slice(0,120);
 return {id:clean(raw?.id).slice(0,64)||undefined,name:clean(raw?.name||u.hostname+u.pathname.replace(/\/$/,'')).slice(0,120),url:u.href,method,expect,keyword,intervalMin:interval,timeoutSec:timeout,service,enabled:raw?.enabled!==false};
}
function expected(status,expect){
 return String(expect||'200-399').split(',').some(part=>{const [a,b]=part.trim().split('-').map(Number);return b?status>=a&&status<=b:status===a;});
}
// One probe → {at, ok, status, ms, tlsDays, keywordOk, error}. `request` and `now` are injectable for tests;
// `certificate(result)` may replace the certificate read (TLS info stubbed in tests).
async function probe(check,{request=H.request,now=()=>Date.now(),certificate=null,resolveProxy}={}){
 const at=now();
 try{
  const r=await request(check.url,{method:check.method||'GET',headers:{'User-Agent':'Petya-Uptime/1','Cache-Control':'no-cache'},timeoutMs:(check.timeoutSec||10)*1000,maxBytes:512*1024,resolveProxy});
  const cert=certificate?certificate(check,r):r.cert;
  const to=Date.parse(cert?.validTo);
  const tlsDays=Number.isFinite(to)?Math.floor((to-at)/DAY):null;
  const keywordOk=check.keyword?String(r.body||'').includes(check.keyword):null;
  const okStatus=expected(r.status,check.expect);
  const error=!okStatus?'Код '+r.status:keywordOk===false?'Нет слова «'+check.keyword+'» в ответе':tlsDays!==null&&tlsDays<0?'Сертификат истёк':'';
  return {at,ok:!error,status:r.status,ms:r.ms,tlsDays,keywordOk,error};
 }catch(e){return {at,ok:false,status:0,ms:null,tlsDays:null,keywordOk:null,error:String(e.message||e).slice(0,160)};}
}
// Runs `fn` over `items` with at most `limit` at once.
async function pool(items,limit,fn){
 const out=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));
 return out;
}
// Checks whose interval has passed since their last probe.
function due(store,now){
 return store.checks().filter(c=>c.enabled!==false).filter(c=>{const last=store.lastProbe(c.id);return !last||now-last[0]>=c.intervalMin*MIN-5000;});
}
// Probes the due checks (bounded concurrency) and stores the results.
async function run(store,{now=()=>Date.now(),concurrency=4,only=null,...opts}={}){
 const list=only?store.checks().filter(c=>only.includes(c.id)):due(store,now());
 const results=await pool(list,concurrency,async c=>({check:c,result:await probe(c,{now,...opts})}));
 for(const {check,result} of results)store.addProbe(check.id,result);
 if(results.length)store.save();
 return results;
}

const percentile=(values,p)=>{const v=values.filter(x=>typeof x==='number').sort((a,b)=>a-b);if(!v.length)return null;return v[Math.min(v.length-1,Math.ceil(p*v.length)-1)];};
// Uptime % over [from, to], a strip of `days` daily percentages (null = no data), p95 latency, failures as
// intervals (consecutive failed probes), the last result and the TLS days.
function stats(store,check,{now,days=30,from}={}){
 const start=from??now-days*DAY;
 const list=store.probes(check.id,Math.min(start,now-days*DAY));
 const inRange=list.filter(p=>p[0]>=start);
 const ok=inRange.filter(p=>p[1]).length;
 const today=new Date(now);today.setHours(0,0,0,0);
 const strip=Array.from({length:days},(_,i)=>{
  const a=today.getTime()-(days-1-i)*DAY,b=a+DAY,day=list.filter(p=>p[0]>=a&&p[0]<b);
  return day.length?{day:new Date(a).toISOString(),percent:day.filter(p=>p[1]).length/day.length,probes:day.length}:{day:new Date(a).toISOString(),percent:null,probes:0};
 });
 const failures=[];let open=null;
 for(const p of inRange){
  if(!p[1]){if(!open)open={from:p[0],to:null,error:p[5],probes:0};open.probes++;}
  else if(open){open.to=p[0];failures.push(open);open=null;}
 }
 if(open)failures.push(open);
 const last=list.at(-1)||null;
 const latency=inRange.slice(-60).map(p=>p[2]);
 return {id:check.id,name:check.name,url:check.url,service:check.service,percent:inRange.length?ok/inRange.length:null,probes:inRange.length,strip,failures,
  latencyP95:percentile(inRange.map(p=>p[2]),0.95),latency:latency.map((v,i)=>[inRange.slice(-60)[i][0],v]),
  last:last?{at:new Date(last[0]).toISOString(),ok:!!last[1],ms:last[2],status:last[3],tlsDays:last[4],error:last[5]}:null,
  tlsDays:[...list].reverse().find(p=>p[4]!==null)?.[4]??null};
}
// The status of a check now: two failed probes in a row → critical, one → warn, TLS < 7 days → warn, expired → critical.
function status(store,check){
 const recent=store.probes(check.id).slice(-2);
 if(!recent.length)return {status:'unknown',since:null};
 const tls=recent.at(-1)[4];
 let s=recent.at(-1)[1]?'ok':recent.length===2&&!recent[0][1]?'critical':'warn';
 if(s==='ok'&&tls!==null&&tls<7)s='warn';
 if(tls!==null&&tls<0)s='critical';
 // Since: the first probe of the current run of the same outcome.
 const all=store.probes(check.id);let i=all.length-1;const want=all[i][1];
 while(i>0&&all[i-1][1]===want)i--;
 return {status:s,since:new Date(all[i][0]).toISOString()};
}
module.exports={validate,probe,run,due,stats,status,expected,pool,percentile};
