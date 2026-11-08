// UA source «Meta»: ad account insights of the Marketing API (Graph API).
//   GET https://graph.facebook.com/<version>/act_<ad account id>/insights?level=campaign&time_increment=1
//       &time_range={"since","until"}&breakdowns=country&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency
//       &limit=500&access_token=<token>          then `paging.next` until there is none
// Installs are the `mobile_app_install` action (or `omni_app_install`). Spend is in the ad account's currency.
// The token needs `ads_read` (a system user token of the business is the stable choice). Insights by platform
// (iOS/Android) cannot be combined with the country breakdown, so platform stays empty here.
const VERSION='v24.0';
const BASE='https://graph.facebook.com/'+VERSION+'/';
const ACCOUNT=/^(?:act_)?\d{5,20}$/,TOKEN=/^[A-Za-z0-9_-]{30,600}$/;
const PAGES=40;
const accounts=settings=>String(settings.uaMetaAccounts||'').split(/[\s,;]+/).map(v=>v.trim()).filter(v=>ACCOUNT.test(v)).slice(0,5).map(v=>v.replace(/^act_/,''));
const token=settings=>String(settings.uaMetaToken||'').trim();
function explain(e){
 let detail='';try{detail=JSON.parse(e?.detail||'{}')?.error?.message||'';}catch{detail='';}
 const map={400:'Meta отклонила запрос'+(detail?': '+detail.slice(0,200):'.'),401:'Meta не приняла токен. Обновите его в настройках «Закупка трафика».',403:'У токена Meta нет права ads_read на этот рекламный аккаунт.',429:'Meta ограничила число запросов. Повторите позже.'};
 const out=Error(/expired|Session has expired/i.test(detail)?'Токен Meta истёк. Создайте новый (лучше токен системного пользователя) и сохраните его в настройках.':map[e?.status]||e?.message||'Meta недоступна.');out.status=e?.status;return out;
}
const installs=actions=>{const list=Array.isArray(actions)?actions:[];const a=list.find(x=>x?.action_type==='mobile_app_install')||list.find(x=>x?.action_type==='omni_app_install')||list.find(x=>x?.action_type==='app_install');return a?Number(a.value)||0:0;};
module.exports={
 id:'meta-ua',name:'Meta',VERSION,ACCOUNT,TOKEN,
 names:[/(?:^|[^\p{L}])(?:meta|мета|facebook|фейсбук\p{L}*|фб|instagram|инстаграм\p{L}*)(?=$|[^\p{L}])/iu],
 maxDays:37*30,
 ready:settings=>accounts(settings).length>0&&TOKEN.test(token(settings)),
 hint:settings=>module.exports.ready(settings)?'':'Рекламный аккаунт и токен Meta — в настройках «Закупка трафика».',
 async fetch(s,{start,end,check}){
  const rows=[];const notes=[];let truncated=false;
  for(const id of accounts(s.settings)){
   let url=BASE+'act_'+id+'/insights?'+new URLSearchParams({level:'campaign',time_increment:'1',time_range:JSON.stringify({since:start,until:end}),breakdowns:'country',
    fields:'campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency',limit:'500',access_token:token(s.settings)});
   for(let page=0;url;page++){
    if(page>=PAGES){truncated=true;notes.push('Meta: отчёт слишком большой, показана часть.');break;}
    let r;try{r=await s.request(url,{headers:{Accept:'application/json'}});}catch(e){throw explain(e);}
    check?.();
    if(!Array.isArray(r?.data))throw Error('Meta вернула некорректный отчёт.');
    for(const x of r.data)rows.push({date:x.date_start,network:'Meta',campaign:x.campaign_name,campaignId:x.campaign_id,country:x.country,platform:'',
     spend:x.spend,installs:installs(x.actions),clicks:x.clicks,impressions:x.impressions,currency:x.account_currency});
    const next=String(r.paging?.next||'');
    // Only Graph API pages of the same request are followed.
    url=next.startsWith('https://graph.facebook.com/')?next:'';
   }
  }
  return {rows,truncated,notes};
 },
 installs,accounts
};
