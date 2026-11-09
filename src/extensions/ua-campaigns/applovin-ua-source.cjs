// UA source «AppLovin (Axon)»: the advertiser report of the AppLovin Reporting API.
//   GET https://r.applovin.com/report?api_key=<Report Key>&report_type=advertiser&format=json&start&end
//       &columns=day,campaign,campaign_id_external,country,platform,impressions,clicks,conversions,cost
// `conversions` are installs, `cost` the spend in USD; the API serves the last 45 days. The Report Key is the same
// key as for MAX revenue reports: when «Реклама и монетизация» already has it, it is reused, not asked again.
const URL_BASE='https://r.applovin.com/report';
const KEY=/^[A-Za-z0-9_-]{16,300}$/;
const PAGE=10000,PAGES=10;
const key=settings=>String(settings.uaApplovinKey||settings.adRevenueApplovinKey||'').trim();
function explain(e){
 const map={401:'AppLovin не принял Report Key. Проверьте ключ в настройках «Закупка трафика».',403:'У Report Key AppLovin нет доступа к отчётам рекламодателя.',429:'AppLovin ограничил число запросов. Повторите через минуту.'};
 const out=Error(map[e?.status]||(e?.status===400?'AppLovin отклонил запрос отчёта'+(e.detail?': '+String(e.detail).slice(0,200):'.'):e?.message||'AppLovin недоступен.'));out.status=e?.status;return out;
}
module.exports={
 id:'applovin-ua',name:'AppLovin',
 names:[/(?:^|[^\p{L}])(?:applovin|аппловин\p{L}*|эпловин\p{L}*|axon|аксон\p{L}*)(?=$|[^\p{L}])/iu],
 maxDays:45,KEY,
 ready:settings=>KEY.test(key(settings)),
 hint:settings=>KEY.test(key(settings))?'':'Report Key AppLovin — в настройках «Закупка трафика».',
 async fetch(s,{start,end,check}){
  const rows=[];let truncated=true;
  for(let page=0;page<PAGES;page++){
   const q=new URLSearchParams({api_key:key(s.settings),report_type:'advertiser',format:'json',start,end,limit:String(PAGE),offset:String(page*PAGE),
    columns:'day,campaign,campaign_id_external,country,platform,impressions,clicks,conversions,cost'});
   let r;try{r=await s.request(URL_BASE+'?'+q,{headers:{Accept:'application/json'}});}catch(e){throw explain(e);}
   check?.();
   const list=Array.isArray(r)?r:Array.isArray(r?.results)?r.results:null;
   if(!list)throw Error('AppLovin вернул некорректный отчёт.');
   if(r?.code!==undefined&&Number(r.code)!==200)throw Error('AppLovin вернул ошибку отчёта (код '+r.code+').');
   rows.push(...list.map(x=>({date:x.day,network:'AppLovin',campaign:x.campaign,campaignId:x.campaign_id_external,country:x.country,platform:x.platform,
    spend:x.cost,installs:x.conversions,clicks:x.clicks,impressions:x.impressions,currency:'USD'})));
   if(list.length<PAGE){truncated=false;break;}
  }
  return {rows,truncated,notes:truncated?['AppLovin: отчёт слишком большой, показаны первые '+PAGE*PAGES+' строк.']:[]};
 }
};
