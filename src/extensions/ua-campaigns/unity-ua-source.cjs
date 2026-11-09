// UA source «Unity Ads»: the Advertising Statistics API v2 (acquisitions report).
//   GET https://services.api.unity.com/advertise/stats/v2/organizations/<organization core ID>/reports/acquisitions
//       ?start=<ISO>&end=<ISO>&scale=day&metrics=starts,clicks,installs,spend&breakdowns=campaign,country,platform&format=json
// Auth: a service account with the «Advertise Stats API Viewer» role; its Key ID and Secret key go into
// `Authorization: Basic base64(<key id>:<secret key>)`. 204 means no data. Rate limit: 1 request per second and
// 30 per 30 minutes per organization and IP — one request per period here. `starts` (ad starts) are impressions.
const BASE='https://services.api.unity.com/advertise/stats/v2/organizations/';
const ORG=/^[A-Za-z0-9-]{4,64}$/,KEY_ID=/^[A-Za-z0-9-]{8,100}$/,SECRET=/^[\x21-\x39\x3b-\x7e]{8,300}$/;
const conf=settings=>({org:String(settings.uaUnityOrg||'').trim(),id:String(settings.uaUnityKeyId||'').trim(),secret:String(settings.uaUnitySecret||'').trim()});
function explain(e){
 const map={401:'Unity не принял ключ сервисного аккаунта. Проверьте Key ID и Secret key в настройках «Закупка трафика».',403:'У сервисного аккаунта Unity нет роли «Advertise Stats API Viewer» в этой организации.',404:'Unity не нашёл организацию: нужен Organization core ID из настроек Unity Ads.',429:'Unity ограничил запросы (1 в секунду, 30 за 30 минут). Повторите позже.'};
 const out=Error(map[e?.status]||(e?.status===400?'Unity отклонил запрос отчёта'+(e.detail?': '+String(e.detail).slice(0,200):'.'):e?.message||'Unity Ads недоступен.'));out.status=e?.status;return out;
}
module.exports={
 id:'unity-ua',name:'Unity Ads',
 names:[/unity\s*ads|юнити\s*адс|(?:^|[^\p{L}])(?:в|из|по|у)\s+(?:unity|юнити)(?=$|[^\p{L}])/iu],
 maxDays:730,ORG,KEY_ID,SECRET,
 ready:settings=>{const c=conf(settings);return ORG.test(c.org)&&KEY_ID.test(c.id)&&SECRET.test(c.secret);},
 hint:settings=>module.exports.ready(settings)?'':'Organization core ID, Key ID и Secret key Unity — в настройках «Закупка трафика».',
 async fetch(s,{start,end,check}){
  const c=conf(s.settings);
  const next=new Date(Date.parse(end+'T00:00:00Z')+86400e3).toISOString();
  const q=new URLSearchParams({start:start+'T00:00:00.000Z',end:next,scale:'day',metrics:'starts,clicks,installs,spend',breakdowns:'campaign,country,platform',format:'json'});
  let r;
  try{r=await s.request(BASE+encodeURIComponent(c.org)+'/reports/acquisitions?'+q,{headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(c.id+':'+c.secret).toString('base64')},timeoutMs:120000});}
  catch(e){throw explain(e);}
  check?.();
  if(r===null)return {rows:[]};
  if(!Array.isArray(r?.data))throw Error('Unity вернул некорректный отчёт.');
  return {rows:r.data.map(x=>({date:String(x.timestamp||'').slice(0,10),network:'Unity Ads',campaign:x.campaignName,campaignId:x.campaignId,country:x.country,platform:x.platform,
   spend:x.spend,installs:x.installs,clicks:x.clicks,impressions:x.starts,currency:'USD'})),
   notes:['Unity Ads: данные обновляются раз в час, метрики до установки — с задержкой около 85 минут.']};
 }
};
