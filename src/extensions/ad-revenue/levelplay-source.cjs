// Ad source «Unity LevelPlay» (ironSource): the LevelPlay Reporting API v1.
// Auth: GET https://platform.ironsrc.com/partners/publisher/auth with headers `secretkey` and `refreshToken`
// (LevelPlay → My Account → API) answers a bearer token valid for 24 hours; reports are
// GET https://platform.ironsrc.com/levelPlay/reporting/v1 with `Authorization: Bearer <token>`.
// Breakdown `adNetwork` comes back as `networkName`; limit 8000 requests per hour; dates are UTC.
// Three reports: per day × app × platform × network × format (revenue, impressions), per day × app × platform
// (activeUsers for ARPDAU, appRequests/appFills for the fill rate — they are mediation-level, not per network),
// and per country for the asked period.
const shape=require('./shape.cjs');
const AUTH='https://platform.ironsrc.com/partners/publisher/auth';
const REPORT='https://platform.ironsrc.com/levelPlay/reporting/v1';
const PER_PAGE=5000,PAGES=10;
const SECRET=/^[A-Za-z0-9_-]{8,200}$/;

const secret=settings=>String(settings.adRevenueLevelplaySecret||'').trim();
const refresh=settings=>String(settings.adRevenueLevelplayRefresh||'').trim();
// Bearer tokens live 24 hours; one is kept per key pair for 23 hours, in memory only.
const tokens=new Map();

function explain(error,stage){
 const map={401:stage==='auth'?'LevelPlay не принял Secret Key и Refresh Token. Проверьте их в настройках «Реклама и монетизация».':'LevelPlay отклонил токен доступа.',403:'У ключей LevelPlay нет доступа к отчётам.',429:'LevelPlay ограничил число запросов (8000 в час). Повторите позже.'};
 const e=Error(map[error.status]||(error.status===400?'LevelPlay отклонил запрос отчёта'+(error.detail?': '+String(error.detail).slice(0,200):'.'):error.message||'LevelPlay недоступен.'));
 e.status=error.status;e.cause=error;return e;
}
async function token(s,now=Date.now()){
 const id=secret(s.settings)+'\n'+refresh(s.settings),hit=tokens.get(id);
 if(hit&&hit.until>now)return hit.token;
 let r;try{r=await s.request(AUTH,{headers:{secretkey:secret(s.settings),refreshToken:refresh(s.settings)}});}catch(e){throw explain(e,'auth');}
 // The body is the token itself, a JSON string.
 const value=typeof r==='string'?r.replace(/^"|"$/g,'').trim():String(r?.token||r?.access_token||'').trim();
 if(!value||/\s/.test(value))throw Error('LevelPlay не выдал токен доступа.');
 tokens.set(id,{token:value,until:now+23*3600000});
 return value;
}
async function report(s,params,check){
 const bearer=await token(s);check?.();
 const rows=[];
 for(let page=1;page<=PAGES;page++){
  const query=new URLSearchParams({...params,page:String(page),resultsPerPage:String(PER_PAGE)});
  let r;try{r=await s.request(REPORT+'?'+query,{headers:{Authorization:'Bearer '+bearer,Accept:'application/json'}});}
  catch(e){if(e.status===401)tokens.clear();throw explain(e,'report');}
  check?.();
  const data=Array.isArray(r)?r:r?.data;
  if(!Array.isArray(data))throw Error('LevelPlay вернул некорректный отчёт.');
  rows.push(...data);
  const total=Number(r?.totalResults);
  if(!data.length||data.length<PER_PAGE||(Number.isFinite(total)&&rows.length>=total))return {rows,truncated:false};
 }
 return {rows,truncated:true};
}
const app=r=>String(r.appName||r.app||r.appKey||'').trim();
const day=r=>String(r.date||r.day||'').slice(0,10);

module.exports={
 id:'levelplay',name:'Unity LevelPlay',
 ready:settings=>SECRET.test(secret(settings))&&SECRET.test(refresh(settings)),
 hint:'Secret Key и Refresh Token LevelPlay — в настройках «Реклама и монетизация».',
 maxDays:90,
 SECRET,
 forget(){tokens.clear();},
 async fetch(s,{start,end,current,check}){
  const notes=[];
  const main=await report(s,{startDate:start,endDate:end,breakdowns:'date,app,platform,adNetwork,adFormat',metrics:'revenue,impressions'},check);
  const daily=await report(s,{startDate:start,endDate:end,breakdowns:'date,app,platform',metrics:'revenue,activeUsers,appRequests,appFills'},check);
  const geo=await report(s,{startDate:current.start,endDate:current.end,breakdowns:'country',metrics:'revenue,impressions'},check);
  if(main.truncated||daily.truncated)notes.push('LevelPlay: отчёт слишком большой, показана только часть строк.');
  const rows=main.rows.map(r=>({day:day(r),app:app(r),bundle:String(r.bundleId||r.appKey||''),platform:shape.platform(r.platform),network:shape.network(r.networkName||r.adNetwork),
   format:shape.format(r.adFormat),revenue:shape.number(r.revenue),impressions:shape.number(r.impressions),attempts:null,responses:null})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day));
  const days=daily.rows.map(r=>({day:day(r),app:app(r),platform:shape.platform(r.platform),dau:shape.number(r.activeUsers),requests:shape.number(r.appRequests),fills:shape.number(r.appFills)})).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.day));
  const countries=geo.rows.map(r=>({country:String(r.country||r.countryCode||'').toUpperCase().slice(0,2),revenue:shape.number(r.revenue),impressions:shape.number(r.impressions)})).filter(r=>r.country);
  return {rows,days,countries,notes};
 }
};
