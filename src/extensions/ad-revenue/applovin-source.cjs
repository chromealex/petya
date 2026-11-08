// Ad source «AppLovin MAX»: the MAX Revenue Reporting API (https://r.applovin.com/maxReport).
// Auth: the account's Report Key as the `api_key` query parameter (MAX dashboard → Account → Keys).
// The API serves at most the last 45 days, revenue and eCPM are estimates in USD, times are UTC, and data of the
// last 1–2 hours may be incomplete. `attempts`, `responses` and `fill_rate` work only together with `network`.
// Two reports per request: per day × app × platform × network × format (with attempts/responses for fill rate),
// and per country for the asked period only (the country dimension would multiply the first report).
const shape=require('./shape.cjs');
const URL_BASE='https://r.applovin.com/maxReport';
const PAGE=10000,PAGES=10;
const KEY=/^[A-Za-z0-9_-]{16,300}$/;

const key=settings=>String(settings.adRevenueApplovinKey||'').trim();
function explain(error){
 const map={401:'AppLovin не принял Report Key. Проверьте ключ в настройках «Реклама и монетизация».',403:'У Report Key AppLovin нет доступа к отчётам MAX.',429:'AppLovin ограничил число запросов. Повторите через минуту.'};
 const e=Error(map[error.status]||(error.status===400?'AppLovin отклонил запрос отчёта'+(error.detail?': '+String(error.detail).slice(0,200):'.'):error.message||'AppLovin недоступен.'));
 e.status=error.status;e.cause=error;return e;
}
async function report(s,params,check){
 const rows=[];
 for(let page=0;page<PAGES;page++){
  const query=new URLSearchParams({api_key:key(s.settings),format:'json',not_zero:'1',limit:String(PAGE),offset:String(page*PAGE),...params});
  let r;try{r=await s.request(URL_BASE+'?'+query,{headers:{Accept:'application/json'}});}catch(e){throw explain(e);}
  check?.();
  if(!r||typeof r!=='object'||!Array.isArray(r.results))throw Error('AppLovin вернул некорректный отчёт.');
  if(r.code!==undefined&&Number(r.code)!==200)throw Error('AppLovin вернул ошибку отчёта (код '+r.code+').');
  rows.push(...r.results);
  if(r.results.length<PAGE)return {rows,truncated:false};
 }
 return {rows,truncated:true};
}

module.exports={
 id:'applovin',name:'AppLovin MAX',
 ready:settings=>KEY.test(key(settings)),
 hint:'Report Key AppLovin MAX — в настройках «Реклама и монетизация».',
 // The window the API allows: the last 45 days.
 maxDays:45,
 KEY,
 async fetch(s,{start,end,current,check}){
  const notes=[];
  const main=await report(s,{start,end,columns:'day,application,package_name,platform,network,ad_format,attempts,responses,impressions,estimated_revenue'},check);
  if(main.truncated)notes.push('AppLovin: отчёт слишком большой, показаны первые '+(PAGE*PAGES).toLocaleString('ru-RU')+' строк.');
  const rows=main.rows.map(r=>({
   day:String(r.day||'').slice(0,10),app:String(r.application||r.package_name||'').trim(),bundle:String(r.package_name||''),
   platform:shape.platform(r.platform),network:shape.network(r.network),format:shape.format(r.ad_format),
   revenue:shape.number(r.estimated_revenue),impressions:shape.number(r.impressions),
   attempts:r.attempts===undefined?null:shape.number(r.attempts),responses:r.responses===undefined?null:shape.number(r.responses)
  })).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day));
  const geo=await report(s,{start:current.start,end:current.end,columns:'country,impressions,estimated_revenue'},check);
  const countries=geo.rows.map(r=>({country:String(r.country||'').toUpperCase().slice(0,2),revenue:shape.number(r.estimated_revenue),impressions:shape.number(r.impressions)})).filter(r=>r.country);
  notes.push('AppLovin: оценка выручки в USD; данные последних 1–2 часов могут быть неполными.');
  return {rows,days:[],countries,notes};
 }
};
